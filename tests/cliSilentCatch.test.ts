import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { logSilent } from '../src/silentLogger';

describe('CLI silent catch guard', () => {
  const cliSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'cli.ts'), 'utf-8');
  const silentLoggerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'silentLogger.ts'), 'utf-8');
  const eslintConfig = fs.readFileSync(path.join(__dirname, '..', 'eslint.config.mjs'), 'utf-8');

  test('does not allow empty catch blocks in the CLI entrypoint', () => {
    const emptyCatch = /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\*[\s\S]*?\*\/\s*)?\}/g;
    const matches = cliSource.match(emptyCatch) ?? [];

    expect(matches).toEqual([]);
  });

  test('does not allow catch clauses without an error binding in the CLI entrypoint', () => {
    const unboundCatch = /catch\s*\{/g;
    const matches = cliSource.match(unboundCatch) ?? [];

    expect(matches).toEqual([]);
  });

  test('keeps best-effort catch failures debuggable without normal stderr noise', () => {
    expect(cliSource).toContain("import { logSilent } from './silentLogger'");
    expect(silentLoggerSource).toContain('process.env');
    expect(silentLoggerSource).toContain('[sweech debug]');
  });

  test('wires an ESLint rule for future CLI silent-catch regressions', () => {
    expect(eslintConfig).toContain("files: ['src/cli.ts']");
    expect(eslintConfig).toContain("'no-empty'");
    expect(eslintConfig).toContain('CatchClause[param=null]');
  });

  test('logSilent emits nothing unless debug is enabled and scrubs secrets when enabled', () => {
    const write = jest.fn();
    const secret = 'sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    logSilent(new Error(`failed with ${secret}`), 'probe', {}, { write } as any);
    expect(write).not.toHaveBeenCalled();

    logSilent(new Error(`failed with ${secret}`), 'probe', { SWEECH_DEBUG: '1' }, { write } as any);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toContain('[sweech debug] probe:');
    expect(write.mock.calls[0][0]).toContain('[REDACTED]');
    expect(write.mock.calls[0][0]).not.toContain(secret);
  });

  test('built info --json keeps normal stderr clean and emits debug-only silent-catch details', () => {
    const cliPath = path.join(__dirname, '..', 'dist', 'cli.js');
    if (!fs.existsSync(cliPath)) {
      console.warn('[cliSilentCatch] dist/cli.js missing - run `npm run build` first. Skipping CLI smoke.');
      return;
    }

    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-cli-silent-'));
    const baseEnv = {
      ...process.env,
      HOME: home,
      SWEECH_NO_UPDATE_NOTIFIER: '1',
      FORCE_COLOR: '0',
    };

    try {
      const normal = spawnSync(process.execPath, [cliPath, 'info', '--json'], {
        env: { ...baseEnv, SWEECH_DEBUG: '' },
        encoding: 'utf-8',
      });
      expect(normal.status).toBe(0);
      expect(normal.stderr).toBe('');
      expect(() => JSON.parse(normal.stdout)).not.toThrow();

      const debug = spawnSync(process.execPath, [cliPath, 'info', '--json'], {
        env: { ...baseEnv, SWEECH_DEBUG: '1' },
        encoding: 'utf-8',
      });
      expect(debug.status).toBe(0);
      expect(debug.stderr).toContain('[sweech debug]');
      expect(() => JSON.parse(debug.stdout)).not.toThrow();
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });
});
