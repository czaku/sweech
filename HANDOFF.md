# Handoff — 2026-05-16 /vy-go batch 1

## Shipped this session (8 tasks of wave-5 + 2 follow-up fix commits)

| ID | Title | Commit |
|---|---|---|
| T-038 | vault same-email collision fix (kind+email+orgId) | `64b0254` |
| T-039 | daemon HMAC auth | `d402ef6` |
| T-043 | ANTHROPIC_CLIENT_ID env override | `d389bcb` |
| T-044 | launcher non-TTY fail-fast | `a716376` |
| T-055 | fish shell completions | `fd864c4` |
| T-058 | init wizard add-another loop | `93f8db4` |
| T-059 | SweechBar onboarding empty state (+ stale `OnlyMenuBarKit` import fix) | `fa4281c` |
| T-060 | macOS codesign + notarise build path | `2e8b691` |
| — | Phase 2 review fixes (3 Claude reviewers) | `75a1c16` |
| — | Codex adversarial fixes (2 HIGH) | `f011c20` |

All merged to `main`. Worktrees cleaned (only the pre-existing `d-lint-consumer-leak-guard` worktree remains untouched).

## Gate status at push

- TS build: clean
- Root jest: **1222 passing / 2 failing** (same 2 pre-existing as baseline 1169/2, +53 new tests across the 8 tasks)
- Engine vitest: **368 passing / 8 failing / 1 skipped** (baseline 349/8/1, +19 new auth tests)
- SwiftBar build: clean, app deployed to `~/Applications/`, process running
- Visual screenshot: `~/Desktop/screenshots/sweech/vy-go-batch1-final-state.png`

## Phase 2 review results

**Code review (3 MUST-FIX, all addressed in 75a1c16):**
- `__fish_seen_argument_from` → `__fish_seen_subcommand_from`
- dead `normalizedEmail` in vault.ts:242 removed
- header constants aligned mixed-case across CLI + engine

**Security review (3 MEDIUMs, MED-1 + MED-3 addressed in 75a1c16):**
- MED-1: `/check` + `/check/all` now auth-gated (was leaking profile enumeration)
- MED-3: `~/.sweech/` parent dir created mode 0o700
- *deferred:* MED-2 (explicit CORS deny policy) — defensive, not exploitable today

**Integration audit (2 BLOCKERS, both addressed in 75a1c16):**
- `src/vaultAdd.ts` was bypassing `getAnthropicClientId()` — T-043 was half-shipped
- `src/oauth.ts:52` had a stale `'sweech-cli'` literal

**Codex adversarial (2 HIGH, both addressed in f011c20):**
- HIGH 1: `daemon.secret` perms weren't enforced on read — now tightens 0o644→0o600 on every load
- HIGH 2: `saveAccount` was lock-free read-modify-write — now wrapped in `withVaultLock` (O_EXCL flag file, 2s deadline, 10s stale detection)
- *deferred:* memory-DoS on signed huge bodies (would need streaming body-hash); fish snapshot doesn't escape workspace names (low risk — names are validated)

## Remaining wave-5 backlog (17 tasks for next /vy-go)

### Critical (3)
- **T-040** — engine hot-reloads `~/.sweech/config.json` (currently only providers.yaml)
- **T-041** — eliminate silent `catch {}` blocks across CLI (23 instances)
- **T-042** — suppress update-check banner when `--json` is in argv

### High (5)
- **T-045** — `sweech proxy` fallback-routing reverse proxy *(depends on T-039 ✓)*
- **T-046** — predictive quota (burn-rate ETA in launcher + menubar)
- **T-047** — usage history log `~/.sweech/usage-log.jsonl` + `sweech history` command
- **T-048** — auto vault backup on every mutation
- **T-049** — SweechBar reads from daemon HTTP (kill the subprocess fan-out) *(depends on T-039 ✓)*

### Medium (7)
- **T-050** — token expiry shown as countdown not epoch ms
- **T-051** — `assign` pre-flights `which <cli>` (also fold in "workspace dir missing" detection from runecode sync gap)
- **T-052** — `sweech compare` gains `--json` + `--per-model`
- **T-053** — `sweech doctor` per-check timeouts + daemon health probe
- **T-054** — daemon log rotation
- **T-056** — centralise `DEFAULT_DAEMON_PORT` constant
- **T-057** — drop deprecated fields in `liveUsage.ts:57-65`

### Low (2)
- **T-061** — Sparkle auto-update for SweechBar *(depends on T-060 ✓)*
- **T-062** — multi-machine vault sync *(depends on T-048)*

### Deferred from review notes (not in original wave-5)
- README docs for `~/.sweech/daemon.secret` (mode 0600 lifecycle) + `SWEECH_ANTHROPIC_CLIENT_ID`
- CLI→engine integration test that boots `serve()` and signs through `buildAuthedHeaders` round-trip
- Memory-DoS protection: size cap before body-hash on signed routes
- CORS deny policy on daemon (defensive)
- `idFor()` separator collision hardening (length-prefixed or `\x1f`-separated)
- Stderr warning when `SWEECH_ANTHROPIC_CLIENT_ID` env override is in effect

## Suggested next /vy-go batch (5 parallel, max file disjoint)

| ID | Files |
|---|---|
| T-040 engine config watch | `packages/engine/src/middleware/profiles.ts` |
| T-042 update banner --json | `src/cli.ts` (update-check block) |
| T-046 predictive quota | `src/launcher.ts`, `src/cli.ts` (live block), `src/usageHistory.ts` (new) |
| T-050 expiry countdown | `src/launcher.ts`, accounts list formatter |
| T-051 + workspace-dir detection | `src/vaultAssign.ts`, engine check |

Note: T-041 (silent catches) touches many files. Consider doing it sequentially first to clear conflict surface for the next batch.

## Outstanding diagnostics

- 2 jest tests failing (baseline, untouched): `launcherIntegration grouped mode`, `systemCommands validateCommandName`. Both are pre-existing — not blocking but worth a triage task.
- `liveUsageCache.test.ts` has a TS compile error (missing `promotion` field on a mock) — pre-existing; would clear if T-057 lands.
- 8 engine vitest failures (baseline, untouched) — not introduced by this session.
- `package-lock.json` has a `0.2.0 ↔ 0.3.0` drift that a post-checkout hook keeps rewriting. Left out of every commit; safe to ignore until the hook is corrected.
