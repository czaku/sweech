# Product Gaps — sweech — 2026-05-20

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
| React dashboard shell | `apps/dashboard` builds into `dist/dashboard`; `sweech dashboard` opens the fed-server-backed React app |

## Half-Built

| Feature | What exists | What's missing |
|---------|-------------|----------------|
| Dashboard | React shell, `/dashboard/state`, `/dashboard/sessions`, `/dashboard/events`, SSE, localhost-only asset serving | Production panels, settings, restore actions, federation state |
| Session management | `sweech agents`, `sweech sessions`, durable `sessions.db`, tmux lifecycle, terminal launcher, wrapper writes | Full reboot recovery and one-click restore UX |
| Federation | Base fed endpoints | LAN dashboard peer state, remote restore, compatibility handling |
| Provider/account/workspace model | v2 vault and account list shipped | Deferred JSON schema v3 and full provider-tree UI |
| SweechBar | Native app builds with account/workspace UI | v0.4 balance, briefing, daemon-backed dashboard parity |
| Distribution | npm package metadata, Homebrew files, install scripts | v0.4 migration runner, dashboard bundle shipping, clean version story |

## Phantom

| Feature | Where promised | Reality |
|---------|----------------|---------|
| Production dashboard panels | Wave 7, dashboard spec | Shell exists; workspaces/accounts/cost/audit/failover/billing panels still need real implementations |
| AI session tile summaries | Wave 7 | No `sessionSummarizer.ts`, no summary columns in a sessions DB |
| Daily briefing | Wave 7 | No `briefing.ts`, no dashboard/SweechBar briefing surface |

## Broken Or Risky

| Finding | Evidence | Impact |
|---------|----------|--------|
| Remaining dashboard scope is large | Shell and local state routes exist; many panels and restore workflows remain open | Risk of shipping a partially useful control panel if restore and real panel data lag |
| Keel generated views are stale/thin | `views/roadmap.md` is empty; `views/tasks.md` shows only 3 tasks while task JSON has 120 files | Operators may work from an incomplete backlog if they trust generated views |
| Wave 7 tasks lack acceptance criteria in JSON | All `T-DASH-*` tasks inspected report missing `acceptanceCriteria` | The spec is strong, but the executable task tracker is not delivery-ready |
| New dashboard scope is oversized | 39 tasks, many cross-cutting, with several "critical" tasks depending on unbuilt foundations | High risk of half-shipping a UI shell without durable recovery workflows |

## Conceptual Gaps

1. The product thesis has shifted from "profile isolation" to "operator control plane", but the working architecture is still CLI-first.
2. The v0.4 spec depends on a durable session ledger, tmux wrapper, daemon state, and terminal launcher. Those are foundations, not panels. Building panels first would create another prototype.
3. There are two routing layers in play: existing `sweech auto/failover/pin` and the newer dashboard/balance/briefing routing. These need one shared scoring contract.
4. Keel state needs cleanup before execution. The prose spec has acceptance detail, but task JSON does not.

## Recommendations

1. Keep the full local gate green: `npm test -- --runInBand`, `npm run build`, `npx tsc --noEmit`, Swift build, audit, and diff check.
2. Regenerate or repair Keel views, then add 3-5 binary acceptance criteria to every Wave 7 task before implementation.
3. Continue v0.4 foundation in this order: AI summaries, federation routes, restore UX, real panels, balance/briefing, release gate.
4. Do not build the dashboard as a decorative shell. The flagship feature is one-click recovery into the right terminal/tmux session.
5. Treat the removed legacy dashboard as gone; do not recreate an inline HTML fallback unless Keel explicitly reopens that decision.
