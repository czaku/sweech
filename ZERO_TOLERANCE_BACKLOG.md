# Zero Tolerance Backlog — sweech — 2026-05-18

Mode: SHRED + brutal-response

Source files:
- `PRODUCT_STORY.md`
- `PRODUCT_GAPS.md`
- `BRUTAL_ASSESSMENT.md`

Keel note: the installed `keel` binary is a shim with `status`, `task list/show/done/block/update/note`, `wave list`, and `search`. It does not expose `wave add/create` or `task add`, so this file is the executable source-of-truth until a full Keel writer is available.

## Wave Summary

- Tasks: 18 total
- Size: S:4, M:10, L:4
- Priority order: test/build gates, backlog correctness, session-recovery spine, dashboard replacement, final proof gates
- Coverage: every concrete recommendation from the three assessment files is mapped below.

## Tasks

### 1. Fix Jest green-output/non-zero-exit leak

- **Source:** "`npm test -- --runInBand` reports 89/89 suites passing, 2,237/2,242 tests passing/skipped, then exits `2`"
- **Category:** fix
- **Priority:** critical
- **Criteria:**
  - [x] `npm test -- tests/doctorTokenRefresh.test.ts --runInBand` prints passing tests and exits `0`.
  - [ ] `npm test -- --runInBand` prints passing tests and exits `0`.
  - [ ] Tests that call `runDoctor()` restore `process.exitCode` and console spies after each capture.
  - [ ] The fix does NOT change production `sweech doctor` severity exit-code behavior.
- **Size:** S
- **Depends on:** none
- **Verification:** targeted Jest run, full Jest run

### 2. Regenerate or repair generated Keel views

- **Source:** "`views/roadmap.md` is empty; `views/tasks.md` shows only 3 tasks while task JSON has 120 files"
- **Category:** fix
- **Priority:** critical
- **Criteria:**
  - [ ] `views/roadmap.md` shows active/ready/todo waves including Wave 5 and Wave 7.
  - [ ] `views/tasks.md` includes all active, ready, blocked, and todo tasks from `keel/tasks/*.json`.
  - [ ] Regeneration command is documented in the task note or script output.
  - [ ] The fix does NOT hand-edit generated views as the final source.
- **Size:** S
- **Depends on:** none
- **Verification:** `keel`/render command output, `rg "T-DASH-001|T-076" views/tasks.md`

### 3. Add binary acceptance criteria to every Wave 7 task JSON

- **Source:** "All `T-DASH-*` tasks are missing machine-readable acceptance criteria."
- **Category:** backlog
- **Priority:** critical
- **Criteria:**
  - [ ] Every `keel/tasks/T-DASH-*.json` has `acceptanceCriteria` with 3-5 binary criteria.
  - [ ] Every task has at least one negative criterion using "does NOT".
  - [ ] Criteria include explicit verification methods: test, grep, screenshot, curl, or manual smoke.
  - [ ] The criteria do NOT expand a task beyond one L-sized session.
- **Size:** M
- **Depends on:** none
- **Verification:** JSON scan for `acceptanceCriteria`, `does NOT`

### 4. Split oversized Wave 7 panel/release tasks into one-session tasks

- **Source:** "Several tasks are too large for one safe session: `T-DASH-010`, `T-DASH-011`, `T-DASH-012`, `T-DASH-013`, `T-DASH-014`, `T-DASH-018`, `T-DASH-019`, `T-DASH-020`, `T-DASH-032`."
- **Category:** backlog
- **Priority:** critical
- **Criteria:**
  - [ ] Each listed task is split or scoped so no child task is larger than L.
  - [ ] Dependencies form a DAG and foundation tasks precede UI panel tasks.
  - [ ] The release task becomes a gate checklist, not implementation work.
  - [ ] The split does NOT delete or narrow any promised feature without a deferred task.
- **Size:** M
- **Depends on:** task 3
- **Verification:** task JSON diff, dependency scan

### 5. Reorder Wave 7 around the session-recovery vertical slice

- **Source:** "The fastest path to something a real user could touch is ... launch a workspace, create a durable session row, tmux-wrap it, show it in a minimal React sessions panel, and click back into the session."
- **Category:** backlog
- **Priority:** critical
- **Criteria:**
  - [ ] Foundation order is `sessions.db` → `tmux.ts` → `terminalLauncher.ts` → dashboard server/SSE → wrapper writes → minimal Sessions UI.
  - [ ] `T-DASH-016` E2E starts once the first dashboard state endpoint exists.
  - [ ] Security review tasks cover terminal launch and HMAC federation before broad UI buildout.
  - [ ] The order does NOT put decorative panels before restore proof.
- **Size:** S
- **Depends on:** tasks 3, 4
- **Verification:** backlog/order diff

