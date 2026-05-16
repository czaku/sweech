/**
 * Account vault — central storage for OAuth identities, decoupled from
 * workspace (profile) directories.
 *
 * Model:
 *   Account  = identity (an email + tokens) with `kind` 'anthropic' | 'openai'.
 *   Workspace = a profile directory (~/.claude*, ~/.codex*) with a CLI type.
 *   Assignment = which account is currently mounted into which workspace.
 *
 * Storage:
 *   ~/.sweech/accounts.json           — array of AccountMeta (no secrets)
 *   keychain `sweech-vault-<kind>-<id>` — JSON-encoded secret blob
 *   ~/.<workspace>/.sweech-account    — text file with the active account id
 *
 * Secrets are persisted via getCredentialStore() so the same code works on
 * macOS Keychain, Linux secret-tool, and Windows cmdkey + file fallback.
 */

import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { atomicWriteFileSync } from './atomicWrite'
import { getCredentialStore } from './credentialStore'

export type AccountKind = 'anthropic' | 'openai'
export type CliType = 'claude' | 'codex'

/** CLI types compatible with a given account kind. */
export function compatibleCliTypes(kind: AccountKind): CliType[] {
  return kind === 'anthropic' ? ['claude'] : ['codex']
}

/** Account kind compatible with a given CLI type. */
export function kindForCliType(cliType: string): AccountKind | null {
  if (cliType === 'claude') return 'anthropic'
  if (cliType === 'codex') return 'openai'
  return null
}

export interface AccountMeta {
  /** Stable id derived from kind + email — used as the directory key. */
  id: string
  kind: AccountKind
  email: string
  displayName?: string
  /** Anthropic accountUuid (claude) or codex account_id. */
  externalId?: string
  /** "Max 20x", "Max 5x", "pro", "plus", etc. */
  plan?: string
  /** Anthropic only — rate-limit tier as stored in keychain. */
  rateLimitTier?: string
  addedAt: string             // ISO
  lastRefreshedAt?: string    // ISO
  /** When the access token expires (ms epoch). */
  expiresAt?: number
  /** Latest known status: 'ok' | 'expired' | 'org_disabled' | 'unauthorized'. */
  status?: 'ok' | 'expired' | 'org_disabled' | 'unauthorized' | 'unknown'
}

/** Anthropic OAuth blob — matches what Claude Code stores in its keychain entry. */
export interface AnthropicSecret {
  accessToken: string
  refreshToken: string
  expiresAt: number
  subscriptionType?: string
  rateLimitTier?: string
}

/** Codex auth.json shape (preserved verbatim so swap is byte-identical). */
export interface OpenAISecret {
  OPENAI_API_KEY?: string | null
  auth_mode?: string
  tokens?: {
    access_token: string
    refresh_token: string
    id_token: string
    account_id?: string
  }
  last_refresh?: string
  [key: string]: unknown
}

export type AccountSecret = AnthropicSecret | OpenAISecret

// ── Paths ────────────────────────────────────────────────────────────────────

const SWEECH_DIR = path.join(os.homedir(), '.sweech')
const ACCOUNTS_FILE = path.join(SWEECH_DIR, 'accounts.json')

/** Marker file inside a workspace pointing at the active account id. */
export function workspaceMarkerPath(workspaceCommandName: string): string {
  return path.join(os.homedir(), `.${workspaceCommandName}`, '.sweech-account')
}

// ── Id derivation ────────────────────────────────────────────────────────────

/** Derive a stable account id from kind + email. */
export function idFor(kind: AccountKind, email: string): string {
  const normalized = `${kind}:${email.toLowerCase().trim()}`
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12)
}

function keychainService(kind: AccountKind, id: string): string {
  return `sweech-vault-${kind}-${id}`
}

const KEYCHAIN_ACCOUNT = 'sweech-vault'

// ── Metadata I/O ─────────────────────────────────────────────────────────────

function readMeta(): AccountMeta[] {
  try {
    const data = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function writeMeta(accounts: AccountMeta[]): void {
  fs.mkdirSync(SWEECH_DIR, { recursive: true, mode: 0o700 })
  atomicWriteFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2))
  try { fs.chmodSync(ACCOUNTS_FILE, 0o600) } catch {}
}

// ── Public API ───────────────────────────────────────────────────────────────

export function listAccounts(kind?: AccountKind): AccountMeta[] {
  const all = readMeta()
  return kind ? all.filter(a => a.kind === kind) : all
}

export function getAccount(id: string): AccountMeta | null {
  return readMeta().find(a => a.id === id) ?? null
}

export function findAccountByEmail(kind: AccountKind, email: string): AccountMeta | null {
  return getAccount(idFor(kind, email))
}

export async function getAccountSecret(id: string): Promise<AccountSecret | null> {
  const meta = getAccount(id)
  if (!meta) return null
  const store = getCredentialStore()
  const raw = await store.get(keychainService(meta.kind, meta.id), KEYCHAIN_ACCOUNT)
  if (!raw) return null
  try { return JSON.parse(raw) as AccountSecret } catch { return null }
}

export async function saveAccount(meta: AccountMeta, secret: AccountSecret): Promise<void> {
  const all = readMeta()
  const idx = all.findIndex(a => a.id === meta.id)
  if (idx >= 0) all[idx] = meta
  else all.push(meta)
  writeMeta(all)
  const store = getCredentialStore()
  await store.set(keychainService(meta.kind, meta.id), KEYCHAIN_ACCOUNT, JSON.stringify(secret))
}

/** Update only the metadata side of an account (no secret rewrite). */
export function updateAccountMeta(id: string, patch: Partial<AccountMeta>): AccountMeta | null {
  const all = readMeta()
  const idx = all.findIndex(a => a.id === id)
  if (idx < 0) return null
  all[idx] = { ...all[idx], ...patch, id: all[idx].id, kind: all[idx].kind }
  writeMeta(all)
  return all[idx]
}

export async function removeAccount(id: string): Promise<boolean> {
  const all = readMeta()
  const meta = all.find(a => a.id === id)
  if (!meta) return false
  writeMeta(all.filter(a => a.id !== id))
  try {
    await getCredentialStore().delete(keychainService(meta.kind, meta.id), KEYCHAIN_ACCOUNT)
  } catch {}
  return true
}

// ── Workspace assignment markers ─────────────────────────────────────────────

export function getActiveAccountId(workspaceCommandName: string): string | null {
  try {
    const raw = fs.readFileSync(workspaceMarkerPath(workspaceCommandName), 'utf-8').trim()
    return raw || null
  } catch {
    return null
  }
}

export function setActiveAccountId(workspaceCommandName: string, accountId: string | null): void {
  const file = workspaceMarkerPath(workspaceCommandName)
  if (accountId === null) {
    try { fs.unlinkSync(file) } catch {}
    return
  }
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  atomicWriteFileSync(file, accountId)
  try { fs.chmodSync(file, 0o600) } catch {}
}

/** Return all workspaces in which the given account is currently mounted. */
export function findWorkspacesUsingAccount(
  accountId: string,
  workspaces: Array<{ commandName: string }>,
): string[] {
  return workspaces
    .filter(w => getActiveAccountId(w.commandName) === accountId)
    .map(w => w.commandName)
}
