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
  // Build writeFileSync options so mode is applied at the open() syscall
  // — NOT chmodded afterwards. writeFileSync's underlying open(O_CREAT)
  // honours the mode arg modulo umask, so a co-tenant racing the
  // temp-file creation lands on the restrictive permissions from the
  // very first byte. A post-write chmodSync would still expose a window
  // between create and chmod during which the temp file is world-readable.
  const writeOpts: { encoding?: BufferEncoding; mode?: number } = {};
  if (typeof data === 'string') writeOpts.encoding = 'utf-8';
  if (opts.mode !== undefined) writeOpts.mode = opts.mode;
  try {
    fs.writeFileSync(tmpPath, data, writeOpts);
    // Belt-and-braces: if the umask masked our mode bits off (e.g. user
    // explicitly umasked 077), chmodSync resets them. Cheap and safe.
    if (opts.mode !== undefined) {
      try { fs.chmodSync(tmpPath, opts.mode); } catch { /* best-effort */ }
    }
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmpPath); } catch { /* already gone */ }
    throw err;
  }
}
