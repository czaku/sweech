import React from 'react';
import { createRoot } from 'react-dom/client';
import { Card, ThemeProvider, themes } from '@vykeai/vysual-react';
import { create } from 'zustand';
import { HeroStrip } from './components/HeroStrip';
import { type DoctorCheck, deriveHeroStats } from './components/heroStats';
import { SessionsPanel } from './panels/Sessions';
import { type DashboardSession } from './components/sessionViewModel';
import { AccountsPanel } from './panels/Accounts';
import { CostPanel } from './panels/Cost';
import { WorkspacesPanel } from './panels/Workspaces';
import { type DashboardAccount, type DashboardCostState, type DashboardWorkspace } from './components/panelViewModel';
import './styles.css';

type DashboardState = {
  sessions: DashboardSession[];
  workspaces: DashboardWorkspace[];
  accounts: DashboardAccount[];
  cost: DashboardCostState;
  doctorChecks: DoctorCheck[];
  connected: boolean;
  localMachine: string;
  panels: Record<string, 'idle' | 'loading' | 'ready'>;
  setConnected: (connected: boolean) => void;
  applyInitialState: (state: { sessions?: DashboardSession[]; machine?: string; workspaces?: DashboardWorkspace[]; accounts?: DashboardAccount[]; cost?: DashboardCostState }) => void;
  updateWorkspace: (workspace: DashboardWorkspace) => void;
  upsertSession: (session: DashboardSession) => void;
  applyDoctorTick: (payload: unknown) => void;
};

type DashboardInitialPayload = {
  sessions?: unknown;
  machine?: unknown;
  workspaces?: unknown;
  accounts?: unknown;
  cost?: unknown;
};

const emptyCost: DashboardCostState = {
  spent7dUsd: 0,
  estCostPerCallUsd: 0,
  providers: [],
  sparkline: [],
};

const useDashboardStore = create<DashboardState>((set) => ({
  sessions: [],
  workspaces: [],
  accounts: [],
  cost: emptyCost,
  doctorChecks: [],
  connected: false,
  localMachine: '',
  panels: {
    sessions: 'idle',
    workspaces: 'idle',
    accounts: 'idle',
    cost: 'idle',
    audit: 'idle',
    failover: 'idle',
  },
  setConnected: (connected) => set({ connected }),
  applyInitialState: (state) => set((current) => ({
    sessions: state.sessions ?? current.sessions,
    workspaces: state.workspaces ?? current.workspaces,
    accounts: state.accounts ?? current.accounts,
    cost: state.cost ?? current.cost,
    localMachine: state.machine ?? current.localMachine,
    panels: { ...current.panels, sessions: 'ready', workspaces: 'ready', accounts: 'ready', cost: 'ready' },
  })),
  updateWorkspace: (workspace) => set((state) => ({
    workspaces: state.workspaces.map((item) => item.commandName === workspace.commandName ? { ...item, ...workspace } : item),
    panels: { ...state.panels, workspaces: 'ready' },
  })),
  upsertSession: (session) => set((state) => ({
    sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
    panels: { ...state.panels, sessions: 'ready' },
  })),
  applyDoctorTick: (payload) => set((state) => ({
    doctorChecks: doctorChecksFromPayload(payload),
    panels: { ...state.panels, audit: 'ready' },
  })),
}));

function useInitialState(url: string) {
  const applyInitialState = useDashboardStore((state) => state.applyInitialState);

  React.useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        const payload = data as DashboardInitialPayload | null;
        if (!cancelled && payload && Array.isArray(payload.sessions)) {
          applyInitialState({
            sessions: payload.sessions as DashboardSession[],
            machine: typeof payload.machine === 'string' ? payload.machine : undefined,
            workspaces: Array.isArray(payload.workspaces) ? payload.workspaces as DashboardWorkspace[] : undefined,
            accounts: Array.isArray(payload.accounts) ? payload.accounts as DashboardAccount[] : undefined,
            cost: payload.cost && typeof payload.cost === 'object' ? payload.cost as DashboardCostState : undefined,
          });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [applyInitialState, url]);
}

