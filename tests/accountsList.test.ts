/**
 * Tests for `src/accountsList.ts` — pure helpers backing `sweech accounts list`.
 *
 * These helpers were extracted "for testability" but landed without
 * tests (codex/integration MEDIUM). The CLI command in `src/cli.ts`
 * still depends on the exact behaviour of:
 *
 *   - filterAccountsForList   (--kind, --provider)
 *   - sortAccountsForList     (display order)
 *   - normalizeKindFilter     (CLI token → AccountKindFilter)
 *   - normalizeProviderFilter (CLI token → provider id | undefined)
 *   - buildAccountsListJson   (--json envelope)
 *
 * No I/O, no module mocking — these are pure functions, so the tests
 * are pure too.
 */

import {
  filterAccountsForList,
  sortAccountsForList,
  normalizeKindFilter,
  normalizeProviderFilter,
  buildAccountsListJson,
} from '../src/accountsList'
import type {
  Account,
  OAuthAccount,
  ApiKeyAccount,
  NoAuthAccount,
} from '../src/providerModel'

// ── Fixtures ────────────────────────────────────────────────────────

function mkOauth(over: Partial<OAuthAccount> = {}): OAuthAccount {
  return {
    kind: 'oauth',
    provider: 'anthropic',
    id: 'sweech-vault-anthropic-' + (over.email ?? 'a@example.com'),
    email: 'a@example.com',
    addedAt: '2026-05-01T00:00:00Z',
    refreshTokenRef: { service: 'Claude Code-credentials', account: 'a@example.com' },
    ...over,
  }
}

function mkApi(over: Partial<ApiKeyAccount> = {}): ApiKeyAccount {
  return {
    kind: 'apikey',
    provider: 'kimi',
    id: 'sweech-vault-kimi-' + (over.label ?? 'default'),
    label: 'default',
    addedAt: '2026-05-01T00:00:00Z',
    keyRef: { service: 'sweech-api-key', account: 'kimi-default' },
    ...over,
  }
}

function mkLocal(over: Partial<NoAuthAccount> = {}): NoAuthAccount {
  return {
    kind: 'none',
    provider: 'ollama',
    id: 'sweech-vault-ollama-' + (over.label ?? 'local'),
    label: 'local',
    addedAt: '2026-05-01T00:00:00Z',
    ...over,
  }
}

// ── filterAccountsForList ───────────────────────────────────────────

describe('filterAccountsForList', () => {
  const accounts: Account[] = [
    mkOauth({ email: 'anthropic-a@example.com', provider: 'anthropic' }),
    mkOauth({ email: 'openai-b@example.com', provider: 'openai' }),
    mkApi({ provider: 'kimi', label: 'work' }),
    mkApi({ provider: 'glm', label: 'work' }),
    mkLocal({ provider: 'ollama', label: 'local' }),
  ]

  test('default (no filters) returns everything unchanged', () => {
    expect(filterAccountsForList(accounts)).toEqual(accounts)
  })

  test('kind=all is the same as no filter', () => {
    expect(filterAccountsForList(accounts, { kind: 'all' })).toEqual(accounts)
  })

  test('kind=oauth keeps only oauth rows', () => {
    const out = filterAccountsForList(accounts, { kind: 'oauth' })
    expect(out.every(a => a.kind === 'oauth')).toBe(true)
    expect(out).toHaveLength(2)
  })

  test('kind=apikey keeps only apikey rows', () => {
    const out = filterAccountsForList(accounts, { kind: 'apikey' })
    expect(out.every(a => a.kind === 'apikey')).toBe(true)
    expect(out).toHaveLength(2)
  })

  test('kind=local maps to the on-disk `none` discriminator', () => {
    // Behavioural contract: user-facing 'local' ↔ on-disk 'none'.
    const out = filterAccountsForList(accounts, { kind: 'local' })
    expect(out.every(a => a.kind === 'none')).toBe(true)
    expect(out).toHaveLength(1)
  })

  test('provider filter is exact, case-sensitive', () => {
    expect(filterAccountsForList(accounts, { provider: 'kimi' })).toHaveLength(1)
    expect(filterAccountsForList(accounts, { provider: 'KIMI' })).toHaveLength(0)
    expect(filterAccountsForList(accounts, { provider: 'kim' })).toHaveLength(0)
  })

  test('kind + provider compose: kind=oauth provider=openai', () => {
    const out = filterAccountsForList(accounts, { kind: 'oauth', provider: 'openai' })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ kind: 'oauth', provider: 'openai' })
  })

  test('kind + provider compose: incompatible combo returns []', () => {
    const out = filterAccountsForList(accounts, { kind: 'oauth', provider: 'kimi' })
    expect(out).toEqual([])
  })

  test('empty input returns empty output', () => {
    expect(filterAccountsForList([], { kind: 'oauth' })).toEqual([])
  })

  test('does not mutate the input array', () => {
    const snapshot = JSON.parse(JSON.stringify(accounts))
    filterAccountsForList(accounts, { kind: 'oauth', provider: 'anthropic' })
    expect(accounts).toEqual(snapshot)
  })
})

// ── sortAccountsForList ─────────────────────────────────────────────

