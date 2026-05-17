# Handoff — 2026-05-17 (T-LU-001 → T-LU-006 wave complete)

## What was completed this session

All 5 priority codex-queue tasks from the prior handoff are shipped to `origin/main`.

### Wave 1 — parallel agents (3 worktrees, merged together)

- **T-LU-001 (HIGH)** — `d1a5eb7` + merge `574c072`
  - `sweech profile create --cli codex --provider <custom>` now writes a real `[model_providers.X]` block to `$CODEX_HOME/config.toml` so codex actually uses the configured provider instead of falling through to ChatGPT OAuth.
  - New `src/codexConfigToml.ts` (329 lines) with minimal TOML parser/merger/emitter + `writeCodexProviderTomlForProfile`.
  - Wired through `src/config.ts:createProfileConfig` so model-change / import paths also regenerate the toml.
  - Wrapper script (`config.ts:648-663`) hoists `settings.env` for codex profiles so the API key referenced by `env_key` resolves at runtime.
  - Constraint: only `wire_api = "responses"` is emitted (codex 0.x removed `wire_api = "chat"`).
  - 37 tests in `tests/codexConfigToml.test.ts`.

- **T-LU-004 (HIGH)** — `9b70463` + merge `f6ac251`
  - New `src/providerRateLimitParsers.ts` (321 lines) with parsers for Kimi (moonshot.ai), Qwen (Alibaba DashScope), DeepSeek, and Z.ai/GLM. All map to the same `LiveRateLimitData` shape so `accountScore` works unchanged.
  - Status semantics mirror Claude: 200<0.8→allowed, 200≥0.8→allowed_warning, 429→limit_reached, 401→unauthorized, 403→forbidden.
  - 107 tests in `tests/providerRateLimitParsers.test.ts` covering each provider × {200, 429, 401, malformed}.
  - **DoS guard added later** (review fix): `MAX_HEADER_VALUE_LENGTH = 64` cap on header values so a pathological custom provider can't block the event loop.

- **T-LU-006 (HIGH)** — `bae41ba` + merge `d0d2e08`
  - `src/tokenRefresh.ts` refreshes 24h before expiry (was 10 min). Each attempt logged to `~/.sweech/audit.jsonl` via `logAudit` (`token_refresh` / `token_refresh_failed`).
  - New `getNextRefreshEta` / `getAllRefreshEtas` exports.
  - `sweech doctor` now includes a "Token refresh ETA" section listing every OAuth-backed profile with hours-until-expiry + due-now flag (`utilityCommands.ts:378`).
  - 26 tests across `tests/tokenRefresh.test.ts` + `tests/doctorTokenRefresh.test.ts`.

### Wave 1 review fixes (`3af9fb0`)

Code + security reviews surfaced 4 MUST-FIX bugs + 2 CRITICAL wiring gaps. All fixed:

- **MUST-FIX**: `tokenRefresh.writeSettings` was non-atomic `fs.writeFileSync` — replaced with `atomicWriteFileSync` + chmod 0600. Concurrent readers (wrapper hoist, getCurrentApiKey, peer sweech invocations) now never observe a truncate window.
- **MUST-FIX**: `tokenRefresh.refreshExpiringTokens` was silently auditing `token_refresh` success even when `readSettings` returned null — so the rotated refresh token was effectively lost on next restart. New behaviour: audit `token_refresh_failed` + skip the in-memory update so the next poll retries.
- **MEDIUM**: `config.ts` settings.json write now validates that no `settings.env` value contains `\n` / `\r` / `\0` — defence in depth against shell injection in the codex wrapper's `export "$_key=$_val"` loop.
- **SHOULD-FIX**: providerRateLimitParsers's `parseResetHeader` was rejecting `"0s"` as unparseable. Accepted now (window just reset is a valid state).
- **SHOULD-FIX**: codexConfigToml dead branch in `sectionOrder` maintenance — collapsed.
- **CRITICAL wiring**: `liveUsage.getLiveUsage` / `refreshLiveUsage` now dispatch to the new Kimi/Qwen/DeepSeek/Z.ai parsers based on `profile.provider`. Without this the wave-1 parsers existed but never fired in production. API key resolved via `readApiKeyFromSettings(configDir, envKeys[])` against the same settings.env block the codex wrapper hoists from. Provider name aliases: `kimi-coding`→`kimi`, `dashscope`→`qwen`, `glm`→`zai`.
- **CRITICAL wiring**: `fedServer.startSweechFedServerWithShutdown` now starts (and gracefully stops on SIGTERM/SIGINT) the token-refresh loop. Without this, the 24h refresh window existed but `startTokenRefreshLoop` had no production caller. `tokenRefresh` is lazy-required to avoid pulling in `inquirer` (ESM-only) when tests import fedServer.
- New `tests/liveUsageProviderDispatch.test.ts` (9 tests) proves the dispatch fires for each supported provider + alias + missing-key short-circuit + codex-cliType-wins ordering.

