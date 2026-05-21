import { type DashboardFreshnessState, formatUsd } from './heroStats';

export type DashboardWorkspace = {
  name?: string;
  commandName: string;
  cliType: string;
  provider: string;
  disabled?: boolean;
  hidden?: boolean;
  sharedWith?: string | null;
  lastUsed?: string | null;
  profileDirExists?: boolean;
  model?: string;
  baseUrl?: string;
  smallFastModel?: string;
};

export type DashboardAccount = {
  name?: string;
  commandName: string;
  cliType: string;
  provider?: string;
  plan?: string;
  tokenStatus?: string;
  messages5h?: number | null;
  messages7d?: number | null;
  lastActive?: string;
  freshnessAt?: number | null;
  utilization5h?: number | null;
  utilization7d?: number | null;
  resetLabel?: string | null;
};

export type DashboardCostProvider = {
  provider: string;
  spent7dUsd: number;
  estCostPerCallUsd: number;
  profiles: number;
};

export type DashboardCostState = {
  generatedAt?: string;
  spent7dUsd: number;
  estCostPerCallUsd: number;
  providers: DashboardCostProvider[];
  sparkline: number[];
};

export function workspaceStatus(workspace: DashboardWorkspace): { label: string; tone: 'success' | 'warning' | 'muted' } {
  if (workspace.hidden) return { label: 'Hidden', tone: 'muted' };
  if (workspace.disabled) return { label: 'Disabled', tone: 'warning' };
  if (workspace.profileDirExists === false) return { label: 'Missing dir', tone: 'warning' };
  return { label: 'Active', tone: 'success' };
}

export function accountTokenStatus(account: DashboardAccount): { label: string; tone: 'success' | 'warning' | 'danger' | 'muted' } {
  const status = account.tokenStatus ?? (account.cliType === 'codex' ? 'managed' : 'unknown');
  if (status === 'valid' || status === 'refreshed' || status === 'managed') return { label: status === 'managed' ? 'Managed' : 'Token ok', tone: 'success' };
  if (status === 'expired' || status === 'unauthorized') return { label: 'Reauth', tone: 'danger' };
  if (status === 'no_token') return { label: 'No token', tone: 'warning' };
  return { label: 'Unknown', tone: 'muted' };
}

export function freshnessFromTimestamp(timestamp: number | string | null | undefined, now = Date.now()): DashboardFreshnessState {
  if (timestamp === null || timestamp === undefined) return 'never';
  const millis = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(millis)) return 'never';
  const age = now - millis;
  if (age < 0 || age <= 10 * 60_000) return 'fresh';
  if (age <= 60 * 60_000) return 'muted';
  return 'stale';
}

export function utilizationPercent(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

export function formatMessageWindow(count: number | null | undefined, label: string): string {
  return typeof count === 'number' ? `${Math.max(0, count)} ${label}` : `${label} window`;
}

export function formatWorkspaceLastUsed(value: string | null | undefined): string {
  if (!value) return 'No launches yet';
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return value;
  return new Date(millis).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function costSparklineBars(cost: DashboardCostState): number[] {
  const bars = Array.isArray(cost.sparkline) ? cost.sparkline.slice(0, 7) : [];
  while (bars.length < 7) bars.unshift(4);
  return bars.map((bar) => Math.max(4, Math.min(36, Math.round(bar))));
}

export { formatUsd };
