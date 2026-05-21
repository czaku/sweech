import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

describe('dashboard state integration', () => {
  let tmp: string;

  beforeEach(() => {
    jest.resetModules();
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
    fs.writeFileSync(path.join(tmp, '.sweech', 'launches.log'), `${JSON.stringify({
      ts: '2026-05-21T09:30:00.000Z',
      profile: 'claude-main',
    })}\n`);
    const actualOs = jest.requireActual<typeof import('node:os')>('node:os');
    const mockOs = { ...actualOs, homedir: () => tmp, hostname: () => 'test-machine' };
    jest.doMock('os', () => mockOs);
    jest.doMock('node:os', () => mockOs);
  });

  afterEach(() => {
    jest.dontMock('os');
    jest.dontMock('node:os');
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
      profileDirExists: false,
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
  });
});
