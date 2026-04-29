import type { ModelRunner, AgentEvent, RunOptions, TokenUsage, ThinkingConfig } from '../types.js';
import { execa } from 'execa';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const MODEL_MAP: Record<string, string> = {
  opus:   'claude-opus-4-6',
  sonnet: 'claude-sonnet-4-6',
  haiku:  'claude-haiku-4-5-20251001',
};

function resolveModel(model: string | undefined): string {
  if (!model) return MODEL_MAP.sonnet;
  return MODEL_MAP[model] ?? model;
}

function resolvePermissionMode(mode: RunOptions['permissionMode']): string | undefined {
  if (!mode || mode === 'ask') return 'default';
  if (mode === 'bypass') return 'bypassPermissions';
  if (mode === 'acceptEdits') return 'acceptEdits';
  if (mode === 'plan') return 'plan';
  if (mode === 'dontAsk') return 'dontAsk';
  if (mode === 'auto') return 'auto';
  return 'default';
}

export class ClaudeRunner implements ModelRunner {
  readonly engine = 'claude-code' as const;

  constructor(private readonly binaryPath: string) {}

  async isAvailable(): Promise<boolean> {
    try {
      const { access } = await import('node:fs/promises');
      await access(this.binaryPath);
      return true;
    } catch {
      return false;
    }
  }

  async *run(prompt: string, opts: RunOptions): AsyncGenerator<AgentEvent> {
    const startMs = Date.now();

    // Build args — same as the agent SDK but via direct CLI spawn
    const args: string[] = [
      '-p', prompt,
      '--output-format', 'stream-json',
      '--verbose',
      '--model', resolveModel(opts.model),
    ];

    const permissionMode = resolvePermissionMode(opts.permissionMode);
    if (permissionMode === 'bypassPermissions') {
      args.push('--dangerously-skip-permissions');
    } else if (permissionMode) {
      args.push('--permission-mode', permissionMode);
    }

    if (opts.effort) args.push('--effort', opts.effort);
    if (opts.maxTurns) args.push('--max-turns', String(opts.maxTurns));
    if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt);
    if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);
    if (opts.continueSession) args.push('--continue');
    if (opts.maxBudgetUsd) args.push('--max-budget-usd', String(opts.maxBudgetUsd));

    // Thinking
    if (opts.thinking) {
      if (typeof opts.thinking === 'string') {
        if (opts.thinking !== 'off') args.push('--thinking');
      } else if (opts.thinking.type !== 'disabled') {
        args.push('--thinking');
      }
    }

    // Additional directories
    if (opts.additionalDirectories) {
      for (const dir of opts.additionalDirectories) {
        args.push('--additional-directory', dir);
      }
    }

    // Tool allow/disallow lists
    if (opts.allowedTools) {
      for (const tool of opts.allowedTools) {
        args.push('--allowed-tool', tool);
      }
    }
    if (opts.disallowedTools) {
      for (const tool of opts.disallowedTools) {
        args.push('--disallowed-tool', tool);
      }
    }

    // Session persistence
    if (opts.persistSession) args.push('--persist-session');

    // outputFormat: already using --output-format stream-json for parsing, skip

    // MCP servers: serialize to temp config file
    let mcpConfigPath: string | undefined;
    if (opts.mcpServers && Object.keys(opts.mcpServers).length > 0) {
      const mcpConfig = { mcpServers: opts.mcpServers };
      mcpConfigPath = join(tmpdir(), `omnai-mcp-${randomUUID()}.json`);
      await writeFile(mcpConfigPath, JSON.stringify(mcpConfig), 'utf-8');
      args.push('--mcp-config', mcpConfigPath);
    }

    // TODO: hooks — complex to serialize as CLI flags, skipping for now

    // Strip env vars that prevent nested claude-code invocation
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (k === 'CLAUDECODE' || k === 'CLAUDE_CODE_ENTRYPOINT' || k === 'CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS') continue;
      if (v !== undefined) env[k] = v;
    }
    // Merge caller-provided env (e.g. CLAUDE_CONFIG_DIR from sweech profile)
    if (opts.env) Object.assign(env, opts.env);

    const proc = execa(this.binaryPath, args, {
      cwd: opts.cwd ?? process.cwd(),
      env: env as NodeJS.ProcessEnv,
      stdin: 'ignore',
      lines: true,
      cancelSignal: opts.abortSignal,
      reject: false,
    });

    // Collect stderr
    const stderrChunks: string[] = [];
    if (proc.stderr) {
      proc.stderr.on('data', (chunk: Buffer | string) => {
        stderrChunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
      });
    }

    let sessionId: string | undefined;
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
    let costUsd = 0;
    let finalOutput = '';

    try {
      for await (const line of proc.stdout!) {
        const lineStr = typeof line === 'string' ? line : String(line);
        if (!lineStr.trim()) continue;
        let event: any;
        try {
          event = JSON.parse(lineStr);
        } catch {
          continue;
        }

        if (event.type === 'system' && event.subtype === 'init' && event.session_id) {
          sessionId = event.session_id;
        } else if (event.type === 'assistant') {
          const content = event.message?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'thinking' && block.thinking) {
                yield { type: 'thinking', content: block.thinking };
              } else if (block.type === 'text' && block.text) {
                yield { type: 'text', content: block.text };
              } else if (block.type === 'tool_use') {
                yield { type: 'tool_use', name: block.name, input: block.input };
              }
            }
          }
        } else if (event.type === 'result') {
          sessionId = event.session_id;
          finalOutput = event.result ?? '';
          costUsd = event.total_cost_usd ?? 0;
          if (event.usage) {
            usage = {
              inputTokens: event.usage.input_tokens ?? 0,
              outputTokens: event.usage.output_tokens ?? 0,
              cacheReadTokens: event.usage.cache_read_input_tokens,
              cacheWriteTokens: event.usage.cache_creation_input_tokens,
            };
          }
          if (event.is_error) {
            yield { type: 'error', message: finalOutput || 'Agent execution failed' };
          }
        }
      }
    } catch (error) {
      if (opts.abortSignal?.aborted) {
        // expected abort
      } else {
        throw error;
      }
    }

    // Check for non-zero exit code (reject: false means await won't throw)
    const procResult = await proc;
    if (procResult.exitCode !== 0 && !finalOutput && !opts.abortSignal?.aborted) {
      const rawStderr = procResult.stderr;
      const stderrStr = Array.isArray(rawStderr) ? rawStderr.join('\n') : rawStderr;
      const stderr = stderrChunks.join('') || stderrStr || 'Claude Code process failed with non-zero exit code';
      yield { type: 'error' as const, message: stderr };
    }

    // Clean up temp MCP config file
    if (mcpConfigPath) {
      unlink(mcpConfigPath).catch(() => {});
    }

    yield {
      type: 'result',
      output: finalOutput,
      sessionId,
      usage,
      costUsd,
      durationMs: Date.now() - startMs,
    };
  }
}
