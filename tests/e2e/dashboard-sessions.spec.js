const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let fixture;

test.beforeAll(async () => {
  if (!process.env.PROJECT_SCREENSHOT_DIR) {
    process.env.PROJECT_SCREENSHOT_DIR = path.join(os.homedir(), 'Desktop', 'screenshots', 'sweech');
  }
  fs.mkdirSync(process.env.PROJECT_SCREENSHOT_DIR, { recursive: true });
  if (process.env.DASHBOARD_E2E_URL) return;
  fixture = await startDashboardFixture();
  process.env.DASHBOARD_E2E_URL = fixture.url;
});

test.afterAll(async () => {
  if (!fixture) return;
  await fixture.close();
});

test('sessions panel filters, opens details, restores, and screenshots flagship grid', async ({ page }) => {
  const baseUrl = process.env.DASHBOARD_E2E_URL;
  const screenshotDir = process.env.PROJECT_SCREENSHOT_DIR;
  if (!baseUrl) throw new Error('DASHBOARD_E2E_URL is required');
  if (!screenshotDir) throw new Error('PROJECT_SCREENSHOT_DIR is required');
  await page.setViewportSize({ width: 1440, height: 1100 });

  const restoreResponses = [];
  page.on('response', async (response) => {
    if (response.url().includes('/dashboard/sessions/') && response.url().includes('/restore')) {
      restoreResponses.push(response.status());
    }
  });

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('session-tile-e2e-local-live')).toBeVisible();
  await expect(page.getByTestId('session-tile-e2e-remote-recoverable')).toBeVisible();
  await expect(page.getByText('Implemented the flagship sessions tile grid')).toBeVisible();
  await expect(page.getByTestId('jump-e2e-remote-recoverable')).toBeDisabled();
  await expect(page.getByTestId('jump-e2e-remote-recoverable')).toHaveText('Remote');

  await page.getByTestId('session-search').fill('restore endpoint');
  await expect(page.getByTestId('session-tile-e2e-local-live')).toBeVisible();
  await expect(page.getByTestId('session-tile-e2e-remote-recoverable')).toBeHidden();
  await page.getByTestId('session-search').fill('');

  await page.getByTestId('jump-e2e-local-live').click();
  await expect.poll(() => restoreResponses.includes(200)).toBe(true);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(screenshotDir, 'T-DASH-010-sessions-panel-grid.png'),
    fullPage: false,
  });

  await page.getByLabel('Open claude-main details').click();
  await expect(page.getByRole('dialog', { name: 'claude-main' })).toBeVisible();
  await expect(page.getByText('Recent activity')).toBeVisible();

  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const overflow = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.right > viewportWidth + 1 || rect.left < -1;
    });
    return {
      tileCount: document.querySelectorAll('.session-tile').length,
      localStar: Boolean(document.querySelector('.local-star')),
      sparkline: Boolean(document.querySelector('.session-sparkline span')),
      overflowCount: overflow.length,
    };
  });
  expect(layout).toEqual({
    tileCount: 2,
    localStar: true,
    sparkline: true,
    overflowCount: 0,
  });

  await page.screenshot({
    path: path.join(screenshotDir, 'T-DASH-010-sessions-panel-dialog.png'),
    fullPage: false,
  });
});

