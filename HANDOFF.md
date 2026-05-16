# Handoff — 2026-05-16 /vy-go batch 3

## Shipped this session (5 wave-5 tasks + Phase 2 fixes + codex adversarial fixes)

| ID | Title | Worktree commit | Final-main commit |
|---|---|---|---|
| T-052 | `sweech compare` gains `--json` + `--per-model` | `5f77d25` | `bcc451c` (merge) |
| T-053 | Doctor per-check timeouts + daemon `/healthz` probe + 0/1/2 exit codes | `214fe64` | `563e1b1` (merge) |
| T-054 | Daemon log rotation — `LogRotator` + copy-truncate, 10 MiB or daily, keep 5 | `e94eb57`, `961ee97` | `8919b8d` (merge) |
| T-057 | Drop 5 `@deprecated` liveUsage fields; migrate 18 consumers incl. SwiftBar | `0c59344` | `d716ce5` (merge) |
| T-056 | Centralise `DEFAULT_DAEMON_PORT` — `src/constants.ts` + engine sibling | — | `cea8dd3` (main) |
| — | Merge-conflict fix: T-052 payload through `buckets[0]` after T-057 | — | `2e36cf1` |
| — | Phase-2 fix: doctor catch preserves 0/1/2 exit-code contract | — | `f8a3298` |
| — | Integration-audit blockers closed (engine port literal + cross-workspace test) | — | `daec824` |
| — | Codex adversarial fix: drop redundant engine-side log rotator | — | `e65144b` |
| — | `chore(keel)`: marked T-052/T-053/T-054/T-056/T-057 done | — | `7f77c95` |

15 commits ready to push. Range: `9be9a81..e65144b` (15 commits).

## Parallelism

Four worktree-isolated agents ran simultaneously for T-052 / T-053 / T-054 / T-057 (`.worktrees/T-052` etc., all `git worktree add HEAD`-based, branched off `9be9a81`). T-056 was authored sequentially on `main` AFTER the parallel batch merged because it touches `src/cli.ts` regions adjacent to T-052 (compare) and T-053 (doctor) and would have produced merge churn. All four worktrees merged back via `git merge --no-ff` with post-merge gates re-run on the final state. Worktrees cleaned at the end — `git worktree list` shows only the pre-existing `.worktrees/d-lint-consumer-leak-guard` (unchanged from batch 2).

## Gate status at push

- **TypeScript** (`npx tsc --noEmit`): root clean, engine clean
- **Root jest**: 1362 passing / 2 failing (baseline 1303/2 → **+59 new tests** across the 5 tasks + 1 cross-workspace constant test in `daec824`)
  - +18 `compare.test.ts` for T-052 (`--json` shape, `--per-model` renderer, default-output regression)
  - +17 `doctorTimeouts.test.ts` for T-053 (worstSeverity exit codes, withTimeout race, probeDaemonHealthz)
  - +16 `logRotator.test.ts` for T-054 (size trigger, daily boundary, keep cap, inode preservation)
  - +2 `quotaSnapshotShape.test.ts` for T-057 (runtime + `@ts-expect-error` type-level lock)
  - +5 `constants.test.ts` for T-056 (value, env override, non-numeric, zero/negative)
  - +1 cross-workspace equality (daec824, integration-audit Finding 7a)
  - Pre-existing failures unchanged: `launcherIntegration grouped mode`, `systemCommands validateCommandName`, `liveUsageCache.test.ts` TS compile error
- **Engine vitest**: 393 passing / 8 failing / 1 skipped (baseline 375/8/1, +18 new from T-054 daemon `log.test.ts`)
- **SwiftBar**: `swift build` clean, `.app` reassembled and installed to `~/Applications/`. Process verified running 10+ minutes consuming the post-T-057 bucket-only JSON shape without crash.
- **Visual proof — data-layer (preferred over screenshot for T-057)**:
  - `sweech usage --json` `live` keys after rebuild = `['buckets', 'capturedAt', 'representativeClaim', 'status', 'tokenExpiresAt', 'tokenStatus']` — zero deprecated fields present, `buckets[0].session/weekly.{utilization, resetsAt}` populated correctly
  - `sweech compare claude-pole codex --json` payload sources `utilization5h: 0.72` from `buckets[0].session.utilization` (verified after rebuild — initial dist was stale; `2e36cf1` merge-fix is in effect)
  - `sweech compare claude-pole codex --per-model` text output shows the per-model rate-limit table
  - `sweech doctor` exit code is `2` when errors detected (verified end-to-end), `0` on all-green (T-053 0/1/2 contract honoured)
