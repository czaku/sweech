# Handoff — 2026-05-17 (codex-queue completion + infra)

## What was completed this session

### Security + correctness fixes (all shipped to `origin/main`)
- `dcc110b` — deferred Phase 2 SHOULD-FIX items
  - `persistV2File`: chmod 0600 errors now logged to stderr instead of swallowed
  - `vaultRefresh.ts:88`: landmine comment about `meta.kind` being legacy-shape (v2 callers would silently hit OpenAI refresh path)
  - `VaultView.swift compatibleAccounts(for:)`: returns `[]` for unknown CLIs (was: silently defaulted to `openai`, so kimi workspaces saw codex accounts as "compatible")
  - `VaultView.swift distinctProviderCount`: Providers tab pill now shows distinct providers across workspaces, not vault-account count
- `433537f` — security HIGH: `--key` literal-API-key guard
  - New `src/keySourceGuard.ts` with `looksLikeLiteralApiKey` heuristic
  - 52 unit tests in `tests/keySourceGuard.test.ts` (known prefixes, env-var shapes, length thresholds, JWT/base64 confusables)
  - CLI now refuses keys passed as `--key sk-…` with a clear error pointing at env/stdin/prompt forms
- `3a0556a` / `5b4c49f` — codex MEDIUM: vaultAddApiKey collision guard
  - New `force` option in `AddApiKeyOptions` + `--force` CLI flag
  - Re-running `accounts add --label X` without `--force` refuses (keychain untouched on refusal)
  - With `--force`: `rotated: true` field on result, CLI shows "rotated existing keychain entry — old key is gone" notice
- `9941ee5` — **CRITICAL** test-safety fix + codex MEDIUM cache race
  - **`tests/anthropicAuth.test.ts`** was doing `fs.unlinkSync` on the REAL `~/.sweech/config.json` via `os.homedir()`. Any Jest interrupt (Ctrl+C, --bail, watch reload, OOM) between `beforeAll` and `afterAll` wiped the user's config — this was the smoking gun for the 2026-05-17 config wipe incident
  - Test now redirects `os.homedir()` to a per-suite `mkdtempSync` tmpdir via `jest.doMock` + lazy require (same pattern as `tests/vault.test.ts`)
  - Added a `CRITICAL safety regression` assertion that fails fast if `TMP_HOME` ever resolves to real home
  - `liveUsage.ts`: cache write race fixed via `atomicWriteFileSync` + new `withCacheLock` O_EXCL flag-file lock. Lock degrades gracefully (stderr warning) on 2s timeout, since cache is non-critical (5-min TTL)
- `1b652da` — 3 pre-existing test failures cleaned up
  - `systemCommands.test.ts`: swapped `claude-mini`/`minimax` (which devs alias to profile wrappers) for guaranteed-not-on-PATH names
  - `launcherIntegration.test.ts`: test expected `"Claude (Anthropic)"` headers, launcher renders terse `Claude`/`Codex` — test updated to match shipping behaviour
  - `liveUsageCache.test.ts`: deleted 3 tests asserting on the removed `promotion` field (with breadcrumb in case the feature comes back)
- `8eebc8c` — `tests/accountsList.test.ts`: 37 new tests covering all 5 untested helpers (filterAccountsForList, sortAccountsForList, normalizeKindFilter, normalizeProviderFilter, buildAccountsListJson)

### Infrastructure
- **CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 enabled on all 15 MacBook profiles + 12 Mac Studio profiles**
- Backup at `~/.claude-settings-backups/20260517-112942/` (this Mac) and `~/.claude-settings-backups/20260517-113305/` (mac-studio)
- SweechBar rebuilt + reinstalled (PID was 17515 at install)

### Test state
- **63 suites / 1526 tests, all green**
- TS clean (`npx tsc --noEmit` returns 0 errors)
- Swift release build clean (`swift build -c release` in `macos-menubar/SweechBar`)

## Current state
- Branch: `main`
- Last commit: `8eebc8c test(accountsList): 37 tests for the 5 untested helpers (integration MEDIUM)`
- Origin: up to date (`origin/main..HEAD` empty)
- Uncommitted changes: **none** (working tree clean)
- Untracked: `.worktrees/`, `packages/engine/bun.lock` (pre-existing)
- Keel status: 0 active, 0 blocked, 53 done, 9 todo. The keel CLI logs a benign `waves.json` jq error — top-level CLI bug, not a blocker

## Open worktree (needs accounting)
- `/Users/luke/dev/onlytools/sweech/.worktrees/d-lint-consumer-leak-guard` on branch `chore/d-lint-consumer-leak-guard`
- Tip: `b8c6cbd ci: add consumer-leak guard — block vykean refs in source`
- **Pre-existing**: not created this session. Verify with the user whether to merge or remove. Per CLAUDE.md worktree discipline, no worktree should outlive its session without a clear status

## What to do next

### Top of keel queue (pick highest priority first)
1. **T-LU-003 (CRITICAL)** — `sweech failover`: 429 detection + auto-rotate to next-ranked profile. Compounds on T-LU-004 (multi-provider headers) and T-LU-006 (token-refresh daemon)
2. **T-LU-001 (HIGH)** — codex CLI ignores settings.json env. Likely 1-day fix: have sweech write a real `[model_providers]` block to `$CODEX_HOME/config.toml` instead of relying on env vars. Note: codex 0.x dropped `wire_api=chat`; only `wire_api=responses` works
3. **T-LU-002 (HIGH)** — `sweech auto`: pick best account and launch (foundation for T-LU-003)
4. **T-LU-004 (HIGH)** — multi-provider rate-limit headers (Kimi/Qwen/DeepSeek/Z.ai)
5. **T-LU-006 (HIGH)** — OAuth token-refresh daemon (24h pre-expiry)