async function startDashboardFixture() {
  const { SessionsDb } = require('../../dist/sessionsDb');
  const { createDashboardRequestHandler } = require('../../dist/dashboardServer');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-dashboard-e2e-'));
  const dbPath = path.join(tmp, '.sweech', 'sessions.db');
  const db = new SessionsDb(dbPath);
  const now = Date.now();
  db.upsert({
    id: 'e2e-local-live',
    workspace: 'claude-main',
    cwd: '/Users/luke/dev/onlytools/sweech',
    machine: os.hostname(),
    tmuxName: 'sweech-claude-main',
    pid: 4321,
    terminalApp: 'Terminal.app',
    launchedAt: now - 7_200_000,
    lastActiveAt: now - 90_000,
    status: 'live',
    messageCount: 42,
    msgCountFirst: 1,
    msgCountLast: 42,
    summaryOne: 'Implemented the flagship sessions tile grid with filters and restore endpoint.',
    summaryBullets: ['Added search and status filtering', 'Wired local restore endpoint', 'Captured browser proof'],
    summaryProvider: 'ollama',
    summaryModel: 'llama3',
    summaryCostUsd: 0,
    summaryAt: now - 30_000,
    summaryStale: false,
    summaryMsgAt: 42,
  });
  db.upsert({
    id: 'e2e-remote-recoverable',
    workspace: 'codex-pole',
    cwd: '/Users/luke/dev/pole',
    machine: 'remote-mini',
    tmuxName: null,
    pid: null,
    launchedAt: now - 86_400_000,
    lastActiveAt: now - 3_600_000,
    status: 'crash-recoverable',
    messageCount: 9,
    msgCountFirst: 0,
    msgCountLast: 9,
    summaryOne: null,
    summaryBullets: ['Recovered stale session', 'Ready for attach'],
    summaryStale: true,
  });
  db.close();

  const handler = createDashboardRequestHandler({
    assetsDir: path.join(process.cwd(), 'dist/dashboard'),
    catchAllAssets: true,
    sessionsDbPath: dbPath,
    terminalLauncher: async (options) => ({ ok: true, command: 'mock-terminal', args: [...options.command] }),
  });
  const server = http.createServer((req, res) => {
    void handler(req, res).then((handled) => {
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
  });
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture server did not expose a port');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await closeServer(server);
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

test('sessions panel remains usable on mobile width', async ({ page }) => {
  const baseUrl = process.env.DASHBOARD_E2E_URL;
  const screenshotDir = process.env.PROJECT_SCREENSHOT_DIR;
  if (!baseUrl) throw new Error('DASHBOARD_E2E_URL is required');
  if (!screenshotDir) throw new Error('PROJECT_SCREENSHOT_DIR is required');

  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('session-tile-e2e-local-live')).toBeVisible();
  await expect(page.getByText('↗ Jump').first()).toBeVisible();
  await page.getByTestId('session-tile-e2e-local-live').scrollIntoViewIfNeeded();
  const overflowCount = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll('body *')).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.right > viewportWidth + 1 || rect.left < -1;
    }).length;
  });
  expect(overflowCount).toBe(0);
  await page.screenshot({
    path: path.join(screenshotDir, 'T-DASH-010-sessions-panel-mobile.png'),
    fullPage: false,
  });
});

