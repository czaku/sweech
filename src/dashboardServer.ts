import http from 'node:http';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConfigManager } from './config';
import { buildCostTable, type CostTable } from './costCommand';
import { pickPrimaryBucket } from './liveUsage';
import { SessionsDb, type DashboardSession, type DashboardSessionStatus, type ListDashboardSessionsFilter } from './sessionsDb';
import { SessionSummarizer } from './sessionSummarizer';
import { getAccountInfo, getKnownAccounts, type AccountInfo } from './subscriptions';
import { launchTerminal, type TerminalName } from './terminalLauncher';
import { editWorkspace, listWorkspaces, type WorkspaceEditOptions, type WorkspaceStatusRow } from './workspaceCrud';

export type DashboardEventName =
  | 'session.changed'
  | 'audit.flagged'
  | 'doctor.tick'
  | 'peer.online'
  | 'peer.offline'
  | 'cost.tick'
  | 'summary.updated';

const DASHBOARD_SESSION_STATUSES = new Set<DashboardSessionStatus>([
  'live',
  'tmux-detached',
  'crash-recoverable',
  'closed',
]);

export interface DashboardEvent<TPayload = unknown> {
  type: DashboardEventName;
  data: TPayload;
}

export interface DashboardState {
  generatedAt: string;
  machine: string;
  sessions: DashboardSession[];
  workspaces: DashboardWorkspace[];
  accounts: DashboardAccount[];
  cost: DashboardCostState;
}

export interface DashboardRequestHandlerOptions {
  assetsDir?: string;
  heartbeatMs?: number;
  sessionPollMs?: number;
  maxSseClients?: number;
  catchAllAssets?: boolean;
  sessionsDbPath?: string;
  terminalLauncher?: typeof launchTerminal;
  stateProvider?: () => Promise<DashboardState>;
}

export interface DashboardWorkspace extends Omit<WorkspaceStatusRow, 'profileDir'> {
  name: string;
  sharedWith?: string;
  lastUsed?: string | null;
  model?: string;
  baseUrl?: string;
  smallFastModel?: string;
}

export interface DashboardAccount {
  name: string;
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
}

export interface DashboardCostState {
  generatedAt: string;
  spent7dUsd: number;
  estCostPerCallUsd: number;
  providers: Array<{ provider: string; spent7dUsd: number; estCostPerCallUsd: number; profiles: number }>;
  sparkline: number[];
}

type DashboardEventListener = (event: DashboardEvent) => void;

const DASHBOARD_EVENT_NAMES = new Set<DashboardEventName>([
  'session.changed',
  'audit.flagged',
  'doctor.tick',
  'peer.online',
  'peer.offline',
  'cost.tick',
  'summary.updated',
]);

const DEFAULT_HEARTBEAT_MS = 15_000;
const DEFAULT_SESSION_POLL_MS = 2_000;
const DEFAULT_MAX_SSE_CLIENTS = 50;
let activeSseClients = 0;

class DashboardEventHub {
  private readonly emitter = new EventEmitter();

  publish<TPayload>(type: DashboardEventName, data: TPayload): void {
    this.emitter.emit('event', { type, data } satisfies DashboardEvent<TPayload>);
  }

  subscribe(listener: DashboardEventListener): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}

export const dashboardEventHub = new DashboardEventHub();

export function publishDashboardEvent<TPayload>(type: DashboardEventName, data: TPayload): void {
  dashboardEventHub.publish(type, data);
}

export function defaultDashboardAssetsDir(): string {
  return path.join(__dirname, 'dashboard');
}

export function isDashboardRequestPath(pathname: string): boolean {
  return pathname === '/'
    || pathname === '/dashboard'
    || pathname.startsWith('/dashboard/')
    || pathname === '/assets'
    || pathname.startsWith('/assets/');
}

export function isLocalDashboardClient(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  return remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1';
}

