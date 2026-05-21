import React from 'react';
import {
  type DashboardAccount,
  type DashboardAuditFinding,
  type DashboardSettingsState,
  type DashboardWorkspace,
} from './panelViewModel';
import { type DashboardSession } from './sessionViewModel';

export type PaletteResultType = 'session' | 'workspace' | 'account' | 'audit' | 'settings' | 'recent';

export type PaletteResult = {
  id: string;
  type: PaletteResultType;
  title: string;
  subtitle: string;
  actionLabel: string;
  target?: string;
  score?: number;
};

type CommandPaletteProps = {
  sessions: DashboardSession[];
  workspaces: DashboardWorkspace[];
  accounts: DashboardAccount[];
  auditFindings: DashboardAuditFinding[];
  settings: DashboardSettingsState;
  onOpenSettings: () => void;
};

const RECENT_KEY = 'sweech.dashboard.commandPalette.recents';
const MAX_RECENTS = 6;

const STATIC_SETTINGS_RESULTS: PaletteResult[] = [
  { id: 'settings-general', type: 'settings', title: 'Open settings', subtitle: 'General, tmux, terminal, summaries, federation', actionLabel: 'Open', target: 'settings-open' },
  { id: 'settings-terminal', type: 'settings', title: 'Terminal preference', subtitle: 'Choose Ghostty, Terminal.app, kitty, wezterm, or auto', actionLabel: 'Open settings', target: 'settings-open' },
  { id: 'settings-federation', type: 'settings', title: 'Federation settings', subtitle: 'Discovery, peer refresh, and dashboard restore preferences', actionLabel: 'Open settings', target: 'settings-open' },
];

export function CommandPalette({
  sessions,
  workspaces,
  accounts,
  auditFindings,
  settings,
  onOpenSettings,
}: CommandPaletteProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [recents, setRecents] = React.useState<PaletteResult[]>(() => readRecentPaletteResults());
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const results = React.useMemo(() => buildPaletteResults({
    sessions,
    workspaces,
    accounts,
    auditFindings,
    settings,
    recents,
    query,
  }), [accounts, auditFindings, query, recents, sessions, settings, workspaces]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const commandPressed = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      if (commandPressed) {
        event.preventDefault();
        setOpen(true);
        setActiveIndex(0);
        return;
      }
      if (!open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, Math.max(0, results.length - 1)));
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const selected = results[activeIndex];
        if (selected) executeResult(selected);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, executeResult, open, results]);

  React.useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const remember = React.useCallback((result: PaletteResult) => {
    const next = normalizeRecentPaletteResults([result, ...recents]);
    setRecents(next);
    writeRecentPaletteResults(next);
  }, [recents]);

  const runAction = React.useCallback((result: PaletteResult) => {
    remember(result);
    setOpen(false);
    setQuery('');
    if (result.type === 'settings' || result.target === 'settings-open') {
      onOpenSettings();
      return;
    }
    if (result.type === 'audit' && result.target) {
      document.querySelector<HTMLElement>(`[data-testid="${cssEscape(result.target)}"]`)?.focus();
      return;
    }
    const target = result.target ? document.querySelector<HTMLElement>(`[data-testid="${cssEscape(result.target)}"]`) : null;
    target?.scrollIntoView({ block: 'center', inline: 'nearest' });
    target?.focus();
    if (result.type === 'workspace' || result.type === 'session') target?.click();
  }, [onOpenSettings, remember]);

  function executeResult(result: PaletteResult) {
    runAction(result);
  }

  if (!open) {
    return (
      <button className="palette-trigger" data-testid="command-palette-trigger" type="button" onClick={() => setOpen(true)} aria-label="Open command palette">
        Cmd K
      </button>
    );
  }

  return (
    <div className="palette-backdrop" role="presentation" onClick={() => setOpen(false)}>
      <dialog className="command-palette" open aria-label="Command palette" onClick={(event) => event.stopPropagation()}>
        <div className="palette-search-row">
          <input
            ref={inputRef}
            data-testid="command-palette-search"
            aria-label="Search commands"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sessions, workspaces, accounts, audit, settings"
          />
          <button className="icon-button" type="button" aria-label="Close command palette" onClick={() => setOpen(false)}>×</button>
        </div>
        <div className="palette-results" role="listbox" aria-label="Command results">
          {results.length === 0 ? (
            <div className="palette-empty" data-testid="command-palette-empty">No matching commands</div>
          ) : results.map((result, index) => (
            <button
              className={`palette-result ${index === activeIndex ? 'palette-result-active' : ''}`}
              data-testid={`command-result-${result.id}`}
              key={result.id}
              onClick={() => runAction(result)}
              onMouseEnter={() => setActiveIndex(index)}
              role="option"
              aria-selected={index === activeIndex}
              type="button"
            >
              <span className="palette-result-kind">{result.type}</span>
              <span>
                <strong>{result.title}</strong>
                <small>{result.subtitle}</small>
              </span>
              <kbd>{result.actionLabel}</kbd>
            </button>
          ))}
        </div>
      </dialog>
    </div>
  );
}