### 6. Create durable `sessions.db` lifecycle storage

- **Source:** "The v0.4 spec depends on a durable session ledger..."
- **Category:** feature
- **Priority:** critical
- **Criteria:**
  - [ ] `src/sessions.ts` creates and migrates `~/.sweech/sessions.db` with the spec schema.
  - [ ] CRUD covers insert, updateStatus, markActivity, list, byId, and bulkWipe.
  - [ ] Reconcile marks dead live rows as `crash-recoverable`.
  - [ ] Tests cover empty migration, lifecycle, filters, and wipe behavior.
  - [ ] It does NOT corrupt or rewrite existing `~/.sweech` config/history files.
- **Size:** L
- **Depends on:** task 1
- **Verification:** Jest tests, sqlite schema query

### 7. Add tmux naming, wrapping, and live-session probes

- **Source:** "tmux-backed crash recovery, one-click terminal restore..."
- **Category:** feature
- **Priority:** critical
- **Criteria:**
  - [ ] `src/tmux.ts` exposes availability, deterministic names, wrapCommand, listLiveSessions, and attachClients.
  - [ ] Session-name collisions append a stable short suffix.
  - [ ] Tests cover naming, collision, list parsing, and client count parsing.
  - [ ] The wrapper does NOT require tmux when tmux is disabled or missing.
- **Size:** M
- **Depends on:** task 6
- **Verification:** Jest tests, local tmux smoke when available

### 8. Add safe terminal launcher for Ghostty, iTerm2, Terminal.app, and generic terminals

- **Source:** "Click `↗ jump` → terminal launcher opens user's preferred terminal..."
- **Category:** feature
- **Priority:** critical
- **Criteria:**
  - [ ] `src/terminalLauncher.ts` launches Ghostty, iTerm2, Terminal.app, or generic `-e` command.
  - [ ] Missing terminal returns `{ ok:false, reason }` with install hint.
  - [ ] Tests assert exact `execFile`/`osascript` argument construction.
  - [ ] The launcher does NOT invoke shell interpolation with untrusted session/cwd values.
- **Size:** M
- **Depends on:** task 7
- **Verification:** Jest tests, security review grep

### 9. Extend dashboard server with static app, state routes, and SSE

- **Source:** "Dashboard state API: not present. Dashboard SSE stream: not present."
- **Category:** feature
- **Priority:** critical
- **Criteria:**
  - [ ] `src/dashboardServer.ts` serves `dist/dashboard/` at `/`.
  - [ ] `/dashboard/state`, `/dashboard/sessions`, `/dashboard/sessions/:id/restore`, and `/dashboard/events` exist.
  - [ ] SSE sends typed events and 15s heartbeat.
  - [ ] Routes bind to localhost by default and reject non-local dashboard access.
  - [ ] The server does NOT remove existing `/fed/*` contracts.
- **Size:** L
- **Depends on:** tasks 6, 8
- **Verification:** Jest route tests, `curl -N /dashboard/events`

### 10. Make wrappers write session rows and tmux-wrap launches

- **Source:** "launch a workspace, create a durable session row, tmux-wrap it..."
- **Category:** feature
- **Priority:** critical
- **Criteria:**
  - [ ] Wrapper launch creates a `sessions.db` row with workspace, cwd, pid, tmux name, timestamps, and status.
  - [ ] Hidden CLI hooks update lifecycle on launch/close without exceeding 50ms normal overhead.
  - [ ] Killing or detaching a tmux session reconciles to the expected status.
  - [ ] The wrapper does NOT break existing `sweech use`, `sweech run`, `--resume`, or `--yolo` behavior.
- **Size:** L
- **Depends on:** tasks 6, 7, 9
- **Verification:** Jest wrapper tests, manual launch smoke

### 11. Scaffold the React dashboard around real state, not placeholders only

- **Source:** "Do not build the dashboard as a decorative shell. The flagship feature is one-click recovery into the right terminal/tmux session."
- **Category:** feature
- **Priority:** critical
- **Criteria:**
  - [ ] `apps/dashboard` builds into `dist/dashboard`.
  - [ ] The initial app consumes `/dashboard/state` and `/dashboard/events`.
  - [ ] Empty states and loading states exist for sessions/accounts/cost/doctor panels.
  - [ ] The scaffold does NOT replace real state with permanent mock-only tiles.
- **Size:** L
- **Depends on:** task 9
- **Verification:** `npm run build`, Playwright screenshot

### 12. Build the minimal Sessions panel with one-click restore

- **Source:** "show it in a minimal React sessions panel, and click back into the session."
- **Category:** feature
- **Priority:** critical
- **Criteria:**
  - [ ] Live, detached, recoverable, and closed sessions render as distinct tile states.
  - [ ] Tile includes workspace, cwd, machine, pid, tmux name, timestamps, and restore button.
  - [ ] Restore calls the local restore endpoint and reports success/failure.
  - [ ] Screenshot proof exists for empty state and populated state.
  - [ ] The panel does NOT hide failed restore errors.