test('cold-load empty state, SSE tile population, filters, reboot recovery, and settings persist', async ({ page }) => {
  const screenshotDir = process.env.PROJECT_SCREENSHOT_DIR;
  if (!screenshotDir) throw new Error('PROJECT_SCREENSHOT_DIR is required');
  const mutable = await startMutableDashboardFixture();
  try {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(mutable.url, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('sessions-empty-state')).toBeVisible();
    await page.screenshot({
      path: path.join(screenshotDir, 'T-DASH-016-cold-load-empty-state.png'),
      fullPage: false,
    });

    const sseTileEvent = waitForDashboardSessionEvent(page, 'e2e-sse-claude-pole');
    await expect.poll(() => page.evaluate(() => Boolean(window.__sweechE2eSseOpen))).toBe(true);
    insertDashboardSession(mutable.dbPath, {
      id: 'e2e-sse-claude-pole',
      workspace: 'claude-pole',
      cwd: '/repo/pole',
      machine: os.hostname(),
      tmuxName: 'sweech-claude-pole',
      pid: 98765,
      terminalApp: 'Ghostty',
      launchedAt: Date.now() - 10_000,
      lastActiveAt: Date.now() + 5_000,
      status: 'live',
      messageCount: 3,
      msgCountFirst: 1,
      msgCountLast: 3,
      summaryOne: 'SSE-driven launch tile arrived without a page reload.',
      summaryBullets: ['Created after the browser opened'],
      summaryProvider: 'ollama',
      summaryModel: 'llama3',
      summaryCostUsd: 0,
      summaryAt: Date.now(),
      summaryStale: false,
      summaryMsgAt: 3,
    });
    await expect.poll(() => sseTileEvent).toBe(true);
    await expect(page.getByTestId('session-tile-e2e-sse-claude-pole')).toBeVisible();

    insertDashboardSession(mutable.dbPath, {
      id: 'e2e-reboot-detached',
      workspace: 'codex-reboot',
      cwd: '/repo/reboot',
      machine: os.hostname(),
      tmuxName: 'missing-tmux-session',
      pid: 55555,
      launchedAt: Date.now() - 30_000,
      lastActiveAt: Date.now() + 10_000,
      status: 'live',
      messageCount: 7,
      summaryOne: 'Reboot candidate session.',
      summaryBullets: ['Before startup reconcile'],
    });
    await expect(page.getByTestId('session-tile-e2e-reboot-detached')).toBeVisible();

    await page.getByTestId('session-search').fill('SSE-driven');
    await expect(page.getByTestId('session-tile-e2e-sse-claude-pole')).toBeVisible();
    await expect(page.getByTestId('session-tile-e2e-reboot-detached')).toBeHidden();
    await page.getByTestId('session-search').fill('');
    await page.getByLabel('Status').selectOption('live');
    await expect(page.getByTestId('session-tile-e2e-sse-claude-pole')).toBeVisible();
    await page.getByLabel('Sort').selectOption('workspace');
    await expect.poll(() => visibleSessionTileIds(page)).toEqual([
      'session-tile-e2e-sse-claude-pole',
      'session-tile-e2e-reboot-detached',
    ]);
    await page.screenshot({
      path: path.join(screenshotDir, 'T-DASH-016-sse-filter-sort.png'),
      fullPage: false,
    });

    await page.getByTestId('settings-open').click();
    await page.getByLabel('Preferred terminal').selectOption('kitty');
    await page.getByTestId('settings-save').click();
    await expect(page.getByRole('dialog', { name: 'Settings' })).toHaveCount(0);
    expect(JSON.parse(fs.readFileSync(mutable.settingsPath, 'utf-8'))).toMatchObject({ terminal: { preferred: 'kitty' } });

    reconcileDashboardSessions(mutable.dbPath, { livePids: [], attachedTmuxNames: [], existingTmuxNames: [] });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByLabel('Status').selectOption('crash-recoverable');
    await expect(page.getByTestId('session-tile-e2e-reboot-detached')).toBeVisible();
    await expect(page.getByTestId('jump-e2e-reboot-detached')).toHaveText('↗ Jump');
    await page.getByTestId('jump-e2e-reboot-detached').click();
    await expect.poll(() => mutable.launches).toEqual([
      expect.objectContaining({
        terminal: 'kitty',
        command: ['tmux', 'attach', '-t', 'missing-tmux-session'],
        cwd: '/repo/reboot',
      }),
    ]);
    await page.getByTestId('session-tile-e2e-reboot-detached').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(screenshotDir, 'T-DASH-016-reboot-recoverable.png'),
      fullPage: false,
    });
  } finally {
    await mutable.close();
  }
});