function useSSE(url: string) {
  const setConnected = useDashboardStore((state) => state.setConnected);
  const upsertSession = useDashboardStore((state) => state.upsertSession);
  const applyDoctorTick = useDashboardStore((state) => state.applyDoctorTick);

  React.useEffect(() => {
    let retry = 500;
    let closed = false;
    let source: EventSource | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      source = new EventSource(url);
      source.onopen = () => {
        retry = 500;
        setConnected(true);
      };
      const handleSessionChanged: EventListener = (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data);
          const session = payload.session ?? payload.data?.session;
          if (session?.id) {
            upsertSession(session);
          }
        } catch {
          return;
        }
      };
      const handleDoctorTick: EventListener = (event) => {
        try {
          applyDoctorTick(JSON.parse((event as MessageEvent).data));
        } catch {
          return;
        }
      };
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          const session = payload.session ?? payload.data?.session;
          if ((payload.type === 'session.changed' || event.type === 'message') && session?.id) {
            upsertSession(session);
          }
        } catch {
          return;
        }
      };
      source.addEventListener('session.changed', handleSessionChanged);
      source.addEventListener('summary.updated', handleSessionChanged);
      source.addEventListener('doctor.tick', handleDoctorTick);
      source.onerror = () => {
        setConnected(false);
        source?.close();
        timer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 8000);
      };
    };

    connect();
    return () => {
      closed = true;
      setConnected(false);
      source?.close();
      if (timer) clearTimeout(timer);
    };
  }, [applyDoctorTick, setConnected, upsertSession, url]);
}

function useSummaryRequests(sessions: DashboardSession[]) {
  const requested = React.useRef(new Set<string>());
  React.useEffect(() => {
    for (const session of sessions) {
      const stale = session.summaryStale ?? session.summary_stale ?? true;
      const summary = session.summaryOne ?? session.summary_one;
      if (!session.id || requested.current.has(session.id) || (!stale && summary)) continue;
      requested.current.add(session.id);
      fetch(`/dashboard/sessions/${encodeURIComponent(session.id)}/summary`, { method: 'POST' })
        .catch(() => {
          requested.current.delete(session.id);
        });
    }
  }, [sessions]);
}

function PlaceholderPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <Card className="panel">
      <h2>{title}</h2>
      <p>{detail}</p>
    </Card>
  );
}

function App() {
  useInitialState('/dashboard/state');
  useSSE('/dashboard/events');
  const { connected, sessions, doctorChecks, localMachine, workspaces, accounts, cost } = useDashboardStore();
  const updateWorkspace = useDashboardStore((state) => state.updateWorkspace);
  useSummaryRequests(sessions);
  const heroSessions = sessions.map((session) => ({
    ...session,
    summaryCostUsd: session.summaryCostUsd ?? session.summary_cost_usd ?? null,
    summaryAt: session.summaryAt ?? session.summary_at ?? null,
    launchedAt: session.launchedAt ?? session.launched_at ?? null,
  }));
  const heroStats = deriveHeroStats(heroSessions, doctorChecks);

  return (
    <ThemeProvider theme={themes.sweech}>
      <main className="dashboard-shell">
        <HeroStrip connected={connected} stats={heroStats} />

        <SessionsPanel sessions={sessions} connected={connected} localMachine={localMachine} />

        <section className="mid-grid" aria-label="Dashboard panels">
          <WorkspacesPanel workspaces={workspaces} onWorkspaceSaved={updateWorkspace} />
          <AccountsPanel accounts={accounts} />
          <CostPanel cost={cost} />
          <PlaceholderPanel title="Audit" detail="Fixable profile findings land here." />
          <PlaceholderPanel title="Failover" detail="Cooldowns and routing decisions land here." />
          <PlaceholderPanel title="Billing" detail="Renewal calendar and balance gaps land here." />
        </section>
      </main>
    </ThemeProvider>
  );
}

function doctorChecksFromPayload(payload: unknown): DoctorCheck[] {
  if (!payload || typeof payload !== 'object') return [];
  const source = payload as { checks?: unknown; data?: { checks?: unknown }; ok?: boolean; status?: DoctorCheck['status'] };
  const checks = Array.isArray(source.checks)
    ? source.checks
    : Array.isArray(source.data?.checks)
      ? source.data.checks
      : undefined;
  if (checks) return checks.filter((check): check is DoctorCheck => Boolean(check && typeof check === 'object'));
  return [{ ok: source.ok, status: source.status }];
}

createRoot(document.getElementById('root')!).render(<App />);
