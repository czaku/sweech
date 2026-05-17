/**
 * Tests for `looksLikeLiteralApiKey` — the heuristic that decides whether
 * `sweech accounts add --kind apikey --key <X>` should treat `<X>` as an
 * env-var *name* or refuse it as a literal-key paste.
 *
 * False positives are SAFE (user is told to pipe via stdin); false
 * negatives are BAD (literal key lands in shell history). The tests bias
 * toward refusing anything that doesn't look like a clean env-var name.
 */

import { looksLikeLiteralApiKey } from '../src/keySourceGuard'

describe('looksLikeLiteralApiKey', () => {
  describe('accepts as env-var name', () => {
    const envNames = [
      'KIMI_API_KEY',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'DASHSCOPE_API_KEY',
      'GLM_API_KEY',
      'AWS_ACCESS_KEY_ID',
      // lowercase / mixed case env vars exist (rare but POSIX-valid)
      'my_api_key',
      'MyKey',
      'A',                // single-letter
      '_PRIVATE_KEY',     // leading underscore
      'K1',               // alphanumeric after letter
      'KEY_123',
    ]
    test.each(envNames)('accepts %s as env-var name', (name) => {
      expect(looksLikeLiteralApiKey(name)).toBe(false)
    })
  })

  describe('refuses known API-key prefixes', () => {
    const literalKeys = [
      // OpenAI / Anthropic / generic sk- family
      'sk-proj-abc123def456ghi789',
      'sk-ant-api03-xxxx',
      'sk_test_123',
      // Public-ish
      'pk-live-xxxx',
      'pk_xxxx',
      // Session tokens
      'sess-abc123',
      'sess_xyz',
      // GitLab
      'glpat-xxxxxxxx',
      // GitHub
      'ghp_xxxxxxxxxxxxxxxx',
      'gho_xxxxxxxx',
      'ghs_xxxxxxxx',
      'ghr_xxxxxxxx',
      'github_pat_xxxxxxxx',
      // xAI / Grok
      'xai-xxxxxxxxx',
      // GLM
      'glm-xxxxxxxxxxxxxxxx',
      // Google API key
      'AIzaSyA1B2C3D4E5F6G7H8',
      // AWS
      'AKIAIOSFODNN7EXAMPLE',
      'ASIAIOSFODNN7EXAMPLE',
      // Google OAuth
      'ya29.a0AfH6SMBxxxxx',
      // Slack
      'xoxb-1234-5678-abcdef',
      'xoxp-1234-5678-abcdef',
      'xapp-1-A12B-3456-abcdef',
    ]
    test.each(literalKeys)('refuses %s', (key) => {
      expect(looksLikeLiteralApiKey(key)).toBe(true)
    })
  })

  describe('refuses non-env-name shapes', () => {
    const malformed = [
      'has spaces',
      'has-dashes',
      'has.dots',
      'has/slash',
      'has+plus',
      'has=equals',
      'unicode_µ',
      'kana_カナ',
      '',
      '123starts-with-digit',
      '!special',
    ]
    test.each(malformed)('refuses %j', (s) => {
      expect(looksLikeLiteralApiKey(s)).toBe(true)
    })
  })

  describe('refuses suspiciously long bare identifiers', () => {
    test('refuses 41-char alphanumeric identifier (over threshold)', () => {
      const long = 'A'.repeat(41)
      expect(looksLikeLiteralApiKey(long)).toBe(true)
    })
    test('refuses 60-char identifier (typical key length)', () => {
      const veryLong = 'A1B2C3D4E5'.repeat(6)
      expect(looksLikeLiteralApiKey(veryLong)).toBe(true)
    })
    test('accepts 40-char identifier (at threshold)', () => {
      const at = 'A'.repeat(40)
      expect(looksLikeLiteralApiKey(at)).toBe(false)
    })
  })

  describe('regression: realistic confusable cases', () => {
    test('refuses a real OpenAI-style key', () => {
      expect(looksLikeLiteralApiKey('sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(true)
    })
    test('refuses a base64-looking literal that user might paste', () => {
      expect(looksLikeLiteralApiKey('YWJjZGVmZ2hpams=')).toBe(true)
    })
    test('refuses a JWT-style literal', () => {
      expect(looksLikeLiteralApiKey('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U')).toBe(true)
    })
    test('accepts standard env-var name even if user habitually uses lower-case', () => {
      expect(looksLikeLiteralApiKey('kimi_api_key')).toBe(false)
    })
  })
})
