/**
 * Tests for T-078 postinstall heal — runPostinstallHeal() must:
 *   - Skip on same-version re-run (idempotent under npm rebuild)
 *   - Stamp last-postinstall.json after success
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
  test('stamps last-postinstall.json with current version after first run', async () => {
    isolateHome();
    const cfg = new ConfigManager();
    const markerPath = path.join(cfg.getConfigDir(), 'last-postinstall.json');
    expect(fs.existsSync(markerPath)).toBe(false);

    await runPostinstallHeal();

    expect(fs.existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf-8'));
    expect(marker.version).toBe(readSweechVersion());
    expect(typeof marker.ranAt).toBe('string');
  });

  test('skips silently on same-version re-run', async () => {
    isolateHome();
    const cfg = new ConfigManager();
    const markerPath = path.join(cfg.getConfigDir(), 'last-postinstall.json');

    // Pre-stamp marker with current version.
    fs.writeFileSync(markerPath, JSON.stringify({
      version: readSweechVersion(),
      ranAt: '2026-05-17T00:00:00Z',
    }));

    await runPostinstallHeal();

    // Lifecycle log must contain a 'skipped' entry rather than a 'completed' one.
    const logFile = path.join(cfg.getLogsDir(), 'lifecycle.jsonl');
    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
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

    // Stamp marker with a DIFFERENT version so the heal runs.
    fs.writeFileSync(
      path.join(cfg.getConfigDir(), 'last-postinstall.json'),
      JSON.stringify({ version: '0.0.0-old', ranAt: '2026-01-01T00:00:00Z' }),
    );

    await runPostinstallHeal();

    expect(fs.lstatSync(path.join(siblingDir, 'projects')).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(path.join(siblingDir, 'sessions')).isSymbolicLink()).toBe(true);
  });
});