describe('sortAccountsForList', () => {
  test('orders by kind (oauth < apikey < none)', () => {
    const out = sortAccountsForList([
      mkLocal({ provider: 'ollama' }),
      mkApi({ provider: 'kimi' }),
      mkOauth({ provider: 'anthropic' }),
    ])
    expect(out.map(a => a.kind)).toEqual(['oauth', 'apikey', 'none'])
  })

  test('inside same kind, orders by provider asc', () => {
    const out = sortAccountsForList([
      mkApi({ provider: 'kimi', label: 'a' }),
      mkApi({ provider: 'glm', label: 'a' }),
      mkApi({ provider: 'dashscope', label: 'a' }),
    ])
    expect(out.map(a => a.provider)).toEqual(['dashscope', 'glm', 'kimi'])
  })

  test('oauth rows tie-break by email', () => {
    const out = sortAccountsForList([
      mkOauth({ provider: 'anthropic', email: 'zebra@x.com' }),
      mkOauth({ provider: 'anthropic', email: 'alpha@x.com' }),
      mkOauth({ provider: 'anthropic', email: 'mango@x.com' }),
    ])
    expect(out.map(a => (a as OAuthAccount).email)).toEqual([
      'alpha@x.com', 'mango@x.com', 'zebra@x.com',
    ])
  })

  test('apikey rows tie-break by label, falling back to id', () => {
    const out = sortAccountsForList([
      mkApi({ provider: 'kimi', label: 'zeta', id: 'id-z' }),
      mkApi({ provider: 'kimi', label: undefined, id: 'id-bareA' }),
      mkApi({ provider: 'kimi', label: 'alpha', id: 'id-a' }),
    ])
    // Sort key is label || id. So: 'alpha' < 'id-bareA' < 'zeta'.
    expect(out.map(a => (a as ApiKeyAccount).label ?? (a as ApiKeyAccount).id)).toEqual([
      'alpha', 'id-bareA', 'zeta',
    ])
  })

  test('local rows tie-break by label, falling back to id', () => {
    const out = sortAccountsForList([
      mkLocal({ provider: 'ollama', label: undefined, id: 'id-x' }),
      mkLocal({ provider: 'ollama', label: 'local-A' }),
    ])
    // 'id-x' > 'local-A' lexicographically — order checks the rule.
    expect(out.map(a => (a as NoAuthAccount).label ?? (a as NoAuthAccount).id)).toEqual([
      'id-x', 'local-A',
    ])
  })

  test('does not mutate the input array', () => {
    const input = [
      mkApi({ provider: 'kimi' }),
      mkOauth({ provider: 'anthropic', email: 'a@x.com' }),
    ]
    const snapshot = JSON.parse(JSON.stringify(input))
    sortAccountsForList(input)
    expect(input).toEqual(snapshot)
  })

  test('empty input returns empty output', () => {
    expect(sortAccountsForList([])).toEqual([])
  })
})

// ── normalizeKindFilter ─────────────────────────────────────────────

describe('normalizeKindFilter', () => {
  test('undefined → "all"', () => {
    expect(normalizeKindFilter(undefined)).toBe('all')
  })

  test('empty string → "all"', () => {
    expect(normalizeKindFilter('')).toBe('all')
  })

  test.each(['oauth', 'apikey', 'local', 'all'])(
    'recognises canonical token "%s"',
    (token) => {
      expect(normalizeKindFilter(token)).toBe(token)
    },
  )

  test.each([
    ['OAUTH', 'oauth'],
    ['ApiKey', 'apikey'],
    ['LOCAL', 'local'],
    ['ALL', 'all'],
  ])('lowercases input: %s → %s', (input, expected) => {
    expect(normalizeKindFilter(input)).toBe(expected)
  })

  test('unknown token falls back to "all" (vs. throwing)', () => {
    expect(normalizeKindFilter('anthropic')).toBe('all')
    expect(normalizeKindFilter('subscription')).toBe('all')
    expect(normalizeKindFilter('garbage')).toBe('all')
  })
})

// ── normalizeProviderFilter ─────────────────────────────────────────

describe('normalizeProviderFilter', () => {
  test('undefined → undefined', () => {
    expect(normalizeProviderFilter(undefined)).toBeUndefined()
  })

  test('empty string → undefined', () => {
    expect(normalizeProviderFilter('')).toBeUndefined()
  })

  test('whitespace-only → undefined', () => {
    expect(normalizeProviderFilter('   ')).toBeUndefined()
  })

  test('strips surrounding whitespace', () => {
    expect(normalizeProviderFilter('  kimi  ')).toBe('kimi')
  })

  test('preserves case (provider ids are case-sensitive)', () => {
    expect(normalizeProviderFilter('Kimi')).toBe('Kimi')
  })
})

// ── buildAccountsListJson ───────────────────────────────────────────

describe('buildAccountsListJson', () => {
  test('wraps the accounts array in {schemaVersion: 1, accounts}', () => {
    const accounts = [mkOauth({ provider: 'anthropic', email: 'a@x.com' })]
    const out = buildAccountsListJson(accounts)
    expect(out).toEqual({ schemaVersion: 1, accounts })
  })

  test('does not deep-copy accounts (reference semantics)', () => {
    const accounts = [mkOauth()]
    const out = buildAccountsListJson(accounts)
    expect(out.accounts).toBe(accounts)
  })

  test('empty input still emits the envelope', () => {
    expect(buildAccountsListJson([])).toEqual({ schemaVersion: 1, accounts: [] })
  })

  test('schemaVersion is a literal 1 (downstream pins to it)', () => {
    const out = buildAccountsListJson([])
    // tsc enforces the literal in the type; this asserts runtime too.
    expect(out.schemaVersion).toBe(1)
  })
})
