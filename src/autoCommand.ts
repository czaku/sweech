/**
 * Pure-output helpers for `sweech auto`.
 *
 * Splitting the JSON/text formatting and exec-env construction out of
 * `cli.ts` keeps the action handler thin (call → format → spawn) and gives
 * us a unit-test seam for the bits that have real logic: the JSON shape
 * contract and the spawn environment.
 */

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
 * Build the spawn environment for `sweech auto --exec`. Sets the picked
 * profile's config-dir env var and strips Claude Code nesting vars so the
 * child CLI doesn't think it's running inside another agentic session.
 *
 * Pure: takes a base env in, returns a new env out — does not read process.env.
 */
export function buildAutoExecEnv(
  cli: CLIConfig,
  configDir: string,
  baseEnv: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...baseEnv, [cli.configDirEnvVar]: configDir };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
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