### Wave 2 — `sweech auto` + `sweech failover`

- **T-LU-002 (HIGH)** — `fdda248`
  - `sweech auto [--cli claude|codex|kimi] [--json] [--exec]` runs `suggestBestAccount(cliType)` and either prints `sweech use <pick>` or spawns the CLI directly.
  - Pure helpers extracted to `src/autoCommand.ts` for testability: `buildAutoCommandJson` (stable JSON shape contract) + `buildAutoExecEnv` (spawn env construction).
  - 16 tests initially, grew to 30 after review fixes.

- **T-LU-003 (CRITICAL)** — `8265dd4`
  - New `src/failover.ts` (310 lines) with cooldown store at `~/.sweech/failover-cooldowns.json` (atomic write + 0o600). `startFailoverListener` subscribes to the existing `limit_reached` event (emitted by `checkUsageThresholds`) and records a cooldown automatically.
  - New `sweech failover [from] [--cli C] [--exclude N1,N2] [--exec] [--json] [--status] [--clear name] [--clear-all]` command. `--exec` records the rotation via `recordFailover` AFTER spawn so audit history reflects real switches.
  - New typed event `failover_rotated` for webhook delivery.
  - `fedServer` daemon starts the failover listener (lazy-required) and stops it FIRST on shutdown (silence the event bus before stopping the refresh timer that could trip it).
  - 31 tests covering write/read round-trip, expiry pruning, listener idempotency + hot-reload guard, candidate walk, default-collision skip.

### Wave 2 review fixes (`996edf8`)

Code + security + integration reviewers found 3 more bugs:

- **MUST-FIX**: `fedServer` shutdown order was `stopTokenRefresh → stopFailoverListener → close` — a final refresh probe could fire `limit_reached` during teardown and trip the still-registered listener into a disk write while closing. Swapped to `stopFailoverListener → stopTokenRefresh → logRotator → close`.
- **MUST-FIX**: `pickFailoverTarget` was using `suggestBestAccount + post-filter` — silently dropped availability when a built-in default account (claude / codex) collided with the source. Switched to `recommendRoute + walk-candidates` so every scored candidate gets a fair check.
- **SHOULD-FIX**: failover listener test-crash recovery — `stopFailoverListener` now always resets the module-level state vars; listener is tagged so hot-reload doesn't leak duplicates.
- **HIGH security**: `atomicWriteFileSync` gained `opts.mode` parameter. Callers holding secrets (settings.json, failover-cooldowns) now pass `{ mode: 0o600 }`.
- **MEDIUM security**: `buildAutoExecEnv` expanded strip list to cover shadowing API keys (`ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY`, `KIMI/MOONSHOT/GLM/ZAI/ZHIPU/DEEPSEEK/QWEN/DASHSCOPE_API_KEY`), other Claude Code nesting vars (`CLAUDE_CODE_SSE_PORT`, `CLAUDE_CODE_OAUTH_TOKEN`), config-dir overrides, and `MCP_SERVERS_PATH`.

### Codex adversarial review fixes (`5f6d9fa`)

Independent review via `codex review --base d0d2e08` (codex-pole / gpt-5.4) caught 3 bugs the Claude-side reviewers missed:

- **P1**: `--exec` was bypassing the wrapper script's settings.env hoist. For codex profiles (which read env at runtime via `env_key`), the API key never made it into the spawned process. Added `readSettingsEnv(configDir)` pure helper + wired both `sweech auto --exec` and `sweech failover --exec` to call it. Hoist runs AFTER strip + BEFORE configDirEnvVar set.
- **P2**: `atomicWriteFileSync` was applying mode via post-write chmod, leaving a tiny window where a co-tenant could `open()` the temp file with default umask perms and keep that fd open across the chmod. Refactored to pass mode through to `writeFileSync({ mode })` so `open(O_CREAT)` honours it. Belt-and-braces post-write chmod retained for umask-077 case.
- **P2**: `subscriptions.checkUsageThresholds(p.name, ...)` was passing display name, but failover compares against commandName. For profiles where name ≠ commandName, a 429 would record under the wrong key and the rate-limited profile got re-selected. Fix: pass `p.commandName` (the unique routing key).
- New `tests/atomicWrite.test.ts` (10 tests) + 10 new `tests/autoCommand.test.ts` cases for `readSettingsEnv` + hoist behaviour.

## Test state

- **71 suites / 1775 tests, all green** (up from 63/1526 at session start: +8 suites, +249 tests)
- `npx tsc --noEmit` returns 0 errors
- Swift release build clean (`swift build -c release` in `macos-menubar/SweechBar/`)
- SweechBar process still running (PID 17515 unchanged) — backwards-compatible data shape changes

