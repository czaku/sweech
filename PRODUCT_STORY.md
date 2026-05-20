# Product Story — sweech — 2026-05-20

Sweech is trying to become the local control plane for AI coding tools. The original product is a CLI profile switcher: create isolated Claude Code, Codex, Kimi, local, and OpenAI-compatible workspaces; keep their credentials and config dirs separate; share project memory when useful; inspect usage; and pick an account that still has capacity. That part is real and substantial.

Today, a user can run `sweech list`, `sweech use <workspace>`, `sweech usage`, `sweech accounts list`, `sweech assign`, `sweech auto`, `sweech failover`, `sweech cost`, `sweech query`, and `sweech models`. The CLI surface is broad, the source has 81 TypeScript modules, and the Jest suite covers a lot of behavior: 89 suites, 2,237 passing tests, 5 skipped. The macOS SweechBar app also builds and exposes account/workspace views, though it is still a companion surface rather than the main product.

The live dashboard is now the new React control panel path. `sweech dashboard` starts a localhost-only fed server, serves `dist/dashboard/`, and attaches to an existing dashboard only after probing `/dashboard/state`. The old inline HTML analytics server in `src/dashboard.ts` has been removed. A fresh screenshot was captured at `~/Desktop/screenshots/sweech/dashboard-retarget-T-DASH-007-2026-05-20.png`.

What is being built now is bigger: v0.4.0 is meant to replace that dashboard with a React single-page operator console backed by a daemon. The new dashboard spec wants live session tiles, tmux-backed crash recovery, one-click terminal restore, SQLite session history, SSE updates, LAN federation, AI-generated session summaries, settings, logs, doctor checks, routing, billing, cost, balance, and a setup wizard. In plain terms: Sweech is moving from "profile switcher" to "AI workbench operations console."

The current Wave 7 work has landed the dashboard scaffold, sessions.db, terminal launching, tmux integration, wrapper writes, dashboard server routes, and dashboard command retargeting. Remaining dashboard work adds AI summaries, federation routes, production panels, provider pricing classification, subscription balance, daily briefing, SweechBar parity, and the 0.4.0 release gate.

What is on the horizon is a fuller routing/conductor model: Sweech would know which account, provider, model, and workspace should handle a task, based on quota, budget, capabilities, project pins, health, and maybe historical performance. The older `PRODUCT_IT_WAS_MEANT_TO_BE.md` describes that direction clearly: not just switching between tools, but orchestrating them.

What Sweech does not currently do is host a cloud service, provide multi-tenant team management, stream live conversation content in the dashboard, or federate across the public internet. The v0.4 dashboard spec is explicitly local-only, single-user, LAN-only for now, and designed to work around Claude/Codex behavior rather than modify those tools.

## Score

| Dimension | Status |
|-----------|--------|
| Screens built | CLI + SweechBar + React dashboard shell working; production dashboard panels still in progress |
| API endpoints | Federation endpoints plus local `/dashboard/state`, `/dashboard/sessions`, and `/dashboard/events`; `/fed/dashboard/*` still planned |
| Test coverage | 2,357 passing, 5 skipped in the full Jest suite |
| Design quality | CLI strong; React dashboard shell is live, with richer panels still planned |
| Shipped to users? | npm-style CLI product at v0.3.0; v0.4 dashboard not shipped |
| Revenue? | No in-repo evidence of paid revenue flow; product optimizes external AI subscription spend |
