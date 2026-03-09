/**
 * Tests for OAuth authentication
 */

// Mock inquirer to avoid ESM issues in jest
jest.mock('inquirer', () => ({
  default: {
    prompt: jest.fn()
  }
}));

import {
  OAuthToken,
  isTokenExpired,
  oauthTokenToEnv
} from '../src/oauth';

describe('OAuth Token Management', () => {
  describe('isTokenExpired', () => {
    it('should return false for tokens with no expiration', () => {
      const token: OAuthToken = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        provider: 'anthropic'
      };

      expect(isTokenExpired(token)).toBe(false);
    });

    it('should return false for tokens that expire in the future', () => {
      const token: OAuthToken = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        provider: 'anthropic',
        expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes from now
      };

      expect(isTokenExpired(token)).toBe(false);
    });

    it('should return true for tokens that expire within 5 minutes', () => {
      const token: OAuthToken = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        provider: 'anthropic',
        expiresAt: Date.now() + 2 * 60 * 1000 // 2 minutes from now
      };

      expect(isTokenExpired(token)).toBe(true);
    });

    it('should return true for tokens that have expired', () => {
      const token: OAuthToken = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        provider: 'anthropic',
        expiresAt: Date.now() - 1000 // 1 second ago
      };

      expect(isTokenExpired(token)).toBe(true);
    });
  });

  describe('oauthTokenToEnv', () => {
    it('should convert Anthropic OAuth token to environment variables', () => {
      const token: OAuthToken = {
        accessToken: 'test-access-token',
        tokenType: 'Bearer',
        provider: 'anthropic'
      };

      const env = oauthTokenToEnv(token, 'claude');

      expect(env.ANTHROPIC_AUTH_TOKEN).toBe('bearer_test-access-token');
      expect(env.ANTHROPIC_BEARER_TOKEN).toBe('test-access-token');
    });

    it('should convert OpenAI OAuth token to environment variables', () => {
      const token: OAuthToken = {
        accessToken: 'test-access-token',
        tokenType: 'Bearer',
        provider: 'openai'
      };

      const env = oauthTokenToEnv(token, 'codex');

      expect(env.OPENAI_API_KEY).toBe('sk-oauth-test-access-token');
      expect(env.OPENAI_BEARER_TOKEN).toBe('test-access-token');
    });

    it('should throw error for unsupported CLI types', () => {
      const token: OAuthToken = {
        accessToken: 'test-token',
        tokenType: 'Bearer',
        provider: 'anthropic'
      };

      expect(() => {
        oauthTokenToEnv(token, 'unsupported');
      }).toThrow('Unsupported CLI type');
    });
  });

  describe('OAuth Token Structure', () => {
    it('should support Anthropic OAuth tokens', () => {
      const token: OAuthToken = {
        accessToken: 'ac-xxx',
        refreshToken: 'ref-xxx',
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer',
        provider: 'anthropic'
      };

      expect(token.provider).toBe('anthropic');
      expect(token.refreshToken).toBeDefined();
      expect(token.expiresAt).toBeDefined();
    });

    it('should support OpenAI OAuth tokens', () => {
      const token: OAuthToken = {
        accessToken: 'sk-oauth-xxx',
        refreshToken: 'refresh-xxx',
        expiresAt: Date.now() + 3600000,
        tokenType: 'Bearer',
        provider: 'openai'
      };

      expect(token.provider).toBe('openai');
      expect(token.refreshToken).toBeDefined();
      expect(token.expiresAt).toBeDefined();
    });
  });
});
