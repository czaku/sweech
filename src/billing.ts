/**
 * Sweech billing data — per-account next-billing-day storage.
 *
 * Vendor APIs (Anthropic, OpenAI, …) do not expose subscription
 * expiry. We persist the answer locally at `~/.sweech/billing.json`,
 * populated either:
 *   - automatically by `sweech accounts billing scan` which shells out
 *     to the `mailscan` CLI (sibling tool at ~/dev/onlytools/mailscan)
 *   - manually via `sweech accounts billing set` for users who don't
 *     run a local mail client or whose subscription does not generate
 *     a billing email matched by the catalog
 *
 * The storage is intentionally a separate file from the vault
 * (`accounts.json`) so:
 *   - the vault stays auth-only — easier to reason about
 *   - billing data can be regenerated from scratch without touching
 *     credentials
 *   - the gitignore rule for `~/.sweech/` keeps both private
 *
 * Schema: `sweech.billing.v1`. The key for each entry is
 * `<vendor>:<email>` lowercased — one user may have separate
 * subscriptions to Anthropic + OpenAI on the same email.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { atomicWriteFileSync } from './atomicWrite';

// ── Constants ────────────────────────────────────────────────────────

const SWEECH_DIR = path.join(os.homedir(), '.sweech');
const BILLING_FILE = path.join(SWEECH_DIR, 'billing.json');

/** Current schema version — bump on breaking shape changes. */
export const BILLING_SCHEMA_VERSION = 'sweech.billing.v1' as const;

// ── Types ────────────────────────────────────────────────────────────

export type BillingStatus =
  | 'active'
  | 'will_not_renew'
  | 'canceled'
  | 'unknown';

export interface BillingEntry {
  /** Lowercased vendor id matching the mailscan catalog (e.g. 'anthropic'). */
  vendor: string;
  /** Lowercased recipient email. */
  email: string;
  /** Subscription status — single source of truth for "is this account paying?". */
  status: BillingStatus;
  /** Best-effort plan label ("Max", "Pro", "Plus", null). */
  plan: string | null;
  /** Day-of-month (1-31) the user gets charged. */
  billingDay: number | null;
  /** ISO-8601 of the most recent receipt. */
  lastPaidAt: string | null;
  /** `YYYY-MM-DD` of the projected next charge, or null when canceled / unknown. */
  nextBillingAt: string | null;
  /** Where this entry came from. */
  source: 'mailscan' | 'manual' | 'merged';
  /** ISO-8601 when this entry was last written. */
  updatedAt: string;
  /** Optional free-text note (manual entries can carry annotations). */
  note?: string;
}

export interface BillingFile {
  schemaVersion: typeof BILLING_SCHEMA_VERSION;
  /** Map keyed by `<vendor>:<email>`. */
  entries: Record<string, BillingEntry>;
  /** ISO-8601 of the last scan operation, when scan-derived. */
  lastScannedAt?: string;
}

// ── Storage I/O ──────────────────────────────────────────────────────

/** Compose the storage key. Both inputs are normalised to lowercase. */
export function billingKey(vendor: string, email: string): string {
  return `${vendor.toLowerCase()}:${email.toLowerCase()}`;
}

function emptyFile(): BillingFile {
  return { schemaVersion: BILLING_SCHEMA_VERSION, entries: {} };
}

/**
 * Read the billing file. Returns an empty shape when missing or
 * malformed — billing is non-critical data, never throw out of the
 * CLI path because a JSON parse failed. A malformed file is logged
 * to stderr once so the user can fix it.
 */
export function readBillingFile(filePath: string = BILLING_FILE): BillingFile {
  if (!fs.existsSync(filePath)) return emptyFile();
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<BillingFile>;
    if (!parsed || typeof parsed !== 'object') return emptyFile();
    if (parsed.schemaVersion !== BILLING_SCHEMA_VERSION) {
      // Future-proof: if we ever rev the schema, migrate here. For now
      // refuse to merge an unknown schema rather than corrupting data.
      // eslint-disable-next-line no-console
      console.error(`sweech: ${filePath} has unknown schemaVersion '${String(parsed.schemaVersion)}' — ignoring`);
      return emptyFile();
    }
    return {
      schemaVersion: BILLING_SCHEMA_VERSION,
      entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
      lastScannedAt: typeof parsed.lastScannedAt === 'string' ? parsed.lastScannedAt : undefined,
    };
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`sweech: failed to read ${filePath} (${e instanceof Error ? e.message : String(e)}) — using empty`);
    return emptyFile();
  }
}

