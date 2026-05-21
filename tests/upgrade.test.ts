import * as fs from 'fs';
import * as path from 'path';

jest.mock('inquirer', () => ({ default: { prompt: jest.fn() }, prompt: jest.fn() }));

var __mockHome: string | null = null;
jest.mock('os', () => {
  const actual = jest.requireActual('node:os');
  return { ...actual, homedir: () => __mockHome ?? actual.homedir() };
});
jest.mock('node:os', () => {
  const actual = jest.requireActual('node:os');
  return { ...actual, homedir: () => __mockHome ?? actual.homedir() };
});
import * as os from 'os';
function setHomedir(p: string | null): void { __mockHome = p; }

import { ConfigManager } from '../src/config';
import { runUpgrade } from '../src/upgrade';

function isolateHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-upgrade-test-'));
  setHomedir(home);
  process.env.SWEECH_HOME = home;
  if (!os.homedir().startsWith(os.tmpdir()) || !os.homedir().includes('sweech-upgrade-test-')) {
    throw new Error(`isolateHome safety check failed: ${os.homedir()}`);
  }
  return home;
}

function writeCodexMisconfig(profileDir: string): void {
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, 'settings.json'), JSON.stringify({ env: {} }));
  fs.writeFileSync(path.join(profileDir, 'history.jsonl'), '{}\n');
  fs.writeFileSync(path.join(profileDir, 'config.toml'), [
    'model = "kimi-k2"',
    'model_provider = "moonshot"',
    '',
    '[model_providers.moonshot]',
    'name = "moonshot"',
    'base_url = "https://api.moonshot.ai/v1"',
    '',
  ].join('\n'));
}

afterEach(() => {
  setHomedir(null);
  delete process.env.SWEECH_HOME;
});

describe('runUpgrade', () => {
  test('dry-run reports every migration without mutating wrappers, share links, sessions DB, providers, or dashboard marker', async () => {
    const home = isolateHome();
    const cfg = new ConfigManager();
    const masterDir = path.join(home, '.claude');
    const sharedDir = path.join(home, '.claude-shared');
    const codexDir = path.join(home, '.codex-kimi');
    fs.mkdirSync(path.join(masterDir, 'projects'), { recursive: true });
    fs.mkdirSync(path.join(masterDir, 'sessions'), { recursive: true });
    fs.mkdirSync(sharedDir, { recursive: true });
    writeCodexMisconfig(codexDir);
    cfg.writeProfiles([
      {
        name: 'claude-shared',
        commandName: 'claude-shared',
        cliType: 'claude',
        provider: 'anthropic',
        sharedWith: 'claude',
        createdAt: '2026-05-21T00:00:00Z',
      },
      {
        name: 'codex-kimi',
        commandName: 'codex-kimi',
        cliType: 'codex',
        provider: 'openai',
        createdAt: '2026-05-21T00:00:00Z',
      },
    ] as any);
    const opened: string[] = [];

    const result = await runUpgrade({ dryRun: true, opener: url => opened.push(url) });

    expect(result.dryRun).toBe(true);
    expect(result.wrappers.updated).toEqual(['claude-shared', 'codex-kimi']);
    expect(fs.existsSync(path.join(cfg.getBinDir(), 'claude-shared'))).toBe(false);
    expect(result.shareSweep.planned.map(item => item.profile)).toContain('claude-shared');
    expect(fs.existsSync(path.join(sharedDir, 'projects'))).toBe(false);
    expect(result.sessionsDb.path).toBe(path.join(home, '.sweech', 'sessions.db'));
    expect(fs.existsSync(result.sessionsDb.path)).toBe(false);
    expect(result.providers.planned).toEqual([{ profile: 'codex-kimi', from: 'openai', to: 'kimi' }]);
    expect(cfg.getProfiles().find(p => p.commandName === 'codex-kimi')?.provider).toBe('openai');
    expect(result.dashboard).toMatchObject({ opened: false, skippedReason: 'dry-run' });
    expect(opened).toHaveLength(0);
    expect(fs.existsSync(path.join(cfg.getConfigDir(), 'upgrade-state.json'))).toBe(false);
    expect(result.totals.planned).toBeGreaterThanOrEqual(4);
  });

  test('real run regenerates wrappers, heals shared links, initializes sessions.db, fixes providers, and opens dashboard once', async () => {
    const home = isolateHome();
    const cfg = new ConfigManager();
    const masterDir = path.join(home, '.claude');
    const sharedDir = path.join(home, '.claude-shared');
    const codexDir = path.join(home, '.codex-kimi');
    fs.mkdirSync(path.join(masterDir, 'projects'), { recursive: true });
    fs.mkdirSync(path.join(masterDir, 'sessions'), { recursive: true });
    fs.mkdirSync(sharedDir, { recursive: true });
    writeCodexMisconfig(codexDir);
    cfg.writeProfiles([
      {
        name: 'claude-shared',
        commandName: 'claude-shared',
        cliType: 'claude',
        provider: 'anthropic',
        sharedWith: 'claude',
        createdAt: '2026-05-21T00:00:00Z',
      },
      {
        name: 'codex-kimi',
        commandName: 'codex-kimi',
        cliType: 'codex',
        provider: 'openai',
        createdAt: '2026-05-21T00:00:00Z',
      },
    ] as any);
    const opened: string[] = [];

    const first = await runUpgrade({ opener: url => opened.push(url) });

    expect(fs.existsSync(path.join(cfg.getBinDir(), 'claude-shared'))).toBe(true);
    expect(fs.lstatSync(path.join(sharedDir, 'projects')).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(sharedDir, 'sessions')).isSymbolicLink()).toBe(true);
    expect(fs.existsSync(path.join(home, '.sweech', 'sessions.db'))).toBe(true);
    expect(first.sessionsDb.initialized).toBe(true);
    expect(first.providers.fixed).toEqual([{ profile: 'codex-kimi', from: 'openai', to: 'kimi' }]);
    expect(new ConfigManager().getProfiles().find(p => p.commandName === 'codex-kimi')?.provider).toBe('kimi');
    expect(opened).toEqual(['http://127.0.0.1:7854/']);
    expect(JSON.parse(fs.readFileSync(path.join(cfg.getConfigDir(), 'upgrade-state.json'), 'utf-8')).dashboardOpenedAt).toEqual(expect.any(String));

    const second = await runUpgrade({ opener: url => opened.push(url) });

    expect(second.dashboard).toMatchObject({ opened: false, skippedReason: 'already-opened' });
    expect(second.providers.fixed).toHaveLength(0);
    expect(second.sessionsDb.initialized).toBe(false);
    expect(opened).toHaveLength(1);
  });

  test('skips wrapper regeneration for unsupported cliType entries without aborting other migrations', async () => {
    isolateHome();
    const cfg = new ConfigManager();
    cfg.writeProfiles([
      {
        name: 'bad-cli',
        commandName: 'bad-cli',
        cliType: 'bogus',
        provider: 'custom',
        createdAt: '2026-05-21T00:00:00Z',
      },
    ] as any);

    const result = await runUpgrade({ openDashboard: false });

    expect(result.wrappers.scanned).toBe(1);
    expect(result.wrappers.updated).toEqual([]);
    expect(result.wrappers.skipped).toEqual([{ profile: 'bad-cli', reason: 'unsupported cliType: bogus' }]);
    expect(result.dashboard).toMatchObject({ opened: false, skippedReason: 'disabled' });
    expect(fs.existsSync(path.join(cfg.getBinDir(), 'bad-cli'))).toBe(false);
  });
});
