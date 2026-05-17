/**
 * Provider / Account / Workspace model (T-070, wave-6 foundation).
 *
 * Before wave-6 sweech had two parallel credential stores:
 *   1. OAuth identities — `~/.sweech/accounts.json` (the vault) + keychain
 *      under `sweech-vault-<kind>-<id>`. See `src/vault.ts`.
 *   2. API-keys — one per-workspace keychain entry under
 *      `sweech-api-key:<commandName>`. See `src/config.ts`.
 *
 * Wave-6 unifies these behind a single tree:
 *
 *   Provider  (anthropic, openai, kimi, glm, dashscope, ollama, …)
 *    └── Account (oauth | apikey | none)
 *         └── Workspace (mount point ~/.<commandName>/)
 *
 * The Account discriminator preserves the existing keychain layout —
 * API-key accounts hold a `keyRef` that points at the original
 * `sweech-api-key:<commandName>` entry rather than duplicating the secret.
 *
 * This module is intentionally **read-only** in T-070: it surfaces the
 * unified tree to display callers (T-071 CLI, T-073 SwiftBar UI). The
 * write paths (vault.ts, config.ts) keep their current API surface so
 * T-070 is a strictly additive landing.
 */

import * as crypto from 'node:crypto'
import { ConfigManager, ProfileConfig, KEYCHAIN_SERVICE } from './config'
import { effectiveProvider, PROVIDERS } from './providers'
import { listAccountsV2 } from './vault'

// ── Provider catalog ─────────────────────────────────────────────────────────

/**
 * Authentication shape a provider supports.
 *
 *   subscription — OAuth-backed plan (Anthropic Max, ChatGPT Pro, Kimi Coding…)
 *   apikey       — bring-your-own key (most third-party vendors)
 *   local        — no auth required (Ollama on localhost, LiteLLM proxies…)
 */
export type ProviderKind = 'subscription' | 'apikey' | 'local'

/** CLI binaries a provider can drive. Mirrors `src/clis.ts`. */
export type CliType = 'claude' | 'codex' | 'kimi'

/**
 * Top-level entry in the provider catalog.
 *
 * `id` is the canonical short key sweech writes into `profile.provider`
 * (e.g. `'anthropic'`, `'glm'`, `'local-proxy'`). It MUST match the
 * strings returned by `effectiveProvider()` so the tree can be joined
 * without translation tables.
 */
export interface Provider {
  /** Stable key — also used as `accounts.json.entry.provider`. */
  id: string
  /** Programmatic short name (lower-case, no spaces). */
  name: string
  /** Display label for UIs (e.g. 'Anthropic', 'MiniMax'). */
  displayName: string
  /** What kind of credentials this provider accepts. */
  kind: ProviderKind
  /** Which CLI binaries can talk to this provider. */
  supportedCliTypes: CliType[]
  /** True when this provider can be authenticated via sweech's OAuth flow. */
  oauthSupported: boolean
}

// ── Account discriminated union ──────────────────────────────────────────────

/** Reference to a credential stored in a keychain backend. */
export interface KeychainRef {
  /** Keychain service name (e.g. 'sweech-api-key', 'sweech-vault-anthropic-<id>'). */
  service: string
  /** Keychain account name (e.g. '<commandName>'). */
  account: string
}

/** OAuth identity at Anthropic or OpenAI. Mirrors current `vault.ts` AccountMeta. */
export interface OAuthAccount {
  kind: 'oauth'
  /** Provider id — always 'anthropic' or 'openai' in wave-6. */
  provider: 'anthropic' | 'openai'
  /** Stable id derived from kind + email (+ optional orgId). */
  id: string
  email: string
  displayName?: string
  /** Anthropic accountUuid or OpenAI account_id. */
  externalId?: string
  /** OAuth org/workspace uuid — disambiguates same email across orgs. */
  orgId?: string
  orgName?: string
  /** Subscription plan label (e.g. 'Max 20x', 'Pro'). */
  plan?: string
  /** Anthropic only — rate-limit tier string from keychain. */
  rateLimitTier?: string
  addedAt: string
  lastRefreshedAt?: string
  /** Access token expiry (ms epoch). */
  expiresAt?: number
  status?: 'ok' | 'expired' | 'org_disabled' | 'unauthorized' | 'unknown'
  /** Reference to the refresh-token secret in keychain. */
  refreshTokenRef: KeychainRef
}

