/**
 * Vault import — discover credentials in existing workspace directories
 * (~/.claude*, ~/.codex*) and copy them into the central account vault.
 *
 * Designed to be idempotent: re-running import on the same workspaces
 * updates metadata (lastRefreshedAt, plan, etc.) without duplicating
 * accounts. Dedupes by `idFor(kind, email)` so multiple workspaces
 * mounting the same identity collapse into a single vault entry.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { isMacOS } from './platform'
import { computeKeychainServiceName } from './credentialStore'
import {
  AccountKind,
  AccountMeta,
  AnthropicSecret,
  OpenAISecret,
  findAccountByEmail,
  idFor,
  saveAccount,
  setActiveAccountId,
} from './vault'

export interface ImportedWorkspace {
  commandName: string         // e.g. "claude", "codex-pole"
  cliType: 'claude' | 'codex'
  configDir: string
}

export interface ImportResult {
  workspace: ImportedWorkspace
  outcome: 'imported' | 'updated' | 'already-mounted' | 'no-credentials' | 'error'
  accountId?: string
  email?: string
  error?: string
}

// ── Workspace discovery ──────────────────────────────────────────────────────

/**
 * Enumerate all candidate workspace directories on disk: ~/.claude*, ~/.codex*.
 * Filters out the ~/.claude-worktrees and similar non-workspace dirs.
 */
export function discoverWorkspaces(): ImportedWorkspace[] {
  const home = os.homedir()
  const result: ImportedWorkspace[] = []
  let entries: string[] = []
  try { entries = fs.readdirSync(home) } catch { return [] }

  for (const name of entries) {
    if (!/^\.(claude|codex)([^a-z].*)?$/i.test(name) && !/^\.(claude|codex)(-.*)?$/.test(name)) continue
    if (name === '.claude-worktrees') continue
    const full = path.join(home, name)
    try {
      if (!fs.statSync(full).isDirectory()) continue
    } catch { continue }

    if (/^\.claude(-.*)?$/.test(name)) {
      result.push({ commandName: name.slice(1), cliType: 'claude', configDir: full })
    } else if (/^\.codex(-.*)?$/.test(name)) {
      result.push({ commandName: name.slice(1), cliType: 'codex', configDir: full })
    }
  }
  return result.sort((a, b) => a.commandName.localeCompare(b.commandName))
}

// ── Claude extraction ────────────────────────────────────────────────────────

interface ClaudeOauthBlob {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  subscriptionType?: string
  rateLimitTier?: string
}

function readClaudeKeychain(configDir: string): ClaudeOauthBlob | null {
  if (!isMacOS()) return null
  const service = computeKeychainServiceName(configDir)
  try {
    const username = process.env.USER || os.userInfo().username
    const raw = execFileSync('security', [
      'find-generic-password', '-a', username, '-s', service, '-w',
    ], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const blob = parsed.claudeAiOauth ?? parsed
    if (!blob?.accessToken) return null
    return blob as ClaudeOauthBlob
  } catch {
    return null
  }
}

interface ClaudeIdentity {
  email?: string
  displayName?: string
  accountUuid?: string
  billingType?: string
  rateLimitTier?: string
}

function readClaudeIdentity(configDir: string): ClaudeIdentity {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(configDir, '.claude.json'), 'utf-8'))
    const oa = data.oauthAccount ?? {}
    return {
      email: oa.emailAddress,
      displayName: oa.displayName,
      accountUuid: oa.accountUuid,
      billingType: oa.billingType,
      rateLimitTier: oa.rateLimitTier,
    }
  } catch {
    return {}
  }
}

function planLabel(rateLimitTier?: string, billingType?: string): string | undefined {
  if (rateLimitTier?.includes('max_20x')) return 'Max 20x'
  if (rateLimitTier?.includes('max_5x')) return 'Max 5x'
  if (rateLimitTier?.includes('max')) return 'Max'
  if (rateLimitTier?.includes('pro')) return 'Pro'
  if (billingType === 'max') return 'Max'
  return billingType
}

// ── Codex extraction ─────────────────────────────────────────────────────────

