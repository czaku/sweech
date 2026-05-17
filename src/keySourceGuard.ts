/**
 * Heuristic guard for `--key` on `sweech accounts add --kind apikey`.
 *
 * Background
 * ──────────
 * The `--key` flag has historically taken an env-var *name* (e.g.
 * `--key KIMI_API_KEY`), with `-` reading from stdin and no flag opening
 * an interactive prompt. The trap is that a user may reasonably assume
 * the literal key goes there:
 *
 *   sweech accounts add --kind apikey --provider kimi --key sk-xxxxxx...
 *
 * In that case the literal key:
 *   • lands in shell history,
 *   • is visible to `ps auxe` for the lifetime of the process,
 *   • is captured by process-audit logs / EDR tooling.
 *
 * Then the CLI resolves `process.env['sk-xxxxxx...']` to `undefined`,
 * silently falls back to the interactive prompt, and the user never
 * realises they leaked the key.
 *
 * Fix
 * ───
 * Reject anything that doesn't look like an env-var name with a clear
 * error pointing at the safe forms (env, stdin, prompt). False positives
 * are safe: a user with an unusual env-var name simply pipes via stdin.
 */

const KNOWN_KEY_PREFIXES: ReadonlyArray<string> = [
  'sk-', 'sk_',                              // OpenAI, Anthropic, Mistral, Groq, DeepSeek
  'pk-', 'pk_',                              // some public-ish keys
  'sess-', 'sess_',                          // session tokens
  'glpat-',                                  // GitLab personal access tokens
  'ghp_', 'gho_', 'ghs_', 'ghr_', 'github_pat_',  // GitHub
  'xai-',                                    // xAI / Grok
  'glm-',                                    // Zhipu GLM
  'AIzaSy',                                  // Google API keys
  'AKIA', 'ASIA',                            // AWS access keys
  'ya29.',                                   // Google OAuth access tokens
  'xoxb-', 'xoxp-', 'xapp-',                 // Slack
]

/** POSIX-portable env-var name shape. */
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Bare identifiers longer than this are treated as suspicious. */
const MAX_ENV_NAME_LEN = 40

/**
 * Return `true` if `value` looks like a raw API key rather than the name
 * of an environment variable holding one.
 *
 * Detection signals (any one is enough):
 *   1. Starts with a known API-key prefix (see `KNOWN_KEY_PREFIXES`).
 *   2. Contains characters that no POSIX env var ever uses
 *      (`/`, `+`, `=`, `.`, `-`, whitespace, etc.).
 *   3. Length > `MAX_ENV_NAME_LEN`.
 */
export function looksLikeLiteralApiKey(value: string): boolean {
  for (const prefix of KNOWN_KEY_PREFIXES) {
    if (value.startsWith(prefix)) return true
  }
  if (!ENV_NAME_RE.test(value)) return true
  if (value.length > MAX_ENV_NAME_LEN) return true
  return false
}
