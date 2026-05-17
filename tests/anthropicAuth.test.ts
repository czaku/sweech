/**
 * Tests for src/anthropicAuth.ts — Anthropic OAuth client ID resolver.
 *
 * Verifies the precedence chain:
 *   config.json oauth.anthropic.clientId > SWEECH_ANTHROPIC_CLIENT_ID >
 *   ANTHROPIC_CLIENT_ID > built-in default.
 *
 * SAFETY (PR-handoff incident, 2026-05-17):
 *   The previous version of this file did `fs.unlinkSync(CONFIG_PATH)` on
 *   the developer's REAL `~/.sweech/config.json` — see the `beforeAll` /
 *   `beforeEach` / `afterEach` hooks below. Any Jest interruption (Ctrl+C,
 *   --bail from another suite, watch-reload, OOM) between `beforeAll`
 *   and `afterAll` wiped the user's workspace + provider config.
 *
 *   This version redirects `os.homedir()` to a per-suite tmpdir so the
 *   tests CAN'T touch real state. Same pattern as `tests/vault.test.ts`:
 *   `jest.resetModules()` + `jest.doMock('os' / 'node:os', ...)` so
 *   downstream modules see the mocked homedir.
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'sweech-anthropic-auth-test-'))
const TMP_CONFIG_PATH = path.join(TMP_HOME, '.sweech', 'config.json')

let originalEnvSweech: string | undefined
let originalEnvLegacy: string | undefined

afterAll(() => {
  try { fs.rmSync(TMP_HOME, { recursive: true, force: true }) } catch {}
})

beforeEach(() => {
  // Fresh module graph so anthropicAuth re-resolves CONFIG_PATH under
  // the mocked homedir, and the client-id cache starts fresh.
  jest.resetModules()
  jest.doMock('os', () => {
    const real = jest.requireActual('os')
    return { ...real, homedir: () => TMP_HOME }
  })
  jest.doMock('node:os', () => {
    const real = jest.requireActual('node:os')
    return { ...real, homedir: () => TMP_HOME }
  })

  originalEnvSweech = process.env.SWEECH_ANTHROPIC_CLIENT_ID
  originalEnvLegacy = process.env.ANTHROPIC_CLIENT_ID
  delete process.env.SWEECH_ANTHROPIC_CLIENT_ID
  delete process.env.ANTHROPIC_CLIENT_ID

  // Each test starts with no config.json. Parent dir must exist for
  // tests that write fixtures.
  const parent = path.dirname(TMP_CONFIG_PATH)
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true, mode: 0o700 })
  if (fs.existsSync(TMP_CONFIG_PATH)) fs.unlinkSync(TMP_CONFIG_PATH)
})

afterEach(() => {
  if (originalEnvSweech === undefined) delete process.env.SWEECH_ANTHROPIC_CLIENT_ID
  else process.env.SWEECH_ANTHROPIC_CLIENT_ID = originalEnvSweech
  if (originalEnvLegacy === undefined) delete process.env.ANTHROPIC_CLIENT_ID
  else process.env.ANTHROPIC_CLIENT_ID = originalEnvLegacy
})

/**
 * Lazy-load the module so it picks up the mocked `os.homedir()` for
 * its module-level `CONFIG_PATH` binding.
 */
function loadAnthropicAuth() {
  return require('../src/anthropicAuth') as typeof import('../src/anthropicAuth')
}

