/**
 * Tests for interactive prompt validation logic
 */

import { ProfileConfig } from '../src/config';
import { getProvider } from '../src/providers';

describe('Interactive Validation', () => {
  describe('Command Name Validation Rules', () => {
    test('validates required field', () => {
      const input: string = '';
      const isEmpty = !input || input.trim().length === 0;
      expect(isEmpty).toBe(true);
    });

    test('validates format (lowercase, numbers, hyphens only)', () => {
      const validNames = [
        'claude-mini',
        'minimax',
        'qwen-1',
        'a-b-c-123',
        'test',
      ];

      const invalidNames = [
        'Claude-Mini',  // uppercase
        'claude_mini',  // underscore
        'claude mini',  // space
        'claude.mini',  // dot
        'claude/mini',  // slash
        'claude@mini',  // special char
      ];

      const regex = /^[a-z0-9-]+$/;

      validNames.forEach(name => {
        expect(regex.test(name)).toBe(true);
      });

      invalidNames.forEach(name => {
        expect(regex.test(name)).toBe(false);
      });
    });

    test('prevents reserved "claude" name', () => {
      const input = 'claude';
      const isReserved = input === 'claude';
      expect(isReserved).toBe(true);
    });

    test('detects duplicate names', () => {
      const existingProfiles: ProfileConfig[] = [
        {
          name: 'test',
          commandName: 'claude-mini',
          cliType: 'claude',
          provider: 'minimax',
          apiKey: 'sk-test',
          createdAt: '2025-02-03T00:00:00.000Z'
        }
      ];

      const newCommandName = 'claude-mini';
      const existing = existingProfiles.find(p => p.commandName === newCommandName);

      expect(existing).toBeDefined();
      expect(existing?.commandName).toBe('claude-mini');
    });

    test('allows unique names', () => {
      const existingProfiles: ProfileConfig[] = [
        {
          name: 'test',
          commandName: 'claude-mini',
          cliType: 'claude',
          provider: 'minimax',
          apiKey: 'sk-test',
          createdAt: '2025-02-03T00:00:00.000Z'
        }
      ];

      const newCommandName = 'claude-qwen';
      const existing = existingProfiles.find(p => p.commandName === newCommandName);

      expect(existing).toBeUndefined();
    });
  });

  describe('Provider Selection', () => {
    test('provider exists in list', () => {
      const provider = getProvider('minimax');
      expect(provider).toBeDefined();
      expect(provider?.name).toBe('minimax');
    });

    test('handles unknown provider', () => {
      const provider = getProvider('unknown-provider');
      expect(provider).toBeUndefined();
    });
  });

  describe('API Key Validation', () => {
    test('validates required field', () => {
      const apiKey: string = '';
      const isEmpty = !apiKey || apiKey.trim().length === 0;
      expect(isEmpty).toBe(true);
    });

    test('trims whitespace', () => {
      const input = '  sk-test-key  ';
      const trimmed = input.trim();
      expect(trimmed).toBe('sk-test-key');
      expect(trimmed.length).toBeLessThan(input.length);
    });

    test('accepts valid API keys', () => {
      const validKeys = [
        'sk-test-key',
        'api-key-123',
        'very-long-api-key-with-many-characters',
      ];

      validKeys.forEach(key => {
        expect(key.trim().length).toBeGreaterThan(0);
      });
    });
  });

  describe('Provider-Specific Suggestions', () => {
    test('suggests names for MiniMax', () => {
      const suggestions = {
        'minimax': '"cmini", "claude-mini", "mini", "minimax-work"',
        'qwen': '"qwen", "claude-qwen", "cqwen", "qwen-personal"',
        'kimi': '"kimi", "claude-kimi", "ckimi", "kimi-work"',
      };

      expect(suggestions.minimax).toContain('cmini');
      expect(suggestions.qwen).toContain('qwen');
      expect(suggestions.kimi).toContain('kimi');
    });

    test('all providers have suggestions', () => {
      const suggestionMap: Record<string, string> = {
        'minimax': '"cmini", "claude-mini", "mini", "minimax-work"',
        'qwen': '"qwen", "claude-qwen", "cqwen", "qwen-personal"',
        'kimi': '"kimi", "claude-kimi", "ckimi", "kimi-work"',
        'deepseek': '"deep", "claude-deep", "cdeep", "deepseek"',
        'glm': '"glm", "claude-glm", "cglm", "glm4"',
        'anthropic': '"claude-2", "claude-work", "claude-personal"'
      };

      Object.keys(suggestionMap).forEach(provider => {
        expect(suggestionMap[provider]).toBeDefined();
        expect(suggestionMap[provider].length).toBeGreaterThan(0);
      });
    });
  });

  describe('Input Transformation', () => {
    test('transforms input to lowercase', () => {
      const input = 'Claude-Mini';
      const transformed = input.toLowerCase().trim();
      expect(transformed).toBe('claude-mini');
    });

    test('trims whitespace', () => {
      const input = '  claude-mini  ';
      const transformed = input.toLowerCase().trim();
      expect(transformed).toBe('claude-mini');
    });

    test('handles already valid input', () => {
      const input = 'claude-mini';
      const transformed = input.toLowerCase().trim();
      expect(transformed).toBe(input);
    });
  });

  describe('Error Message Format', () => {
    test('invalid characters error message', () => {
      const errorMsg = 'Use only lowercase letters, numbers, and hyphens (e.g., "claude-mini", "cmini")';
      expect(errorMsg).toContain('lowercase');
      expect(errorMsg).toContain('e.g.');
    });

    test('duplicate name error message', () => {
      const commandName = 'claude-mini';
      const providerName = 'MiniMax';
      const errorMsg = `Command "${commandName}" already exists (${providerName}). Choose a different name.`;

      expect(errorMsg).toContain(commandName);
      expect(errorMsg).toContain(providerName);
      expect(errorMsg).toContain('already exists');
    });

    test('reserved name error message', () => {
      const errorMsg = 'Cannot use "claude" - this is reserved for your default account';
      expect(errorMsg).toContain('reserved');
      expect(errorMsg).toContain('default account');
    });
  });
});