### Wave-6 spillovers (tagged for revival)
- T-071 — `sweech list` regrouped under providers + new `--json` (`wave6/T-071-keep`)
- T-073 — SweechBar AccountsView single-provider-tree full rebuild (`wave6/T-073-keep`)
- T-074 — SwiftBar widget + docs migrated to provider tree (`wave6/T-074-keep`)

### Cheapest cleanup wins (low priority, not blocking)
- Delete `macos-menubar/SweechBar/Sources/AccountsView.swift` — 2533 lines compiled but never instantiated (popover entry is VaultView). Verify zero references first
- Resolve the stale `.worktrees/d-lint-consumer-leak-guard` worktree (merge or remove)

## Decisions made (do not re-litigate)
- **`--force` is required for labelled API-key rotation.** Re-running `accounts add --label X` is intentionally NOT a silent rotation. The user can pass `--force` for in-place key rotation; without it, the CLI refuses and leaves the keychain entry untouched
- **Cache lock degrades gracefully on timeout.** Unlike the vault lock (which throws on timeout because data loss is unacceptable), the rate-limit-cache lock falls through with a stderr warning after 2s. Hangs in the menu bar would be worse than the rare missed cache update
- **`looksLikeLiteralApiKey` heuristic biases toward refusal.** False positives just nudge the user to the stdin form; false negatives leak the key. Known prefixes + env-name-shape + length > 40 are all enough to refuse
- **Settings.json is per-profile, NOT shared.** Each `~/.claude*/` is a full profile root (env, history, agents, hooks, plugins, memory). Sharing would punch a hole in the boundary the profile model exists to provide
- **3 pre-existing tests were broken vs shipping behaviour, not vice-versa.** `Claude (Anthropic)` headers don't exist (launcher TUI uses terse labels); `promotion` field was dropped from `LiveRateLimitData`; `claude-mini` collides with dev aliases. The implementations are correct
- **Bigger wave-6 redesign (T-071/T-073/T-074) is deferred, not abandoned.** Tags preserve the in-flight branches. Restart only when the user explicitly asks for that scope

## Open questions
- Should `.worktrees/d-lint-consumer-leak-guard` be merged into `main`? It carries a CI guard that blocks `vykean` references — not strictly sweech-scoped but lives here
- The codex queue items (T-LU-002/003/004/006) all touch the rate-limit / failover logic — start with which one?
- Mac Studio Agent Teams: settings.json was patched via SSH, but no Claude Code session was restarted on the Studio. No action needed unless next session there hits something

## Key files
- `src/keySourceGuard.ts` — new this session. Heuristic for `--key` UX guard
- `src/liveUsage.ts` — new `withCacheLock` + `atomicWriteFileSync` for the cache file. Pattern of "lock with graceful timeout fall-through" lives here
- `src/vaultAddApiKey.ts` — collision guard with `--force`. Pre-check happens inside the vault lock BEFORE the keychain write to preserve old key on refusal
- `tests/anthropicAuth.test.ts` — **rewritten this session**. Reference pattern for `jest.doMock('os', ...)` + lazy require. Apply to any future test that hits `~/.sweech`
- `tests/accountsList.test.ts` — new this session. 37 tests; reference for testing pure module-kernel helpers
- `macos-menubar/SweechBar/Sources/VaultView.swift` — the real popover (not `AccountsView.swift`). `compatibleAccounts(for:)` + `distinctProviderCount` are the cosmetic fixes
- `macos-menubar/build-app.sh` — produces SweechBar.app. Run from `macos-menubar/` directory

## Watch out for
- **`tests/anthropicAuth.test.ts` USED TO wipe ~/.sweech/config.json** — if you see ANY test in the repo doing `fs.unlinkSync(path.join(os.homedir(), '.sweech', ...))` or similar, that is a config-killer. Sandbox it with `jest.doMock('os', () => ({ ...real, homedir: () => TMP_HOME }))` immediately
- **`withVaultLock` is sync; `withVaultLockExternal` is sync too.** Do NOT pass an async fn — the `try/finally` releases the lock before the awaited promise resolves. If you need async work inside the lock, refactor to sync first
- **Auto-push hook is on.** After every successful `git commit`, the next user-prompt cycle pushes automatically. If you see "Your branch is ahead by 1 commit", it just hasn't fired yet — `git push` manually if needed
- **macos-menubar uses two repo roots.** `macos-menubar/SweechBar.app` builds from `macos-menubar/SweechBar/`, but `build-app.sh` references `/Users/luke/dev/sweech/macos-menubar` — the alternate working dir. Both point at the same content via submodule; don't get confused if a screenshot shows a different path
- **keel CLI prints a benign jq error** about missing `waves/waves.json`. Don't chase it — it's a keel-side bug, not a sweech-side issue
- The `.worktrees/d-lint-consumer-leak-guard` worktree predates this session. Don't delete without asking