export type BuildPaletteInput = {
  sessions: DashboardSession[];
  workspaces: DashboardWorkspace[];
  accounts: DashboardAccount[];
  auditFindings: DashboardAuditFinding[];
  settings: DashboardSettingsState;
  recents?: PaletteResult[];
  query?: string;
};

export function buildPaletteResults(input: BuildPaletteInput): PaletteResult[] {
  const base = [
    ...buildRecentResults(input.recents ?? [], input.query ?? ''),
    ...input.sessions.map(sessionToPaletteResult),
    ...input.workspaces.map(workspaceToPaletteResult),
    ...input.accounts.map(accountToPaletteResult),
    ...input.auditFindings.map(auditToPaletteResult),
    ...settingsToPaletteResults(input.settings),
  ];
  const query = normalizeQuery(input.query ?? '');
  const ranked = base
    .map((result) => ({ ...result, score: scorePaletteResult(result, query) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || typeRank(a.type) - typeRank(b.type) || a.title.localeCompare(b.title));
  return dedupePaletteResults(ranked).slice(0, 12);
}

export function scorePaletteResult(result: PaletteResult, query: string): number {
  if (!query) return result.type === 'recent' ? 120 : 20 - typeRank(result.type);
  const haystack = normalizeQuery(`${result.title} ${result.subtitle} ${result.type}`);
  if (haystack.includes(query)) return 100 + query.length;
  return fuzzyScore(haystack, query);
}

export function fuzzyScore(haystack: string, query: string): number {
  if (!query) return 1;
  let score = 0;
  let lastIndex = -1;
  for (const char of query) {
    const index = haystack.indexOf(char, lastIndex + 1);
    if (index === -1) return 0;
    score += lastIndex + 1 === index ? 8 : 3;
    lastIndex = index;
  }
  return score;
}

export function normalizeRecentPaletteResults(results: PaletteResult[]): PaletteResult[] {
  return dedupePaletteResults(results.map((result) => ({ ...result, type: 'recent' as const }))).slice(0, MAX_RECENTS);
}

function buildRecentResults(recents: PaletteResult[], query: string): PaletteResult[] {
  if (query.trim()) return [];
  return recents.map((recent) => ({
    ...recent,
    id: `recent-${recent.id.replace(/^recent-/, '')}`,
    type: 'recent',
    subtitle: `Recent · ${recent.subtitle}`,
  }));
}

function sessionToPaletteResult(session: DashboardSession): PaletteResult {
  const workspace = stringField(session.workspace, 'session');
  const id = stringField(session.id, workspace);
  const status = stringField(session.status, 'unknown');
  const machine = stringField(session.machine, 'local');
  return {
    id: `session-${id}`,
    type: 'session',
    title: `Open ${workspace}`,
    subtitle: `${status} session on ${machine}`,
    actionLabel: 'Open',
    target: `session-tile-${id}`,
  };
}

function workspaceToPaletteResult(workspace: DashboardWorkspace): PaletteResult {
  return {
    id: `workspace-${workspace.commandName}`,
    type: 'workspace',
    title: `Edit ${workspace.commandName}`,
    subtitle: `${workspace.provider} · ${workspace.cliType}`,
    actionLabel: 'Edit',
    target: `workspace-card-${workspace.commandName}`,
  };
}

function accountToPaletteResult(account: DashboardAccount): PaletteResult {
  return {
    id: `account-${account.commandName}`,
    type: 'account',
    title: `Inspect ${account.commandName}`,
    subtitle: `${account.provider ?? account.cliType} · ${account.plan ?? 'usage window'}`,
    actionLabel: 'Focus',
    target: `account-card-${account.commandName}`,
  };
}

function auditToPaletteResult(finding: DashboardAuditFinding): PaletteResult {
  const profile = finding.profile || 'profile';
  return {
    id: `audit-${profile}-${finding.kind}`,
    type: 'audit',
    title: `Audit ${profile}`,
    subtitle: `${finding.severity} · ${finding.detail}`,
    actionLabel: finding.fixAction ? 'Focus fix' : 'Focus',
    target: finding.fixAction ? `audit-fix-${profile}-${finding.kind}` : `audit-finding-${profile}-${finding.kind}`,
  };
}

function settingsToPaletteResults(settings: DashboardSettingsState): PaletteResult[] {
  return STATIC_SETTINGS_RESULTS.map((result) => ({
    ...result,
    subtitle: result.id === 'settings-terminal'
      ? `Current terminal: ${settings.terminal.preferred}`
      : result.subtitle,
  }));
}

function readRecentPaletteResults(): PaletteResult[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') as PaletteResult[];
    return normalizeRecentPaletteResults(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function writeRecentPaletteResults(results: PaletteResult[]): void {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(results));
  } catch {
    return;
  }
}

function dedupePaletteResults(results: PaletteResult[]): PaletteResult[] {
  const seen = new Set<string>();
  const deduped: PaletteResult[] = [];
  for (const result of results) {
    const key = result.id.replace(/^recent-/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(result);
  }
  return deduped;
}

function normalizeQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function typeRank(type: PaletteResultType): number {
  return { recent: 0, session: 1, workspace: 2, account: 3, audit: 4, settings: 5 }[type];
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