- **Visual proof — screenshot** of SweechBar popover repeatedly toggled shut between AppleScript click and `screencapture` due to focus mechanics on the external display. Process-level proof (10+ min uptime against new JSON shape) substitutes for the visual.

## Phase 2 review results

**Code review** (`code-reviewer` agent — 2 MUST-FIX + 2 SHOULD-FIX + 3 NICE-TO-HAVE):
1. MUST-FIX: `src/cli.ts:1687` doctor catch unconditionally `process.exit(1)` — overrode T-053's exitCode=2 contract. Fixed in `f8a3298`: catch now sets `exitCode = max(prior, 2)`.
2. MUST-FIX-flagged: `packages/engine/src/usage.ts:16-31` and `cli/usage.ts:75` retain a parallel `LiveRateLimitData` interface with the deprecated fields. **Re-classified as SHOULD-FIX after security review confirmed** the engine has its own separate cache populated from API headers directly — different type, different cache, different consumer; not a silent-break, but real consistency tech debt. **Carried forward** (see backlog below).
3. SHOULD-FIX: `resolveDaemonPortForDoctor` duplicates `resolveDaemonPort` from `cli.ts:3602`. Not addressed this batch — leaving for a future "unify port-resolution helpers" task (also flagged in T-056's commit message).
4. SHOULD-FIX: `BucketWindow.resetsAt: Double?` is optional while `utilization: Double` is non-optional in `SweechAPI.swift:11` — type inconsistency. Carried forward.
5. NICE-TO-HAVE: `withTimeout` doesn't thread `AbortSignal` through — caller's inner fetch keeps running after the timeout fires. Documented for follow-up; codex also flagged this (see below).

**Security review** (`security-reviewer` agent — 0 HIGH / 0 MEDIUM / 4 LOW defence-in-depth notes, no code changes required):
- LOW: `parseInt("8080abc")` semantics — non-issue for port (numeric flow, no injection vector).
- LOW: log rotation `statSync` follows symlinks — non-issue because `~/Library/Logs` is mode 0700 (single-user trust boundary).
- LOW: rotated `.1`…`.5` inherit source mode 0644 — non-issue, parent dir is the security boundary.
- LOW: JSON output may serialise NaN as null — verified unreachable on the actual code paths.

**Integration audit** (`general-purpose` agent — 2 BLOCKERS + 2 MEDIUM + 3 NICE-TO-HAVE):
- BLOCKER 5a: `packages/engine/src/daemon/index.ts:49` runtime port fallback hardcoded `7801` instead of using `DEFAULT_DAEMON_PORT`. Fixed in `daec824`.
- BLOCKER 7a: No cross-workspace equality test between the two `DEFAULT_DAEMON_PORT` constants. Fixed in `daec824` (new `constants.test.ts` assertion).
- MEDIUM 8a: `tests/quotaSnapshotShape.test.ts` locks the inner `LiveRateLimitData` shape but not the outer `sweech usage --json` / `sweech list --json` payload. Carried forward.
- MEDIUM 9a: Parallel `LiveRateLimitData` definition in engine (same as code-reviewer #2). Carried forward.
- NICE-TO-HAVE: tighter integration tests (end-to-end CLI → daemon → /healthz → bucket migration). Carried forward.

**Codex adversarial** (`codex exec` against the diff — 2 HIGH + 2 MEDIUM + 1 LOW):
- HIGH (logRotator copy-truncate window): documented in `e65144b` as a deliberate known limitation matching newsyslog/`logrotate --copytruncate`. Full fix would require SIGHUP-style logger reopen, out of T-054 scope; volume is too low to make the window observable.
- HIGH (dual rotator + no cross-process lock): engine daemon's `LogRotator` and fed server's `LogRotator` both pointed at `~/Library/Logs/sweech-serve.log`. Engine daemon's stdio is `'ignore'` (cli.ts:3658) so it never writes to that file. Fixed in `e65144b` by removing the engine-side rotator entirely; class import retained for the future "engine writes its own log" case.
- MEDIUM (engine LiveRateLimitData): same finding as code-reviewer + integration-audit. Carried forward.
- MEDIUM (withTimeout doesn't abort underlying work): documented for follow-up.
- LOW (doctor exit 1 when daemon down may surprise CI): T-053 contract is intentional — daemon-unreachable = severity 1 (warning). Documenting here so external consumers know.

## Outstanding wave-5 backlog (8 tasks for next /vy-go)

### Critical (1)
- **T-041** — eliminate silent `catch {}` blocks across CLI (23 instances). **Recommend running solo** — touches many files, parallel worktrees would conflict.

### High (3)
- **T-045** — `sweech proxy` fallback-routing reverse proxy *(depends on T-039 ✓)*
- **T-047** — usage history log `~/.sweech/usage-log.jsonl` + `sweech history` command
- **T-048** — auto vault backup on every mutation
- **T-049** — SweechBar reads from daemon HTTP (kill subprocess fan-out) *(depends on T-039 ✓)*

### Low (2)
- **T-061** — Sparkle auto-update for SweechBar *(depends on T-060 ✓)*
- **T-062** — multi-machine vault sync *(depends on T-048)*

### Carried-forward review findings (this session + prior)
- README docs for `~/.sweech/daemon.secret` (mode 0o600 lifecycle) + `SWEECH_ANTHROPIC_CLIENT_ID`
- README docs for `~/.sweech/quota-samples.json` (purpose, retention, opt-out)
- README docs for `--force` semantics on `sweech assign`
- README docs for `SWEECH_LOG_PATH` env var + rotation cadence (new this batch)
- CLI→engine integration test that boots `serve()` and signs through `buildAuthedHeaders` round-trip
- Memory-DoS protection: size cap before body-hash on signed routes
- CORS deny policy on daemon (defensive)
- `idFor()` separator collision hardening (length-prefixed or `\x1f`-separated)
- Stderr warning when `SWEECH_ANTHROPIC_CLIENT_ID` env override is in effect
- **NEW: unify `resolveDaemonPort` (full env+config+default) vs `envOrDefaultDaemonPort` (env-only) — two distinct resolution strategies coexist; merge into one helper in `src/constants.ts` and migrate callers**
- **NEW: migrate `packages/engine/src/usage.ts` `LiveRateLimitData` to bucket shape, mirroring `src/liveUsage.ts` (T-057 follow-up — separate workspace, separate cache, but identical-named type with different shape is a footgun)**
- **NEW: tighten `tests/quotaSnapshotShape.test.ts` to also lock the outer `sweech usage --json` / `sweech list --json` payload shape — currently only the inner type is locked**
- **NEW: align `BucketWindow.resetsAt` optionality with `utilization` optionality in `SweechAPI.swift:11`**
- **NEW: thread `AbortSignal` through `withTimeout` so callers can cancel inner work after the outer timeout fires**
- **NEW: write a `SIGHUP`-style logger reopen path to close the copy-truncate window in `LogRotator` (only worth doing if log volume grows materially)**
- **NEW: end-to-end integration test wiring `runDoctor() → real TCP daemon /healthz → HMAC bypass → bucket migration` — proves all four refactors live together**

## Suggested next /vy-go batch

Two viable shapes:

**A) Solo T-041 batch** — 23-file silent-catch cleanup. Single-threaded because parallel agents would race on `src/cli.ts`. Likely the safest next batch.

**B) 3 parallel + 1 solo (file-disjoint)**:
| ID | Files (target) |
|---|---|
| T-047 `sweech history` | `src/usageHistory.ts` (likely new), `src/cli.ts` (new history command region) |
| T-048 auto vault backup | `src/vault.ts` or wherever vault mutations live |
| T-049 SweechBar reads from daemon HTTP | `macos-menubar/SweechBar/Sources/SweechAPI.swift` |
| (Solo, sequential) T-041 silent catches | many files |

T-049 has the biggest blast radius because it changes how SweechBar gets data — needs visual proof.

## Outstanding diagnostics

- 2 jest failures (baseline, untouched): `launcherIntegration grouped mode`, `systemCommands validateCommandName`. Worth a triage task next batch.
- `liveUsageCache.test.ts` TS compile error (pre-existing reference to removed `promotion` field). Independent cleanup — out of T-057 scope (T-057 was about a different set of fields).
- 8 engine vitest failures (baseline, untouched): not introduced by this session — check/keychain/profiles-migration boundary tests, fail on this machine's env regardless of branch.
- `package-lock.json 0.2.0↔0.3.0` drift continues to be rewritten by a hook; deliberately not staged in any commit this batch.
- Pre-existing `chore/d-lint-consumer-leak-guard` worktree at `.worktrees/d-lint-consumer-leak-guard` is unchanged — third batch in a row carrying this. Integration audit flagged it as NICE-TO-HAVE (`Finding 9b`). Worth a one-time cleanup if the lint branch is no longer needed.
- SourceKit (not `swift build`) emits `'main' attribute cannot be used in a module that contains top-level code` against `SweechWidget.swift:225`. This is a known SourceKit false positive when a separate widget extension target shares the same SwiftPM module index — `swift build` and Xcode build both succeed clean. Not introduced this batch; pre-existing.
