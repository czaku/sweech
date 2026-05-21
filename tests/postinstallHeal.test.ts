/**
 * Tests for T-078 postinstall heal — runPostinstallHeal() must:
 *   - Skip on same-version re-run (idempotent under npm rebuild)
 *   - Stamp config.json lastResyncedSweechVersion after success
 *   - Re-link drifted sharedWith profiles
 *   - Log every state transition to lifecycle.jsonl
 */

import * as fs from 'fs';
import * as path from 'path';

// Inquirer ships as ESM in node_modules — mock it out so the
// utilityCommands import chain doesn't blow up under jest.
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
import { runPostinstallHeal } from '../src/utilityCommands';

function isolateHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-postinstall-test-'));
  setHomedir(home);
  process.env.SWEECH_HOME = home;
  if (!os.homedir().startsWith(os.tmpdir()) || !os.homedir().includes('sweech-postinstall-test-')) {
    throw new Error(`isolateHome safety check failed: ${os.homedir()}`);
  }
  return home;
}

afterEach(() => {
  setHomedir(null);
  delete process.env.SWEECH_HOME;
});

function readSweechVersion(): string {
  const pkgPath = path.join(__dirname, '..', 'package.json');
  return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).version;
}

describe('runPostinstallHeal', () => {
  test('skips fresh installs with no config.json', async () => {
    const home = isolateHome();
    fs.mkdirSync(path.join(home, '.sweech'), { recursive: true });
    expect(fs.existsSync(path.join(home, '.sweech', 'config.json'))).toBe(false);

    const result = await runPostinstallHeal();

    expect(result).toMatchObject({
      skipped: true,
      reason: 'missing-config',
      totalRepaired: 0,
      profilesScanned: 0,
    });
    expect(fs.existsSync(path.join(home, '.sweech', 'config.json'))).toBe(false);
  });

  test('stamps config.json lastResyncedSweechVersion with current version after first run', async () => {
    isolateHome();
    const cfg = new ConfigManager();
    cfg.writeProfiles([]);

    const result = await runPostinstallHeal();

    expect(result.skipped).toBe(false);
    const configJson = JSON.parse(fs.readFileSync(cfg.getConfigFile(), 'utf-8'));
    expect(configJson.lastResyncedSweechVersion).toBe(readSweechVersion());
  });

  test('runs upgrade migrations silently without opening the dashboard', async () => {
    isolateHome();
    const cfg = new ConfigManager();
    cfg.writeProfiles([{
      name: 'claude-main',
      commandName: 'claude-main',
      cliType: 'claude',
      provider: 'anthropic',
      createdAt: '2026-05-21T00:00:00Z',
    } as any]);

    const result = await runPostinstallHeal();

    expect(result.skipped).toBe(false);
    expect(fs.existsSync(path.join(cfg.getBinDir(), 'claude-main'))).toBe(true);
    expect(fs.existsSync(path.join(cfg.getConfigDir(), 'sessions.db'))).toBe(true);
    expect(fs.existsSync(path.join(cfg.getConfigDir(), 'upgrade-state.json'))).toBe(false);
  });

  test('skips silently on same-version re-run', async () => {
    isolateHome();
    const cfg = new ConfigManager();
    cfg.writeProfiles([]);
    const configPath = cfg.getConfigFile();

    // Pre-stamp marker with current version.
    const configJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    fs.writeFileSync(configPath, JSON.stringify({
      ...configJson,
      lastResyncedSweechVersion: readSweechVersion(),
    }, null, 2));

    const result = await runPostinstallHeal();

    // Lifecycle log must contain a 'skipped' entry rather than a 'completed' one.
    const logFile = path.join(cfg.getLogsDir(), 'lifecycle.jsonl');
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    expect(result).toMatchObject({ skipped: true, reason: 'same-version' });
    expect(lines.some(l => l.event === 'postinstall.skipped_same_version')).toBe(true);
    expect(lines.some(l => l.event === 'postinstall.completed')).toBe(false);
  });

  test('re-links a drifted sharedWith profile during upgrade', async () => {
    const home = isolateHome();
    const cfg = new ConfigManager();

    // Master profile with sharable dirs.
    const masterDir = path.join(home, '.claude');
    fs.mkdirSync(path.join(masterDir, 'projects'), { recursive: true });
    fs.mkdirSync(path.join(masterDir, 'sessions'), { recursive: true });

    // Sibling registered as sharedWith claude but with NO links on disk
    // (simulating "user upgraded sweech which added a new shareable
    // entry not present on the older profile").
    const siblingDir = path.join(home, '.test-drifted');
    fs.mkdirSync(siblingDir);
    cfg.writeProfiles([{
      name: 'test-drifted',
      commandName: 'test-drifted',
      cliType: 'claude',
      provider: 'anthropic',
      createdAt: '2026-05-17T00:00:00Z',
      sharedWith: 'claude',
    } as any]);

    const configPath = cfg.getConfigFile();
    const configJson = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const profiles = Array.isArray(configJson) ? configJson : configJson.profiles;
    fs.writeFileSync(configPath, JSON.stringify({
      ...(Array.isArray(configJson) ? {} : configJson),
      profiles,
      lastResyncedSweechVersion: '0.0.0-old',
    }, null, 2));

    const result = await runPostinstallHeal();

    expect(result.skipped).toBe(false);
    expect(fs.lstatSync(path.join(siblingDir, 'projects')).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(siblingDir, 'sessions')).isSymbolicLink()).toBe(true);
  });

  test('package postinstall ships the shared script entrypoint', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
    expect(pkg.scripts.postinstall).toBe('node scripts/postinstall.js || true');
    expect(pkg.files).toContain('scripts/postinstall.js');
    expect(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'postinstall.js'), 'utf-8'))
      .toContain('sweech: resynced');
  });
});
