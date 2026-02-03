/**
 * Tests for configuration management
 */

import { ProfileConfig } from '../src/config';
import { getProvider } from '../src/providers';

describe('Profile Configuration', () => {
  describe('ProfileConfig structure', () => {
    test('has required fields', () => {
      const profile: ProfileConfig = {
        name: 'test',
        commandName: 'test-command',
        cliType: 'claude',
        provider: 'minimax',
        apiKey: 'sk-test-key',
        createdAt: new Date().toISOString()
      };

      expect(profile.name).toBe('test');
      expect(profile.commandName).toBe('test-command');
      expect(profile.cliType).toBe('claude');
      expect(profile.provider).toBe('minimax');
      expect(profile.apiKey).toBeDefined();
      expect(profile.createdAt).toBeDefined();
    });

    test('supports optional fields', () => {
      const profile: ProfileConfig = {
        name: 'test',
        commandName: 'test',
        cliType: 'claude',
        provider: 'minimax',
        apiKey: 'sk-test',
        baseUrl: 'https://custom.api',
        model: 'custom-model',
        smallFastModel: 'fast-model',
        createdAt: new Date().toISOString()
      };

      expect(profile.baseUrl).toBe('https://custom.api');
      expect(profile.model).toBe('custom-model');
      expect(profile.smallFastModel).toBe('fast-model');
    });
  });

  describe('Command name validation', () => {
    test('valid command names', () => {
      const validNames = [
        'claude-mini',
        'minimax',
        'qwen-work',
        'cmini',
        'deep1',
        'a-b-c-123'
      ];

      validNames.forEach(name => {
        expect(/^[a-z0-9-]+$/.test(name)).toBe(true);
      });
    });

    test('invalid command names', () => {
      const invalidNames = [
        'Claude-Mini',  // uppercase
        'claude_mini',  // underscore
        'claude mini',  // space
        'claude.mini',  // dot
        'claude/mini',  // slash
      ];

      invalidNames.forEach(name => {
        expect(/^[a-z0-9-]+$/.test(name)).toBe(false);
      });
    });
  });

  describe('Provider integration', () => {
    test('profile provider matches provider config', () => {
      const provider = getProvider('minimax');
      expect(provider).toBeDefined();

      const profile: ProfileConfig = {
        name: 'test',
        commandName: 'test',
        cliType: 'claude',
        provider: 'minimax',
        apiKey: 'sk-test',
        baseUrl: provider?.baseUrl,
        model: provider?.defaultModel,
        createdAt: new Date().toISOString()
      };

      expect(profile.baseUrl).toBe(provider?.baseUrl);
      expect(profile.model).toBe(provider?.defaultModel);
    });
  });
});