/** API-key account at a provider (Kimi, GLM, MiniMax, OpenRouter, …). */
export interface ApiKeyAccount {
  kind: 'apikey'
  /** Provider id (e.g. 'kimi', 'glm', 'dashscope'). */
  provider: string
  /** Stable id — `sha8(provider + ':' + commandName)`. */
  id: string
  /** Human label for the account, optional. */
  label?: string
  addedAt: string
  /** Reference to the API-key secret in keychain. */
  keyRef: KeychainRef
}

/** Local endpoint with no auth (Ollama on localhost, LiteLLM proxies, …). */
export interface NoAuthAccount {
  kind: 'none'
  /** Provider id (e.g. 'ollama', 'local-proxy', 'local-ollama'). */
  provider: string
  /** Stable id — `sha8(provider + ':' + commandName)`. */
  id: string
  /** Human label, e.g. 'Ollama 11434'. */
  label?: string
  addedAt: string
}

/**
 * Account discriminator — narrows on `account.kind`.
 *
 *   if (a.kind === 'oauth')  → OAuthAccount   (email, expiresAt, plan, …)
 *   if (a.kind === 'apikey') → ApiKeyAccount  (keyRef, label, …)
 *   if (a.kind === 'none')   → NoAuthAccount  (label, …)
 */
export type Account = OAuthAccount | ApiKeyAccount | NoAuthAccount

// ── Workspace ────────────────────────────────────────────────────────────────

/** Mount point — `~/.<commandName>/`. */
export interface Workspace {
  /** Directory suffix without the leading dot (e.g. 'claude', 'codex-ted'). */
  commandName: string
  /** CLI binary the workspace drives. */
  cliType: CliType
  /** Provider id the workspace is configured against. */
  providerId: string
  /** Active account id (resolved from `accounts.json` + workspace marker). */
  accountId?: string
  /** Absolute path to the workspace dir (`~/.<commandName>`). */
  configDir: string
  /** Symlink master profile, if any (e.g. 'claude' for 'claude-pole'). */
  sharedWith?: string
  /** Effective baseUrl (after provider/profile override resolution). */
  baseUrl?: string
  /** Active model id for this workspace. */
  model?: string
}

// ── Provider catalog ─────────────────────────────────────────────────────────

const KIMI_CLI_PROVIDERS = new Set(['kimi', 'kimi-coding'])

/**
 * Map a legacy `providers.ts` `compatibility` array to the wave-6
 * `supportedCliTypes` shape. Kimi is treated as a first-class cliType.
 */
function supportedCliTypesFor(name: string, compat: readonly string[]): CliType[] {
  const out = new Set<CliType>()
  for (const c of compat) {
    if (c === 'claude' || c === 'codex' || c === 'kimi') out.add(c)
  }
  if (KIMI_CLI_PROVIDERS.has(name)) out.add('kimi')
  return Array.from(out)
}

/**
 * Synthetic entries for providers that only surface via
 * `effectiveProvider()` host-matching (no entry in `PROVIDERS`).
 * Keeping them here means the unified tree can present them in the
 * Providers section even when no workspace is yet configured.
 */
