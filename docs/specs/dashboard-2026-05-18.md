# Spec: sweech web dashboard

## Status
- Author: Claude (Opus 4.7, paired with Luke)
- Date: 2026-05-18
- Status: DRAFT

## Problem

Sweech today exposes ~80 CLI commands + a 473-line single-file HTML
dashboard that only shows usage analytics. The CLI is great for power
users but doesn't answer "what's running right now, where, and how do
I get back to that conversation I had in /dev/routinely two days ago
after my Mac rebooted?" — which is the operator's day-to-day question.

The May-2026 incidents made this acute: Luke repeatedly lost
recoverability of long claude-pole conversations because (a) Claude
Code deletes pointer files on exit, (b) tmux wasn't being used, so
crashes wiped scrollback, (c) there was no single place to see every
in-flight session across machines. The existing dashboard doesn't
surface any of this.

A full-fidelity control-panel UI is the missing piece. It also unlocks
federation — Luke runs sweech on both a MacBook and a Mac Studio and
wants one pane of glass.

## Goals (G)

- **G1** From dashboard cold-start to clicking a session and landing
  in Ghostty attached to its tmux session in ≤ 3 clicks, ≤ 2 s.
- **G2** Survive a Mac reboot: every session marked
  `crash-recoverable` has a one-click rebuild path that re-establishes
  tmux + `--continue` and shows the prior conversation history.
- **G3** Single-page control panel — every primary surface visible
  without route navigation; ≤ 1 modal layer deep for actions.
- **G4** Federation: from any machine running sweech, see and
  one-click-restore sessions on every peer machine on the LAN.
- **G5** Replace the existing `sweech dashboard` command entirely. No
  fallback HTML, no legacy mode.
- **G6** AI-summarised session tiles — each session shows a
  one-sentence summary + 3-5 recent activities, generated via the
  user's own routed sweech workspaces (local-first, cloud fallback).
- **G7** Tile recognition: looking at a tile, the user can tell
  within 1-2 s which conversation it is, without opening it.

## Non-goals (NG)

- **NG1** Web-app hosted at vyke.ai. Local-only daemon, local-only
  dashboard. No data leaves the user's network unless they choose to.
- **NG2** Multi-tenant. One Mac, one user. Federation is across the
  same user's machines, not multiple users.
- **NG3** Cross-network (off-LAN) federation in v1. Tailscale support
  is a future extension, not MVP.
- **NG4** Mobile/touch optimisation. Dashboard is keyboard+pointer on
  Mac. Responsive grid is nice-to-have, not required.
- **NG5** Replacing SweechBar (the macOS menu-bar app). SweechBar
  stays as the always-available status indicator; the dashboard is
  the full operator surface.
- **NG6** Streaming claude conversation content live. The dashboard
  reflects state (session running / message count / summary), it does
  not render the live conversation transcript.
- **NG7** Modifying Claude Code's behaviour. We work around its
  pointer-file lifecycle via stub pointers and our own sessions.db.

## Requirements (R)

### Functional

- **R1** `sweech dashboard` starts (or attaches to) the fed daemon,
  opens the user's default browser to `http://127.0.0.1:<port>/`.
- **R2** Dashboard auto-discovers same-LAN peers via the existing
  mDNS fed daemon. Each peer's sessions appear in the unified list,
  prefixed with `★` for local rows and a Pill for the peer hostname.
- **R3** Every workspace launch creates a row in `~/.sweech/sessions.db`
  (sqlite). Status lifecycle: `live → tmux-detached → crash-recoverable
  → closed`. Wrapper writes on launch; daemon reconciles on startup.
- **R4** Wrapper-script default: `tmux new -d -s <project>-<workspace>-sweech`,
  switchable per global setting + per-launch env var.
- **R5** Sessions panel shows tiles with: status dot, machine, workspace,
  cwd, AI-summary, recent activities, message count, sparkline,
  timestamps, `↗ jump` action.
- **R6** Click `↗ jump` → terminal launcher opens user's preferred
  terminal (Ghostty / iTerm2 / Terminal.app) with `tmux attach -t <name>`
  (or `claude-pole --continue` if no tmux).
- **R7** Cross-machine restore: clicking a remote session's `↗ jump`
  sends HMAC-signed `POST /fed/dashboard/restore` to peer; peer spawns
  ghostty + tmux locally.
