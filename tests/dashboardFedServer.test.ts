import http from 'node:http';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createDashboardRequestHandler, isLocalDashboardClient, publishDashboardEvent } from '../src/dashboardServer';
import { createSweechFedServer, startSweechFedServer } from '../src/fedServer';

const mockList = jest.fn();
const mockClose = jest.fn();

jest.mock('../src/sessionsDb', () => ({
  SessionsDb: jest.fn().mockImplementation(() => ({
    list: mockList,
    close: mockClose,
  })),
}));

jest.mock('../src/config', () => ({
  ConfigManager: jest.fn().mockImplementation(() => ({
    getProfiles: jest.fn().mockReturnValue([]),
  })),
}));

jest.mock('../src/subscriptions', () => ({
  getKnownAccounts: jest.fn().mockReturnValue([]),
  getAccountInfo: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/auditLog', () => ({
  readAuditLog: jest.fn().mockReturnValue([]),
}));

describe('fed dashboard routes', () => {
  let tmp: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-dashboard-fed-'));
    fs.mkdirSync(path.join(tmp, 'assets'));
    fs.writeFileSync(path.join(tmp, 'index.html'), '<!doctype html><title>sweech dashboard</title><script src="/assets/app.js"></script>');
    fs.writeFileSync(path.join(tmp, 'assets', 'app.js'), 'window.__dashboard = true;');
    mockList.mockReturnValue([sessionFixture()]);
  });

  afterEach(async () => {
    if (server.listening) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  test('fed server exposes dashboard state from sessions.db', async () => {
    await listen(createSweechFedServer(0));

    const res = await request('/dashboard/state');
    const body = JSON.parse(res.body);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(body.sessions).toHaveLength(1);
    expect(body.sessions[0]).toMatchObject({ id: 's1', workspace: 'sweech', status: 'live' });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test('fed server can be constrained to localhost for dashboard startup', async () => {
    server = await startSweechFedServer(0, { host: '127.0.0.1' });

    const address = server.address();
    expect(typeof address).toBe('object');
    expect(address && typeof address === 'object' ? address.address : '').toBe('127.0.0.1');
  });

  test('dashboard sessions endpoint forwards documented filters to sessions.db', async () => {
    await listen(createSweechFedServer(0));

    await request('/dashboard/sessions?machine=devbox&workspace=sweech&status=live,tmux-detached&q=repo&limit=25&offset=5');

    expect(mockList).toHaveBeenCalledWith({
      machine: 'devbox',
      workspace: 'sweech',
      q: 'repo',
      status: ['live', 'tmux-detached'],
      limit: 25,
      offset: 5,
    });
  });

  test('serves built dashboard assets through the dashboard handler', async () => {
    await listen(http.createServer((req, res) => {
      void createDashboardRequestHandler({ assetsDir: tmp })(req, res).then((handled) => {
        if (!handled) {
          res.writeHead(404);
          res.end('not found');
        }
      });
    }));

    const html = await request('/');
    const dashboardHtml = await request('/dashboard/');
    const asset = await request('/assets/app.js');

    expect(html.status).toBe(200);
    expect(html.headers['content-type']).toContain('text/html');
    expect(html.body).toContain('sweech dashboard');
    expect(dashboardHtml.status).toBe(200);
    expect(dashboardHtml.body).toContain('sweech dashboard');
    expect(asset.status).toBe(200);
    expect(asset.headers['content-type']).toContain('text/javascript');
    expect(asset.body).toContain('window.__dashboard');
  });

  test('static serving refuses symlinks that resolve outside the dashboard root', async () => {
    const outside = path.join(tmp, '..', 'outside-secret.txt');
    fs.writeFileSync(outside, 'secret');
    fs.symlinkSync(outside, path.join(tmp, 'assets', 'escape.txt'));
    await listen(http.createServer((req, res) => {
      void createDashboardRequestHandler({ assetsDir: tmp })(req, res);
    }));

    const res = await request('/assets/escape.txt');
    const body = JSON.parse(res.body);

    expect(res.status).toBe(403);
    expect(body.error).toBe('Dashboard asset outside static root');
  });

  test('dashboard state collection errors return JSON 500 responses', async () => {
    mockList.mockImplementationOnce(() => { throw new Error('database locked'); });
    await listen(http.createServer((req, res) => {
      void createDashboardRequestHandler({ assetsDir: tmp })(req, res);
    }));

    const res = await request('/dashboard/state');
    const body = JSON.parse(res.body);

    expect(res.status).toBe(500);
    expect(body.error).toBe('Dashboard state unavailable');
    expect(body.detail).toBe('database locked');
  });

  test('invalid session status filter returns a client error', async () => {
    await listen(http.createServer((req, res) => {
      void createDashboardRequestHandler({ assetsDir: tmp })(req, res);
    }));

    const res = await request('/dashboard/sessions?status=garbage');
    const body = JSON.parse(res.body);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid dashboard session status: garbage');
  });

  test('JSON and SSE endpoints reject missing Origin requests', async () => {
    await listen(http.createServer((req, res) => {
      void createDashboardRequestHandler({ assetsDir: tmp })(req, res);
    }));

    const res = await request('/dashboard/state', {});

    expect(res.status).toBe(403);
  });

  test('JSON endpoints allow same-origin browser fetch metadata without Origin', async () => {
    await listen(http.createServer((req, res) => {
      void createDashboardRequestHandler({ assetsDir: tmp })(req, res);
    }));

    const res = await request('/dashboard/state', { 'Sec-Fetch-Site': 'same-origin' });

    expect(res.status).toBe(200);
  });

  test('rejects malformed dashboard path encoding without crashing', async () => {
    await listen(http.createServer((req, res) => {
      void createDashboardRequestHandler({ assetsDir: tmp })(req, res);
    }));

    const res = await request('/dashboard/%E0%A4%A');
    const body = JSON.parse(res.body);

    expect(res.status).toBe(400);
    expect(body.error).toBe('Bad path encoding');
  });

  test('SSE streams initial session changes and typed dashboard events', async () => {
    await listen(http.createServer((req, res) => {
      void createDashboardRequestHandler({ assetsDir: tmp, heartbeatMs: 25, sessionPollMs: 50 })(req, res);
    }));

    await new Promise<void>((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/dashboard/events', headers: dashboardHeaders() }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
          if (body.includes('event: session.changed') && body.includes('event: doctor.tick') && body.includes('event: heartbeat')) {
            expect(res.statusCode).toBe(200);
            expect(res.headers['content-type']).toContain('text/event-stream');
            req.destroy();
            resolve();
          }
        });
        setImmediate(() => publishDashboardEvent('doctor.tick', { ok: true }));
      });
      req.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ECONNRESET') return;
        reject(error);
      });
      setTimeout(() => reject(new Error('timed out waiting for SSE events')), 1000).unref();
    });
  });

  test('local-only guard refuses non-local dashboard clients', () => {
    expect(isLocalDashboardClient('127.0.0.1')).toBe(true);
    expect(isLocalDashboardClient('::1')).toBe(true);
    expect(isLocalDashboardClient('::ffff:127.0.0.1')).toBe(true);
    expect(isLocalDashboardClient('192.168.1.50')).toBe(false);
    expect(isLocalDashboardClient(undefined)).toBe(false);
  });

  test('drops unserializable SSE events without throwing', async () => {
    await listen(http.createServer((req, res) => {
      void createDashboardRequestHandler({ assetsDir: tmp, heartbeatMs: 25, sessionPollMs: 50 })(req, res);
    }));

    await new Promise<void>((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/dashboard/events', headers: dashboardHeaders() }, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
          if (body.includes('dropped unserializable doctor.tick event')) {
            req.destroy();
            resolve();
          }
        });
        const circular: { self?: unknown } = {};
        circular.self = circular;
        setImmediate(() => {
          expect(() => publishDashboardEvent('doctor.tick', circular)).not.toThrow();
        });
      });
      req.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ECONNRESET') return;
        reject(error);
      });
      setTimeout(() => reject(new Error('timed out waiting for unserializable SSE drop')), 1000).unref();
    });
  });

  async function listen(nextServer: http.Server): Promise<void> {
    server = nextServer;
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
  }

  function request(requestPath: string, headers = dashboardHeaders(requestPath)): Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      http.get({ hostname: '127.0.0.1', port, path: requestPath, headers }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      }).on('error', reject);
    });
  }
});

function dashboardHeaders(requestPath = '/dashboard/state'): http.OutgoingHttpHeaders {
  return requestPath.startsWith('/dashboard/')
    ? { Origin: 'http://127.0.0.1' }
    : {};
}

function sessionFixture() {
  return {
    id: 's1',
    workspace: 'sweech',
    cwd: '/repo/sweech',
    cwdBasename: 'sweech',
    machine: 'devbox',
    tmuxName: 'sweech-s1',
    claudeSid: null,
    jsonlPath: null,
    pid: 123,
    terminalApp: 'Ghostty',
    launchedAt: 1,
    lastActiveAt: Date.now(),
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
}
