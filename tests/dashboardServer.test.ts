import http from 'node:http';
import net from 'node:net';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createDashboardRequestHandler } from '../src/dashboardServer';

const mockList = jest.fn();
const mockById = jest.fn();
const mockClose = jest.fn();
const mockSummarizeNow = jest.fn();
const mockSummarizerClose = jest.fn();
const mockLaunchTerminal = jest.fn();
const mockGetProfiles = jest.fn();
const mockListWorkspaces = jest.fn();
const mockEditWorkspace = jest.fn();
const mockGetKnownAccounts = jest.fn();
const mockGetAccountInfo = jest.fn();
const mockBuildCostTable = jest.fn();

jest.mock('../src/sessionsDb', () => ({
  SessionsDb: jest.fn().mockImplementation(() => ({
    list: mockList,
    byId: mockById,
    close: mockClose,
  })),
}));

jest.mock('../src/sessionSummarizer', () => ({
  SessionSummarizer: jest.fn().mockImplementation(() => ({
    summarizeNow: mockSummarizeNow,
    close: mockSummarizerClose,
  })),
}));

jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('../src/terminalLauncher', () => ({
  launchTerminal: (...args: unknown[]) => mockLaunchTerminal(...args),
}));

jest.mock('../src/config', () => ({
  ConfigManager: jest.fn().mockImplementation(() => ({
    getProfiles: mockGetProfiles,
    getProfileDir: (commandName: string) => `/profiles/${commandName}`,
  })),
}));

jest.mock('../src/workspaceCrud', () => ({
  listWorkspaces: (...args: unknown[]) => mockListWorkspaces(...args),
  editWorkspace: (...args: unknown[]) => mockEditWorkspace(...args),
}));

jest.mock('../src/subscriptions', () => ({
  getKnownAccounts: (...args: unknown[]) => mockGetKnownAccounts(...args),
  getAccountInfo: (...args: unknown[]) => mockGetAccountInfo(...args),
}));

jest.mock('../src/costCommand', () => ({
  buildCostTable: (...args: unknown[]) => mockBuildCostTable(...args),
}));

