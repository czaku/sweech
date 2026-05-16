/**
 * Workspace ← Account assignment.
 *
 * Writes a vault-stored account's credentials into a workspace directory so
 * the underlying CLI (claude or codex) picks them up on next launch.
 *
 * Compatibility:
 *   anthropic account → claude workspace only
 *   openai account    → codex workspace only
 *
 * Side effects per CLI:
 *   claude:
 *     - rewrite keychain entry `Claude Code-credentials[-<dirhash>]` with the
 *       vault's accessToken/refreshToken/expiresAt/subscriptionType/rateLimitTier
 *     - patch <dir>/.claude.json oauthAccount block so the running CLI banner
 *       displays the right identity
 *   codex:
 *     - overwrite <dir>/auth.json with the vault's stored auth contents
 *
 * Also writes the `.sweech-account` marker so later reads know which vault
 * entry is mounted.
 */

import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'
import { atomicWriteFileSync } from './atomicWrite'
import { computeKeychainServiceName, getCredentialStore } from './credentialStore'
import { isMacOS } from './platform'
import {
  AccountKind,
  AnthropicSecret,
  CliType,
  OpenAISecret,
  getAccount,
  getAccountSecret,
  kindForCliType,
  setActiveAccountId,
} from './vault'

export interface AssignError {
  ok: false
  reason: string
}

export interface AssignSuccess {
  ok: true
  workspaceCommandName: string
  accountId: string
  email: string
}

export type AssignResult = AssignSuccess | AssignError

export interface Workspace {
  commandName: string  // 'claude', 'codex-pole', etc — directory suffix
  cliType: CliType
  configDir: string    // ~/.<commandName>
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function assignAccountToWorkspace(
  ws: Workspace,
  accountId: string,
): Promise<AssignResult> {
  const meta = getAccount(accountId)
  if (!meta) return { ok: false, reason: `Account ${accountId} not found in vault` }

  const expectedKind = kindForCliType(ws.cliType)
  if (!expectedKind) {
    return { ok: false, reason: `Workspace ${ws.commandName} has unsupported cliType=${ws.cliType}` }
  }
  if (meta.kind !== expectedKind) {
    return {
      ok: false,
      reason: `Incompatible: account ${meta.email} is ${meta.kind} but workspace ${ws.commandName} expects ${expectedKind}`,
    }
  }

  const secret = await getAccountSecret(accountId)
  if (!secret) return { ok: false, reason: `No credentials stored for ${meta.email}` }

  try {
    if (ws.cliType === 'claude') {
      await writeClaudeCredentials(ws.configDir, secret as AnthropicSecret, meta)
    } else {
      writeCodexCredentials(ws.configDir, secret as OpenAISecret)
    }
  } catch (err) {
    return { ok: false, reason: `Failed to write credentials: ${(err as Error).message}` }
  }

  setActiveAccountId(ws.commandName, accountId)
  return { ok: true, workspaceCommandName: ws.commandName, accountId, email: meta.email }
}

// ── Claude: keychain + .claude.json ─────────────────────────────────────────

async function writeClaudeCredentials(
  configDir: string,
  secret: AnthropicSecret,
  meta: { email: string; externalId?: string; rateLimitTier?: string },
): Promise<void> {
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 })
  const service = computeKeychainServiceName(configDir)
  const payload = JSON.stringify({
    claudeAiOauth: {
      accessToken: secret.accessToken,
      refreshToken: secret.refreshToken,
      expiresAt: secret.expiresAt,
      subscriptionType: secret.subscriptionType,
      rateLimitTier: secret.rateLimitTier ?? meta.rateLimitTier,
      scopes: ['user:inference', 'user:profile'],
    },
  })
  const user = username()
  if (isMacOS()) {
    // macOS: execFile against `security` — no shell, args passed as argv.
    execFileSync(
      'security',
      ['add-generic-password', '-U', '-a', user, '-s', service, '-w', payload],
      { stdio: 'ignore' },
    )
  } else {
    // Other platforms: cross-platform store; claude reads .credentials.json.
    await getCredentialStore().set(service, user, payload)
  }

  // Mirror to .credentials.json (claude on non-macOS reads this; also useful
  // as a backup on macOS so refresh tooling can see the active token).
  const credPath = path.join(configDir, '.credentials.json')
  try {
    atomicWriteFileSync(credPath, JSON.stringify(JSON.parse(payload), null, 2))
    fs.chmodSync(credPath, 0o600)
  } catch {}

  // Patch oauthAccount in .claude.json so claude's banner shows the right
  // identity (and so sweech's TUI picks it up without a live refresh).
  patchClaudeJson(configDir, {
    emailAddress: meta.email,
    accountUuid: meta.externalId,
    rateLimitTier: secret.rateLimitTier ?? meta.rateLimitTier,
    billingType: secret.subscriptionType,
  })
}

function username(): string {
  return process.env.USER || os.userInfo().username
}

interface ClaudeJsonPatch {
  emailAddress?: string
  accountUuid?: string
  rateLimitTier?: string
  billingType?: string
}

function patchClaudeJson(configDir: string, patch: ClaudeJsonPatch): void {
  const file = path.join(configDir, '.claude.json')
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    // missing or unreadable — create fresh
  }
  const existing = (data.oauthAccount as Record<string, unknown> | undefined) ?? {}
  data.oauthAccount = {
    ...existing,
    ...(patch.emailAddress !== undefined ? { emailAddress: patch.emailAddress } : {}),
    ...(patch.accountUuid !== undefined ? { accountUuid: patch.accountUuid } : {}),
    ...(patch.rateLimitTier !== undefined ? { rateLimitTier: patch.rateLimitTier } : {}),
    ...(patch.billingType !== undefined ? { billingType: patch.billingType } : {}),
  }
  try {
    atomicWriteFileSync(file, JSON.stringify(data, null, 2))
    fs.chmodSync(file, 0o600)
  } catch {}
}

// ── Codex: auth.json ─────────────────────────────────────────────────────────

function writeCodexCredentials(configDir: string, secret: OpenAISecret): void {
  fs.mkdirSync(configDir, { recursive: true, mode: 0o700 })
  const file = path.join(configDir, 'auth.json')
  atomicWriteFileSync(file, JSON.stringify(secret, null, 2))
  try { fs.chmodSync(file, 0o600) } catch {}
}

// ── Helper: kind/cliType compatibility ──────────────────────────────────────

export function canAssign(accountKind: AccountKind, cliType: CliType): boolean {
  return kindForCliType(cliType) === accountKind
}