test('two local federation daemons restore a remote dashboard session with HMAC', async () => {
  const federated = await startTwoDaemonFederationFixture();
  try {
    const { signDaemonRequest } = require('../../dist/daemonAuth');
    const body = JSON.stringify({ sessionId: 'remote-restore', terminal: 'kitty' });
    const tamperedBody = JSON.stringify({ sessionId: 'remote-restore', terminal: 'ghostty' });
    const unsigned = await jsonRequest(federated.remote.port, 'POST', '/fed/dashboard/restore', body, { 'Content-Type': 'application/json' });
    const wrongSecret = await jsonRequest(federated.remote.port, 'POST', '/fed/dashboard/restore', body, {
      ...signDaemonRequest('wrong-secret', 'POST', '/fed/dashboard/restore', body, Date.now()),
      'Content-Type': 'application/json',
    });
    const wrongPath = await jsonRequest(federated.remote.port, 'POST', '/fed/dashboard/restore', body, {
      ...signDaemonRequest(federated.secret, 'POST', '/fed/dashboard/state', body, Date.now()),
      'Content-Type': 'application/json',
    });
    const tampered = await jsonRequest(federated.remote.port, 'POST', '/fed/dashboard/restore', tamperedBody, {
      ...signDaemonRequest(federated.secret, 'POST', '/fed/dashboard/restore', body, Date.now()),
      'Content-Type': 'application/json',
    });
    const stale = await jsonRequest(federated.remote.port, 'POST', '/fed/dashboard/restore', body, {
      ...signDaemonRequest(federated.secret, 'POST', '/fed/dashboard/restore', body, Date.now() - 600_000),
      'Content-Type': 'application/json',
    });
    const localState = await jsonRequest(federated.local.port, 'GET', '/dashboard/federation', '', { Origin: `http://127.0.0.1:${federated.local.port}` });

    expect(unsigned.status).toBe(401);
    expect(wrongSecret.status).toBe(401);
    expect(wrongPath.status).toBe(401);
    expect(tampered.status).toBe(401);
    expect(stale.status).toBe(401);
    expect(federated.remoteLaunches).toHaveLength(0);
    const signed = await jsonRequest(federated.remote.port, 'POST', '/fed/dashboard/restore', body, {
      ...signDaemonRequest(federated.secret, 'POST', '/fed/dashboard/restore', body, Date.now()),
      'Content-Type': 'application/json',
    });
    expect(signed.status).toBe(200);
    expect(signed.body).toMatchObject({ ok: true, session: { id: 'remote-restore', workspace: 'codex-remote' } });
    expect(federated.remoteLaunches[0]).toMatchObject({
      terminal: 'kitty',
      command: ['tmux', 'attach', '-t', 'remote-tmux'],
      cwd: '/repo/remote',
    });
    expect(localState.status).toBe(200);
    expect(localState.body.peers[0]).toMatchObject({
      hostname: expect.any(String),
      url: `http://127.0.0.1:${federated.remote.port}`,
      status: 'online',
      sessionCount: 1,
      capabilities: expect.arrayContaining(['dashboard-v1']),
    });
  } finally {
    await federated.close();
  }
});