describe('dashboard server', () => {
  let server: http.Server;
  let port: number;
  let tmp: string;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-dashboard-server-'));
    fs.mkdirSync(path.join(tmp, 'assets'));
    fs.writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><title>sweech dashboard</title><script src="/assets/app.js"></script>');
    fs.writeFileSync(path.join(tmp, 'assets', 'app.js'), 'window.__dashboard = true;');
    const session = {
      id: 's1',
      workspace: 'sweech',
      cwd: '/repo/sweech',
      cwdBasename: 'sweech',
      machine: os.hostname(),
      tmuxName: 'sweech-s1',
      claudeSid: null,
      jsonlPath: null,
      pid: 123,
      terminalApp: 'Ghostty',
      launchedAt: 1,
      lastActiveAt: 2,
      closedAt: null,
      status: 'live',
      messageCount: 4,
      msgCountFirst: 1,
      msgCountLast: 4,
      summaryOne: null,
      summaryBullets: null,
      summaryProvider: null,
      summaryModel: null,
      summaryCostUsd: null,
      summaryAt: null,
      summaryStale: false,
      summaryMsgAt: null,
    };
    mockList.mockReturnValue([
      {
        ...session,
      },
    ]);
    mockById.mockReturnValue(session);
    mockLaunchTerminal.mockResolvedValue({ ok: true, command: 'open', args: ['ghostty://run?...'] });
    mockGetProfiles.mockReturnValue([{ name: 'Sweech Main', commandName: 'sweech', cliType: 'claude', provider: 'anthropic', model: 'claude-sonnet-4-5' }]);
    mockEditWorkspace.mockReturnValue({
      commandName: 'sweech',
      model: 'claude-opus-4-5',
      baseUrl: 'https://api.example.test',
      apiKey: 'sk-test-should-not-leak',
      oauth: { accessToken: 'secret-token' },
      envOverrides: { ANTHROPIC_AUTH_TOKEN: 'secret-env' },
    });
    mockListWorkspaces.mockReturnValue([{
      commandName: 'sweech',
      cliType: 'claude',
      provider: 'anthropic',
      disabled: false,
      hidden: false,
      profileDir: '/profiles/sweech',
      profileDirExists: true,
    }]);
    mockGetKnownAccounts.mockReturnValue([{ name: 'Sweech Main', commandName: 'sweech', cliType: 'claude', provider: 'anthropic' }]);
    mockGetAccountInfo.mockResolvedValue([{
      name: 'Sweech Main',
      commandName: 'sweech',
      cliType: 'claude',
      provider: 'anthropic',
      meta: { plan: 'Max 5x' },
      messages5h: 12,
      messages7d: 88,
      lastActive: '2026-05-21T09:30:00.000Z',
      hoursUntilWeeklyReset: 24,
      tokenStatus: 'valid',
      live: { capturedAt: Date.UTC(2026, 4, 21, 9, 30), buckets: [{ session: { utilization: 0.24 }, weekly: { utilization: 0.44 } }] },
    }]);
    mockBuildCostTable.mockResolvedValue({
      generatedAt: '2026-05-21T09:30:00.000Z',
      rows: [{
        profile: 'sweech',
        cliType: 'claude',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        spent7dUsd: 1.25,
        estCostPerCallUsd: 0.0375,
        lastUseTs: Date.UTC(2026, 4, 21, 9, 30),
      }, {
        profile: 'codex',
        cliType: 'codex',
        provider: 'openai',
        model: 'gpt-5-mini',
        spent7dUsd: 0.5,
        estCostPerCallUsd: 0.009,
        lastUseTs: Date.UTC(2026, 4, 20, 9, 30),
      }],
    });
    mockSummarizeNow.mockResolvedValue({
      sessionId: 's1',
      summaryOne: 'Dashboard route summary.',
      summaryBullets: ['Read viewport trigger'],
      summaryProvider: 'ollama',
      summaryModel: 'llama3',
      summaryCostUsd: 0,
      summaryAt: 123,
      summaryMsgAt: 50,
    });
    server = http.createServer((req, res) => {
      void createDashboardRequestHandler({ assetsDir: tmp, catchAllAssets: true })(req, res).then((handled) => {
        if (!handled) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('server did not expose a TCP port'));
          return;
        }
        port = address.port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tmp, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  function request(path: string, method = 'GET'): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: path.startsWith('/dashboard/') ? { Origin: `http://127.0.0.1:${port}` } : {} }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  function requestWithBody(path: string, method: string, body: string): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          Origin: `http://127.0.0.1:${port}`,
          'Content-Type': 'application/json',
        },
      }, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => { responseBody += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: responseBody, headers: res.headers }));
      });
      req.on('error', reject);
      req.end(body);
    });
  }

  test('serves dashboard state from the sessions database', async () => {
    const res = await request('/dashboard/state');
    const body = JSON.parse(res.body);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(body.machine).toEqual(expect.any(String));
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({ id: 's1', status: 'live', workspace: 'sweech' });
    expect(body.workspaces[0]).toMatchObject({ commandName: 'sweech', name: 'Sweech Main', provider: 'anthropic', model: 'claude-sonnet-4-5' });
    expect(body.workspaces[0].lastUsed).toBe('2026-05-21T09:30:00.000Z');
    expect(body.workspaces[0].profileDir).toBeUndefined();
    expect(body.accounts[0]).toMatchObject({ commandName: 'sweech', plan: 'Max 5x', tokenStatus: 'valid', messages5h: 12, messages7d: 88, utilization5h: 0.24 });
    expect(body.cost).toMatchObject({ spent7dUsd: 1.75, estCostPerCallUsd: 0.009 });
    expect(body.cost.providers[0]).toMatchObject({ provider: 'anthropic', profiles: 1 });
    expect(body.cost.rows).toBeUndefined();
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockGetAccountInfo).toHaveBeenCalledWith(expect.any(Array), { liveCacheOnly: true, timeoutMs: 500 });
  });

  test('dashboard account utilization prefers the All models bucket', async () => {
    mockGetAccountInfo.mockResolvedValueOnce([{
      name: 'Codex',
      commandName: 'codex',
      cliType: 'codex',
      provider: 'openai',
      meta: {},
      messages5h: 0,
      messages7d: 0,
      tokenStatus: undefined,
      live: {
        capturedAt: Date.UTC(2026, 4, 21, 9, 30),
        buckets: [
          { label: 'GPT-5.3-Codex-Spark', session: { utilization: 0 }, weekly: { utilization: 0 } },
          { label: 'All models', session: { utilization: 0.34 }, weekly: { utilization: 0.44 } },
        ],
      },
    }]);

    const res = await request('/dashboard/state');
    const body = JSON.parse(res.body);

    expect(res.status).toBe(200);
    expect(body.accounts[0]).toMatchObject({ commandName: 'codex', utilization5h: 0.34, utilization7d: 0.44 });
  });

  test('serves sessions alias from the same state payload', async () => {
    const res = await request('/dashboard/sessions');
    const body = JSON.parse(res.body);
    expect(res.status).toBe(200);
    expect(body.sessions[0].id).toBe('s1');
  });

  test('POST /dashboard/sessions/:id/summary triggers viewport summarization', async () => {
    const res = await request('/dashboard/sessions/s1/summary', 'POST');
    const body = JSON.parse(res.body);

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      status: 'ok',
      summary: {
        sessionId: 's1',
        summaryOne: 'Dashboard route summary.',
        summaryProvider: 'ollama',
      },
    });
    expect(mockSummarizeNow).toHaveBeenCalledWith('s1', 'viewport');
    expect(mockSummarizerClose).toHaveBeenCalled();
  });

  test('POST /dashboard/sessions/:id/restore opens terminal attach command', async () => {
    const res = await requestWithBody('/dashboard/sessions/s1/restore', 'POST', '{}');
    const body = JSON.parse(res.body);

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockById).toHaveBeenCalledWith('s1');
    expect(mockLaunchTerminal).toHaveBeenCalledWith({
      terminal: 'ghostty',
      command: ['tmux', 'attach', '-t', 'sweech-s1'],
      cwd: '/repo/sweech',
      title: 'sweech sweech',
    });
  });

  test('PATCH /dashboard/workspaces/:name edits workspace settings', async () => {
    const res = await requestWithBody('/dashboard/workspaces/sweech', 'PATCH', JSON.stringify({
      model: 'claude-opus-4-5',
      baseUrl: 'https://api.example.test',
    }));
    const body = JSON.parse(res.body);

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, profile: { commandName: 'sweech', model: 'claude-opus-4-5' } });
    expect(body.profile.apiKey).toBeUndefined();
    expect(body.profile.oauth).toBeUndefined();
    expect(body.profile.envOverrides).toBeUndefined();
    expect(mockEditWorkspace).toHaveBeenCalledWith('sweech', {
      model: 'claude-opus-4-5',
      baseUrl: 'https://api.example.test',
    });
  });

  test('PATCH /dashboard/workspaces/:name preserves blank strings to clear overrides', async () => {
    const res = await requestWithBody('/dashboard/workspaces/sweech', 'PATCH', JSON.stringify({
      model: '',
      baseUrl: '',
      smallFastModel: '',
    }));

    expect(res.status).toBe(200);
    expect(mockEditWorkspace).toHaveBeenCalledWith('sweech', {
      model: '',
      baseUrl: '',
      smallFastModel: '',
    });
  });

  test('restore route rejects unsupported terminals', async () => {
    const res = await requestWithBody('/dashboard/sessions/s1/restore', 'POST', JSON.stringify({ terminal: 'not-a-terminal' }));

    expect(res.status).toBe(400);
    expect(JSON.parse(res.body).error).toContain('Unsupported terminal');
  });

  test('restore route rejects browser-unsafe missing origin requests', async () => {
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/dashboard/sessions/s1/restore',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end('{}');
    });

    expect(res.status).toBe(403);
    expect(JSON.parse(res.body).error).toContain('localhost origin');
    expect(mockLaunchTerminal).not.toHaveBeenCalled();
  });

  test('restore route rejects mismatched localhost origins', async () => {
    const res = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/dashboard/sessions/s1/restore',
        method: 'POST',
        headers: {
          Host: `127.0.0.1:${port}`,
          Origin: 'http://localhost:9999',
          'Content-Type': 'application/json',
        },
      }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end('{}');
    });

    expect(res.status).toBe(403);
    expect(mockLaunchTerminal).not.toHaveBeenCalled();
  });

  test('restore route requires JSON content type and non-empty body', async () => {
    const wrongContent = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/dashboard/sessions/s1/restore',
        method: 'POST',
        headers: { Origin: `http://127.0.0.1:${port}` },
      }, (response) => {
        let body = '';
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => resolve({ status: response.statusCode ?? 0, body }));
      });
      req.on('error', reject);
      req.end('');
    });
    const emptyJson = await requestWithBody('/dashboard/sessions/s1/restore', 'POST', '');

    expect(wrongContent.status).toBe(415);
    expect(emptyJson.status).toBe(400);
    expect(mockLaunchTerminal).not.toHaveBeenCalled();
  });

  test('restore route rejects closed sessions', async () => {
    const closed = { ...mockById(), status: 'closed' };
    mockById.mockReturnValueOnce(closed);

    const res = await requestWithBody('/dashboard/sessions/s1/restore', 'POST', '{}');

    expect(res.status).toBe(409);
    expect(JSON.parse(res.body).error).toContain('Closed dashboard sessions');
    expect(mockLaunchTerminal).not.toHaveBeenCalled();
  });

  test('restore route rejects non-local sessions', async () => {
    const remote = { ...mockById(), machine: 'remote-mini' };
    mockById.mockReturnValueOnce(remote);

    const res = await requestWithBody('/dashboard/sessions/s1/restore', 'POST', '{}');

    expect(res.status).toBe(409);
    expect(JSON.parse(res.body).error).toContain('Remote dashboard sessions');
    expect(mockLaunchTerminal).not.toHaveBeenCalled();
  });

  test('summary route returns accepted when session is not ready', async () => {
    mockSummarizeNow.mockResolvedValueOnce(null);

    const res = await request('/dashboard/sessions/s1/summary', 'POST');

    expect(res.status).toBe(202);
    expect(JSON.parse(res.body)).toMatchObject({ status: 'skipped' });
  });

  test('opens an SSE stream for dashboard events', async () => {
    await new Promise<void>((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/dashboard/events', headers: { Origin: 'http://127.0.0.1' } }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
          if (body.includes('event: session.changed')) {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');
            expect(body).toContain('"id":"s1"');
            req.destroy();
            resolve();
          }
        });
      });
      req.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ECONNRESET') return;
        reject(error);
      });
      setTimeout(() => reject(new Error('timed out waiting for SSE connect')), 1000).unref();
    });
  });

  test('rejects malformed URL encoding without crashing', async () => {
    const res = await request('/%E0%A4%A');
    const body = JSON.parse(res.body);
    expect(res.status).toBe(400);
    expect(body.error).toBe('Bad path encoding');
  });

  test('rejects malformed absolute-form request targets without crashing', async () => {
    const statusLine = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write('GET http://%zz/ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
      });
      let body = '';
      socket.on('data', (chunk) => { body += chunk; });
      socket.on('end', () => resolve(body.split('\r\n')[0]));
      socket.on('error', reject);
    });
    expect(statusLine).toBe('HTTP/1.1 400 Bad Request');
  });

  test('serves the React dashboard shell at the root path', async () => {
    const res = await request('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('sweech dashboard');
  });
});
