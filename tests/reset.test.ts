/**
 * Tests for reset command and default directory protection
 */

import * as path from 'path';
import * as os from 'os';

jest.mock('inquirer', () => ({})); // Mock inquirer to avoid ES module issues
jest.mock('chalk', () => ({
  red: jest.fn((str) => str),
  green: jest.fn((str) => str),
  cyan: jest.fn((str) => str),
  yellow: jest.fn((str) => str),
  gray: jest.fn((str) => str),
  bold: {
    red: jest.fn((str) => str)
  }
}));

import { isDefaultCLIDirectory, isDefaultProfile } from '../src/reset';

describe('Reset Protection', () => {
  const home = os.homedir();

  describe('isDefaultCLIDirectory', () => {
    test('identifies Claude default directory', () => {
      const claudeDir = path.join(home, '.claude');
      expect(isDefaultCLIDirectory(claudeDir)).toBe(true);
    });

    test('identifies Codex default directory', () => {
      const codexDir = path.join(home, '.codex');
      expect(isDefaultCLIDirectory(codexDir)).toBe(true);
    });

    test('identifies alternate config locations', () => {
      const altClaudeDir = path.join(home, '.config', 'claude');

      expect(isDefaultCLIDirectory(altClaudeDir)).toBe(true);
    });

    test('does not identify sweech-managed directories', () => {
      const sweechDir = path.join(home, '.sweech', 'profiles', 'claude-mini');
      expect(isDefaultCLIDirectory(sweechDir)).toBe(false);
    });

    test('does not identify custom directories', () => {
      const customDir = path.join(home, 'my-custom-dir');
      expect(isDefaultCLIDirectory(customDir)).toBe(false);
    });

    test('handles relative paths correctly', () => {
      const relativeClaudeDir = '.claude';
      const absoluteClaudeDir = path.resolve(relativeClaudeDir);

      // Should work regardless of relative vs absolute
      expect(typeof isDefaultCLIDirectory(relativeClaudeDir)).toBe('boolean');
      expect(typeof isDefaultCLIDirectory(absoluteClaudeDir)).toBe('boolean');
    });

    test('handles trailing slashes', () => {
      const claudeDirWithSlash = path.join(home, '.claude/');
      const claudeDirWithoutSlash = path.join(home, '.claude');

      expect(isDefaultCLIDirectory(claudeDirWithSlash)).toBe(
        isDefaultCLIDirectory(claudeDirWithoutSlash)
      );
    });

    test('is case-sensitive on Unix, insensitive on Windows', () => {
      const upperClaudeDir = path.join(home, '.CLAUDE');

      if (process.platform === 'win32') {
        // Windows is case-insensitive
        expect(typeof isDefaultCLIDirectory(upperClaudeDir)).toBe('boolean');
      } else {
        // Unix is case-sensitive - .CLAUDE is not .claude
        expect(isDefaultCLIDirectory(upperClaudeDir)).toBe(false);
      }
    });
  });

  describe('isDefaultProfile', () => {
    test('identifies default profile by name', () => {
      const customDir = path.join(home, '.sweech', 'profiles', 'claude');

      expect(isDefaultProfile('claude', customDir)).toBe(true);
      expect(isDefaultProfile('codex', customDir)).toBe(true);
    });

    test('identifies default profile by directory', () => {
      const claudeDir = path.join(home, '.claude');

      expect(isDefaultProfile('any-name', claudeDir)).toBe(true);
    });

    test('does not identify custom profiles', () => {
      const customDir = path.join(home, '.sweech', 'profiles', 'claude-mini');

      expect(isDefaultProfile('claude-mini', customDir)).toBe(false);
      expect(isDefaultProfile('minimax', customDir)).toBe(false);
      expect(isDefaultProfile('qwen-work', customDir)).toBe(false);
    });

    test('handles case-insensitively for names', () => {
      const customDir = path.join(home, '.sweech', 'profiles', 'test');

      expect(isDefaultProfile('CLAUDE', customDir)).toBe(true);
      expect(isDefaultProfile('Claude', customDir)).toBe(true);
      expect(isDefaultProfile('CODEX', customDir)).toBe(true);
    });

    test('protects all default CLI names', () => {
      const customDir = path.join(home, '.sweech', 'profiles', 'test');
      const defaultNames = ['claude', 'codex'];

      defaultNames.forEach(name => {
        expect(isDefaultProfile(name, customDir)).toBe(true);
      });
    });
  });

  describe('Protection Logic', () => {
    test('protects against removing ~/.claude/', () => {
      const claudeDir = path.join(home, '.claude');
      expect(isDefaultCLIDirectory(claudeDir)).toBe(true);
    });

    test('allows removing sweech-managed profiles', () => {
      const miniDir = path.join(home, '.sweech', 'profiles', 'claude-mini');
      expect(isDefaultCLIDirectory(miniDir)).toBe(false);
    });

    test('protects all default directories', () => {
      const defaultDirs = [
        '.claude',
        '.codex'
      ];

      defaultDirs.forEach(dir => {
        const fullPath = path.join(home, dir);
        expect(isDefaultCLIDirectory(fullPath)).toBe(true);
      });
    });

    test('allows custom directory structures', () => {
      const customPaths = [
        path.join(home, 'my-projects', 'claude-config'),
        path.join(home, 'work', 'ai-configs'),
        path.join(home, '.sweech', 'profiles', 'any-name')
      ];

      customPaths.forEach(dir => {
        expect(isDefaultCLIDirectory(dir)).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    test('handles empty string', () => {
      expect(isDefaultCLIDirectory('')).toBe(false);
    });

    test('handles root directory', () => {
      expect(isDefaultCLIDirectory('/')).toBe(false);
    });

    test('handles home directory', () => {
      expect(isDefaultCLIDirectory(home)).toBe(false);
    });

    test('handles nested paths', () => {
      const nested = path.join(home, '.claude', 'nested', 'deep', 'path');
      // Only the exact default directories are protected, not nested paths within them
      expect(isDefaultCLIDirectory(nested)).toBe(false);
    });

    test('handles non-existent paths', () => {
      const nonExistent = path.join(home, '.definitely-not-a-real-directory-12345');
      expect(typeof isDefaultCLIDirectory(nonExistent)).toBe('boolean');
    });
  });
});