async function startMutableDashboardFixture() {
  const { createDashboardRequestHandler } = require('../../dist/dashboardServer');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-dashboard-mutable-e2e-'));
  const dbPath = path.join(tmp, '.sweech', 'sessions.db');
  const settingsPath = path.join(tmp, '.sweech', 'dashboard-settings.json');
  const launches = [];
  const handler = createDashboardRequestHandler({
    assetsDir: path.join(process.cwd(), 'dist/dashboard'),
    catchAllAssets: true,
    sessionsDbPath: dbPath,
    settingsPath,
    sessionPollMs: 150,
    heartbeatMs: 500,
    terminalLauncher: async (options) => {
      launches.push(options);
      return { ok: true, command: 'mock-terminal', args: [...options.command] };
    },
  });
  const server = http.createServer((req, res) => {
    void handler(req, res).then((handled) => {
      if (!handled) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });
  });
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('mutable fixture server did not expose a port');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    dbPath,
    settingsPath,
    launches,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await closeServer(server);
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

async function startTwoDaemonFederationFixture() {
  const { createSweechFedServer, DashboardPeerCache, startDashboardPeerPolling } = require('../../dist/fedServer');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-dashboard-fed-e2e-'));
  const secret = 'playwright-dashboard-fed-secret';
  const secretPath = path.join(tmp, 'daemon.secret');
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  const localDbPath = path.join(tmp, 'local', 'sessions.db');
  const remoteDbPath = path.join(tmp, 'remote', 'sessions.db');
  insertDashboardSession(remoteDbPath, {
    id: 'remote-restore',
    workspace: 'codex-remote',
    cwd: '/repo/remote',
    machine: 'remote-mini',
    tmuxName: 'remote-tmux',
    pid: 111,
    launchedAt: Date.now() - 20_000,
    lastActiveAt: Date.now() - 10_000,
    status: 'live',
    messageCount: 5,
  });
  const peerCache = new DashboardPeerCache();
  const remoteLaunches = [];
  const localServer = createSweechFedServer(0, {
    daemonSecretPath: secretPath,
    sessionsDbPath: localDbPath,
    dashboardPeerCache: peerCache,
  });
  const remoteServer = createSweechFedServer(0, {
    daemonSecretPath: secretPath,
    sessionsDbPath: remoteDbPath,
    terminalLauncher: async (options) => {
      remoteLaunches.push(options);
      return { ok: true, command: 'mock-remote-terminal', args: [...options.command] };
    },
  });
  const local = await listenServer(localServer);
  const remote = await listenServer(remoteServer);
  const stopPeerPolling = startDashboardPeerPolling({
    cache: peerCache,
    secretPath,
    intervalMs: 25,
    isDashboardOpen: () => true,
    peersProvider: () => [{ name: 'remote-mini', host: '127.0.0.1', port: remote.port, secret }],
  });
  await waitForCondition(
    () => peerCache.list().some((peer) => peer.status === 'online' && peer.sessionCount === 1),
    20_000,
    () => JSON.stringify(peerCache.list()),
  );
  return {
    secret,
    local,
    remote,
    remoteLaunches,
    close: async () => {
      stopPeerPolling();
      await Promise.all([closeServer(localServer), closeServer(remoteServer)]);
      fs.rmSync(tmp, { recursive: true, force: true });
    },
  };
}

function insertDashboardSession(dbPath, session) {
  const { SessionsDb } = require('../../dist/sessionsDb');
  const db = new SessionsDb(dbPath);
  db.upsert({
    cwdBasename: path.basename(session.cwd || '/repo/project'),
    machine: os.hostname(),
    launchedAt: Date.now(),
    lastActiveAt: Date.now(),
    status: 'live',
    ...session,
  });
  db.close();
}

function reconcileDashboardSessions(dbPath, input) {
  const { SessionsDb } = require('../../dist/sessionsDb');
  const db = new SessionsDb(dbPath);
  const result = db.reconcileOnDaemonStartup(input);
  db.close();
  return result;
}

function waitForDashboardSessionEvent(page, sessionId) {
  return page.evaluate((id) => new Promise((resolve, reject) => {
    const source = new EventSource('/dashboard/events');
    const timer = window.setTimeout(() => {
      source.close();
      reject(new Error(`Timed out waiting for dashboard SSE session.changed for ${id}`));
    }, 5000);
    source.addEventListener('open', () => {
      window.__sweechE2eSseOpen = true;
    });
    source.addEventListener('session.changed', (event) => {
      try {
        const payload = JSON.parse(event.data);
        const session = payload.session ?? payload.data?.session;
        if (session?.id !== id) return;
        window.clearTimeout(timer);
        source.close();
        resolve(true);
      } catch (error) {
        window.clearTimeout(timer);
        source.close();
        reject(error);
      }
    });
    source.addEventListener('error', () => {
      window.__sweechE2eSseOpen = false;
    });
  }), sessionId);
}

function visibleSessionTileIds(page) {
  return page.locator('.session-tile').evaluateAll((tiles) => tiles
    .filter((tile) => {
      const style = window.getComputedStyle(tile);
      return style.display !== 'none' && style.visibility !== 'hidden' && tile.getBoundingClientRect().height > 0;
    })
    .map((tile) => tile.getAttribute('data-testid')));
}

async function waitForCondition(predicate, timeoutMs = 5000, debug = () => '') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for dashboard E2E condition ${debug()}`);
}

async function listenServer(server) {
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not expose a port');
  return { server, port: address.port };
}

function closeServer(server) {
  server.closeAllConnections?.();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out closing dashboard E2E server')), 1000);
    server.close(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function jsonRequest(port, method, requestPath, body = '', headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: requestPath, method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode || 0, body: JSON.parse(data || '{}') });
        } catch {
          resolve({ status: res.statusCode || 0, body: data });
        }
      });
    });
    req.setTimeout(5000, () => {
      req.destroy(new Error(`${method} ${requestPath} on port ${port} timed out`));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