export function hasActiveDashboardClients(): boolean {
  return activeSseClients > 0;
}

export function createDashboardRequestHandler(options: DashboardRequestHandlerOptions = {}) {
  const assetsDir = options.assetsDir ?? defaultDashboardAssetsDir();
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const sessionPollMs = options.sessionPollMs ?? DEFAULT_SESSION_POLL_MS;
  const maxSseClients = options.maxSseClients ?? DEFAULT_MAX_SSE_CLIENTS;
  const catchAllAssets = options.catchAllAssets ?? false;

  return async function handleDashboardRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1');
    } catch {
      sendDashboardJson(res, 400, { error: 'Bad request target' });
      return true;
    }

    if (!catchAllAssets && !isDashboardRequestPath(url.pathname)) return false;

    if (!isLocalDashboardClient(req.socket.remoteAddress)) {
      sendDashboardJson(res, 403, { error: 'Dashboard is only available from localhost' });
      return true;
    }
    if (!isLocalDashboardHost(req.headers.host) || !isAllowedDashboardOrigin(req.headers.host, req.headers.origin, req.headers['sec-fetch-site'], url.pathname)) {
      sendDashboardJson(res, 403, { error: 'Dashboard requests must use a localhost origin' });
      return true;
    }

    const summaryMatch = url.pathname.match(/^\/dashboard\/sessions\/([^/]+)\/summary$/);
    if (summaryMatch) {
      if (req.method !== 'POST') {
        sendDashboardJson(res, 405, { error: 'Method not allowed' });
        return true;
      }
      try {
        const summary = await summarizeDashboardSession(decodeURIComponent(summaryMatch[1]));
        if (!summary) {
          sendDashboardJson(res, 202, { status: 'skipped', reason: 'session not ready for summary' });
          return true;
        }
        sendDashboardJson(res, 200, { status: 'ok', summary });
      } catch (error) {
        sendDashboardJson(res, 500, {
          error: 'Dashboard summary unavailable',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    const restoreMatch = url.pathname.match(/^\/dashboard\/sessions\/([^/]+)\/restore$/);
    if (restoreMatch) {
      if (req.method !== 'POST') {
        sendDashboardJson(res, 405, { error: 'Method not allowed' });
        return true;
      }
      if (!isJsonRequest(req.headers['content-type'])) {
        sendDashboardJson(res, 415, { error: 'Content-Type must be application/json' });
        return true;
      }
      const body = await readDashboardBody(req, res);
      if (body === null) return true;
      if (!body.trim()) {
        sendDashboardJson(res, 400, { error: 'JSON body is required' });
        return true;
      }
      try {
        const payload = parseDashboardJsonObject(body);
        const result = await restoreLocalDashboardSession(
          decodeURIComponent(restoreMatch[1]),
          parseTerminalName(optionalString(payload.terminal)),
          options.terminalLauncher ?? launchTerminal,
          options.sessionsDbPath,
        );
        sendDashboardJson(res, result.ok ? 200 : 422, result);
      } catch (error) {
        if (error instanceof DashboardRequestError) {
          sendDashboardJson(res, error.status, { error: error.message });
          return true;
        }
        sendDashboardJson(res, 500, {
          error: 'Dashboard session restore failed',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      return true;
    }

    const workspaceEditMatch = url.pathname.match(/^\/dashboard\/workspaces\/([^/]+)$/);
    if (workspaceEditMatch) {
      if (req.method !== 'PATCH') {
        sendDashboardJson(res, 405, { error: 'Method not allowed' });
        return true;
      }
      if (!isJsonRequest(req.headers['content-type'])) {
        sendDashboardJson(res, 415, { error: 'Content-Type must be application/json' });
        return true;
      }
      const body = await readDashboardBody(req, res);
      if (body === null) return true;
      try {
        const payload = parseDashboardJsonObject(body);
        const profile = editWorkspaceFromDashboard(decodeURIComponent(workspaceEditMatch[1]), payload);
        sendDashboardJson(res, 200, { ok: true, profile: dashboardEditableWorkspace(profile) });
      } catch (error) {
        if (error instanceof DashboardRequestError) {
          sendDashboardJson(res, error.status, { error: error.message });
          return true;
        }
        sendDashboardJson(res, 500, dashboardErrorBody(error));
      }
      return true;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendDashboardJson(res, 405, { error: 'Method not allowed' });
      return true;
    }

    if (url.pathname === '/dashboard/state') {
      try {
        sendDashboardJson(res, 200, options.stateProvider ? await options.stateProvider() : await collectDashboardState(options.sessionsDbPath));
      } catch (error) {
        if (error instanceof DashboardRequestError) {
          sendDashboardJson(res, error.status, { error: error.message });
          return true;
        }
        sendDashboardJson(res, 500, dashboardErrorBody(error));
      }
      return true;
    }

    if (url.pathname === '/dashboard/sessions') {
      try {
        sendDashboardJson(res, 200, await collectDashboardSessions(url, options.sessionsDbPath));
      } catch (error) {
        if (error instanceof DashboardRequestError) {
          sendDashboardJson(res, error.status, { error: error.message });
          return true;
        }
        sendDashboardJson(res, 500, dashboardErrorBody(error));
      }
      return true;
    }

    if (url.pathname === '/dashboard/events') {
      sendDashboardEvents(req, res, { heartbeatMs, sessionPollMs, maxSseClients, sessionsDbPath: options.sessionsDbPath });
      return true;
    }

    serveDashboardAsset(req, res, assetsDir, url.pathname);
    return true;
  };
}

export async function collectDashboardState(dbPath?: string): Promise<DashboardState> {
  const [sessionsState, auxiliaryState] = await Promise.all([
    collectDashboardSessions(undefined, dbPath),
    collectDashboardAuxiliaryState(),
  ]);
  return { ...sessionsState, ...auxiliaryState };
}

export async function summarizeDashboardSession(sessionId: string) {
  const summarizer = new SessionSummarizer();
  try {
    return await summarizer.summarizeNow(sessionId, 'viewport');
  } finally {
    summarizer.close();
  }
}

export async function collectDashboardSessions(url?: URL, dbPath?: string): Promise<DashboardState> {
  const db = new SessionsDb(dbPath);
  try {
    return {
      generatedAt: new Date().toISOString(),
      machine: os.hostname(),
      sessions: db.list(dashboardSessionsFilterFromUrl(url)),
      workspaces: [],
      accounts: [],
      cost: emptyDashboardCostState(),
    };
  } finally {
    db.close();
  }
}

async function collectDashboardAuxiliaryState(): Promise<Pick<DashboardState, 'workspaces' | 'accounts' | 'cost'>> {
  const config = new ConfigManager();
  const profiles = config.getProfiles();
  const accountRefs = getKnownAccounts(profiles, { includeInactive: true });
  const [accounts, costTable] = await Promise.all([
    getAccountInfo(accountRefs, { liveCacheOnly: true, timeoutMs: 500 }).catch(() => [] as AccountInfo[]),
    buildCostTable().catch(() => null),
  ]);
  const lastUseByProfile = new Map<string, string>();
  for (const row of costTable?.rows ?? []) {
    if (row.lastUseTs) lastUseByProfile.set(row.profile, new Date(row.lastUseTs).toISOString());
  }
  const workspaces = listWorkspaces(config).map((workspace) => {
    const profile = profiles.find((candidate) => candidate.commandName === workspace.commandName);
    return {
      commandName: workspace.commandName,
      cliType: workspace.cliType,
      provider: workspace.provider,
      disabled: workspace.disabled,
      hidden: workspace.hidden,
      profileDirExists: workspace.profileDirExists,
      name: profile?.name ?? workspace.commandName,
      sharedWith: profile?.sharedWith,
      lastUsed: lastUseByProfile.get(workspace.commandName) ?? null,
      model: profile?.model,
      baseUrl: profile?.baseUrl,
      smallFastModel: profile?.smallFastModel,
    };
  });

  return {
    workspaces,
    accounts: accounts.map(dashboardAccountFromInfo),
    cost: dashboardCostFromTable(costTable),
  };
}

function dashboardAccountFromInfo(account: AccountInfo): DashboardAccount {
  const primaryBucket = pickPrimaryBucket(account.live);
  const session = primaryBucket?.session?.utilization;
  const weekly = primaryBucket?.weekly?.utilization;
  return {
    name: account.name,
    commandName: account.commandName,
    cliType: account.cliType,
    provider: account.provider,
    plan: account.meta.plan,
    tokenStatus: account.tokenStatus,
    messages5h: account.messages5h,
    messages7d: account.messages7d,
    lastActive: account.lastActive,
    freshnessAt: account.live?.capturedAt ?? account.tokenRefreshedAt ?? null,
    utilization5h: typeof session === 'number' ? session : null,
    utilization7d: typeof weekly === 'number' ? weekly : null,
    resetLabel: account.hoursUntilWeeklyReset === undefined ? null : `${Math.max(0, Math.round(account.hoursUntilWeeklyReset))}h`,
  };
}

function dashboardCostFromTable(table: CostTable | null): DashboardCostState {
  if (!table) return emptyDashboardCostState();
  const providers = new Map<string, { provider: string; spent7dUsd: number; estCostPerCallUsd: number; profiles: number }>();
  for (const row of table.rows) {
    const provider = row.provider || 'unknown';
    const slot = providers.get(provider) ?? { provider, spent7dUsd: 0, estCostPerCallUsd: 0, profiles: 0 };
    slot.spent7dUsd += row.spent7dUsd;
    slot.estCostPerCallUsd += row.estCostPerCallUsd ?? 0;
    slot.profiles += 1;
    providers.set(provider, slot);
  }
  const spent7dUsd = table.rows.reduce((sum, row) => sum + row.spent7dUsd, 0);
  const perCallEstimates = table.rows
    .map((row) => row.estCostPerCallUsd)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
  const estCostPerCallUsd = perCallEstimates.length > 0 ? Math.min(...perCallEstimates) : 0;
  return {
    generatedAt: table.generatedAt,
    spent7dUsd,
    estCostPerCallUsd,
    providers: [...providers.values()].sort((a, b) => b.spent7dUsd - a.spent7dUsd || b.estCostPerCallUsd - a.estCostPerCallUsd),
    sparkline: dashboardCostSparkline([...providers.values()].map((provider) => provider.spent7dUsd)),
  };
}

function emptyDashboardCostState(): DashboardCostState {
  return {
    generatedAt: new Date().toISOString(),
    spent7dUsd: 0,
    estCostPerCallUsd: 0,
    providers: [],
    sparkline: dashboardCostSparkline([]),
  };
}

function dashboardCostSparkline(values: number[]): number[] {
  const buckets = values.length > 0 ? values.slice(0, 7) : [0, 0, 0, 0, 0, 0, 0];
  while (buckets.length < 7) buckets.unshift(0);
  const max = Math.max(...buckets, 0.01);
  return buckets.map((value) => Math.max(4, Math.round((value / max) * 32)));
}

function editWorkspaceFromDashboard(commandName: string, payload: Record<string, unknown>) {
  const patch: WorkspaceEditOptions = {};
  const model = editableString(payload.model);
  const baseUrl = editableString(payload.baseUrl);
  const smallFastModel = editableString(payload.smallFastModel);
  if (model !== undefined) patch.model = model;
  if (baseUrl !== undefined) patch.baseUrl = baseUrl;
  if (smallFastModel !== undefined) patch.smallFastModel = smallFastModel;

  if (payload.envOverrides !== undefined) {
    if (!payload.envOverrides || typeof payload.envOverrides !== 'object' || Array.isArray(payload.envOverrides)) {
      throw new DashboardRequestError(400, 'envOverrides must be an object');
    }
    const envOverrides: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload.envOverrides)) {
      const envKey = key.trim();
      if (!envKey || typeof value !== 'string') {
        throw new DashboardRequestError(400, 'envOverrides values must be strings');
      }
      envOverrides[envKey] = value;
    }
    if (Object.keys(envOverrides).length > 0) patch.envOverrides = envOverrides;
  }

  if (Object.keys(patch).length === 0) {
    throw new DashboardRequestError(400, 'At least one editable workspace field is required');
  }
  return editWorkspace(commandName, patch);
}

function editableString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined;
}

function dashboardEditableWorkspace(profile: { commandName: string; model?: string; baseUrl?: string; smallFastModel?: string }): Pick<DashboardWorkspace, 'commandName' | 'model' | 'baseUrl' | 'smallFastModel'> {
  return {
    commandName: profile.commandName,
    model: profile.model,
    baseUrl: profile.baseUrl,
    smallFastModel: profile.smallFastModel,
  };
}

async function restoreLocalDashboardSession(
  sessionId: string,
  requestedTerminal: TerminalName | undefined,
  terminalLauncher: typeof launchTerminal,
  dbPath?: string,
): Promise<{ ok: boolean; session: DashboardSession; launch?: unknown; reason?: string }> {
  const db = new SessionsDb(dbPath);
  try {
    const session = db.byId(sessionId);
    if (!session) throw new DashboardRequestError(404, 'Dashboard session not found');
    if (session.machine !== os.hostname()) throw new DashboardRequestError(409, 'Remote dashboard sessions must be restored through federation');
    if (session.status === 'closed') throw new DashboardRequestError(409, 'Closed dashboard sessions cannot be restored');
    const terminal = requestedTerminal ?? terminalFromSession(session) ?? 'ghostty';
    const command: [string, ...string[]] = session.tmuxName
      ? ['tmux', 'attach', '-t', session.tmuxName]
      : [session.workspace, '--continue'];
    const launch = await terminalLauncher({
      terminal,
      command,
      cwd: session.cwd,
      title: `sweech ${session.workspace}`,
    });
    return launch.ok
      ? { ok: true, session, launch }
      : { ok: false, session, reason: launch.reason, launch };
  } finally {
    db.close();
  }
}

function dashboardSessionsFilterFromUrl(url?: URL): ListDashboardSessionsFilter {
  const status = parseStatusFilter(url?.searchParams.get('status'));
  const limitParam = url?.searchParams.get('limit');
  const offsetParam = url?.searchParams.get('offset');
  return {
    machine: optionalParam(url?.searchParams.get('machine')),
    workspace: optionalParam(url?.searchParams.get('workspace')),
    q: optionalParam(url?.searchParams.get('q')),
    status,
    limit: limitParam ? parsePositiveInt(limitParam, 200) : 200,
    offset: offsetParam ? parsePositiveInt(offsetParam, 0) : 0,
  };
}

function parseStatusFilter(value: string | null | undefined): DashboardSessionStatus | DashboardSessionStatus[] | undefined {
  const statuses = (value ?? '').split(',').map((item) => item.trim()).filter(Boolean) as DashboardSessionStatus[];
  if (statuses.length === 0) return undefined;
  const invalid = statuses.find((status) => !DASHBOARD_SESSION_STATUSES.has(status));
  if (invalid) throw new DashboardRequestError(400, `Invalid dashboard session status: ${invalid}`);
  return statuses.length === 1 ? statuses[0] : statuses;
}

function optionalParam(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function terminalFromSession(session: DashboardSession): TerminalName | undefined {
  const value = session.terminalApp?.trim().toLowerCase();
  if (!value) return undefined;
  if (value.includes('ghostty')) return 'ghostty';
  if (value.includes('iterm')) return 'iterm2';
  if (value.includes('terminal')) return 'terminal';
  if (value.includes('alacritty')) return 'alacritty';
  if (value.includes('kitty')) return 'kitty';
  if (value.includes('wezterm')) return 'wezterm';
  return undefined;
}

function parseTerminalName(value: string | undefined): TerminalName | undefined {
  if (!value) return undefined;
  if (value === 'ghostty' || value === 'iterm2' || value === 'terminal' || value === 'alacritty' || value === 'kitty' || value === 'wezterm') {
    return value;
  }
  throw new DashboardRequestError(400, `Unsupported terminal: ${value}`);
}

function isJsonRequest(contentType: string | string[] | undefined): boolean {
  const value = Array.isArray(contentType) ? contentType[0] : contentType;
  return typeof value === 'string' && value.toLowerCase().split(';', 1)[0].trim() === 'application/json';
}

async function readDashboardBody(req: http.IncomingMessage, res: http.ServerResponse): Promise<string | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > 64 * 1024) {
      sendDashboardJson(res, 413, { error: 'Request body too large' });
      return null;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseDashboardJsonObject(body: string): Record<string, unknown> {
  if (!body.trim()) return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new DashboardRequestError(400, 'JSON body must be an object');
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DashboardRequestError) throw error;
    throw new DashboardRequestError(400, 'Invalid JSON body');
  }
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

class DashboardRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function sendDashboardJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': 'http://127.0.0.1',
  });
  res.end(JSON.stringify(body));
}

