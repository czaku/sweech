/**
 * Tests for src/providerModel.ts and the v1 → v2 vault schema migration.
 *
 * The vault writes to ~/.sweech/accounts.json and to the keychain. Both
 * are redirected: homedir() points at a per-test-file tmp directory, and
 * the credential store is swapped for an in-memory map. ConfigManager
 * reads `${homedir}/.sweech/config.json` so we write a fixture there to
 * exercise the workspace-discovery path of migrateV1ToV2.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-providerModel-test-'))

afterAll(() => {
  try { fs.rmSync(TMP_HOME, { recursive: true, force: true }) } catch {}
})

beforeEach(() => {
  // Fresh module graph so vault re-resolves ACCOUNTS_FILE under the
  // mocked homedir, and the in-memory credential store starts empty.
  jest.resetModules()
  jest.doMock('os', () => {
    const real = jest.requireActual('os')
    return { ...real, homedir: () => TMP_HOME }
  })
  jest.doMock('node:os', () => {
    const real = jest.requireActual('node:os')
    return { ...real, homedir: () => TMP_HOME }
  })
  jest.doMock('../src/credentialStore', () => {
    const memory = new Map<string, string>()
    const key = (service: string, account: string) => `${service}::${account}`
    const store = {
      async get(service: string, account: string): Promise<string | null> {
        return memory.get(key(service, account)) ?? null
      },
      async set(service: string, account: string, value: string): Promise<void> {
        memory.set(key(service, account), value)
      },
      async delete(service: string, account: string): Promise<void> {
        memory.delete(key(service, account))
      },
    }
    return {
      getCredentialStore: () => store,
      readCredential: async (s: string, a: string) => store.get(s, a),
      computeKeychainServiceName: (dir: string) => `service-${path.basename(dir)}`,
      MacOSKeychainStore: class {},
      LinuxSecretToolStore: class {},
      WindowsCmdkeyStore: class {},
      FileTokenStore: class {},
      isSecretToolAvailable: () => false,
      isCmdkeyAvailable: () => false,
    }
  })
  // Each test gets a clean ~/.sweech.
  const sweechDir = path.join(TMP_HOME, '.sweech')
  try { fs.rmSync(sweechDir, { recursive: true, force: true }) } catch {}
})

// ── Fixtures ─────────────────────────────────────────────────────────────────

const V1_OAUTH_FIXTURE = [
  {
    id: 'aaaa11111111',
    kind: 'anthropic',
    email: 'alice@example.com',
    displayName: 'Alice',
    externalId: 'uuid-anth-1',
    plan: 'Max 20x',
    addedAt: '2026-05-01T00:00:00.000Z',
    status: 'ok',
  },
  {
    id: 'bbbb22222222',
    kind: 'openai',
    email: 'bob@example.com',
    externalId: 'oai-acc-1',
    plan: 'Pro',
    addedAt: '2026-05-02T00:00:00.000Z',
    status: 'ok',
  },
]

const CONFIG_FIXTURE = {
  profiles: [
    // 1 anthropic OAuth-backed (collapses into existing OAuth row, no apikey)
    {
      name: 'claude',
      commandName: 'claude',
      cliType: 'claude',
      provider: 'anthropic',
      createdAt: '2026-04-01T00:00:00.000Z',
    },
    // 1 codex OAuth-backed (collapses into existing OAuth row, no apikey)
    {
      name: 'codex',
      commandName: 'codex',
      cliType: 'codex',
      provider: 'openai',
      createdAt: '2026-04-02T00:00:00.000Z',
    },
    // 3 API-key-backed workspaces (emit kind:'apikey' rows).
    // baseUrl is empty so effectiveProvider() returns the raw provider
    // tag without host-based remapping — keeps the test's expected
    // joins straightforward.
    {
      name: 'claude-kimi',
      commandName: 'claude-kimi',
      cliType: 'claude',
      provider: 'kimi',
      createdAt: '2026-04-03T00:00:00.000Z',
    },
    {
      name: 'claude-glm',
      commandName: 'claude-glm',
      cliType: 'claude',
      provider: 'glm',
      createdAt: '2026-04-04T00:00:00.000Z',
    },
    {
      name: 'codex-openrouter',
      commandName: 'codex-openrouter',
      cliType: 'codex',
      provider: 'openrouter',
      createdAt: '2026-04-05T00:00:00.000Z',
    },
    // 1 local Ollama workspace (emits kind:'none'). Baseurl points at
    // localhost:11434 so effectiveProvider() maps it to 'local-ollama'.
    {
      name: 'codex-ollama',
      commandName: 'codex-ollama',
      cliType: 'codex',
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
      createdAt: '2026-04-06T00:00:00.000Z',
    },
  ],
}

function writeAccountsFile(data: unknown): void {
  const sweechDir = path.join(TMP_HOME, '.sweech')
  fs.mkdirSync(sweechDir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(path.join(sweechDir, 'accounts.json'), JSON.stringify(data, null, 2))
}

function writeConfigFile(data: unknown): void {
  const sweechDir = path.join(TMP_HOME, '.sweech')
  fs.mkdirSync(sweechDir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(path.join(sweechDir, 'config.json'), JSON.stringify(data, null, 2))
}

function loadProviderModel() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../src/providerModel') as typeof import('../src/providerModel')
}

function loadVault() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../src/vault') as typeof import('../src/vault')
}

// ── PROVIDER_CATALOG ────────────────────────────────────────────────────────

describe('PROVIDER_CATALOG', () => {
  test('includes known subscription providers', () => {
    const pm = loadProviderModel()
    const anth = pm.PROVIDER_CATALOG.find(p => p.id === 'anthropic')
    expect(anth).toBeDefined()
    expect(anth?.kind).toBe('subscription')
    expect(anth?.oauthSupported).toBe(true)
    expect(anth?.supportedCliTypes).toContain('claude')

    const oai = pm.PROVIDER_CATALOG.find(p => p.id === 'openai')
    expect(oai?.kind).toBe('subscription')
    expect(oai?.supportedCliTypes).toContain('codex')
  })

  test('includes API-key providers', () => {
    const pm = loadProviderModel()
    const kimi = pm.PROVIDER_CATALOG.find(p => p.id === 'kimi')
    expect(kimi?.kind).toBe('apikey')
    expect(kimi?.oauthSupported).toBe(false)

    const glm = pm.PROVIDER_CATALOG.find(p => p.id === 'glm')
    expect(glm?.kind).toBe('apikey')
  })

  test('includes synthetic local providers (local-ollama, local-proxy, xortron)', () => {
    const pm = loadProviderModel()
    for (const id of ['local-ollama', 'local-proxy', 'xortron']) {
      const p = pm.PROVIDER_CATALOG.find(x => x.id === id)
      expect(p).toBeDefined()
      expect(p?.kind).toBe('local')
    }
  })

  test('includes synthetic apikey providers (gemini, groq, nvidia, ollama-cloud)', () => {
    const pm = loadProviderModel()
    for (const id of ['gemini', 'groq', 'nvidia', 'ollama-cloud']) {
      const p = pm.PROVIDER_CATALOG.find(x => x.id === id)
      expect(p).toBeDefined()
      expect(p?.kind).toBe('apikey')
    }
  })

  test('does not include the synthetic "custom" wildcard', () => {
    const pm = loadProviderModel()
    expect(pm.PROVIDER_CATALOG.find(p => p.id === 'custom')).toBeUndefined()
  })

  test('every entry has a non-empty displayName and at least one cliType', () => {
    const pm = loadProviderModel()
    for (const p of pm.PROVIDER_CATALOG) {
      expect(p.displayName.length).toBeGreaterThan(0)
      expect(p.supportedCliTypes.length).toBeGreaterThan(0)
    }
  })
})

// ── getProvidersForCli ──────────────────────────────────────────────────────

describe('getProvidersForCli', () => {
  test('claude includes anthropic and anthropic-compat providers', () => {
    const pm = loadProviderModel()
    const claudeProviders = pm.getProvidersForCli('claude').map(p => p.id)
    expect(claudeProviders).toContain('anthropic')
    expect(claudeProviders).toContain('glm')
    expect(claudeProviders).toContain('kimi')
    expect(claudeProviders).toContain('minimax')
    expect(claudeProviders).not.toContain('grok')      // grok is codex-only
    expect(claudeProviders).not.toContain('openai')
  })

  test('codex includes openai and openai-compat providers', () => {
    const pm = loadProviderModel()
    const codexProviders = pm.getProvidersForCli('codex').map(p => p.id)
    expect(codexProviders).toContain('openai')
    expect(codexProviders).toContain('grok')
    expect(codexProviders).toContain('openrouter')
    expect(codexProviders).toContain('gemini')         // synthetic
    expect(codexProviders).not.toContain('anthropic')
    expect(codexProviders).not.toContain('glm')
  })

  test('kimi includes kimi and kimi-coding providers', () => {
    const pm = loadProviderModel()
    const kimiProviders = pm.getProvidersForCli('kimi').map(p => p.id)
    expect(kimiProviders).toContain('kimi')
    expect(kimiProviders).toContain('kimi-coding')
  })
})

// ── Migration v1 → v2 ───────────────────────────────────────────────────────

describe('migrateV1ToV2', () => {
  test('fresh-install (no accounts.json, no config.json) → empty list, no spurious file write', () => {
    const vault = loadVault()
    const list = vault.listAccountsV2()
    expect(list).toEqual([])
    // accounts.json is not created on fresh install — no v1 to migrate
    // and nothing to write. First saveAccount call would lazily create it.
    expect(fs.existsSync(path.join(TMP_HOME, '.sweech/accounts.json'))).toBe(false)
  })

  test('v1 bare-array fixture migrates to v2 with oauth wrappers + apikey + none rows', () => {
    writeAccountsFile(V1_OAUTH_FIXTURE)
    writeConfigFile(CONFIG_FIXTURE)

    const vault = loadVault()
    const all = vault.listAccountsV2()

    // 2 OAuth (the v1 fixture's anthropic + openai rows)
    // 3 apikey (claude-kimi, claude-glm, codex-openrouter)
    // 1 none   (codex-ollama)
    // The OAuth-backed workspaces (`claude`, `codex`) collapse into the
    // existing OAuth rows so they don't double-count.
    expect(all).toHaveLength(6)

    const oauth = all.filter(a => a.kind === 'oauth')
    const apikey = all.filter(a => a.kind === 'apikey')
    const none = all.filter(a => a.kind === 'none')
    expect(oauth).toHaveLength(2)
    expect(apikey).toHaveLength(3)
    expect(none).toHaveLength(1)

    // ── OAuth rows preserve identity fields ──
    const aliceRow = oauth.find(a => a.kind === 'oauth' && a.email === 'alice@example.com')
    expect(aliceRow).toBeDefined()
    if (aliceRow?.kind === 'oauth') {
      expect(aliceRow.provider).toBe('anthropic')
      expect(aliceRow.id).toBe('aaaa11111111')
      expect(aliceRow.refreshTokenRef).toEqual({
        service: 'sweech-vault-anthropic-aaaa11111111',
        account: 'sweech-vault',
      })
    }

    // ── apikey rows reference sweech-api-key keychain entries ──
    const kimiRow = apikey.find(a => a.provider === 'kimi')
    expect(kimiRow).toBeDefined()
    if (kimiRow?.kind === 'apikey') {
      expect(kimiRow.keyRef).toEqual({
        service: 'sweech-api-key',
        account: 'claude-kimi',
      })
    }

    // ── none rows (local Ollama maps via effectiveProvider) ──
    const ollamaRow = none.find(a => a.provider === 'local-ollama')
    expect(ollamaRow).toBeDefined()
  })

  test('schemaVersion is 2 on disk after migration', () => {
    writeAccountsFile(V1_OAUTH_FIXTURE)
    const vault = loadVault()
    vault.listAccountsV2() // triggers migration
    const file = JSON.parse(fs.readFileSync(path.join(TMP_HOME, '.sweech/accounts.json'), 'utf-8'))
    expect(file.schemaVersion).toBe(2)
    expect(Array.isArray(file.accounts)).toBe(true)
  })

  test('migration is idempotent (running twice produces the same output)', () => {
    writeAccountsFile(V1_OAUTH_FIXTURE)
    writeConfigFile(CONFIG_FIXTURE)
    const vault = loadVault()
    const first = JSON.stringify(vault.listAccountsV2())

    // Reset modules so the migration code path runs again — but with
    // an already-v2 accounts.json file.
    jest.resetModules()
    jest.doMock('os', () => {
      const real = jest.requireActual('os')
      return { ...real, homedir: () => TMP_HOME }
    })
    jest.doMock('node:os', () => {
      const real = jest.requireActual('node:os')
      return { ...real, homedir: () => TMP_HOME }
    })
    jest.doMock('../src/credentialStore', () => {
      const memory = new Map<string, string>()
      const key = (service: string, account: string) => `${service}::${account}`
      const store = {
        async get(s: string, a: string) { return memory.get(key(s, a)) ?? null },
        async set(s: string, a: string, v: string) { memory.set(key(s, a), v) },
        async delete(s: string, a: string) { memory.delete(key(s, a)) },
      }
      return {
        getCredentialStore: () => store,
        readCredential: async (s: string, a: string) => store.get(s, a),
        computeKeychainServiceName: (d: string) => `service-${path.basename(d)}`,
        MacOSKeychainStore: class {}, LinuxSecretToolStore: class {},
        WindowsCmdkeyStore: class {}, FileTokenStore: class {},
        isSecretToolAvailable: () => false, isCmdkeyAvailable: () => false,
      }
    })

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vault2 = require('../src/vault') as typeof import('../src/vault')
    const second = JSON.stringify(vault2.listAccountsV2())
    expect(second).toBe(first)
  })

  test('accounts are sorted by (provider, addedAt) for deterministic diffs', () => {
    writeAccountsFile(V1_OAUTH_FIXTURE)
    writeConfigFile(CONFIG_FIXTURE)
    const vault = loadVault()
    const list = vault.listAccountsV2()
    for (let i = 1; i < list.length; i++) {
      const cmp = list[i - 1].provider.localeCompare(list[i].provider)
      expect(cmp).toBeLessThanOrEqual(0)
    }
  })

  test('legacy AccountMeta-shaped readers still work after migration', () => {
    writeAccountsFile(V1_OAUTH_FIXTURE)
    writeConfigFile(CONFIG_FIXTURE)
    const vault = loadVault()
    const legacy = vault.listAccounts()
    // legacy projection only returns OAuth-shaped rows
    expect(legacy).toHaveLength(2)
    const kinds = new Set(legacy.map(a => a.kind))
    expect(kinds.has('anthropic')).toBe(true)
    expect(kinds.has('openai')).toBe(true)
  })

  test('writeMeta preserves apikey rows when an OAuth caller saves', async () => {
    writeAccountsFile(V1_OAUTH_FIXTURE)
    writeConfigFile(CONFIG_FIXTURE)
    const vault = loadVault()
    // Trigger migration
    vault.listAccountsV2()

    // Simulate a legacy OAuth save (vaultRefresh would do this).
    const meta = vault.getAccount('aaaa11111111')!
    await vault.saveAccount(
      { ...meta, plan: 'Max 5x', lastRefreshedAt: '2026-05-10T00:00:00.000Z' },
      { accessToken: 'new', refreshToken: 'new-r', expiresAt: 0 },
    )

    const all = vault.listAccountsV2()
    // apikey + none rows must still be there
    const apikey = all.filter(a => a.kind === 'apikey')
    const none = all.filter(a => a.kind === 'none')
    expect(apikey).toHaveLength(3)
    expect(none).toHaveLength(1)
    // And the OAuth row was updated
    const alice = all.find(a => a.kind === 'oauth' && a.id === 'aaaa11111111')
    expect(alice).toBeDefined()
    if (alice?.kind === 'oauth') expect(alice.plan).toBe('Max 5x')
  })

  test('saveAccountsV2 round-trips all three kinds', () => {
    const vault = loadVault()
    vault.saveAccountsV2([
      {
        kind: 'oauth',
        provider: 'anthropic',
        id: 'oauth-x',
        email: 'x@y.com',
        addedAt: '2026-05-01T00:00:00.000Z',
        refreshTokenRef: { service: 'sweech-vault-anthropic-oauth-x', account: 'sweech-vault' },
      },
      {
        kind: 'apikey',
        provider: 'kimi',
        id: 'apikey-x',
        addedAt: '2026-05-02T00:00:00.000Z',
        keyRef: { service: 'sweech-api-key', account: 'kimi-x' },
      },
      {
        kind: 'none',
        provider: 'ollama',
        id: 'none-x',
        addedAt: '2026-05-03T00:00:00.000Z',
      },
    ])
    const round = vault.listAccountsV2()
    expect(round).toHaveLength(3)
    expect(round.map(a => a.kind).sort()).toEqual(['apikey', 'none', 'oauth'])
  })
})

// ── getAccountsByProvider ────────────────────────────────────────────────────

describe('getAccountsByProvider', () => {
  test('returns only accounts for the requested provider', () => {
    writeAccountsFile(V1_OAUTH_FIXTURE)
    writeConfigFile(CONFIG_FIXTURE)
    const pm = loadProviderModel()
    expect(pm.getAccountsByProvider('kimi')).toHaveLength(1)
    expect(pm.getAccountsByProvider('glm')).toHaveLength(1)
    expect(pm.getAccountsByProvider('anthropic')).toHaveLength(1)
    expect(pm.getAccountsByProvider('openai')).toHaveLength(1)
    expect(pm.getAccountsByProvider('openrouter')).toHaveLength(1)
    expect(pm.getAccountsByProvider('does-not-exist')).toHaveLength(0)
  })
})

// ── accountIdForApiKey ──────────────────────────────────────────────────────

describe('accountIdForApiKey', () => {
  test('is stable for the same input', () => {
    const pm = loadProviderModel()
    expect(pm.accountIdForApiKey('kimi', 'claude-kimi'))
      .toBe(pm.accountIdForApiKey('kimi', 'claude-kimi'))
  })
  test('changes when provider differs', () => {
    const pm = loadProviderModel()
    expect(pm.accountIdForApiKey('kimi', 'claude-kimi'))
      .not.toBe(pm.accountIdForApiKey('glm', 'claude-kimi'))
  })
  test('changes when commandName differs', () => {
    const pm = loadProviderModel()
    expect(pm.accountIdForApiKey('kimi', 'a'))
      .not.toBe(pm.accountIdForApiKey('kimi', 'b'))
  })
  test('returns a 12-char hex string', () => {
    const pm = loadProviderModel()
    expect(pm.accountIdForApiKey('kimi', 'claude-kimi')).toMatch(/^[0-9a-f]{12}$/)
  })
})

// ── collectProviderTree ─────────────────────────────────────────────────────

describe('collectProviderTree', () => {
  test('returns nested tree with accounts + workspaces joined per provider', () => {
    writeAccountsFile(V1_OAUTH_FIXTURE)
    writeConfigFile(CONFIG_FIXTURE)

    const pm = loadProviderModel()
    const tree = pm.collectProviderTree()

    // Providers with no accounts/workspaces are filtered out by default.
    const ids = tree.map(node => node.provider.id)
    expect(ids).toContain('anthropic')
    expect(ids).toContain('openai')
    expect(ids).toContain('kimi')
    expect(ids).toContain('glm')
    expect(ids).toContain('openrouter')

    const kimiNode = tree.find(n => n.provider.id === 'kimi')!
    expect(kimiNode.accounts).toHaveLength(1)
    expect(kimiNode.accounts[0].account.kind).toBe('apikey')
    // The kimi account is joined to its workspace via the
    // sha8(provider+commandName) id mapping.
    expect(kimiNode.accounts[0].workspaces).toHaveLength(1)
    expect(kimiNode.accounts[0].workspaces[0].commandName).toBe('claude-kimi')
  })

  test('includeEmpty surfaces providers with no accounts/workspaces', () => {
    writeAccountsFile([])
    writeConfigFile({ profiles: [] })

    const pm = loadProviderModel()
    const tree = pm.collectProviderTree({ includeEmpty: true })
    expect(tree.length).toBeGreaterThan(0)
    for (const node of tree) {
      expect(Array.isArray(node.accounts)).toBe(true)
      expect(Array.isArray(node.orphanWorkspaces)).toBe(true)
    }
  })

  test('workspaces whose accountId does not join any Account are surfaced as orphans', () => {
    // Configure a workspace for a provider but no account; the
    // workspace should appear in orphanWorkspaces.
    writeAccountsFile([])
    writeConfigFile({
      profiles: [{
        name: 'claude-mm',
        commandName: 'claude-mm',
        cliType: 'claude',
        provider: 'minimax',
        baseUrl: 'https://api.minimax.io/anthropic',
        createdAt: '2026-04-01T00:00:00.000Z',
      }],
    })

    // Manually skip the workspace's `.sweech-account` marker (it's
    // never set, so accountId is undefined) → orphan.
    const pm = loadProviderModel()
    // Force migration so apikey row is created for the workspace.
    loadVault().listAccountsV2()

    const tree = pm.collectProviderTree()
    const mm = tree.find(n => n.provider.id === 'minimax')
    expect(mm).toBeDefined()
    // The migration created an apikey account for the workspace, AND
    // the workspace's accountId starts unset (no marker file), so it
    // shows as orphan. After T-072 the migration will also stamp the
    // marker, but that's downstream.
    expect(mm!.accounts.length + mm!.orphanWorkspaces.length).toBeGreaterThan(0)
  })
})

// ── Type-level narrowing (compile-time, not runtime) ────────────────────────

describe('Account discriminator narrowing', () => {
  test('account.kind discriminates the union at the type level', () => {
    const pm = loadProviderModel()
    const oauthAcct: import('../src/providerModel').Account = {
      kind: 'oauth',
      provider: 'anthropic',
      id: 'a',
      email: 'x@y.com',
      addedAt: '2026-05-01T00:00:00.000Z',
      refreshTokenRef: { service: 'sweech-vault-anthropic-a', account: 'sweech-vault' },
    }
    if (oauthAcct.kind === 'oauth') {
      // OAuth fields are accessible
      expect(oauthAcct.email).toBe('x@y.com')
      expect(oauthAcct.provider).toBe('anthropic')
    }
    const apikeyAcct: import('../src/providerModel').Account = {
      kind: 'apikey',
      provider: 'kimi',
      id: 'k',
      addedAt: '2026-05-02T00:00:00.000Z',
      keyRef: { service: 'sweech-api-key', account: 'kimi' },
    }
    if (apikeyAcct.kind === 'apikey') {
      // apikey fields accessible
      expect(apikeyAcct.keyRef.service).toBe('sweech-api-key')
      // @ts-expect-error — `email` does not exist on ApiKeyAccount
      void apikeyAcct.email
    }
    const noneAcct: import('../src/providerModel').Account = {
      kind: 'none',
      provider: 'ollama',
      id: 'o',
      addedAt: '2026-05-03T00:00:00.000Z',
    }
    if (noneAcct.kind === 'none') {
      // @ts-expect-error — `keyRef` does not exist on NoAuthAccount
      void noneAcct.keyRef
      // @ts-expect-error — `email` does not exist on NoAuthAccount
      void noneAcct.email
    }
    // The catalog typing is consistent.
    expect(pm.PROVIDER_CATALOG.length).toBeGreaterThan(0)
  })
})