## Current state

- Branch: `main`
- Latest commit: `5f6d9fa fix(wave2): address codex adversarial review (3 findings)`
- Origin: up to date — every commit pushed
- Uncommitted changes: **none** (working tree clean)
- Untracked: `.worktrees/`, `packages/engine/bun.lock` (pre-existing)
- Keel: 0 active, 0 blocked, 58 done, 4 todo

## Still on the keel queue

- **T-LU-005 (MEDIUM)** — `sweech serve --install`: launchd daemon with auto-restart
- **T-LU-007 (MEDIUM)** — `sweech cost`: USD/M-token per profile + budget filtering
- **T-LU-008 (MEDIUM)** — `sweech profile audit`: flag dormant + identity cross-bleed, prune
- **T-LU-009 (MEDIUM)** — Project-aware routing: `.sweech.json` to pin profile per project

## Open worktree (still needs accounting)

- `.worktrees/d-lint-consumer-leak-guard` on branch `chore/d-lint-consumer-leak-guard` — pre-existing from before this session, carries a CI guard blocking `vykean` references. Verify with the user whether to merge or remove.

## Decisions made (do not re-litigate)

- **Provider-aware dispatch uses settings.env, not credentialStore.** The codex wrapper script already hoists `settings.env` for codex profiles, so reading the same source keeps the daemon in sync with what the CLI actually runs with. Aliases (`kimi-coding`→`kimi`, etc.) defined in `PROVIDER_DISPATCH`.
- **Failover listener is daemon-only.** `startFailoverListener` is called from `fedServer.startSweechFedServerWithShutdown` — NOT from foreground CLI commands. Foreground commands that trigger `getAccountInfo` still emit `limit_reached`, but the listener only catches them when registered (daemon running). This is intentional: a one-shot `sweech list` shouldn't write cooldowns.
- **Cooldown key is `commandName` (not display name).** `checkUsageThresholds` now receives `p.commandName`, the listener stores `data.account` (= commandName), and `pickFailoverTarget` filters against commandName. Consistent everywhere.
- **`atomicWriteFileSync` mode applied at open(), not chmod after.** Closes the temp-file TOCTOU window. Belt-and-braces post-write chmod kept for umask-077 case.
- **24h refresh window is intentional.** Wider than the 10-min predecessor so tokens survive long sleep/standby + give the daemon multiple polling intervals to recover from transient refresh failures.
- **buildAutoExecEnv: strip first, hoist second, set configDirEnvVar last.** Order is load-bearing — strip removes parent's stale tokens; hoist re-sets the picked profile's auth; configDirEnvVar set last so a hoisted CONFIG_DIR can't clobber the correct path.

## Key files (new this session)

- `src/codexConfigToml.ts` — minimal TOML parser/merger/emitter. Pattern for any future TOML writes.
- `src/providerRateLimitParsers.ts` — OpenAI-compat rate-limit header parsers shared across Kimi/Qwen/DeepSeek/Z.ai.
- `src/autoCommand.ts` — pure helpers for `sweech auto`. Stable JSON shape contract — downstream scripts depend on keys.
- `src/failover.ts` — cooldown store + listener + `pickFailoverTarget` + `recordFailover`. The tagged-listener pattern for hot-reload guard is reusable.
- `tests/atomicWrite.test.ts` — first dedicated atomic-write test file. Cross-platform skip on Windows.
- `tests/liveUsageProviderDispatch.test.ts` — proves the wave-1 wiring fix actually fires the provider parsers end-to-end.

## Watch out for

- **`mockRecommendRoute` is mocked in failover tests, not `mockSuggestBestAccount`.** `pickFailoverTarget` switched implementations; use `mockRecommendRoute.mockResolvedValueOnce(makeRouteResponse(...))` for new tests.
- **`pickFailoverTarget` walks `route.candidates`, doesn't post-filter.** A candidate with `reasons.length > 0` is already rejected — skip it; the loop continues to the next.
- **The `failover_rotated` event ONLY fires from `recordFailover()` (after spawn).** Don't fire it from `recordRateLimitCooldown` — that's the upstream signal, not the rotation event.
- **`readSettingsEnv` is intentionally tolerant.** Missing file, malformed JSON, non-string values → returns `{}`. No throws.
- **Cache lock spin-wait blocks ~25ms per retry, bounded by 2s.** Cache is non-critical, graceful timeout. Don't try to "fix" the spin — it's intentional.

## Next steps

The top of the codex queue is now: T-LU-005 (launchd daemon), T-LU-007 (cost tracking), T-LU-008 (profile audit), T-LU-009 (project-aware routing). All MEDIUM priority. Run `/vy-go` to pick them up.