function dashboardErrorBody(error: unknown): { error: string; detail: string } {
  return {
    error: 'Dashboard state unavailable',
    detail: error instanceof Error ? error.message : String(error),
  };
}

function sendDashboardEvents(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  options: { heartbeatMs: number; sessionPollMs: number; maxSseClients: number; sessionsDbPath?: string }
): void {
  if (req.method === 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  if (activeSseClients >= options.maxSseClients) {
    sendDashboardJson(res, 429, { error: 'Too many dashboard event streams' });
    return;
  }
  activeSseClients++;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': connected\n\n');

  let since = 0;
  const emitSessions = () => {
    void emitSessionChanges(res, since, options.sessionsDbPath).then((latest) => {
      since = Math.max(since, latest);
    }).catch((error) => {
      writeDashboardComment(res, `dashboard state unavailable: ${error instanceof Error ? error.message : String(error)}`);
    });
  };
  emitSessions();

  const unsubscribe = dashboardEventHub.subscribe((event) => {
    writeDashboardEvent(res, event);
  });
  const sessionTimer = setInterval(emitSessions, options.sessionPollMs);
  const heartbeatTimer = setInterval(() => {
    safeWrite(res, `event: heartbeat\ndata: ${JSON.stringify({ at: Date.now() })}\n\n`);
  }, options.heartbeatMs);
  sessionTimer.unref();
  heartbeatTimer.unref();

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearInterval(sessionTimer);
    clearInterval(heartbeatTimer);
    unsubscribe();
    req.off('close', cleanup);
    res.off('error', cleanup);
    activeSseClients = Math.max(0, activeSseClients - 1);
  };
  req.on('close', cleanup);
  res.on('error', cleanup);
}

