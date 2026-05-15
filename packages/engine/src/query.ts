import { detectEngines } from './detect.js';
import type { EngineId, SweechConfig, Provider, ThinkingLevel } from './types.js';

// Current model rosters (verified 2026-05-15):
//   Anthropic: Opus 4.7 (newest), Sonnet 4.6, Haiku 4.5.
//   OpenAI:    GPT-5.4 family (5.4, 5.4-mini, 5.3-codex), plus the o-series
//              reasoning models still on offer.
//   Google:    Gemini 3 Pro Preview is the newest tier; 2.5-pro/flash remain.
//
// Keep this list in sync when Anthropic/OpenAI/Google ship a new flagship.
// The user's preferred default is whichever model name appears first per provider.
const ANTHROPIC_MODELS = ['claude-opus-4-7', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
const OPENAI_MODELS = ['gpt-5.4', 'gpt-5.4-mini', 'gpt-5.3-codex', 'gpt-4.1', 'gpt-4.1-mini', 'o3', 'o4-mini'];
const GOOGLE_MODELS = ['gemini-3-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'];

const MODELS_BY_ENGINE: Record<EngineId, string[]> = {
  'claude-code': ANTHROPIC_MODELS,
  'qwen-code':   ['qwen3-coder-next', 'qwen2.5-coder-32b-instruct', 'qwen2.5-72b-instruct'],
  'gemini-cli':  GOOGLE_MODELS,
  'amazon-q':    ['amazon-q-developer'],
  'pi-mono':     [...ANTHROPIC_MODELS, ...OPENAI_MODELS, ...GOOGLE_MODELS,
                  'deepseek-chat', 'deepseek-reasoner', 'mistral-large', 'codestral',
                  'grok-3', 'grok-3-mini'],
  'opencode':    [...ANTHROPIC_MODELS, ...OPENAI_MODELS, ...GOOGLE_MODELS],
  'goose':       [...ANTHROPIC_MODELS, ...OPENAI_MODELS, ...GOOGLE_MODELS],
  'codex':       [...OPENAI_MODELS, 'codex-mini'],
  'copilot':     ['claude-opus-4.7', 'claude-sonnet-4.6', 'claude-haiku-4.5',
                  'gpt-5.4', 'gpt-5.3-codex', 'gemini-3-pro-preview'],
  'http':        [],
};

/**
 * Effort vocabularies per engine, sourced from each CLI's own help/error
 * output (NOT guesswork):
 *
 *   claude-code:  `claude --help | grep effort`
 *                 → low | medium | high | xhigh | max
 *   codex:        `codex exec -c model_reasoning_effort=__invalid__ 2>&1`
 *                 → none | minimal | low | medium | high | xhigh
 *   pi-mono:      inherits Anthropic-style budget tokens (claude vocab).
 *
 * Re-verify whenever a CLI updates. The previous shared `EFFORT_LEVELS`
 * constant was wrong for both engines (claude missing xhigh, codex empty).
 */
const ENGINE_EFFORT_LEVELS: Partial<Record<EngineId, readonly string[]>> = {
  'claude-code': ['low', 'medium', 'high', 'xhigh', 'max'],
  codex: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  'pi-mono': ['low', 'medium', 'high', 'xhigh', 'max'],
};
const ENGINES_WITH_THINKING = new Set<EngineId>(['claude-code', 'pi-mono']);
const THINKING_LEVELS: ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

export interface EngineQuery {
  engine: EngineId;
  available: boolean;
  binaryPath?: string;
  providers: Provider[];
  models: string[];
  supportsEffort: boolean;
  effortLevels: string[];
  supportsThinking: boolean;
  thinkingLevels: ThinkingLevel[];
}

export interface AvailableOptions {
  engines: EngineQuery[];
  /** Union of providers across all available engines. */
  providers: Provider[];
  /** Union of models across all available engines. */
  models: string[];
  /** Non-empty only when at least one available engine supports effort. */
  effortLevels: string[];
  /** Non-empty only when at least one available engine supports thinking. */
  thinkingLevels: ThinkingLevel[];
}

export async function queryAvailable(config?: SweechConfig): Promise<AvailableOptions> {
  const statuses = await detectEngines(config);

  const engines: EngineQuery[] = statuses.map((status) => {
    const id = status.engine;
    const effortLevels = ENGINE_EFFORT_LEVELS[id] ?? [];
    const supportsEffort = effortLevels.length > 0;
    const supportsThinking = ENGINES_WITH_THINKING.has(id);
    return {
      engine: id,
      available: status.available,
      binaryPath: status.binaryPath,
      providers: (status.providers ?? []) as Provider[],
      models: MODELS_BY_ENGINE[id] ?? [],
      supportsEffort,
      effortLevels: [...effortLevels],
      supportsThinking,
      thinkingLevels: supportsThinking ? [...THINKING_LEVELS] : [],
    };
  });

  const available = engines.filter((e) => e.available);
  const providers = [...new Set(available.flatMap((e) => e.providers))] as Provider[];
  const models = [...new Set(available.flatMap((e) => e.models))];
  const unionEffort = [...new Set(available.flatMap((e) => e.effortLevels))];
  const anyThinking = available.some((e) => e.supportsThinking);

  return {
    engines,
    providers,
    models,
    effortLevels: unionEffort,
    thinkingLevels: anyThinking ? [...THINKING_LEVELS] : [],
  };
}