const SYNTHETIC_PROVIDERS: Provider[] = [
  {
    id: 'gemini',
    name: 'gemini',
    displayName: 'Google Gemini',
    kind: 'apikey',
    supportedCliTypes: ['codex'],
    oauthSupported: false,
  },
  {
    id: 'groq',
    name: 'groq',
    displayName: 'Groq',
    kind: 'apikey',
    supportedCliTypes: ['codex'],
    oauthSupported: false,
  },
  {
    id: 'nvidia',
    name: 'nvidia',
    displayName: 'NVIDIA',
    kind: 'apikey',
    supportedCliTypes: ['codex'],
    oauthSupported: false,
  },
  {
    id: 'ollama-cloud',
    name: 'ollama-cloud',
    displayName: 'Ollama Cloud',
    kind: 'apikey',
    supportedCliTypes: ['claude', 'codex'],
    oauthSupported: false,
  },
  {
    id: 'local-ollama',
    name: 'local-ollama',
    displayName: 'Ollama (Local)',
    kind: 'local',
    supportedCliTypes: ['claude', 'codex'],
    oauthSupported: false,
  },
  {
    id: 'local-proxy',
    name: 'local-proxy',
    displayName: 'Local Proxy',
    kind: 'local',
    supportedCliTypes: ['claude', 'codex'],
    oauthSupported: false,
  },
  {
    id: 'xortron',
    name: 'xortron',
    displayName: 'Xortron',
    kind: 'local',
    supportedCliTypes: ['claude', 'codex'],
    oauthSupported: false,
  },
]

/**
 * Map a `PROVIDERS[name]` entry to a wave-6 Provider.
 *
 * `kind` is derived from authOptional + name:
 *   - `authOptional` → local
 *   - 'anthropic' or 'openai' → subscription (OAuth-backed)
 *   - everything else → apikey (BYO key)
 */
function fromLegacyProvider(name: string, p: typeof PROVIDERS[string]): Provider {
  let kind: ProviderKind
  if (p.authOptional) kind = 'local'
  else if (name === 'anthropic' || name === 'openai') kind = 'subscription'
  else kind = 'apikey'

  const oauthSupported = name === 'anthropic' || name === 'openai' || name === 'kimi-coding'

  return {
    id: name,
    name,
    displayName: p.displayName,
    kind,
    supportedCliTypes: supportedCliTypesFor(name, p.compatibility),
    oauthSupported,
  }
}

/**
 * Canonical provider catalog. Joins `PROVIDERS` from `src/providers.ts`
 * with the synthetic entries above (for hosts that only appear via
 * `effectiveProvider()` derivation).
 *
 * Deduplicated by `id` — synthetic entries don't shadow PROVIDERS keys.
 */
export const PROVIDER_CATALOG: Provider[] = (() => {
  const acc: Provider[] = []
  const seen = new Set<string>()
  for (const [name, p] of Object.entries(PROVIDERS)) {
    if (name === 'custom') continue // not a real upstream provider
    const entry = fromLegacyProvider(name, p)
    acc.push(entry)
    seen.add(entry.id)
  }
  for (const synth of SYNTHETIC_PROVIDERS) {
    if (seen.has(synth.id)) continue
    acc.push(synth)
    seen.add(synth.id)
  }
  return acc
})()

// ── Lookups ──────────────────────────────────────────────────────────────────

/**
 * Look up a Provider by its canonical id. Returns `undefined` when the
 * id isn't in the catalog — e.g. an old provider tag that has since
 * been removed.
 */
export function getProviderById(id: string): Provider | undefined {
  return PROVIDER_CATALOG.find(p => p.id === id)
}

/**
 * All providers whose `supportedCliTypes` includes the requested CLI.
 */
export function getProvidersForCli(cliType: CliType): Provider[] {
  return PROVIDER_CATALOG.filter(p => p.supportedCliTypes.includes(cliType))
}

/**
 * Stable short-id derivation for non-OAuth accounts.
 *
 * `provider:commandName` is the lookup tuple used by `migrateV1ToV2()`
 * when it walks the workspace list — every workspace gets exactly one
 * Account, identified by this hash.
 */
export function accountIdForApiKey(providerId: string, commandName: string): string {
  return crypto
    .createHash('sha256')
    .update(`${providerId}:${commandName}`)
    .digest('hex')
    .slice(0, 12)
}

/**
 * All Accounts whose `provider` field matches the requested provider id.
 *
 * Reads from `loadAccountsV2()` so both OAuth and API-key accounts are
 * surfaced. Use this — not the legacy `vault.listAccounts()` — when
 * you need the unified view.
 */
export function getAccountsByProvider(providerId: string): Account[] {
  return listAccountsV2().filter(a => a.provider === providerId)
}