async function emitSessionChanges(res: http.ServerResponse, since: number, dbPath?: string): Promise<number> {
  let latest = since;
  const state = await collectDashboardSessions(undefined, dbPath);
  for (const session of state.sessions) {
    if (session.lastActiveAt <= since) continue;
    latest = Math.max(latest, session.lastActiveAt);
    writeDashboardEvent(res, {
      type: 'session.changed',
      data: { session },
    });
  }
  return latest;
}

function writeDashboardEvent(res: http.ServerResponse, event: DashboardEvent): void {
  if (!DASHBOARD_EVENT_NAMES.has(event.type)) return;
  const data = safeJson(event.data);
  if (!data) {
    writeDashboardComment(res, `dropped unserializable ${event.type} event`);
    return;
  }
  safeWrite(res, `event: ${event.type}\ndata: ${data}\n\n`);
}

function writeDashboardComment(res: http.ServerResponse, message: string): void {
  safeWrite(res, `: ${message.replace(/\r?\n/g, ' ')}\n\n`);
}

function safeWrite(res: http.ServerResponse, chunk: string): void {
  if (res.writableEnded || res.destroyed) return;
  if (!res.write(chunk)) res.destroy(new Error('dashboard SSE client backpressure limit reached'));
}

function safeJson(value: unknown): string | null {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function serveDashboardAsset(req: http.IncomingMessage, res: http.ServerResponse, assetsDir: string, pathname: string): void {
  let relative: string;
  try {
    if (pathname === '/dashboard' || pathname === '/dashboard/') {
      relative = 'index.html';
    } else if (pathname.startsWith('/dashboard/')) {
      relative = decodeURIComponent(pathname.slice('/dashboard/'.length));
    } else {
      relative = decodeURIComponent(pathname.replace(/^\/+/, ''));
    }
  } catch {
    sendDashboardJson(res, 400, { error: 'Bad path encoding' });
    return;
  }

  const root = path.resolve(assetsDir);
  const requestedPath = path.resolve(root, relative);
  const filePath = requestedPath === root || requestedPath.startsWith(root + path.sep)
    ? requestedPath
    : path.join(root, 'index.html');
  const finalPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(root, 'index.html');
  const safeFinalPath = resolveSafeDashboardFile(root, finalPath);
  if (!safeFinalPath) {
    sendDashboardJson(res, 403, { error: 'Dashboard asset outside static root' });
    return;
  }

  fs.readFile(safeFinalPath, (error, data) => {
    if (error) {
      sendDashboardJson(res, 503, { error: 'Dashboard assets not built. Run npm run build.' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentTypeFor(safeFinalPath),
      'Cache-Control': safeFinalPath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  });
}

function resolveSafeDashboardFile(root: string, filePath: string): string | null {
  try {
    const realRoot = fs.realpathSync(root);
    const realFile = fs.realpathSync(filePath);
    return realFile === realRoot || realFile.startsWith(realRoot + path.sep) ? realFile : null;
  } catch {
    return filePath === path.join(root, 'index.html') ? filePath : null;
  }
}

function isLocalDashboardHost(host: string | undefined): boolean {
  if (!host) return true;
  const normalized = host.toLowerCase();
  return normalized === 'localhost'
    || normalized.startsWith('localhost:')
    || normalized === '127.0.0.1'
    || normalized.startsWith('127.0.0.1:')
    || normalized === '[::1]'
    || normalized.startsWith('[::1]:');
}

function isAllowedDashboardOrigin(host: string | undefined, origin: string | undefined, fetchSite: string | string[] | undefined, pathname: string): boolean {
  if (!origin) {
    const site = Array.isArray(fetchSite) ? fetchSite[0] : fetchSite;
    if (site === 'same-origin' || site === 'none') return true;
    return pathname !== '/dashboard/state'
      && pathname !== '/dashboard/sessions'
      && !/^\/dashboard\/sessions\/[^/]+\/summary$/.test(pathname)
      && !/^\/dashboard\/sessions\/[^/]+\/restore$/.test(pathname)
      && pathname !== '/dashboard/events';
  }
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'http:' || !isLocalDashboardHost(parsed.host)) return false;
    if (isUnsafeDashboardPath(pathname)) return Boolean(host && parsed.host.toLowerCase() === host.toLowerCase());
    return true;
  } catch {
    return false;
  }
}

function isUnsafeDashboardPath(pathname: string): boolean {
  return /^\/dashboard\/sessions\/[^/]+\/(summary|restore)$/.test(pathname);
}

function contentTypeFor(filePath: string): string {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}