describe('getAnthropicClientId', () => {
  it('returns the built-in default when nothing is set', () => {
    const m = loadAnthropicAuth()
    expect(m.getAnthropicClientId()).toBe(m.DEFAULT_ANTHROPIC_CLIENT_ID)
  })

  it('reads SWEECH_ANTHROPIC_CLIENT_ID when set', () => {
    const m = loadAnthropicAuth()
    process.env.SWEECH_ANTHROPIC_CLIENT_ID = 'sweech-env-id'
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe('sweech-env-id')
  })

  it('falls back to legacy ANTHROPIC_CLIENT_ID when SWEECH_ is unset', () => {
    const m = loadAnthropicAuth()
    process.env.ANTHROPIC_CLIENT_ID = 'legacy-env-id'
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe('legacy-env-id')
  })

  it('prefers SWEECH_ANTHROPIC_CLIENT_ID over legacy ANTHROPIC_CLIENT_ID', () => {
    const m = loadAnthropicAuth()
    process.env.SWEECH_ANTHROPIC_CLIENT_ID = 'sweech-env-id'
    process.env.ANTHROPIC_CLIENT_ID = 'legacy-env-id'
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe('sweech-env-id')
  })

  it('reads config.json oauth.anthropic.clientId when present', () => {
    const m = loadAnthropicAuth()
    fs.writeFileSync(
      TMP_CONFIG_PATH,
      JSON.stringify({ profiles: [], oauth: { anthropic: { clientId: 'config-id' } } }),
    )
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe('config-id')
  })

  it('config.json overrides SWEECH_ANTHROPIC_CLIENT_ID', () => {
    const m = loadAnthropicAuth()
    process.env.SWEECH_ANTHROPIC_CLIENT_ID = 'sweech-env-id'
    fs.writeFileSync(
      TMP_CONFIG_PATH,
      JSON.stringify({ profiles: [], oauth: { anthropic: { clientId: 'config-id' } } }),
    )
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe('config-id')
  })

  it('config.json overrides legacy ANTHROPIC_CLIENT_ID', () => {
    const m = loadAnthropicAuth()
    process.env.ANTHROPIC_CLIENT_ID = 'legacy-env-id'
    fs.writeFileSync(
      TMP_CONFIG_PATH,
      JSON.stringify({ profiles: [], oauth: { anthropic: { clientId: 'config-id' } } }),
    )
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe('config-id')
  })

  it('ignores legacy bare-array config.json shape and falls through to env/default', () => {
    const m = loadAnthropicAuth()
    fs.writeFileSync(TMP_CONFIG_PATH, JSON.stringify([{ name: 'demo' }]))
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe(m.DEFAULT_ANTHROPIC_CLIENT_ID)
  })

  it('falls through to env/default when oauth block is empty', () => {
    const m = loadAnthropicAuth()
    fs.writeFileSync(TMP_CONFIG_PATH, JSON.stringify({ profiles: [], oauth: {} }))
    process.env.SWEECH_ANTHROPIC_CLIENT_ID = 'sweech-env-id'
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe('sweech-env-id')
  })

  it('falls through when oauth.anthropic.clientId is empty string', () => {
    const m = loadAnthropicAuth()
    fs.writeFileSync(
      TMP_CONFIG_PATH,
      JSON.stringify({ profiles: [], oauth: { anthropic: { clientId: '' } } }),
    )
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe(m.DEFAULT_ANTHROPIC_CLIENT_ID)
  })

  it('tolerates malformed config.json and falls back to default', () => {
    const m = loadAnthropicAuth()
    fs.writeFileSync(TMP_CONFIG_PATH, '{ not valid json')
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe(m.DEFAULT_ANTHROPIC_CLIENT_ID)
  })

  it('caches the resolved value within a process', () => {
    const m = loadAnthropicAuth()
    process.env.SWEECH_ANTHROPIC_CLIENT_ID = 'first-id'
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe('first-id')
    process.env.SWEECH_ANTHROPIC_CLIENT_ID = 'second-id'
    // Cache wins until reset.
    expect(m.getAnthropicClientId()).toBe('first-id')
    m._resetAnthropicClientIdCache()
    expect(m.getAnthropicClientId()).toBe('second-id')
  })

  it('CRITICAL safety regression: never reads or writes the real ~/.sweech/config.json', () => {
    // Belt-and-braces: even if a future refactor accidentally leaks the
    // real homedir, this assertion catches it. If TMP_HOME equals
    // os.homedir(), the mock failed.
    expect(TMP_HOME).not.toBe(os.homedir())
    expect(TMP_HOME.startsWith(os.tmpdir())).toBe(true)
  })
})
