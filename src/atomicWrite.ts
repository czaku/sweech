/**
 * Atomic file write utility.
 *
 * Writes data to a temporary file (named with PID + timestamp to avoid
 * collisions across restarts), then renames it to the target path.
 * On POSIX systems, rename is atomic, so readers never see a partial write.
 * Temp files are cleaned up on failure.
 *
 * `opts.mode` (octal, e.g. 0o600) is applied to the TEMP file BEFORE the
 * rename, so the visible file is owner-only the instant it becomes
 * observable to readers. A post-rename chmod would leave a TOCTOU window
 * during which a co-tenant process could `open()` a world-readable fd
 * that persists across the chmod. Pass mode whenever the file holds
 * secrets (settings.json with API keys, cooldown files with profile
 * metadata, audit logs).
 */

import * as fs from 'fs';

export interface AtomicWriteOptions {
  /**
   * POSIX file mode applied on the temp file BEFORE rename. Omit to keep
   * the OS umask default (typically 0644). Pass 0o600 for secrets.
   */
  mode?: number;
}

export function atomicWriteFileSync(
  filePath: string,
  data: string | Buffer,
  opts: AtomicWriteOptions = {},
): void {
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.writeFileSync(tmpPath, data, typeof data === 'string' ? 'utf-8' : undefined);
    if (opts.mode !== undefined) {
      try { fs.chmodSync(tmpPath, opts.mode); } catch { /* best-effort — Windows etc. */ }
    }
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
    throw err;
  }
}
