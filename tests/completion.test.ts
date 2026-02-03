/**
 * Tests for shell completion script generation
 */

import * as fs from 'fs';
import { generateBashCompletion, generateZshCompletion } from '../src/completion';
import { ConfigManager } from '../src/config';
import { AliasManager } from '../src/aliases';

jest.mock('fs');
jest.mock('../src/config');
jest.mock('../src/aliases');

const mockFs = fs as jest.Mocked<typeof fs>;
const MockConfigManager = ConfigManager as jest.MockedClass<typeof ConfigManager>;
const MockAliasManager = AliasManager as jest.MockedClass<typeof AliasManager>;

describe('Completion Scripts', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock ConfigManager
    MockConfigManager.prototype.getProfiles = jest.fn().mockReturnValue([
      {
        name: 'test',
        commandName: 'claude-mini',
        cliType: 'claude',
        provider: 'minimax',
        apiKey: 'sk-test',
        createdAt: '2025-02-03T00:00:00.000Z'
      },
      {
        name: 'test2',
        commandName: 'claude-qwen',
        cliType: 'claude',
        provider: 'qwen',
        apiKey: 'sk-test2',
        createdAt: '2025-02-03T00:00:00.000Z'
      }
    ]);

    // Mock AliasManager
    MockAliasManager.prototype.getAliases = jest.fn().mockReturnValue({
      work: 'claude-mini',
      personal: 'claude-qwen'
    });
  });

  describe('generateBashCompletion', () => {
    test('generates valid bash completion script', () => {
      const script = generateBashCompletion();

      expect(script).toContain('_sweech_completion()');
      expect(script).toContain('complete -F _sweech_completion sweech');
    });

    test('includes all command names in completion', () => {
      const script = generateBashCompletion();

      expect(script).toContain('add');
      expect(script).toContain('list');
      expect(script).toContain('remove');
      expect(script).toContain('stats');
      expect(script).toContain('show');
      expect(script).toContain('alias');
      expect(script).toContain('discover');
      expect(script).toContain('completion');
    });

    test('includes profile names for relevant commands', () => {
      const script = generateBashCompletion();

      expect(script).toContain('claude-mini');
      expect(script).toContain('claude-qwen');
    });

    test('includes alias names in completion', () => {
      const script = generateBashCompletion();

      expect(script).toContain('work');
      expect(script).toContain('personal');
    });

    test('handles remove/rm commands', () => {
      const script = generateBashCompletion();

      expect(script).toContain('remove|rm|show|stats');
      expect(script).toMatch(/profiles="claude-mini claude-qwen"/);
    });

    test('handles alias subcommands', () => {
      const script = generateBashCompletion();

      expect(script).toContain('alias)');
      expect(script).toContain('list remove');
    });

    test('handles completion shell options', () => {
      const script = generateBashCompletion();

      expect(script).toContain('completion)');
      expect(script).toContain('bash zsh');
    });

    test('uses bash variable syntax', () => {
      const script = generateBashCompletion();

      expect(script).toContain('${COMP_WORDS[COMP_CWORD]}');
      expect(script).toContain('COMPREPLY');
      expect(script).toContain('compgen');
    });

    test('handles empty profiles list', () => {
      MockConfigManager.prototype.getProfiles = jest.fn().mockReturnValue([]);

      const script = generateBashCompletion();

      expect(script).toContain('profiles=""');
    });

    test('handles empty aliases list', () => {
      MockAliasManager.prototype.getAliases = jest.fn().mockReturnValue({});

      const script = generateBashCompletion();

      expect(script).toContain('aliases=""');
    });
  });

  describe('generateZshCompletion', () => {
    test('generates valid zsh completion script', () => {
      const script = generateZshCompletion();

      expect(script).toContain('#compdef sweech');
      expect(script).toContain('_sweech()');
      expect(script).toContain('_sweech "$@"');
    });

    test('includes command descriptions', () => {
      const script = generateZshCompletion();

      expect(script).toContain('add:Add a new provider');
      expect(script).toContain('list:List all configured providers');
      expect(script).toContain('remove:Remove a configured provider');
      expect(script).toContain('stats:Show usage statistics');
      expect(script).toContain('show:Show provider details');
      expect(script).toContain('alias:Manage command aliases');
    });

    test('includes profile names', () => {
      const script = generateZshCompletion();

      expect(script).toContain('claude-mini');
      expect(script).toContain('claude-qwen');
    });

    test('includes alias names', () => {
      const script = generateZshCompletion();

      expect(script).toContain('work');
      expect(script).toContain('personal');
    });

    test('handles command-specific completion', () => {
      const script = generateZshCompletion();

      expect(script).toContain('remove|rm|show|stats)');
      expect(script).toContain('_arguments "*:profile:($profiles)"');
    });

    test('handles alias subcommands', () => {
      const script = generateZshCompletion();

      expect(script).toContain('alias)');
      expect(script).toContain('if [[ $words[3] == "remove" ]]');
      expect(script).toContain('_arguments "*:alias:($aliases_list)"');
    });

    test('uses zsh variable syntax', () => {
      const script = generateZshCompletion();

      expect(script).toContain('$words[2]');
      expect(script).toContain('$words[3]');
      expect(script).toContain('_describe');
      expect(script).toContain('_arguments');
    });

    test('handles empty profiles list', () => {
      MockConfigManager.prototype.getProfiles = jest.fn().mockReturnValue([]);

      const script = generateZshCompletion();

      expect(script).toContain('profiles=()');
    });

    test('handles empty aliases list', () => {
      MockAliasManager.prototype.getAliases = jest.fn().mockReturnValue({});

      const script = generateZshCompletion();

      expect(script).toContain('aliases_list=()');
    });
  });

  describe('Script format', () => {
    test('bash script is executable format', () => {
      const script = generateBashCompletion();

      expect(script).toMatch(/^# Bash completion/);
      expect(script.trim().endsWith('sweech')).toBe(true);
    });

    test('zsh script is executable format', () => {
      const script = generateZshCompletion();

      expect(script).toMatch(/^#compdef sweech/);
      expect(script.trim().endsWith('"$@"')).toBe(true);
    });

    test('bash script has proper line endings', () => {
      const script = generateBashCompletion();

      expect(script).not.toContain('\r\n'); // No Windows line endings
      expect(script.split('\n').length).toBeGreaterThan(10); // Multi-line
    });

    test('zsh script has proper line endings', () => {
      const script = generateZshCompletion();

      expect(script).not.toContain('\r\n'); // No Windows line endings
      expect(script.split('\n').length).toBeGreaterThan(10); // Multi-line
    });
  });

  describe('Dynamic content', () => {
    test('bash script updates with different profiles', () => {
      MockConfigManager.prototype.getProfiles = jest.fn().mockReturnValue([
        {
          name: 'test',
          commandName: 'test-command',
          cliType: 'claude',
          provider: 'minimax',
          apiKey: 'sk-test',
          createdAt: '2025-02-03T00:00:00.000Z'
        }
      ]);

      const script = generateBashCompletion();

      expect(script).toContain('test-command');
      expect(script).not.toContain('claude-mini');
    });

    test('zsh script updates with different profiles', () => {
      MockConfigManager.prototype.getProfiles = jest.fn().mockReturnValue([
        {
          name: 'test',
          commandName: 'test-command',
          cliType: 'claude',
          provider: 'minimax',
          apiKey: 'sk-test',
          createdAt: '2025-02-03T00:00:00.000Z'
        }
      ]);

      const script = generateZshCompletion();

      expect(script).toContain('test-command');
      expect(script).not.toContain('claude-mini');
    });

    test('bash script updates with different aliases', () => {
      MockAliasManager.prototype.getAliases = jest.fn().mockReturnValue({
        test: 'test-command'
      });

      const script = generateBashCompletion();

      expect(script).toContain('test');
      expect(script).not.toContain('work');
    });

    test('zsh script updates with different aliases', () => {
      MockAliasManager.prototype.getAliases = jest.fn().mockReturnValue({
        test: 'test-command'
      });

      const script = generateZshCompletion();

      expect(script).toContain('test');
      expect(script).not.toContain('work');
    });
  });
});
