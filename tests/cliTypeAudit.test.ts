/**
 * Tests for T-079 cliType_mismatch audit + --fix-cli-type path.
 *
 * The real-world incident this guards against: profiles named
 * `claude-or-pole` (openrouter) and `claude-mm-pro` (minimax) were
 * created with cliType='codex' by accident, so the wrapper ended up
 * exec'ing `codex` against a Claude-style settings.json.
 */

import * as fs from 'fs';
import * as path from 'path';

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
import { inferExpectedCliType, fixCliTypeOnProfile, auditProfiles } from '../src/profileAudit';

function isolateHome(): string {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-clitype-test-'));
  setHomedir(home);
  process.env.SWEECH_HOME = home;
  if (!os.homedir().startsWith(os.tmpdir()) || !os.homedir().includes('sweech-clitype-test-')) {
    throw new Error(`isolateHome safety check failed: ${os.homedir()}`);
  }
  return home;
}

afterEach(() => {
  setHomedir(null);
  delete process.env.SWEECH_HOME;
});

describe('inferExpectedCliType', () => {
  test('claude- prefix → claude', () => {
    expect(inferExpectedCliType('claude-or-pole', 'openrouter')).toBe('claude');
    expect(inferExpectedCliType('claude-mm-pro', 'minimax')).toBe('claude');
    expect(inferExpectedCliType('claude-ali', 'dashscope')).toBe('claude');
  });

  test('codex- prefix → codex', () => {
    expect(inferExpectedCliType('codex-pole', 'openai')).toBe('codex');
    expect(inferExpectedCliType('codex-ollama', 'ollama')).toBe('codex');
  });

  test('kimi- prefix → kimi', () => {
    expect(inferExpectedCliType('kimi-test', 'kimi')).toBe('kimi');
  });

  test('bare CLI name → matching cliType', () => {
    expect(inferExpectedCliType('claude', 'anthropic')).toBe('claude');
    expect(inferExpectedCliType('codex', 'openai')).toBe('codex');
  });

  test('no prefix, single-CLI provider → infer from provider', () => {
    // anthropic provider has compatibility=['claude'] only.
    expect(inferExpectedCliType('my-profile', 'anthropic')).toBe('claude');
  });

  test('no prefix, multi-CLI provider → null (no opinion)', () => {
    // ollama supports both claude and codex — no inference possible
    // from provider alone, and the name has no recognised prefix.
    expect(inferExpectedCliType('weird-name', 'ollama')).toBeNull();
  });
});

describe('auditProfiles cli_type_mismatch finding', () => {
  test('flags claude- prefixed profile with cliType=codex', async () => {
    isolateHome();
    const cfg = new ConfigManager();
    fs.mkdirSync(path.join(cfg.getConfigDir(), '..', '.claude-or-pole'), { recursive: true });
    fs.writeFileSync(
      path.join(cfg.getConfigDir(), '..', '.claude-or-pole', 'settings.json'),
      JSON.stringify({ env: {} }),
    );
    cfg.writeProfiles([{
      name: 'claude-or-pole',
      commandName: 'claude-or-pole',
      cliType: 'codex',
      provider: 'openrouter',
      createdAt: '2026-05-17T00:00:00Z',
    } as any]);

    const report = await auditProfiles({ config: cfg, dormancyDays: 9999 });
    const mismatches = report.findings.filter(f => f.kind === 'cli_type_mismatch');
    expect(mismatches.length).toBe(1);
    expect(mismatches[0].profile).toBe('claude-or-pole');
    expect((mismatches[0].evidence as any).expectedCliType).toBe('claude');
    expect((mismatches[0].evidence as any).observedCliType).toBe('codex');
    expect(mismatches[0].suggestion).toBe('fix_cli_type');
    expect(report.summary.cli_type_mismatch).toBe(1);
  });

  test('does NOT flag a correctly-typed profile', async () => {
    isolateHome();
    const cfg = new ConfigManager();
    fs.mkdirSync(path.join(cfg.getConfigDir(), '..', '.codex-pole'), { recursive: true });
    fs.writeFileSync(
      path.join(cfg.getConfigDir(), '..', '.codex-pole', 'settings.json'),
      JSON.stringify({ env: {} }),
    );
    cfg.writeProfiles([{
      name: 'codex-pole',
      commandName: 'codex-pole',
      cliType: 'codex',
      provider: 'openai',
      createdAt: '2026-05-17T00:00:00Z',
    } as any]);

    const report = await auditProfiles({ config: cfg, dormancyDays: 9999 });
    expect(report.findings.filter(f => f.kind === 'cli_type_mismatch')).toHaveLength(0);
  });
});

describe('fixCliTypeOnProfile', () => {
  test('rewrites cliType, leaves other fields alone, writes a backup', () => {
    isolateHome();
    const cfg = new ConfigManager();
    cfg.writeProfiles([{
      name: 'claude-or-pole',
      commandName: 'claude-or-pole',
      cliType: 'codex',
      provider: 'openrouter',
      createdAt: '2026-05-17T00:00:00Z',
      model: 'anthropic/claude-sonnet-4-6',
    } as any]);

    const result = fixCliTypeOnProfile(cfg, 'claude-or-pole');
    expect(result.changed).toBe(true);
    expect(result.from).toBe('codex');
    expect(result.to).toBe('claude');

    const updated = cfg.getProfiles().find(p => p.commandName === 'claude-or-pole');
    expect(updated?.cliType).toBe('claude');
    expect(updated?.model).toBe('anthropic/claude-sonnet-4-6'); // untouched

    // Backup file exists.
    const backups = fs.readdirSync(cfg.getBackupsDir())
      .filter(f => f.startsWith('config.json.cli_type_fix.') && f.endsWith('.bak'));
    expect(backups.length).toBe(1);
  });

  test('no-op for already-correct profile', () => {
    isolateHome();
    const cfg = new ConfigManager();
    cfg.writeProfiles([{
      name: 'claude-good',
      commandName: 'claude-good',
      cliType: 'claude',
      provider: 'anthropic',
      createdAt: '2026-05-17T00:00:00Z',
    } as any]);
    const result = fixCliTypeOnProfile(cfg, 'claude-good');
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('already-correct');
  });

  test('reports profile-not-found cleanly', () => {
    isolateHome();
    const cfg = new ConfigManager();
    const result = fixCliTypeOnProfile(cfg, 'nonexistent');
    expect(result.changed).toBe(false);
    expect(result.reason).toBe('profile-not-found');
  });
});
