# Brutal Assessment — sweech — 2026-05-18

## Reality Check

- Features claimed done in task JSON: 62
- Current planned Wave 7 tasks: 39
- Wave 7 tasks with acceptance criteria in JSON: 0
- Tests: 89 suites pass in output, 2,237 tests pass, 5 skipped, but command exits `2`
- Build: `npm run build` passes
- Type check: `npx tsc --noEmit` passes
- SweechBar build: `swift build` passes with SwiftUI deprecation warnings
- Real completion against v0.4 dashboard vision: early foundation/spec stage, not product stage

## Visual QA

Screenshot: `~/Desktop/screenshots/sweech/dashboard-current-2026-05-18.png`

The current dashboard is a simple usage analytics page. It is readable, not broken, and data renders. It is also nowhere close to the promised control panel. It has no session tiles, no restore affordance, no settings drawer, no federation panel, no logs, no doctor panel, no setup wizard, and no command palette. The "Top profiles by launches" panel is empty while account rows are populated, so the page feels like a partial diagnostic rather than a product surface.

Design score: 2.5/5 for the current dashboard. It is serviceable for internal usage, not compelling enough to be the flagship experience.

## Backlog Audit

Wave 7 has strong prose in `docs/specs/dashboard-2026-05-18.md` and `docs/specs/dashboard-2026-05-18-backlog.md`, but the Keel task JSON is not clean enough for execution.

- All `T-DASH-*` tasks are missing machine-readable acceptance criteria.
- Several tasks are too large for one safe session: `T-DASH-010`, `T-DASH-011`, `T-DASH-012`, `T-DASH-013`, `T-DASH-014`, `T-DASH-018`, `T-DASH-019`, `T-DASH-020`, `T-DASH-032`.
- Ordering is mostly right at the high level, but `T-DASH-016` E2E should start as soon as the first dashboard state endpoint exists, not after all panels.
- `T-DASH-017` adversarial review is good, but it should not wait until the full dashboard diff if terminal launching and HMAC federation are already implemented. Those need earlier security review.
- `T-DASH-018 Ship 0.4.0` is not a task; it is a release gate and should depend on explicit proof artifacts.

## Features That Do Not Work Yet

- New React dashboard: not present.
- Dashboard state API: not present.
- Dashboard SSE stream: not present.
- SQLite sessions DB: not present for the v0.4 flow.
- Tmux wrapper lifecycle: not present.
- One-click session restore: not present.
- LAN dashboard federation: not present.
- AI-generated session summaries: not present.
- Daily briefing: not present.
- Subscription balance dashboard/routing: not present.
- New CLI backends for opencode/gemini/goose/jcode: not present in the current root CLI.

## Code Quality

The codebase is large but not hollow. The CLI has broad tests and build/type gates pass. There are still many silent `catch {}` sites in production code, which matches an already-open Wave 5 critical task. The dashboard implementation is intentionally old and should be replaced only after the new path actually works end-to-end.

One serious gate issue remains: Jest reports all suites passing but exits with code `2`. That is a release blocker until diagnosed.

## Verdict

FIX FIRST for v0.4. SHIP for the existing v0.3 CLI only if the non-zero test exit is resolved or explicitly understood.

The fastest path to something a real user could touch is not the whole 39-task dashboard. It is a narrow vertical slice: launch a workspace, create a durable session row, tmux-wrap it, show it in a minimal React sessions panel, and click back into the session. If that works, the product has a new spine. If it does not, every panel around it is decoration.

## What Would Make This Shippable

1. Fix `npm test` returning exit code `2`.
2. Add acceptance criteria to every Wave 7 task before running agents on it.
3. Build and verify the session-recovery vertical slice first.
4. Capture screenshots and terminal proof for the dashboard, session tile, and restore flow.
5. Only then expand to account/cost/federation/settings panels.
