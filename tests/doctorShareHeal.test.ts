import * as cp from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
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

import { ConfigManager } from '../src/config';
import { runHeal } from '../src/utilityCommands';

const CLI_PATH = path.join(__dirname, '..', 'dist', 'cli.js');
const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_SWEECH_HOME = process.env.SWEECH_HOME;

function setHomedir(p: string | null): void { __mockHome = p; }

function isolateHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-doctor-heal-test-'));
  setHomedir(home);
  process.env.HOME = home;
  process.env.SWEECH_HOME = home;
  return home;
}

function writeSharedProfile(cfg: ConfigManager, commandName = 'claude-test'): void {
  cfg.writeProfiles([{
    name: commandName,
    commandName,
    cliType: 'claude',
    provider: 'anthropic',
    createdAt: '2026-05-20T00:00:00Z',
    sharedWith: 'claude',
  }]);
}

async function runHealSilently(): Promise<void> {
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    await runHeal();
  } finally {
    logSpy.mockRestore();
  }
}

afterEach(() => {
  setHomedir(null);
  if (ORIGINAL_HOME === undefined) delete process.env.HOME;
  else process.env.HOME = ORIGINAL_HOME;
  if (ORIGINAL_SWEECH_HOME === undefined) delete process.env.SWEECH_HOME;
  else process.env.SWEECH_HOME = ORIGINAL_SWEECH_HOME;
});

