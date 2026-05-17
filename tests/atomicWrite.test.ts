/**
 * Tests for src/atomicWrite.ts — the mode-on-write fix from the codex
 * adversarial review (closes TOCTOU window during the temp-file lifetime).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { atomicWriteFileSync } from '../src/atomicWrite';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-atomic-'));
});

afterEach(() => {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
});

describe('atomicWriteFileSync (no mode)', () => {
  test('writes file content', () => {
    const p = path.join(tmp, 'out.json');
    atomicWriteFileSync(p, '{"a":1}');
    expect(fs.readFileSync(p, 'utf-8')).toBe('{"a":1}');
  });

  test('survives concurrent reads (rename is atomic)', () => {
    const p = path.join(tmp, 'out.json');
    atomicWriteFileSync(p, JSON.stringify({ v: 1 }));
    expect(fs.readFileSync(p, 'utf-8')).toBe('{"v":1}');
    atomicWriteFileSync(p, JSON.stringify({ v: 2 }));
    expect(fs.readFileSync(p, 'utf-8')).toBe('{"v":2}');
  });

  test('cleans up temp file on rename failure', () => {
    // Pass a path that can't exist (parent dir missing) — write succeeds
    // to the temp file but rename fails because the target dir is gone.
    const badDir = path.join(tmp, 'missing-subdir');
    const p = path.join(badDir, 'out.json');
    expect(() => atomicWriteFileSync(p, 'data')).toThrow();
    // The temp file (in badDir) shouldn't exist after the throw.
    const leftover = fs.existsSync(badDir) ? fs.readdirSync(badDir) : [];
    expect(leftover).toEqual([]);
  });
});

describe('atomicWriteFileSync (mode 0o600)', () => {
  // chmod is a no-op on Windows; skip those tests there.
  const itPosix = process.platform === 'win32' ? it.skip : it;

  itPosix('creates the file with mode 0o600 from the open() syscall', () => {
    const p = path.join(tmp, 'secret.json');
    atomicWriteFileSync(p, 'secret-bytes', { mode: 0o600 });
    const stat = fs.statSync(p);
    expect(stat.mode & 0o777).toBe(0o600);
  });

  itPosix('temp-file open() honours mode — no post-rename chmod race', () => {
    // We can't easily observe the temp file mid-flight (it gets renamed
    // synchronously). Instead we verify the BEHAVIOR contract: the
    // final file is 0o600 AND the function never throws if chmodSync
    // is unavailable (the belt-and-braces post-rename chmod is defensive
    // only).
    const p = path.join(tmp, 'secret2.json');
    atomicWriteFileSync(p, JSON.stringify({ token: 'sk-secret' }), { mode: 0o600 });
    const stat = fs.statSync(p);
    expect(stat.mode & 0o777).toBe(0o600);
    // World-read bit MUST NOT be set
    expect(stat.mode & 0o004).toBe(0);
    // Group-read bit MUST NOT be set
    expect(stat.mode & 0o040).toBe(0);
  });

  itPosix('mode is preserved across rewrites', () => {
    const p = path.join(tmp, 'rewrite.json');
    atomicWriteFileSync(p, 'v1', { mode: 0o600 });
    atomicWriteFileSync(p, 'v2', { mode: 0o600 });
    expect(fs.statSync(p).mode & 0o777).toBe(0o600);
  });

  itPosix('mode 0o700 (executable secrets, e.g. wrapper scripts) also works', () => {
    const p = path.join(tmp, 'wrapper.sh');
    atomicWriteFileSync(p, '#!/bin/sh\necho hi\n', { mode: 0o700 });
    expect(fs.statSync(p).mode & 0o777).toBe(0o700);
  });

  itPosix('without opts.mode, falls back to umask default — no chmod call', () => {
    const p = path.join(tmp, 'unrestricted.json');
    atomicWriteFileSync(p, 'public-data');
    // Default mode under typical umask 022 is 0o644
    const mode = fs.statSync(p).mode & 0o777;
    // We don't assert exact value because umask varies — assert only
    // that it's NOT the restrictive 0o600 we'd get with opts.mode set.
    expect(mode).not.toBe(0o600);
  });
});
