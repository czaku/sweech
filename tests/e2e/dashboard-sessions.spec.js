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
  await new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('fixture server did not expose a port');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
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
