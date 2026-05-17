/**
 * Tests for src/billing.ts — local storage of per-account billing data.
 *
 * The module reads/writes ~/.sweech/billing.json, so most tests use a
 * tempdir path passed as the optional `filePath` param. Atomic-write
 * via the existing `atomicWriteFileSync` helper is exercised end-to-end
 * (real fs writes; no mocks).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  BILLING_SCHEMA_VERSION,
  billingKey,
  readBillingFile,
  writeBillingFile,
  upsertEntry,
  removeEntry,
  mergeMailscanReport,
  getEntry,
  compareByNextBilling,
  daysUntilNextBill,
  type BillingEntry,
  type BillingFile,
  type MailscanBillingReport,
} from '../src/billing';

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-billing-test-'));
  return path.join(dir, 'billing.json');
}

function entry(over: Partial<BillingEntry>): BillingEntry {
  return {
    vendor: 'anthropic',
    email: 'user@example.com',
    status: 'active',
    plan: 'Max',
    billingDay: 24,
    lastPaidAt: '2026-04-24T00:00:00.000Z',
    nextBillingAt: '2026-05-24',
    source: 'manual',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...over,
  };
}

describe('billingKey', () => {
  test('normalises both inputs to lowercase', () => {
    expect(billingKey('Anthropic', 'User@Example.COM')).toBe('anthropic:user@example.com');
  });

  test('plain inputs pass through unchanged', () => {
    expect(billingKey('openai', 'a@b.c')).toBe('openai:a@b.c');
  });
});

describe('readBillingFile / writeBillingFile', () => {
  test('missing file → empty shape, no throw', () => {
    const file = readBillingFile('/tmp/sweech-billing-does-not-exist-xyz.json');
    expect(file.schemaVersion).toBe(BILLING_SCHEMA_VERSION);
    expect(file.entries).toEqual({});
  });

  test('round-trip preserves entries', () => {
    const filePath = tmpFile();
    const original: BillingFile = {
      schemaVersion: BILLING_SCHEMA_VERSION,
      entries: { 'anthropic:a@b.c': entry({ email: 'a@b.c' }) },
      lastScannedAt: '2026-05-17T00:00:00.000Z',
    };
    writeBillingFile(original, filePath);
    const read = readBillingFile(filePath);
    expect(read).toEqual(original);
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  });

  test('written file is mode 0600 (owner-only)', () => {
    const filePath = tmpFile();
    writeBillingFile({ schemaVersion: BILLING_SCHEMA_VERSION, entries: {} }, filePath);
    const stat = fs.statSync(filePath);
    expect(stat.mode & 0o777).toBe(0o600);
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  });

  test('malformed JSON → empty shape, logged to stderr', () => {
    const filePath = tmpFile();
    fs.writeFileSync(filePath, '{ not valid json');
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const file = readBillingFile(filePath);
    expect(file.entries).toEqual({});
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  });

  test('unknown schemaVersion → empty shape + stderr warning (refuses to merge)', () => {
    const filePath = tmpFile();
    fs.writeFileSync(filePath, JSON.stringify({ schemaVersion: 'unknown.v9', entries: { 'a:b': {} } }));
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const file = readBillingFile(filePath);
    expect(file.entries).toEqual({});
    expect(errSpy.mock.calls[0][0]).toMatch(/unknown schemaVersion/);
    errSpy.mockRestore();
    fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
  });
});

describe('upsertEntry', () => {
  test('inserts a new entry under the composed key', () => {
    const file: BillingFile = { schemaVersion: BILLING_SCHEMA_VERSION, entries: {} };
    const next = upsertEntry(file, entry({ vendor: 'openai', email: 'x@y.z' }));
    expect(Object.keys(next.entries)).toEqual(['openai:x@y.z']);
  });

  test('overwrites by default', () => {
    const original = entry({ status: 'active' });
    const file: BillingFile = {
      schemaVersion: BILLING_SCHEMA_VERSION,
      entries: { [billingKey(original.vendor, original.email)]: original },
    };
    const next = upsertEntry(file, entry({ status: 'canceled', source: 'mailscan' }));
    expect(Object.values(next.entries)[0].status).toBe('canceled');
    expect(Object.values(next.entries)[0].source).toBe('mailscan');
  });

  test('preserveManual:true blocks scan from overwriting manual entry', () => {
    const manual = entry({ status: 'active', source: 'manual', note: 'set by hand' });
    const file: BillingFile = {
      schemaVersion: BILLING_SCHEMA_VERSION,
      entries: { [billingKey(manual.vendor, manual.email)]: manual },
    };
    const scan = entry({ status: 'canceled', source: 'mailscan' });
    const next = upsertEntry(file, scan, { preserveManual: true });
    expect(Object.values(next.entries)[0].status).toBe('active');
    expect(Object.values(next.entries)[0].note).toBe('set by hand');
  });

  test('preserveManual:true allows manual → manual overwrite', () => {
    const m1 = entry({ source: 'manual', plan: 'Max' });
    const file: BillingFile = {
      schemaVersion: BILLING_SCHEMA_VERSION,
      entries: { [billingKey(m1.vendor, m1.email)]: m1 },
    };
    const m2 = entry({ source: 'manual', plan: 'Pro' });
    const next = upsertEntry(file, m2, { preserveManual: true });
    expect(Object.values(next.entries)[0].plan).toBe('Pro');
  });

  test('does not mutate the input file', () => {
    const file: BillingFile = { schemaVersion: BILLING_SCHEMA_VERSION, entries: {} };
    const before = JSON.stringify(file);
    upsertEntry(file, entry({}));
    expect(JSON.stringify(file)).toBe(before);
  });
});

describe('removeEntry', () => {
  test('removes by vendor+email key', () => {
    const e = entry({});
    const file: BillingFile = {
      schemaVersion: BILLING_SCHEMA_VERSION,
      entries: { [billingKey(e.vendor, e.email)]: e },
    };
    const next = removeEntry(file, e.vendor, e.email);
    expect(next.entries).toEqual({});
  });

  test('no-op when entry does not exist', () => {
    const file: BillingFile = { schemaVersion: BILLING_SCHEMA_VERSION, entries: {} };
    const next = removeEntry(file, 'foo', 'bar@baz.q');
    expect(next).toBe(file);
  });

  test('case-insensitive on vendor and email', () => {
    const e = entry({ vendor: 'anthropic', email: 'a@b.c' });
    const file: BillingFile = {
      schemaVersion: BILLING_SCHEMA_VERSION,
      entries: { [billingKey(e.vendor, e.email)]: e },
    };
    const next = removeEntry(file, 'ANTHROPIC', 'A@B.C');
    expect(next.entries).toEqual({});
  });
});

describe('mergeMailscanReport', () => {
  function report(over: Partial<MailscanBillingReport>): MailscanBillingReport {
    return {
      schemaVersion: 'mailscan.billing.v1',
      producer: 'mailscan',
      scannedAt: '2026-05-17T00:00:00.000Z',
      email: 'user@example.com',
      vendors: {},
      ...over,
    };
  }

  test('merges multiple vendors into the file', () => {
    const file: BillingFile = { schemaVersion: BILLING_SCHEMA_VERSION, entries: {} };
    const next = mergeMailscanReport(file, report({
      vendors: {
        anthropic: { vendor: 'anthropic', status: 'active', plan: 'Max', billingDay: 24, lastPaidAt: '2026-04-24T00:00:00Z', nextBillingEstimate: '2026-05-24' },
        openai: { vendor: 'openai', status: 'will_not_renew', plan: 'Plus', billingDay: 15, lastPaidAt: '2026-03-15T00:00:00Z', nextBillingEstimate: '2026-04-14' },
      },
    }));
    expect(Object.keys(next.entries).sort()).toEqual(['anthropic:user@example.com', 'openai:user@example.com']);
  });

  test('skips unknowns with no signal', () => {
    const file: BillingFile = { schemaVersion: BILLING_SCHEMA_VERSION, entries: {} };
    const next = mergeMailscanReport(file, report({
      vendors: {
        kimi: { vendor: 'kimi', status: 'unknown', plan: null, billingDay: null, lastPaidAt: null, nextBillingEstimate: null },
      },
    }));
    expect(next.entries).toEqual({});
  });

  test('does NOT overwrite manual entries (preserveManual)', () => {
    const manual = entry({ source: 'manual', status: 'active', note: 'manual override' });
    const file: BillingFile = {
      schemaVersion: BILLING_SCHEMA_VERSION,
      entries: { [billingKey(manual.vendor, manual.email)]: manual },
    };
    const next = mergeMailscanReport(file, report({
      email: manual.email,
      vendors: {
        anthropic: { vendor: 'anthropic', status: 'canceled', plan: 'Max', billingDay: 24, lastPaidAt: '2026-04-24T00:00:00Z', nextBillingEstimate: null },
      },
    }));
    expect(Object.values(next.entries)[0].source).toBe('manual');
    expect(Object.values(next.entries)[0].status).toBe('active');
    expect(Object.values(next.entries)[0].note).toBe('manual override');
  });

  test('lastScannedAt is set from the report', () => {
    const file: BillingFile = { schemaVersion: BILLING_SCHEMA_VERSION, entries: {} };
    const next = mergeMailscanReport(file, report({ scannedAt: '2026-06-01T12:00:00.000Z' }));
    expect(next.lastScannedAt).toBe('2026-06-01T12:00:00.000Z');
  });
});

describe('daysUntilNextBill', () => {
  test('positive when next bill is in the future', () => {
    const days = daysUntilNextBill(entry({ nextBillingAt: '2026-05-24' }), Date.UTC(2026, 4, 17));
    expect(days).toBe(7);
  });

  test('zero on the billing day', () => {
    const days = daysUntilNextBill(entry({ nextBillingAt: '2026-05-24' }), Date.UTC(2026, 4, 24, 0, 0, 0));
    expect(days).toBe(0);
  });

  test('negative when next bill is in the past', () => {
    const days = daysUntilNextBill(entry({ nextBillingAt: '2026-04-01' }), Date.UTC(2026, 4, 17));
    expect(days).toBeLessThan(0);
  });

  test('null when nextBillingAt is null', () => {
    expect(daysUntilNextBill(entry({ nextBillingAt: null }))).toBeNull();
  });

  test('null when nextBillingAt is malformed', () => {
    expect(daysUntilNextBill(entry({ nextBillingAt: 'not-a-date' }))).toBeNull();
  });
});

describe('compareByNextBilling', () => {
  test('sorts by next bill date ascending', () => {
    const arr = [
      entry({ vendor: 'a', nextBillingAt: '2026-06-01' }),
      entry({ vendor: 'b', nextBillingAt: '2026-05-01' }),
      entry({ vendor: 'c', nextBillingAt: '2026-05-15' }),
    ];
    arr.sort(compareByNextBilling);
    expect(arr.map(e => e.vendor)).toEqual(['b', 'c', 'a']);
  });

  test('entries with no nextBillingAt sink to the end', () => {
    const arr = [
      entry({ vendor: 'a', nextBillingAt: null }),
      entry({ vendor: 'b', nextBillingAt: '2026-05-01' }),
    ];
    arr.sort(compareByNextBilling);
    expect(arr.map(e => e.vendor)).toEqual(['b', 'a']);
  });
});

describe('getEntry', () => {
  test('returns the entry when present', () => {
    const e = entry({});
    const file: BillingFile = {
      schemaVersion: BILLING_SCHEMA_VERSION,
      entries: { [billingKey(e.vendor, e.email)]: e },
    };
    expect(getEntry(file, e.vendor, e.email)).toEqual(e);
  });

  test('returns null when missing', () => {
    const file: BillingFile = { schemaVersion: BILLING_SCHEMA_VERSION, entries: {} };
    expect(getEntry(file, 'a', 'b@c.d')).toBeNull();
  });
});