// ── Workspace discovery ──────────────────────────────────────────────────────

/** Convert a ConfigManager `ProfileConfig` into a wave-6 `Workspace`. */
export function workspaceFromProfile(p: ProfileConfig, accountId?: string): Workspace {
  const effective = effectiveProvider(p.provider, p.baseUrl)
  const cliType = (p.cliType === 'codex' || p.cliType === 'kimi') ? (p.cliType as CliType) : 'claude'
  const configDir = `${require('os').homedir()}/.${p.commandName}`
  return {
    commandName: p.commandName,
    cliType,
    providerId: effective || p.provider,
    accountId,
    configDir,
    sharedWith: p.sharedWith,
    baseUrl: p.baseUrl,
    model: p.model,
  }
}

/** Read all workspaces from disk. */
export function listWorkspaces(): Workspace[] {
  let config: ConfigManager
  try { config = new ConfigManager() } catch { return [] }
  let profiles: ProfileConfig[]
  try { profiles = config.getProfiles() } catch { return [] }
  // Resolve the active account per workspace via the `.sweech-account`
  // marker. Lazy-imported to keep this module free of vault.ts cycles
  // beyond the listAccountsV2 dependency above.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getActiveAccountId } = require('./vault') as typeof import('./vault')

  // For non-OAuth providers the marker is rarely set today — migration
  // creates the apikey/none account row but workspaces only stamp the
  // `.sweech-account` file when explicitly assigned. Fall back to the
  // deterministic `sha8(provider+commandName)` derivation so the tree
  // join works out of the box for fresh post-migration installs.
  return profiles.map(p => {
    const markerId = getActiveAccountId(p.commandName)
    const eff = effectiveProvider(p.provider, p.baseUrl) || p.provider
    const isOAuthProvider = eff === 'anthropic' || eff === 'openai'
    const accountId = markerId
      ?? (isOAuthProvider ? undefined : accountIdForApiKey(eff, p.commandName))
    return workspaceFromProfile(p, accountId ?? undefined)
  })
}

// ── Unified tree ─────────────────────────────────────────────────────────────

/** A Provider node in the unified tree, with its accounts and workspaces nested. */
export interface ProviderTreeNode {
  provider: Provider
  accounts: AccountTreeNode[]
  /**
   * Workspaces whose `providerId` matches but whose `accountId` could
   * not be joined to any Account row (orphans). Kept around so the
   * display surface can flag them as "needs assignment".
   */
  orphanWorkspaces: Workspace[]
}

/** An Account node in the unified tree, with its workspaces nested. */
export interface AccountTreeNode {
  account: Account
  workspaces: Workspace[]
}

export interface CollectOptions {
  /** When true, providers with no accounts and no workspaces are kept. */
  includeEmpty?: boolean
}

/**
 * Join Provider × Account × Workspace into a single nested tree.
 *
 * This is the canonical helper every display surface should use —
 * `sweech accounts list`, SwiftBar's VaultView, JSON exports, etc.
 * No surface should re-implement the join.
 */
export function collectProviderTree(opts: CollectOptions = {}): ProviderTreeNode[] {
  const accounts = listAccountsV2()
  const workspaces = listWorkspaces()

  const result: ProviderTreeNode[] = []
  for (const provider of PROVIDER_CATALOG) {
    const provAccounts = accounts.filter(a => a.provider === provider.id)
    const provWorkspaces = workspaces.filter(w => w.providerId === provider.id)

    const accountNodes: AccountTreeNode[] = provAccounts.map(account => ({
      account,
      workspaces: provWorkspaces.filter(w => w.accountId === account.id),
    }))

    const accountIds = new Set(provAccounts.map(a => a.id))
    const orphanWorkspaces = provWorkspaces.filter(
      w => !w.accountId || !accountIds.has(w.accountId),
    )

    if (!opts.includeEmpty && accountNodes.length === 0 && orphanWorkspaces.length === 0) {
      continue
    }

    result.push({ provider, accounts: accountNodes, orphanWorkspaces })
  }
  return result
}
