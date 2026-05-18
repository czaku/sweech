# Product Gaps — sweech — 2026-05-18

## Summary

- Features promised or planned: 18 major capability groups
- Shipped: 9
- Half-built: 6
- Phantom: 3
- Broken gate: 1
- Integrity score: roughly 50% against the full public/docs promise, much higher for the original CLI-switcher promise and much lower for the v0.4 dashboard promise.

## Shipped

| Feature | Evidence |
|---------|----------|
| Multi-profile CLI switching | `src/cli.ts`, `src/config.ts`, `sweech use`, wrapper generation, tests |
| Claude/Codex/Kimi/custom provider profile model | `src/clis.ts`, `src/providers.ts`, `src/customProvider.ts`, tests |
| Shared data mode | `SHAREABLE_DIRS`, `CODEX_SHAREABLE_DIRS`, share topology tests |
| Credential vault/account assignment | `src/vault.ts`, `src/accountCrud.ts`, `src/vaultAssign.ts`, tests |
| Usage, history, cost, quota display | `src/usage.ts`, `src/usageHistory.ts`, `src/costCommand.ts`, `src/providerQuotas.ts`, tests |
| Auto/failover/project pin routing | `src/autoCommand.ts`, `src/failover.ts`, `src/projectConfig.ts`, tests |
| Federation base API | `src/fedServer.ts` exposes `/healthz`, `/fed/info`, `/fed/runs`, `/fed/widget`, `/fed/recommendation`, `/fed/route-recommendation`, `/fed/alerts` |
| macOS SweechBar | `macos-menubar/SweechBar` builds successfully |
| Legacy dashboard | `src/dashboard.ts` serves a usage analytics HTML page; screenshot captured |

## Half-Built

| Feature | What exists | What's missing |
|---------|-------------|----------------|
| Dashboard | Single HTML analytics page | React control panel, panels, SSE, settings, restore actions, federation state |
| Session management | `sweech agents`, `sweech sessions`, test coverage | Durable `sessions.db`, tmux lifecycle, reboot recovery, terminal restore |
| Federation | Base fed endpoints | LAN dashboard peer state, remote restore, compatibility handling |
| Provider/account/workspace model | v2 vault and account list shipped | Deferred JSON schema v3 and full provider-tree UI |
| SweechBar | Native app builds with account/workspace UI | v0.4 balance, briefing, daemon-backed dashboard parity |
| Distribution | npm package metadata, Homebrew files, install scripts | v0.4 migration runner, dashboard bundle shipping, clean version story |

## Phantom

| Feature | Where promised | Reality |
|---------|----------------|---------|
| New React dashboard | Wave 7, dashboard spec | `apps/dashboard` does not exist yet |
| AI session tile summaries | Wave 7 | No `sessionSummarizer.ts`, no summary columns in a sessions DB |
| Daily briefing | Wave 7 | No `briefing.ts`, no dashboard/SweechBar briefing surface |

## Broken Or Risky

| Finding | Evidence | Impact |
|---------|----------|--------|
| Test gate exits non-zero | `npm test -- --runInBand` reports 89/89 suites passing, 2,237/2,242 tests passing/skipped, then exits `2` | CI/local gates will treat a green-looking test run as failed |
| Keel generated views are stale/thin | `views/roadmap.md` is empty; `views/tasks.md` shows only 3 tasks while task JSON has 120 files | Operators may work from an incomplete backlog if they trust generated views |
| Wave 7 tasks lack acceptance criteria in JSON | All `T-DASH-*` tasks inspected report missing `acceptanceCriteria` | The spec is strong, but the executable task tracker is not delivery-ready |
| New dashboard scope is oversized | 39 tasks, many cross-cutting, with several "critical" tasks depending on unbuilt foundations | High risk of half-shipping a UI shell without durable session recovery |
| Legacy dashboard promise is mismatched | Help says "local usage analytics dashboard"; Wave 7 says "replace dashboard entirely" | Users expecting the new operator console will only get analytics today |

## Conceptual Gaps

1. The product thesis has shifted from "profile isolation" to "operator control plane", but the working architecture is still CLI-first.
2. The v0.4 spec depends on a durable session ledger, tmux wrapper, daemon state, and terminal launcher. Those are foundations, not panels. Building panels first would create another prototype.
3. There are two routing layers in play: existing `sweech auto/failover/pin` and the newer dashboard/balance/briefing routing. These need one shared scoring contract.
4. Keel state needs cleanup before execution. The prose spec has acceptance detail, but task JSON does not.

## Recommendations

1. Fix the Jest exit-code bug first. A green summary with exit code 2 invalidates every delivery gate.
2. Regenerate or repair Keel views, then add 3-5 binary acceptance criteria to every Wave 7 task before implementation.
3. Ship v0.4 foundation in this order: `sessions.db`, tmux integration, terminal launcher, dashboard server/SSE, wrapper writes, then React UI.
4. Do not build the dashboard as a decorative shell. The flagship feature is one-click recovery into the right terminal/tmux session.
5. Keep the legacy dashboard until the new dashboard passes an end-to-end restore flow, then delete it in the retarget task.
