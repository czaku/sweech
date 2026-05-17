/**
 * Pure-output helpers for `sweech auto`.
 *
 * Splitting the JSON/text formatting and exec-env construction out of
 * `cli.ts` keeps the action handler thin (call → format → spawn) and gives
 * us a unit-test seam for the bits that have real logic: the JSON shape
 * contract and the spawn environment.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AccountRecommendation } from './accountSelector';
import type { CLIConfig } from './clis';

export interface AutoCommandJson {
  profile: string;
  cliType: string;
  configDir: string;
  score: number;
  reason: string;
  command: string;
}

/**
 * Build the JSON payload printed by `sweech auto --json`. Stable shape:
 * downstream scripts depend on these keys.
 */
export function buildAutoCommandJson(rec: AccountRecommendation): AutoCommandJson {
  return {
    profile: rec.account.commandName,
    cliType: rec.account.cliType,
    configDir: rec.account.configDir,
    score: rec.score,
    reason: rec.reason,
    command: `sweech use ${rec.account.commandName}`,
  };
}

/**
 * Variables stripped from the spawned child's environment so the picked
 * profile's settings.env (already mirrored into the wrapper script's
 * `export "$K=$V"` loop) wins instead of being shadowed by whatever the
 * user's shell has exported. Covers:
 *   - Claude Code nesting vars (don't let the child think it's nested)
 *   - Anthropic / OpenAI / Kimi / GLM / DeepSeek / Qwen API keys that
 *     could route the picked profile to the wrong account silently
 *   - CONFIG_DIR overrides that would point the CLI elsewhere
 *   - MCP_SERVERS_PATH which would import an unintended MCP graph
 */
const STRIPPED_ENV_VARS = [
  // Claude Code nesting
  'CLAUDECODE',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_SSE_PORT',
  'CLAUDE_CODE_OAUTH_TOKEN',
  // API keys that could shadow the picked profile's settings.env
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'KIMI_API_KEY',
  'MOONSHOT_API_KEY',
  'GLM_API_KEY',
  'ZAI_API_KEY',
  'ZHIPU_API_KEY',
  'DEEPSEEK_API_KEY',
  'QWEN_API_KEY',
  'DASHSCOPE_API_KEY',
  // CLI config-dir overrides — re-set per-spawn below to the picked profile
  'CLAUDE_CONFIG_DIR',
  'CODEX_HOME',
  // MCP server graph
  'MCP_SERVERS_PATH',
] as const;

/**
 * Read a profile's settings.json env block. Returns an empty object when
 * the file is missing or malformed — callers treat "no env to hoist" the
 * same as "this profile uses default auth", which is the safe fallback.
 *
 * Pure: takes a configDir in, returns a plain dict out.
 */
export function readSettingsEnv(configDir: string): Record<string, string> {
  try {
    const settingsPath = path.join(configDir, 'settings.json');
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    const settings = JSON.parse(raw) as { env?: Record<string, unknown> };
    const env = settings?.env;
    if (!env || typeof env !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === 'string') out[k] = v;
      else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Build the spawn environment for `sweech auto --exec`. Sets the picked
 * profile's config-dir env var and strips Claude Code nesting vars +
 * shadowing API keys, then hoists the picked profile's settings.env
 * (codex specifically reads env vars at runtime via env_key entries in
 * config.toml, so the API key MUST be in the spawned process env).
 *
 * Order matters:
 *   1. spread baseEnv
 *   2. strip nesting + shadowing keys (so they can't override the hoist)
 *   3. hoist settingsEnv (the picked profile's auth + base URL + model)
 *   4. set configDirEnvVar (so it isn't accidentally clobbered by hoist)
 *
 * Pure: takes a base env + settings env in, returns a new env out.
 * Caller (cli.ts) reads settings.json via readSettingsEnv and passes the
 * result here — keeps this function trivially testable.
 */
export function buildAutoExecEnv(
  cli: CLIConfig,
  configDir: string,
  baseEnv: NodeJS.ProcessEnv,
  settingsEnv: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv };
  for (const key of STRIPPED_ENV_VARS) {
    delete env[key];
  }
  // Hoist the picked profile's settings.env so codex (and any other CLI
  // that reads env at runtime) sees the right API key, base URL, model.
  // Without this, --exec would bypass the wrapper's hoist and the codex
  // CLI would fall through to ChatGPT login because its config.toml
  // env_key resolves to undefined.
  for (const [k, v] of Object.entries(settingsEnv)) {
    env[k] = v;
  }
  // Re-set the picked profile's config-dir AFTER hoist + strip, so it
  // isn't shadowed by either the inherited parent env OR a stale
  // settings.env entry pointing at a different profile dir.
  env[cli.configDirEnvVar] = configDir;
  return env;
}

/**
 * Error message string for the "no available profile" case. Used by both
 * the JSON and text paths so the wording stays consistent.
 */
export function noProfileErrorMessage(cliFilter: string | undefined): string {
  const filter = cliFilter ? ` for --cli ${cliFilter}` : '';
  return `no available profile${filter}`;
}