- **Size:** M
- **Depends on:** tasks 10, 11
- **Verification:** Playwright screenshot, component tests

### 13. Keep legacy dashboard until React restore flow is proven, then retarget

- **Source:** "Keep the legacy dashboard until the new dashboard passes an end-to-end restore flow, then delete it in the retarget task."
- **Category:** refactor
- **Priority:** high
- **Criteria:**
  - [ ] `sweech dashboard` opens the React dashboard only after the restore E2E passes.
  - [ ] `src/dashboard.ts` is removed only in the retarget commit.
  - [ ] README/help text reflects the actual dashboard behavior.
  - [ ] The retarget does NOT remove legacy functionality before replacement proof exists.
- **Size:** M
- **Depends on:** task 12
- **Verification:** CLI smoke, screenshot, code deletion diff

### 14. Add LAN dashboard federation routes with HMAC protection

- **Source:** "LAN dashboard federation: not present."
- **Category:** feature
- **Priority:** high
- **Criteria:**
  - [ ] `/fed/dashboard/state`, `/fed/dashboard/restore`, and `/fed/dashboard/summary` exist.
  - [ ] Each route requires valid HMAC except public compatibility metadata.
  - [ ] Two local daemon instances can exchange state with isolated data dirs.
  - [ ] The federation routes do NOT send raw conversation JSONL across machines.
- **Size:** M
- **Depends on:** tasks 9, 12
- **Verification:** integration test with two ports

### 15. Add AI session summaries after the session spine works

- **Source:** "AI-generated session summaries: not present."
- **Category:** feature
- **Priority:** high
- **Criteria:**
  - [ ] `src/sessionSummarizer.ts` summarizes recent JSONL activity into title, one-liner, and bullets.
  - [ ] Local-first provider path is attempted before metered fallback.
  - [ ] Summary cost/provider/model are stored in `sessions.db`.
  - [ ] Prompt construction does NOT allow raw transcript instructions to override the summary contract.
- **Size:** M
- **Depends on:** task 12
- **Verification:** Jest tests, sample JSONL smoke

### 16. Add subscription balance as a shared routing contract

- **Source:** "There are two routing layers in play... These need one shared scoring contract."
- **Category:** feature
- **Priority:** high
- **Criteria:**
  - [ ] Balance score is computed per `<provider>:<accountId>` using usage/cache/history/billing data.
  - [ ] `sweech auto --balance` uses the same score exposed to the dashboard panel.
  - [ ] CLI and dashboard display the same recommended account for the same fixture.
  - [ ] The score does NOT override hard-limit or disabled/hidden account exclusions.
- **Size:** M
- **Depends on:** task 12
- **Verification:** shared fixture tests

### 17. Add daily briefing only after balance and sessions are real

- **Source:** "Daily briefing: not present."
- **Category:** feature
- **Priority:** medium
- **Criteria:**
  - [ ] `sweech briefing` summarizes session recovery, balance risks, and recommended next launches.
  - [ ] Dashboard banner and SweechBar badge read the same briefing state.
  - [ ] Dismissal persists per day.
  - [ ] Briefing generation does NOT spend cloud budget when local-only mode/cap is active.
- **Size:** M
- **Depends on:** tasks 15, 16
- **Verification:** Jest tests, screenshot

### 18. Final v0.4 release proof gate

- **Source:** "Capture screenshots and terminal proof for the dashboard, session tile, and restore flow."
- **Category:** test
- **Priority:** critical
- **Criteria:**
  - [ ] `npm run build`, `npx tsc --noEmit`, `npm test -- --runInBand`, and `swift build` all exit `0`.
  - [ ] Playwright screenshots prove empty dashboard, populated sessions, restore error, and restore success states.
  - [ ] Manual terminal proof shows launch → tmux session → dashboard tile → restore.
  - [ ] README and CHANGELOG match shipped behavior.
  - [ ] The release does NOT claim any unimplemented panel or automation as shipped.
- **Size:** M
- **Depends on:** all prior critical/high tasks
- **Verification:** command logs, screenshots under `~/Desktop/screenshots/sweech/`

## Audit Result

- Tasks rewritten for clarity: 18
- Criteria added: 18
- Reordered: yes
- Split oversized work: yes, especially dashboard panels and release gate
- Merged duplicates: yes, dashboard/server/session-recovery duplicates were clustered into the spine
- DAG status: valid
- Stop-at-50% value: after tasks 1-10, Sweech has the core session-recovery backend and can be connected to UI; after task 12, it has the actual v0.4 product spine.
