/**
 * Regression guard against the May 2026 incident in which jest tests
 * silently wrote to the developer's real ~/.sweech/ and cleared real
 * workspace markers under ~/.<workspace>/.sweech-account.
 *
 * `vaultHome()` resolves the effective vault root in priority order:
 *   1. process.env.SWEECH_HOME  (escape hatch for tests + unusual deploys)
 *   2. os.homedir()             (real path)
 *
 * If any future refactor breaks the env-var path, the next test run
 * could repeat the incident. This file is deliberately small and
 * isolated — it runs without mocks so a regression cannot be masked
 * by another suite's mock setup.
 */

import * as os from 'os';
import * as path from 'path';
import { vaultHome, workspaceMarkerPath } from '../src/vault';

describe('vaultHome — SWEECH_HOME override', () => {
  const ORIG = process.env.SWEECH_HOME;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.SWEECH_HOME;
    else process.env.SWEECH_HOME = ORIG;
  });

  test('SWEECH_HOME unset → falls back to os.homedir()', () => {
    delete process.env.SWEECH_HOME;
    expect(vaultHome()).toBe(os.homedir());
  });

  test('SWEECH_HOME set → overrides os.homedir()', () => {
    process.env.SWEECH_HOME = '/tmp/sweech-vaulthome-test';
    expect(vaultHome()).toBe('/tmp/sweech-vaulthome-test');
  });

  test('workspaceMarkerPath honours SWEECH_HOME — no real-home writes during tests', () => {
    process.env.SWEECH_HOME = '/tmp/sandbox-home';
    const marker = workspaceMarkerPath('claude-ted');
    // The path MUST resolve under the sandbox, not under the real home.
    expect(marker).toBe(path.join('/tmp/sandbox-home', '.claude-ted', '.sweech-account'));
    expect(marker.startsWith(os.homedir())).toBe(false);
  });

  test('SWEECH_HOME empty string → falls back to os.homedir() (truthy-only override)', () => {
    process.env.SWEECH_HOME = '';
    expect(vaultHome()).toBe(os.homedir());
  });
});