- **R8** AI summaries: generated via `sweech auto --provider ollama`
  first, fallback to `sweech auto --budget 0.005` on local failure.
  Stored in sessions.db with provider+cost trace.
- **R9** Real-time updates over SSE (`GET /dashboard/events`): session
  lifecycle events, audit findings, doctor ticks, peer online/offline.
- **R10** Panels (one card per concern): Sessions ★, Workspaces,
  Accounts, Cost, Failover, Routing, Billing, Audit, Doctor, Logs,
  Federation, Plugins, Templates, Settings.
- **R11** Settings panel exposes: terminal preference, tmux on/off,
  summary provider preference, summary budget caps, retention controls,
  federation toggle.
- **R12** Sessions retention is unlimited by default. Settings exposes
  manual wipe with options (older than 30d/90d/1y/closed only/all-closed-over-N).

### Non-functional

- **R-perf** Dashboard cold-load ≤ 800 ms on M-series Mac. SSE
  reconnect within 2 s of network change. Tile render p95 ≤ 16 ms.
- **R-perf-wrap** Wrapper pre-launch overhead ≤ 50 ms (bash-only
  pre-check, no sweech subprocess when no drift detected).
- **R-security** Dashboard binds to 127.0.0.1 only by default.
  Federation uses existing HMAC token from `~/.sweech/daemon.secret`.
  No conversation content sent to vyke.ai or any external endpoint.
  Summaries are computed by user's own workspaces.
- **R-privacy** AI summaries on REMOTE peers are computed by the peer
  locally, then sent (HMAC-signed) to the originating machine. Raw
  conversation jsonls never cross the wire — only the summary text.
- **R-build** `npm install -g sweech` ships the built frontend.
  `dist/dashboard/` is part of the npm package. No additional install
  step.
- **R-a11y** All buttons keyboard-reachable. Focus rings visible. Tile
  text ≥ 14px. Status dots paired with text labels (not colour-only).

## Design

### Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser (Vite-built React app served from disk)                  │
│  └── apps/dashboard/dist (loaded as static from sweech daemon)    │
│      Zustand store ← SSE events                                   │
│      REST calls    → /dashboard/*                                 │
└──────────────────────────────────────────────────────────────────┘
                              │
                              │ http (localhost)
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  sweech fed daemon (extended)                                     │
│  ├── /dashboard/state         GET — full snapshot                 │
│  ├── /dashboard/sessions      GET — list                          │
│  ├── /dashboard/sessions/:id  GET — detail incl. summary          │
│  ├── /dashboard/sessions/:id/restore POST — start ghostty+tmux    │
│  ├── /dashboard/events        GET — SSE stream                    │
│  ├── /dashboard/audit         GET — current findings              │
│  ├── /dashboard/audit/fix     POST — apply --fix-cli-type etc     │
│  ├── /dashboard/cost          GET — usage + cost rollup           │
│  ├── /dashboard/settings      GET/PATCH — terminal pref, tmux etc │
│  ├── /dashboard/wipe-sessions POST — manual prune                 │
│  ├── /fed/dashboard/state     GET — peer-to-peer (HMAC)           │
│  ├── /fed/dashboard/restore   POST — cross-machine restore (HMAC) │
│  └── /fed/dashboard/summary   POST — summary push (HMAC)          │
│                                                                   │
│  Static: /                   → apps/dashboard/dist/index.html     │
│          /assets/*           → apps/dashboard/dist/assets/*       │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│  Local state                                                      │
│  ├── ~/.sweech/sessions.db (sqlite — new in this spec)            │
│  ├── ~/.sweech/config.json (existing)                             │
│  ├── ~/.sweech/history.json (existing usage snapshots)            │
│  ├── ~/.sweech/usage.json (existing launch records)               │
│  ├── ~/.sweech/rate-limit-cache.json (existing)                   │
│  ├── ~/.sweech/logs/lifecycle.jsonl (existing)                    │
│  └── ~/.claude*/projects/*/UUID.jsonl (claude conversations)      │
│                                                                   │
│  Terminal apps (launched on click)                                │
│  ├── Ghostty   ← ghostty://run?command=... URL scheme             │
│  ├── iTerm2    ← AppleScript                                      │
│  ├── Terminal  ← AppleScript                                      │
│  └── others    ← `<binary> -e <cmd>`                              │
│                                                                   │
│  tmux                                                             │
│  └── named sessions: <project>-<workspace>-sweech[-<sid8>]        │
└──────────────────────────────────────────────────────────────────┘

Federation:
   machine-a ◄────── mDNS announce ──────► machine-b
       ▲                                       │
       │ HMAC /fed/dashboard/*                 │
       └───────────────────────────────────────┘
```

### Data model

#### sessions.db (sqlite, `~/.sweech/sessions.db`)

```sql
CREATE TABLE sessions (
  id              TEXT PRIMARY KEY,          -- uuidv7
  workspace       TEXT NOT NULL,             -- commandName
  cwd             TEXT NOT NULL,
  cwd_basename    TEXT NOT NULL,             -- denormalised for sorting
  machine         TEXT NOT NULL,             -- hostname
  tmux_name       TEXT,                      -- null when SWEECH_NO_TMUX
  claude_sid      TEXT,                      -- jsonl uuid
  jsonl_path      TEXT,
  pid             INTEGER,
  terminal_app    TEXT,                      -- 'ghostty' | 'iterm2' | 'terminal' | 'unknown'
  launched_at     INTEGER NOT NULL,          -- unix ms
  last_active_at  INTEGER NOT NULL,
  closed_at       INTEGER,
  status          TEXT NOT NULL,             -- 'live'|'tmux-detached'|'crash-recoverable'|'closed'
  message_count   INTEGER DEFAULT 0,
  msg_count_first INTEGER DEFAULT 0,
  msg_count_last  INTEGER DEFAULT 0,
  -- Summary cache
  summary_one     TEXT,                      -- AI-generated 1-sentence
  summary_bullets TEXT,                      -- json array
  summary_provider TEXT,                     -- workspace that summarised
  summary_model   TEXT,
  summary_cost_usd REAL,
  summary_at      INTEGER,
  summary_stale   INTEGER DEFAULT 1,
  summary_msg_at  INTEGER                    -- msg_count when summarised
);

CREATE INDEX ix_sessions_workspace ON sessions(workspace);
CREATE INDEX ix_sessions_cwd ON sessions(cwd);
CREATE INDEX ix_sessions_status ON sessions(status);
CREATE INDEX ix_sessions_last_active ON sessions(last_active_at);
CREATE INDEX ix_sessions_machine ON sessions(machine);

CREATE TABLE peers (
  hostname    TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  last_seen   INTEGER NOT NULL,
  capabilities TEXT                          -- json
);
```

#### config.json additions

```json
{
  "dashboard": {
    "port": 0,                              // 0 = random
    "preferredTerminal": "ghostty",         // 'ghostty' | 'iterm2' | 'terminal' | 'auto'
    "tmux": {
      "enabled": true,
      "namingScheme": "project-workspace-suffix",
      "suffix": "sweech"
    },
    "summaries": {
      "enabled": true,
      "providerOrder": ["ollama", "auto-cheapest"],
      "budgetPerSummaryUsd": null,          // null = uncapped
      "budgetPerDayUsd": null,
      "model": "auto"
    },
    "federation": {
      "enabled": true,
      "discoveryMethod": "mdns"             // future: "tailscale"
    },
    "preview": {
      "level": "ai-title-and-summary"       // 'metadata'|'title'|'title+first'|'title+first+last'|'ai-title-and-summary'
    },
    "retention": {
      "autoWipe": false,
      "wipeOlderThanDays": null
    }
  }
}
```

### API surface

#### Local REST (under `/dashboard/*`, localhost only)

| Method | Path                              | Purpose |
|--------|-----------------------------------|---------|
| GET    | `/dashboard/state`                | Full snapshot for cold load |
| GET    | `/dashboard/sessions?machine=&status=&workspace=&q=` | Filtered list |
| GET    | `/dashboard/sessions/:id`         | Detail incl. full summary |
| POST   | `/dashboard/sessions/:id/restore` | Spawn terminal + tmux + claude |
| DELETE | `/dashboard/sessions/:id`         | Close a row (jsonl untouched) |
| POST   | `/dashboard/wipe`                 | Bulk delete by filter (older-than-N) |
| GET    | `/dashboard/audit`                | Current audit report |
| POST   | `/dashboard/audit/fix-cli-type`   | One-click fix |
| POST   | `/dashboard/audit/fix-provider`   | One-click fix |
| GET    | `/dashboard/cost?range=7d|30d`    | Spend rollup |
| GET    | `/dashboard/usage`                | Live rate-limit data |
| GET    | `/dashboard/settings`             | Read merged settings |
| PATCH  | `/dashboard/settings`             | Write subset |
| POST   | `/dashboard/summaries/regen/:id`  | Force re-summary |
| GET    | `/dashboard/doctor`               | Run doctor checks, return JSON |
| GET    | `/dashboard/events`               | SSE stream (see Realtime) |

#### Federated REST (under `/fed/dashboard/*`, HMAC-required)

| Method | Path                              | Purpose |
|--------|-----------------------------------|---------|
| GET    | `/fed/dashboard/state`            | Peer's snapshot |
| POST   | `/fed/dashboard/restore`          | Cross-machine restore RPC |
| POST   | `/fed/dashboard/summary`          | Push summary (when peer summarised on demand) |

### State / UI flow

**Single-page grid** (no router). Default layout:

```
Row 1 — Hero strip:    [Doctor health] [Total live] [Total recoverable] [Cost MTD]
Row 2 — Sessions panel: full-width, filters + sort + tile grid
Row 3 — 3-col:          [Workspaces] [Accounts] [Cost chart]
Row 4 — 3-col:          [Audit findings] [Failover cooldowns] [Billing calendar]
Row 5 — 2-col:          [Routing pins] [Federation peers]
Row 6 — 2-col:          [Logs tail] [Settings drawer trigger]
```

Modal layers:
- Session detail dialog (full tile expanded + message timeline)
- Settings drawer (settings panel slides in from right)
- Workspace edit dialog
- Audit fix confirmation
- Wipe confirmation (with preview of what will be deleted)

State machine: pure store (Zustand) sliced per panel. SSE events
dispatch to slice mutators. REST mutations call API → optimistic
update → reconcile on event.

### Error model

- **API 4xx** → toast with message, action stays unresolved (e.g.,
  restore button returns to idle, not "in progress").
- **API 5xx** → toast + error log line in Logs panel.
- **SSE disconnect** → silent reconnect with exp-backoff up to 30 s.
  Banner appears after 30 s of disconnect: "live updates paused —
  retrying".
- **Peer unreachable** → peer row greys; sessions from that peer get
  `(offline)` chip; restore button on those rows disabled with
  tooltip.
- **tmux missing** → tmux panel switches to install-hint state.
  Sessions still tracked; restore degrades to bare relaunch.
- **Terminal binary missing** → restore fails with toast linking to
  Settings panel for terminal selection.
- **Summary failure** → tile shows previous summary (or "summarising…"
  if first time); error logged but not surfaced as a toast.
- **DB corruption** → daemon refuses to start, surfaces clear error
  with backup-and-recreate suggestion. sessions.db is rebuildable
  from jsonls.

## Decisions (D)

- **D1 React + Vite + vysual-react.** Alternatives: SwiftUI native
  Mac app; SvelteKit; pure HTML+inline-JS like existing dashboard.
  Chose React because vysual-react already exists with sweech-aware
  hooks + the sweech theme; llodge has proven the Vite stack; cross-
  machine federation needs a web target.

- **D2 Single page, no routing.** Alternatives: React Router with
  /sessions, /workspaces, /audit pages; tabs across top.
  Chose single page because user explicitly asked for control-panel
  density over hierarchical navigation, and the surface is bounded.

- **D3 Extend existing fed daemon, don't fork a new dashboard server.**
  Alternatives: separate `sweech-dashboard-daemon` process.
  Chose extension because we already have HTTP routing, HMAC auth,
  mDNS, daemon lifecycle, and the dashboard is just one more capability.

- **D4 sqlite for sessions.db.** Alternatives: JSON file, single jsonl
  appender, leveldb, redis.
  Chose sqlite because we need filtered queries (machine, status,
  workspace, time range) over potentially thousands of rows, and node
  has built-in `node:sqlite` in 22+.

- **D5 tmux default-on, settable, no force-migrate.** Alternatives:
  always-on; opt-in only; migrate existing bare sessions destructively.
  Chose settable-default-on because crash-recovery is the headline
  feature and most users want it, but a `[💡 wrap next time]` hint
  surfaces the option for bare-launched sessions without nagging.

- **D6 tmux naming `<project>-<workspace>-sweech[-<sid8>]`.**
  Alternatives: short `sw-<workspace>-<sid8>`; verbose
  `sweech-<workspace>-<basename(cwd)>-<sid8>`.
  Chose project-first because `tmux ls` groups alphabetically by
  project — which matches how Luke thinks about which-claude-am-I-in.

- **D7 SSE for live events, not WebSocket.** Alternatives: WebSocket;
  polling.
  Chose SSE because we have one-way server→client events, SSE
  survives sleep+wifi flaps with native browser auto-reconnect, and
  the daemon's HTTP routing already supports it. WebSocket adds
  bidirectional complexity for no win.

- **D8 AI summaries default-on, hybrid local→cloud, no budget caps.**
  Alternatives: opt-in only; cloud-only; local-only; capped by default.
  Chose default-on because tiles are the recognition surface and the
  user has many subscriptions. Hybrid (local ollama → cloud-cheapest)
  protects privacy while ensuring quality on first launch.

- **D9 Per-machine summarisation in federation.** Alternatives:
  centralised summariser on one peer; client-side summarisation in
  the browser.
  Chose per-machine because the conversation jsonls already live on
  that machine; computing locally avoids shipping content across the
  fed wire. The summary text crosses, not the source data.

- **D10 Replace old dashboard.ts entirely.** Alternatives: keep at
  /legacy; tombstone with deprecation notice; merge into new.
  Chose hard replacement because new dashboard subsumes 100% of old
  functionality (account status + usage chart become panels) and
  carrying two surfaces doubles maintenance.

- **D11 Localhost-only, no token-gate for local UI.** Alternatives:
  per-session token; mTLS; Bearer auth.
  Chose no-auth-localhost because anyone with shell on your Mac can
  already read ~/.sweech/* directly. Adding a token just adds friction
  for the legitimate user. Federation peers still HMAC-sign.

- **D12 Tailscale federation deferred to v2.** Alternatives: ship
  with Tailscale support; rely on Tailscale-native networking only.
  Chose defer because mDNS covers the daily LAN case, Tailscale adds
  a dep + integration surface, and v1 ships sooner without it.

- **D13 Monorepo with `apps/dashboard/` workspace.** Alternatives:
  flat `src/web/`; separate npm package.
  Chose workspaces because the React app has its own deps (React,
  Vite, Tailwind, vysual-react) that shouldn't pollute the CLI's
  dependency tree, but they must ship together so a separate package
  is wrong.

- **D14 ensureSessionPointers stays in core, drives "resume" tile state.**
  Already implemented in commit 42e9611. Dashboard's
  `crash-recoverable` rows reuse this — when bash pre-check on
  launch detects a jsonl without a pointer, the wrapper regenerates a
  synthetic pointer so `/resume` finds it AND the dashboard tile
  renders correctly.

## Open questions (Q)

- **Q1** Settings drawer vs. inline settings panel? Drawer slides
  in from right (more space, hides controls when not in use); inline
  panel fits the "no nav" rule but takes grid real estate. Drawer
  is mildly nav-y but tucks away cleanly. Defaulting to drawer.

- **Q2** Doctor panel — runs doctor live every N seconds, or
  on-demand only? Live = always-fresh but spends a HEALTH-CHECK
  budget; on-demand = stale unless user clicks refresh. Suggest:
  run on tab focus + every 60s while focused, otherwise paused.

- **Q3** Should the dashboard show the **bare-host pid** in tile
  metadata, or hide it as too technical? Useful for "I want to kill
  this myself in Terminal", clutter for everyone else.

- **Q4** First-launch flow when no sessions exist yet? Show an empty
  state with "launch your first workspace" CTA, or show all panels
  with empty data?

- **Q5** Multi-window same conversation in tmux — currently spec
  treats this as a single session row. Should there be a "viewer
  count" badge showing how many ttys are attached to the tmux
  session?

## Risks (RK)

- **RK1** Wrapper latency regression. We already mitigated R1
  (340 ms → <10 ms via bash pre-check). Adding sessions.db write at
  launch must stay sub-10 ms — write via sqlite WAL, no fsync.

- **RK2** sessions.db row explosion if user launches many short
  sessions (e.g., scripted automation). Mitigation: retention wipe
  options, lazy summary computation.

- **RK3** Federation HMAC key compromise — if `~/.sweech/daemon.secret`
  leaks, an attacker can issue restore RPCs to spawn shells on peers.
  Mitigation: same as current fed daemon (chmod 0600, never logged).

- **RK4** Terminal launcher fails silently on missing apps. User
  clicks restore, nothing happens. Mitigation: dashboard detects
  installed terminals on load, settings panel shows availability,
  restore call returns 4xx with actionable message.

- **RK5** AI summary cost runs away. Mitigation: settings expose
  per-summary + per-day caps; cost panel surfaces summary spend
  rollup distinctly from CLI spend.

- **RK6** Stale summary shown for archived session that never
  re-summarises. Mitigation: summary_stale flag + viewport-driven
  re-summarisation when tile becomes visible.

- **RK7** Ghostty URL scheme not registered → restore button no-ops.
  Mitigation: detect via `defaults read com.apple.LaunchServices` and
  fall back to `ghostty -e` on schemes not registered.

- **RK8** Mac Studio's older sweech version (per user: "do not update
  it yet") won't have the new fed routes. Federation gracefully
  degrades — peer that doesn't respond to `/fed/dashboard/state` is
  shown as `(legacy)` with its sessions absent but the peer present.

## Test plan

### Unit
- `sessions.ts` — schema migrations, status reconciliation, retention
  filter SQL.
- `tmux.ts` — naming-scheme generation, collision detection (sid8
  append), tmux availability detection.
- `terminalLauncher.ts` — command construction per terminal (Ghostty
  URL, iTerm2 AppleScript, Terminal AppleScript, generic -e). Mock
  exec to assert command strings.
- `sessionSummarizer.ts` — prompt construction, response parsing,
  cost tracking, stale-mark logic.
- `dashboardServer.ts` route handlers — happy path + 4xx + auth
  failures.

### Integration
- End-to-end wrapper run with sessions.db: launch claude-pole, assert
  row inserted with status=live, kill claude, assert status flips to
  closed.
- Cross-machine restore mock — start two daemons on different ports
  with separate sessions.db, assert HMAC RPC + restore succeeds.
- SSE event ordering — session.changed must arrive before
  session.summary.updated.
- Wrapper bash pre-check perf: launch with no drift completes in
  <10 ms.

### E2E
- Playwright: cold-load dashboard, see existing sessions, click `↗
  jump`, assert tmux session reachable.
- Playwright: simulate Mac reboot — kill tmux server, refresh
  dashboard, click crash-recoverable row, assert ghostty launch
  attempt.
- Playwright: filter by machine, sort by message-count, search by
  cwd.

### Manual
- Real cross-machine restore (laptop → mac-studio over Wi-Fi)
- Ghostty URL scheme registration on a fresh user
- AI summary cost reasonableness over 1 hour of normal use

## Rollout

- **Stages**: dev → screenshot review → laptop dogfood → mac-studio
  dogfood (when ready) → npm publish.
- **Feature flag**: `dashboard.enabled` in config.json, default
  `true`. Set to `false` to fall back to "dashboard removed in this
  version" message + recommend rollback.
- **Rollback**: `npm install -g sweech@<prior>` reverts CLI + drops
  back to old dashboard.ts. sessions.db is forward-compatible
  (additive schema only via migrations).

## Out of scope (deferred)

- Tailscale federation discovery (cross-network)
- Mobile/tablet UI optimisation
- iOS companion app (sees fed daemon over Tailscale, replicates
  sessions panel)
- Conversation transcript browser (read-only viewer for jsonl content
  — currently only summary surfaces in dashboard)
- Live agent stream (rendering claude's in-flight responses in
  the dashboard)
- Sharing a single session live across federated peers (multi-cursor
  pair programming)
- SweechBar parity rewrite (the menu-bar app stays SwiftUI; this
  spec doesn't touch it)
- Plugin system for custom panels
- Theme switcher (vysual sweech theme is the only theme in v1)

---

## Next step

Run `/vy-backlog with docs/specs/dashboard-2026-05-18.md` to break
this into discrete tasks for parallel execution under `/vy-go`.
