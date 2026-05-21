const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let fixture;

test.beforeAll(async () => {
  process.env.PROJECT_SCREENSHOT_DIR = process.env.PROJECT_SCREENSHOT_DIR || path.join(os.homedir(), 'Desktop', 'screenshots', 'sweech');
  fs.mkdirSync(process.env.PROJECT_SCREENSHOT_DIR, { recursive: true });
  fixture = await startDashboardPanelsFixture();
});

test.afterAll(async () => {
  if (fixture) await fixture.close();
});

test('workspaces accounts and cost panels render real dashboard state', async ({ page }) => {
  const screenshotDir = process.env.PROJECT_SCREENSHOT_DIR;
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('workspace-card-claude-main')).toBeVisible();
  await expect(page.getByTestId('workspace-status-claude-main')).toHaveText('Active');
  await expect(page.getByText('claude-shared')).toBeVisible();
  await expect(page.getByTestId('account-card-claude-pro')).toBeVisible();
  await expect(page.getByTestId('token-status-claude-pro')).toHaveText('Token ok');
  await expect(page.getByTestId('usage-bar-claude-pro-5h')).toContainText('42 5h');
  await expect(page.getByTestId('usage-bar-claude-pro-7d')).toContainText('320 7d');
  await expect(page.getByTestId('cost-sparkline-provider-mix')).toBeVisible();
  await expect(page.getByTestId('cost-provider-anthropic')).toContainText('$2.00');
  await page.getByTestId('workspace-card-claude-main').click();
  await expect(page.getByRole('dialog', { name: 'Edit claude-main' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Model', exact: true })).toHaveValue('claude-sonnet-4-5');
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
  await page.screenshot({
    path: path.join(screenshotDir, 'T-DASH-011-workspace-edit-dialog.png'),
    fullPage: false,
  });
  await page.getByLabel('Close workspace editor').click();

  const layout = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const overflow = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.right > viewportWidth + 1 || rect.left < -1;
    });
    return {
      workspaceCards: document.querySelectorAll('.workspace-card').length,
      accountCards: document.querySelectorAll('.account-card').length,
      costBars: document.querySelectorAll('.cost-sparkline span').length,
      overflowCount: overflow.length,
    };
  });
  expect(layout).toEqual({ workspaceCards: 2, accountCards: 2, costBars: 7, overflowCount: 0 });

  await page.getByTestId('workspace-card-claude-main').scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(screenshotDir, 'T-DASH-011-workspaces-accounts-cost-desktop.png'),
    fullPage: false,
  });
});

test('dashboard data panels remain usable on mobile width', async ({ page }) => {
  const screenshotDir = process.env.PROJECT_SCREENSHOT_DIR;
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('workspace-card-claude-main').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('workspace-card-claude-main')).toBeVisible();
  await expect(page.getByTestId('account-card-claude-pro')).toBeVisible();
  await expect(page.getByTestId('cost-sparkline-provider-mix')).toBeVisible();

  const overflowCount = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return Array.from(document.querySelectorAll('body *')).filter((el) => {
      const rect = el.getBoundingClientRect();
      return rect.right > viewportWidth + 1 || rect.left < -1;
    }).length;
  });
  expect(overflowCount).toBe(0);

  await page.screenshot({
    path: path.join(screenshotDir, 'T-DASH-011-workspaces-accounts-cost-mobile.png'),
    fullPage: false,
  });
});

async function startDashboardPanelsFixture() {
  const { createDashboardRequestHandler } = require('../../dist/dashboardServer');
  const handler = createDashboardRequestHandler({
    assetsDir: path.join(process.cwd(), 'dist/dashboard'),
    catchAllAssets: true,
    stateProvider: async () => dashboardStateFixture(),
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
    },
  };
}

function dashboardStateFixture() {
  const now = Date.UTC(2026, 4, 21, 12);
  return {
    generatedAt: new Date(now).toISOString(),
    machine: os.hostname(),
    sessions: [],
    workspaces: [
      {
        name: 'Claude Main',
        commandName: 'claude-main',
        cliType: 'claude',
        provider: 'anthropic',
        disabled: false,
        hidden: false,
        sharedWith: 'claude-shared',
        lastUsed: '2026-05-21T09:00:00.000Z',
        profileDirExists: true,
        model: 'claude-sonnet-4-5',
      },
      {
        name: 'Codex Pole',
        commandName: 'codex-pole',
        cliType: 'codex',
        provider: 'openai',
        disabled: true,
        hidden: false,
        sharedWith: null,
        lastUsed: null,
        profileDirExists: true,
        model: 'gpt-5',
      },
    ],
    accounts: [
      {
        name: 'Claude Pro',
        commandName: 'claude-pro',
        cliType: 'claude',
        provider: 'anthropic',
        plan: 'Max 20x',
        tokenStatus: 'valid',
        messages5h: 42,
        messages7d: 320,
        lastActive: '2026-05-21T11:50:00.000Z',
        freshnessAt: now,
        utilization5h: 0.42,
        utilization7d: 0.64,
        resetLabel: '18h',
      },
      {
        name: 'Codex Team',
        commandName: 'codex-team',
        cliType: 'codex',
        provider: 'openai',
        plan: 'Team',
        tokenStatus: 'managed',
        messages5h: 8,
        messages7d: 77,
        lastActive: '2026-05-21T10:00:00.000Z',
        freshnessAt: now - 45 * 60_000,
        utilization5h: 0.18,
        utilization7d: 0.22,
        resetLabel: '4h',
      },
    ],
    cost: {
      generatedAt: new Date(now).toISOString(),
      spent7dUsd: 2.5,
      estCostPerCallUsd: 0.05,
      sparkline: [4, 8, 13, 18, 22, 28, 32],
      providers: [
        { provider: 'anthropic', spent7dUsd: 2, estCostPerCallUsd: 0.04, profiles: 2 },
        { provider: 'openai', spent7dUsd: 0.5, estCostPerCallUsd: 0.01, profiles: 1 },
      ],
    },
  };
}