/**
 * Atomically write the billing file (no torn-write window). Uses 0o600
 * so the file is owner-readable only — same posture as the vault, even
 * though billing data is metadata not secrets. Belt and braces.
 */
export function writeBillingFile(file: BillingFile, filePath: string = BILLING_FILE): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  atomicWriteFileSync(filePath, JSON.stringify(file, null, 2) + '\n', { mode: 0o600 });
}

// ── Mutators (pure-ish — return new file shape rather than mutating in place) ─

export interface UpsertOptions {
  /** When true, never overwrite a `source: 'manual'` entry — manual
   * inputs are authoritative against scan results. */
  preserveManual?: boolean;
}

export function upsertEntry(file: BillingFile, entry: BillingEntry, opts: UpsertOptions = {}): BillingFile {
  const key = billingKey(entry.vendor, entry.email);
  const existing = file.entries[key];
  if (opts.preserveManual && existing && existing.source === 'manual' && entry.source !== 'manual') {
    return file;
  }
  return {
    ...file,
    entries: {
      ...file.entries,
      [key]: { ...entry, updatedAt: entry.updatedAt || new Date().toISOString() },
    },
  };
}

export function removeEntry(file: BillingFile, vendor: string, email: string): BillingFile {
  const key = billingKey(vendor, email);
  if (!(key in file.entries)) return file;
  const next = { ...file.entries };
  delete next[key];
  return { ...file, entries: next };
}

// ── Mailscan integration ─────────────────────────────────────────────

export interface MailscanVendorEntry {
  vendor: string;
  status: BillingStatus;
  plan: string | null;
  lastPaidAt: string | null;
  billingDay: number | null;
  nextBillingEstimate: string | null;
}

export interface MailscanBillingReport {
  schemaVersion: 'mailscan.billing.v1';
  producer: 'mailscan';
  scannedAt: string;
  email: string;
  vendors: Record<string, MailscanVendorEntry>;
}

/**
 * Merge a mailscan billing report into the billing file. Existing
 * manual entries are preserved (per `preserveManual: true`); existing
 * scan entries for the same vendor+email are overwritten.
 */
export function mergeMailscanReport(file: BillingFile, report: MailscanBillingReport): BillingFile {
  let next = file;
  for (const v of Object.values(report.vendors)) {
    // Skip vendors that have no signal — don't store unknowns; they
    // bloat the file and provide no useful info.
    if (v.status === 'unknown' && v.lastPaidAt === null) continue;
    next = upsertEntry(next, {
      vendor: v.vendor,
      email: report.email,
      status: v.status,
      plan: v.plan,
      billingDay: v.billingDay,
      lastPaidAt: v.lastPaidAt,
      nextBillingAt: v.nextBillingEstimate,
      source: 'mailscan',
      updatedAt: new Date().toISOString(),
    }, { preserveManual: true });
  }
  return { ...next, lastScannedAt: report.scannedAt };
}

// ── Convenience reads for display ────────────────────────────────────

/**
 * Look up a billing entry by vendor + email. Returns null when missing.
 */
export function getEntry(file: BillingFile, vendor: string, email: string): BillingEntry | null {
  return file.entries[billingKey(vendor, email)] ?? null;
}

/**
 * Sort key for displaying "next bill" most-urgent-first. Entries with
 * no `nextBillingAt` go to the end.
 */
export function compareByNextBilling(a: BillingEntry, b: BillingEntry): number {
  const av = a.nextBillingAt ?? '￿';
  const bv = b.nextBillingAt ?? '￿';
  return av.localeCompare(bv);
}

/**
 * Compute days-until-next-bill from today. Returns null when no
 * `nextBillingAt` is known. Negative values mean the projected date
 * is in the past (subscription should have rolled or lapsed).
 */
export function daysUntilNextBill(entry: BillingEntry, now: number = Date.now()): number | null {
  if (!entry.nextBillingAt) return null;
  const target = Date.parse(entry.nextBillingAt + 'T00:00:00Z');
  if (!Number.isFinite(target)) return null;
  return Math.floor((target - now) / (24 * 60 * 60 * 1000));
}
