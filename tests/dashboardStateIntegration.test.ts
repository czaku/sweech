import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('dashboard state integration', () => {
  let tmp: string;
  let originalCwd: string;

  beforeEach(() => {
    jest.resetModules();
    originalCwd = process.cwd();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-dashboard-state-'));
    fs.mkdirSync(path.join(tmp, '.sweech'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.sweech', 'config.json'), JSON.stringify({
      profiles: [{
        name: 'Claude Main',
        commandName: 'claude-main',
        cliType: 'claude',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        createdAt: '2026-05-21T00:00:00.000Z',
        sharedWith: 'claude-shared',
      }],
    }, null, 2));
    fs.mkdirSync(path.join(tmp, '.claude-main'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.claude-main', 'settings.json'), JSON.stringify({ env: {} }, null, 2));
    fs.writeFileSync(path.join(tmp, '.sweech', 'launches.log'), `${JSON.stringify({
      ts: '2026-05-21T09:30:00.000Z',
      profile: 'claude-main',
    })}\n`);
    fs.writeFileSync(path.join(tmp, '.sweech', 'failover-cooldowns.json'), JSON.stringify({
      'claude-main': {
        commandName: 'claude-main',
        reason: 'limit_reached',
        recordedAt: Date.now() - 60_000,
        expiresAt: Date.now() + 60_000,
      },
    }, null, 2));
    fs.writeFileSync(path.join(tmp, '.sweech', 'billing.json'), JSON.stringify({
      schemaVersion: 'sweech.billing.v1',
      entries: {
        'anthropic:luke@example.com': {
          vendor: 'anthropic',
          email: 'luke@example.com',
          billingDay: 21,
          updatedAt: '2026-05-21T00:00:00.000Z',
        },
      },
    }, null, 2));
    fs.writeFileSync(path.join(tmp, '.sweech.json'), JSON.stringify({ profile: 'claude-main', cliType: 'claude' }, null, 2));
    process.chdir(tmp);
    const actualOs = jest.requireActual<typeof import('node:os')>('node:os');
    const mockOs = { ...actualOs, homedir: () => tmp, hostname: () => 'test-machine' };
    jest.doMock('os', () => mockOs);
    jest.doMock('node:os', () => mockOs);
  });

  afterEach(() => {
    jest.dontMock('os');
    jest.dontMock('node:os');
    process.chdir(originalCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('collectDashboardState wires real config collectors into dashboard payload', async () => {
    const { collectDashboardState } = await import('../src/dashboardServer');
    const state = await collectDashboardState(path.join(tmp, '.sweech', 'sessions.db'));

    expect(state.machine).toBe('test-machine');
    expect(state.workspaces[0]).toMatchObject({
      commandName: 'claude-main',
      name: 'Claude Main',
      sharedWith: 'claude-shared',
      profileDirExists: true,
    });
    expect(state.workspaces[0]).not.toHaveProperty('profileDir');
    expect(state.accounts.find((account) => account.commandName === 'claude-main')).toMatchObject({
      commandName: 'claude-main',
      messages5h: 0,
      messages7d: 0,
    });
    expect(state.cost).toMatchObject({
      spent7dUsd: expect.any(Number),
      estCostPerCallUsd: expect.any(Number),
      providers: expect.any(Array),
      sparkline: expect.any(Array),
    });
    expect(state.cost).not.toHaveProperty('rows');
    expect(state.audit.scanned).toBe(1);
    expect(state.failover.cooldowns[0]).toMatchObject({ commandName: 'claude-main', reason: 'limit_reached' });
    expect(state.routing.pin).toMatchObject({ profile: 'claude-main', cliType: 'claude' });
    expect(state.routing.searchRoot).toBe(process.cwd());
    expect(state.routing.pins[0]).toMatchObject({ workspace: path.basename(process.cwd()), cwd: process.cwd(), pinned: true, profile: 'claude-main' });
    expect(state.billing.entries[0]).toMatchObject({ vendor: 'anthropic', email: 'lu***@example.com', billingDay: 21 });
    expect(state.billing.days).toHaveLength(30);
  });
});
