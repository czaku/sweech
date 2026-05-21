export type SessionStatus = 'live' | 'tmux-detached' | 'crash-recoverable' | 'closed';

export type DashboardSession = {
  id: string;
  workspace: string;
  cwd: string;
  cwdBasename?: string;
  cwd_basename?: string;
  machine: string;
  status: SessionStatus;
  tmuxName?: string | null;
  tmux_name?: string | null;
  pid?: number | null;
  tty?: string | null;
  terminalApp?: string | null;
  terminal_app?: string | null;
  launchedAt?: number | null;
  launched_at?: number | null;
  lastActiveAt?: number;
  last_active_at?: number;
  messageCount?: number;
  message_count?: number;
  msgCountFirst?: number;
  msg_count_first?: number;
  msgCountLast?: number;
  msg_count_last?: number;
  summaryCostUsd?: number | null;
  summary_cost_usd?: number | null;
  summaryAt?: number | null;
  summary_at?: number | null;
  summaryStale?: boolean;
  summary_stale?: boolean;
  summaryOne?: string | null;
  summary_one?: string | null;
  summaryBullets?: string[] | string | null;
  summary_bullets?: string[] | string | null;
  attachClients?: number;
  attach_clients?: number;
};

export type NormalizedSession = {
  id: string;
  workspace: string;
  cwd: string;
  cwdBasename: string;
  machine: string;
  status: SessionStatus;
  tmuxName: string | null;
  pid: number | null;
  tty: string | null;
  terminalApp: string | null;
  launchedAt: number | null;
  lastActiveAt: number;
  messageCount: number;
  msgCountFirst: number;
  msgCountLast: number;
  summaryCostUsd: number | null;
  summaryAt: number | null;
  summaryStale: boolean;
  summaryOne: string | null;
  summaryBullets: string[];
  attachClients: number;
};

export type SessionFilters = {
  machine: string;
  status: 'all' | SessionStatus;
  workspace: string;
  search: string;
};

export type SessionSort = 'last-active' | 'launched' | 'messages' | 'workspace';

export function normalizeSession(session: DashboardSession): NormalizedSession {
  const cwdBasename = session.cwdBasename ?? session.cwd_basename ?? basename(session.cwd);
  return {
    id: session.id,
    workspace: session.workspace,
    cwd: session.cwd,
    cwdBasename,
    machine: session.machine,
    status: session.status,
    tmuxName: session.tmuxName ?? session.tmux_name ?? null,
    pid: session.pid ?? null,
    tty: session.tty ?? null,
    terminalApp: session.terminalApp ?? session.terminal_app ?? null,
    launchedAt: session.launchedAt ?? session.launched_at ?? null,
    lastActiveAt: session.lastActiveAt ?? session.last_active_at ?? 0,
    messageCount: session.messageCount ?? session.message_count ?? 0,
    msgCountFirst: session.msgCountFirst ?? session.msg_count_first ?? 0,
    msgCountLast: session.msgCountLast ?? session.msg_count_last ?? 0,
    summaryCostUsd: session.summaryCostUsd ?? session.summary_cost_usd ?? null,
    summaryAt: session.summaryAt ?? session.summary_at ?? null,
    summaryStale: session.summaryStale ?? session.summary_stale ?? true,
    summaryOne: session.summaryOne ?? session.summary_one ?? null,
    summaryBullets: normalizeBullets(session.summaryBullets ?? session.summary_bullets),
    attachClients: session.attachClients ?? session.attach_clients ?? 0,
  };
}

export function normalizeBullets(value: DashboardSession['summaryBullets']): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 5);
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 5);
  } catch {
    return value.split(/\n+/).map((item) => item.replace(/^[-*]\s*/, '').trim()).filter(Boolean).slice(0, 5);
  }
  return [];
}

export function filterSessions(sessions: NormalizedSession[], filters: SessionFilters): NormalizedSession[] {
  const search = filters.search.trim().toLowerCase();
  return sessions.filter((session) => {
    if (filters.machine && session.machine !== filters.machine) return false;
    if (filters.status !== 'all' && session.status !== filters.status) return false;
    if (filters.workspace && session.workspace !== filters.workspace) return false;
    if (!search) return true;
    return [
      session.workspace,
      session.cwd,
      session.cwdBasename,
      session.machine,
      session.tmuxName ?? '',
      session.summaryOne ?? '',
      session.summaryBullets.join(' '),
    ].join(' ').toLowerCase().includes(search);
  });
}

export function sortSessions(sessions: NormalizedSession[], sort: SessionSort): NormalizedSession[] {
  return [...sessions].sort((a, b) => {
    if (sort === 'workspace') return a.workspace.localeCompare(b.workspace) || b.lastActiveAt - a.lastActiveAt;
    if (sort === 'messages') return b.messageCount - a.messageCount || b.lastActiveAt - a.lastActiveAt;
    if (sort === 'launched') return (b.launchedAt ?? 0) - (a.launchedAt ?? 0) || b.lastActiveAt - a.lastActiveAt;
    return b.lastActiveAt - a.lastActiveAt || (b.launchedAt ?? 0) - (a.launchedAt ?? 0);
  });
}

export function sessionFilterOptions(sessions: NormalizedSession[]) {
  return {
    machines: uniqueSorted(sessions.map((session) => session.machine)),
    workspaces: uniqueSorted(sessions.map((session) => session.workspace)),
  };
}

export function formatRelativeTime(timestamp: number | null | undefined, now = Date.now()): string {
  if (!timestamp) return 'never';
  const diff = Math.max(0, now - timestamp);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  return `${Math.floor(diff / day)}d ago`;
}

export function sparklineBars(session: NormalizedSession): number[] {
  const first = Math.max(0, session.msgCountFirst);
  const last = Math.max(first, session.msgCountLast, session.messageCount);
  const total = Math.max(1, last - first);
  return [0.18, 0.32, 0.47, 0.68, 0.86, 1].map((ratio, index) => {
    const activity = Math.round((total * ratio) / Math.max(1, index + 1));
    return Math.max(2, Math.min(28, activity + 4 + index));
  });
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function basename(value: string): string {
  const parts = value.split('/').filter(Boolean);
  return parts.at(-1) ?? value;
}