describe('doctor shared symlink repair', () => {
  beforeAll(() => {
    expect(fs.existsSync(CLI_PATH)).toBe(true);
  });

  test('runHeal restores a deleted commands symlink for shared profiles', async () => {
    const home = isolateHome();
    const cfg = new ConfigManager();
    writeSharedProfile(cfg);

    const masterCommands = path.join(home, '.claude', 'commands');
    const profileCommands = path.join(home, '.claude-test', 'commands');
    fs.mkdirSync(masterCommands, { recursive: true });
    fs.mkdirSync(path.dirname(profileCommands), { recursive: true });

    expect(fs.existsSync(profileCommands)).toBe(false);

    await runHealSilently();

    expect(fs.lstatSync(profileCommands).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(profileCommands)).toBe(masterCommands);
  });

  test('runHeal is idempotent after repair', async () => {
    const home = isolateHome();
    const cfg = new ConfigManager();
    writeSharedProfile(cfg);

    const masterCommands = path.join(home, '.claude', 'commands');
    const profileCommands = path.join(home, '.claude-test', 'commands');
    fs.mkdirSync(masterCommands, { recursive: true });
    fs.mkdirSync(path.dirname(profileCommands), { recursive: true });

    await runHealSilently();
    await runHealSilently();

    expect(fs.lstatSync(profileCommands).isSymbolicLink()).toBe(true);
    expect(fs.readlinkSync(profileCommands)).toBe(masterCommands);
  });

  test('runHeal preserves real data by merging before symlinking', async () => {
    const home = isolateHome();
    const cfg = new ConfigManager();
    writeSharedProfile(cfg);

    const masterCommands = path.join(home, '.claude', 'commands');
    const profileCommands = path.join(home, '.claude-test', 'commands');
    fs.mkdirSync(masterCommands, { recursive: true });
    fs.mkdirSync(profileCommands, { recursive: true });
    fs.writeFileSync(path.join(profileCommands, 'local.md'), 'local command');

    await runHealSilently();

    expect(fs.readFileSync(path.join(masterCommands, 'local.md'), 'utf-8')).toBe('local command');
    expect(fs.lstatSync(profileCommands).isSymbolicLink()).toBe(true);
  });

  test('dist CLI doctor reports explicit MISSING status for shared profile links', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-doctor-cli-test-'));
    try {
      fs.mkdirSync(path.join(home, '.sweech', 'bin'), { recursive: true });
      fs.mkdirSync(path.join(home, '.claude-test'), { recursive: true });
      fs.writeFileSync(path.join(home, '.claude-test', 'settings.json'), '{}');
      fs.writeFileSync(path.join(home, '.sweech', 'bin', 'claude-test'), '#!/bin/sh\n');
      fs.chmodSync(path.join(home, '.sweech', 'bin', 'claude-test'), 0o755);
      fs.writeFileSync(path.join(home, '.sweech', 'config.json'), JSON.stringify([{
        name: 'claude-test',
        commandName: 'claude-test',
        cliType: 'claude',
        provider: 'anthropic',
        createdAt: '2026-05-20T00:00:00Z',
        sharedWith: 'claude',
      }]));

      const result = cp.spawnSync('node', [CLI_PATH, 'doctor'], {
        env: { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' },
        encoding: 'utf-8',
      });

      expect(result.stdout).toContain('Shared symlinks');
      expect(result.stdout).toContain('MISSING commands');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('dist CLI doctor reports explicit DANGLING status for deleted master targets', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-doctor-dangling-cli-test-'));
    try {
      const expectedTarget = path.join(home, '.claude', 'commands');
      const profileCommands = path.join(home, '.claude-test', 'commands');
      fs.mkdirSync(path.dirname(expectedTarget), { recursive: true });
      fs.mkdirSync(path.dirname(profileCommands), { recursive: true });
      fs.mkdirSync(path.join(home, '.sweech', 'bin'), { recursive: true });
      fs.writeFileSync(path.join(home, '.claude-test', 'settings.json'), '{}');
      fs.writeFileSync(path.join(home, '.sweech', 'bin', 'claude-test'), '#!/bin/sh\n');
      fs.chmodSync(path.join(home, '.sweech', 'bin', 'claude-test'), 0o755);
      fs.symlinkSync(expectedTarget, profileCommands);
      fs.writeFileSync(path.join(home, '.sweech', 'config.json'), JSON.stringify([{
        name: 'claude-test',
        commandName: 'claude-test',
        cliType: 'claude',
        provider: 'anthropic',
        createdAt: '2026-05-20T00:00:00Z',
        sharedWith: 'claude',
      }]));

      const result = cp.spawnSync('node', [CLI_PATH, 'doctor'], {
        env: { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' },
        encoding: 'utf-8',
      });

      expect(result.stdout).toContain('DANGLING commands');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('dist CLI doctor --fix restores deleted commands symlink', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-doctor-fix-cli-test-'));
    try {
      const masterCommands = path.join(home, '.claude', 'commands');
      const profileCommands = path.join(home, '.claude-test', 'commands');
      fs.mkdirSync(masterCommands, { recursive: true });
      fs.mkdirSync(path.dirname(profileCommands), { recursive: true });
      fs.mkdirSync(path.join(home, '.sweech'), { recursive: true });
      fs.writeFileSync(path.join(home, '.sweech', 'config.json'), JSON.stringify([{
        name: 'claude-test',
        commandName: 'claude-test',
        cliType: 'claude',
        provider: 'anthropic',
        createdAt: '2026-05-20T00:00:00Z',
        sharedWith: 'claude',
      }]));

      const result = cp.spawnSync('node', [CLI_PATH, 'doctor', '--fix'], {
        env: { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' },
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(fs.lstatSync(profileCommands).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(profileCommands)).toBe(masterCommands);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('dist CLI doctor --fix repairs dangling directory target', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-doctor-fix-dangling-cli-test-'));
    try {
      const masterCommands = path.join(home, '.claude', 'commands');
      const profileCommands = path.join(home, '.claude-test', 'commands');
      fs.mkdirSync(path.dirname(masterCommands), { recursive: true });
      fs.mkdirSync(path.dirname(profileCommands), { recursive: true });
      fs.mkdirSync(path.join(home, '.sweech'), { recursive: true });
      fs.symlinkSync(masterCommands, profileCommands);
      fs.writeFileSync(path.join(home, '.sweech', 'config.json'), JSON.stringify([{
        name: 'claude-test',
        commandName: 'claude-test',
        cliType: 'claude',
        provider: 'anthropic',
        createdAt: '2026-05-20T00:00:00Z',
        sharedWith: 'claude',
      }]));

      const result = cp.spawnSync('node', [CLI_PATH, 'doctor', '--fix'], {
        env: { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' },
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(fs.existsSync(masterCommands)).toBe(true);
      expect(fs.lstatSync(profileCommands).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(profileCommands)).toBe(masterCommands);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('dist CLI doctor --fix repairs dangling shared file target', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-doctor-fix-dangling-file-cli-test-'));
    try {
      const masterFile = path.join(home, '.claude', 'mcp.json');
      const profileFile = path.join(home, '.claude-test', 'mcp.json');
      fs.mkdirSync(path.dirname(masterFile), { recursive: true });
      fs.mkdirSync(path.dirname(profileFile), { recursive: true });
      fs.mkdirSync(path.join(home, '.sweech'), { recursive: true });
      fs.symlinkSync(masterFile, profileFile);
      fs.writeFileSync(path.join(home, '.sweech', 'config.json'), JSON.stringify([{
        name: 'claude-test',
        commandName: 'claude-test',
        cliType: 'claude',
        provider: 'anthropic',
        createdAt: '2026-05-20T00:00:00Z',
        sharedWith: 'claude',
      }]));

      const result = cp.spawnSync('node', [CLI_PATH, 'doctor', '--fix'], {
        env: { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' },
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      expect(fs.existsSync(masterFile)).toBe(true);
      expect(fs.readFileSync(masterFile, 'utf-8')).toBe('');
      expect(fs.lstatSync(profileFile).isSymbolicLink()).toBe(true);
      expect(fs.readlinkSync(profileFile)).toBe(masterFile);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('dist CLI doctor --heal-dry-run --json previews steady-state missing links', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-doctor-dry-run-cli-test-'));
    try {
      const masterCommands = path.join(home, '.claude', 'commands');
      fs.mkdirSync(masterCommands, { recursive: true });
      fs.mkdirSync(path.join(home, '.claude-test'), { recursive: true });
      fs.mkdirSync(path.join(home, '.sweech'), { recursive: true });
      fs.writeFileSync(path.join(home, '.sweech', 'config.json'), JSON.stringify([{
        name: 'claude-test',
        commandName: 'claude-test',
        cliType: 'claude',
        provider: 'anthropic',
        createdAt: '2026-05-20T00:00:00Z',
        sharedWith: 'claude',
      }]));

      const result = cp.spawnSync('node', [CLI_PATH, 'doctor', '--heal-dry-run', '--json'], {
        env: { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' },
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
      const payload = JSON.parse(result.stdout);
      expect(payload.sweep.planned).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ profile: 'claude-test', name: 'commands', reason: 'missing' }),
        ]),
      );
      expect(fs.existsSync(path.join(home, '.claude-test', 'commands'))).toBe(false);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  test('dist CLI doctor escapes control characters in wrong symlink target output', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-doctor-control-cli-test-'));
    try {
      const expectedTarget = path.join(home, '.claude', 'commands');
      const profileCommands = path.join(home, '.claude-test', 'commands');
      fs.mkdirSync(expectedTarget, { recursive: true });
      fs.mkdirSync(path.dirname(profileCommands), { recursive: true });
      fs.mkdirSync(path.join(home, '.sweech', 'bin'), { recursive: true });
      fs.writeFileSync(path.join(home, '.claude-test', 'settings.json'), '{}');
      fs.writeFileSync(path.join(home, '.sweech', 'bin', 'claude-test'), '#!/bin/sh\n');
      fs.chmodSync(path.join(home, '.sweech', 'bin', 'claude-test'), 0o755);
      fs.symlinkSync(`${home}/bad\u001b[31m-target`, profileCommands);
      fs.writeFileSync(path.join(home, '.sweech', 'config.json'), JSON.stringify([{
        name: 'claude-test',
        commandName: 'claude-test',
        cliType: 'claude',
        provider: 'anthropic',
        createdAt: '2026-05-20T00:00:00Z',
        sharedWith: 'claude',
      }]));

      const result = cp.spawnSync('node', [CLI_PATH, 'doctor'], {
        env: { ...process.env, HOME: home, NO_COLOR: '1', FORCE_COLOR: '0' },
        encoding: 'utf-8',
      });

      expect(result.stdout).toContain('bad\\x1b[31m-target');
      expect(result.stdout).not.toContain('bad\u001b[31m-target');
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