interface CodexAuthFile {
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

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split('.')
    if (parts.length < 2) return null
    const padded = parts[1] + '='.repeat((4 - (parts[1].length % 4)) % 4)
    const json = Buffer.from(padded, 'base64url').toString('utf-8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

function readCodexAuth(configDir: string): CodexAuthFile | null {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(configDir, 'auth.json'), 'utf-8')) as CodexAuthFile
    return data
  } catch {
    return null
  }
}

function extractCodexEmail(auth: CodexAuthFile): { email?: string; expiresAt?: number; plan?: string } {
  const idToken = auth.tokens?.id_token
  if (!idToken) return {}
  const payload = decodeJwtPayload(idToken)
  if (!payload) return {}
  const profile = (payload['https://api.openai.com/profile'] as Record<string, unknown> | undefined) ?? {}
  const authClaim = (payload['https://api.openai.com/auth'] as Record<string, unknown> | undefined) ?? {}
  const email = (payload.email as string | undefined)
    ?? (profile.email as string | undefined)
  const expSec = payload.exp as number | undefined
  const plan = (authClaim.chatgpt_plan_type as string | undefined)
    ?? (authClaim.plan_type as string | undefined)
  return { email, expiresAt: expSec ? expSec * 1000 : undefined, plan }
}

async function importCodexWorkspace(ws: ImportedWorkspace): Promise<ImportResult> {
  const auth = readCodexAuth(ws.configDir)
  if (!auth || (!auth.tokens && !auth.OPENAI_API_KEY)) {
    return { workspace: ws, outcome: 'no-credentials' }
  }
  const { email, expiresAt, plan } = extractCodexEmail(auth)
  const fallbackEmail = email || `${ws.commandName}@unknown.local`
  const kind: AccountKind = 'openai'
  const id = idFor(kind, fallbackEmail)
  const existing = findAccountByEmail(kind, fallbackEmail)
  const meta: AccountMeta = {
    id,
    kind,
    email: fallbackEmail,
    externalId: auth.tokens?.account_id,
    plan: plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : undefined,
    addedAt: existing?.addedAt ?? new Date().toISOString(),
    lastRefreshedAt: new Date().toISOString(),
    expiresAt,
    status: 'ok',
  }
  const secret: OpenAISecret = auth as OpenAISecret
  await saveAccount(meta, secret)
  setActiveAccountId(ws.commandName, id)
  return {
    workspace: ws,
    outcome: existing ? 'updated' : 'imported',
    accountId: id,
    email: fallbackEmail,
  }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export async function importWorkspaces(workspaces?: ImportedWorkspace[]): Promise<ImportResult[]> {
  const list = workspaces ?? discoverWorkspaces()
  const results: ImportResult[] = []
  for (const ws of list) {
    try {
      if (ws.cliType === 'claude') {
        const blob = readClaudeKeychain(ws.configDir)
        if (!blob) { results.push({ workspace: ws, outcome: 'no-credentials' }); continue }
        const ident = readClaudeIdentity(ws.configDir)
        const email = ident.email || `${ws.commandName}@unknown.local`
        const kind: AccountKind = 'anthropic'
        const id = idFor(kind, email)
        const existing = findAccountByEmail(kind, email)
        const meta: AccountMeta = {
          id,
          kind,
          email,
          displayName: ident.displayName,
          externalId: ident.accountUuid,
          plan: planLabel(blob.rateLimitTier ?? ident.rateLimitTier, ident.billingType),
          rateLimitTier: blob.rateLimitTier ?? ident.rateLimitTier,
          addedAt: existing?.addedAt ?? new Date().toISOString(),
          lastRefreshedAt: new Date().toISOString(),
          expiresAt: blob.expiresAt,
          status: 'ok',
        }
        const secret: AnthropicSecret = {
          accessToken: blob.accessToken,
          refreshToken: blob.refreshToken ?? '',
          expiresAt: blob.expiresAt ?? 0,
          subscriptionType: blob.subscriptionType,
          rateLimitTier: blob.rateLimitTier ?? ident.rateLimitTier,
        }
        await saveAccount(meta, secret)
        setActiveAccountId(ws.commandName, id)
        results.push({ workspace: ws, outcome: existing ? 'updated' : 'imported', accountId: id, email })
      } else {
        results.push(await importCodexWorkspace(ws))
      }
    } catch (err) {
      results.push({ workspace: ws, outcome: 'error', error: err instanceof Error ? err.message : String(err) })
    }
  }
  return results
}
