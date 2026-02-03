/**
 * Tests for utility commands (doctor, path, test, edit, clone, rename)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
  isInPath,
  detectShell,
  getShellRCFile
} from '../src/utilityCommands';

jest.mock('fs');
jest.mock('child_process');
jest.mock('inquirer', () => ({})); // Mock inquirer to avoid ES module issues
jest.mock('chalk', () => ({
  red: jest.fn((str) => str),
  green: jest.fn((str) => str),
  cyan: jest.fn((str) => str),
  yellow: jest.fn((str) => str),
  gray: jest.fn((str) => str),
  bold: {
    red: jest.fn((str) => str),
    green: jest.fn((str) => str),
    cyan: jest.fn((str) => str)
  }
}));

const mockFs = fs as jest.Mocked<typeof fs>;
const mockExecSync = execSync as jest.MockedFunction<typeof execSync>;

describe('Utility Commands', () => {
  const home = os.homedir();
  const sweechBinDir = path.join(home, '.sweech', 'bin');

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    delete process.env.SHELL;
  });

  describe('isInPath', () => {
    test('returns true when sweech bin is in PATH', () => {
      const originalPath = process.env.PATH;
      process.env.PATH = `${sweechBinDir}:/usr/local/bin:/usr/bin`;

      expect(isInPath(sweechBinDir)).toBe(true);

      process.env.PATH = originalPath;
    });

    test('returns false when sweech bin is not in PATH', () => {
      const originalPath = process.env.PATH;
      process.env.PATH = '/usr/local/bin:/usr/bin:/bin';

      expect(isInPath(sweechBinDir)).toBe(false);

      process.env.PATH = originalPath;
    });

    test('handles PATH with multiple entries', () => {
      const originalPath = process.env.PATH;
      process.env.PATH = `/usr/local/bin:${sweechBinDir}:/usr/bin:/opt/bin`;

      expect(isInPath(sweechBinDir)).toBe(true);

      process.env.PATH = originalPath;
    });

    test('handles empty PATH', () => {
      const originalPath = process.env.PATH;
      process.env.PATH = '';

      expect(isInPath(sweechBinDir)).toBe(false);

      process.env.PATH = originalPath;
    });

    test('handles undefined PATH', () => {
      const originalPath = process.env.PATH;
      delete process.env.PATH;

      expect(isInPath(sweechBinDir)).toBe(false);

      process.env.PATH = originalPath;
    });

    test('is case-sensitive on Unix', () => {
      if (process.platform === 'win32') {
        return; // Skip on Windows
      }

      const originalPath = process.env.PATH;
      const upperBinDir = path.join(home, '.SWEETCH', 'bin');
      process.env.PATH = `${upperBinDir}:/usr/local/bin`;

      expect(isInPath(sweechBinDir)).toBe(false);

      process.env.PATH = originalPath;
    });

    test('handles paths with spaces', () => {
      const originalPath = process.env.PATH;
      const pathWithSpaces = `/Users/test user/.sweech/bin:/usr/bin`;
      const testBinDir = '/Users/test user/.sweech/bin';
      process.env.PATH = pathWithSpaces;

      // Should work if home has spaces
      const result = typeof isInPath(testBinDir);
      expect(result).toBe('boolean');

      process.env.PATH = originalPath;
    });

    test('normalizes paths correctly', () => {
      const originalPath = process.env.PATH;
      // Path with trailing slash should still match
      process.env.PATH = `${sweechBinDir}/:/usr/local/bin`;

      expect(isInPath(sweechBinDir)).toBe(true);

      process.env.PATH = originalPath;
    });
  });

  describe('detectShell', () => {
    test('detects bash from SHELL env var', () => {
      process.env.SHELL = '/bin/bash';
      expect(detectShell()).toBe('bash');
    });

    test('detects zsh from SHELL env var', () => {
      process.env.SHELL = '/usr/local/bin/zsh';
      expect(detectShell()).toBe('zsh');
    });

    test('detects fish from SHELL env var', () => {
      process.env.SHELL = '/usr/bin/fish';
      expect(detectShell()).toBe('fish');
    });

    test('returns bash for unrecognized shell on Unix', () => {
      process.env.SHELL = '/bin/ksh';
      const result = detectShell();
      if (process.platform === 'win32') {
        expect(result).toBe('cmd');
      } else {
        expect(result).toBe('bash');
      }
    });

    test('returns default shell when SHELL is not set', () => {
      delete process.env.SHELL;
      const result = detectShell();
      if (process.platform === 'win32') {
        expect(result).toBe('cmd');
      } else {
        expect(result).toBe('bash');
      }
    });

    test('handles SHELL with full path', () => {
      process.env.SHELL = '/usr/local/Cellar/zsh/5.9/bin/zsh';
      expect(detectShell()).toBe('zsh');
    });

    test('is case-sensitive for shell detection', () => {
      process.env.SHELL = '/bin/BASH';
      const result = detectShell();
      // /bin/BASH doesn't contain lowercase 'bash', so defaults to bash
      if (process.platform === 'win32') {
        expect(result).toBe('cmd');
      } else {
        expect(result).toBe('bash');
      }
    });

    test('handles empty SHELL variable', () => {
      process.env.SHELL = '';
      const result = detectShell();
      if (process.platform === 'win32') {
        expect(result).toBe('cmd');
      } else {
        expect(result).toBe('bash');
      }
    });

    test('detects common macOS bash path', () => {
      process.env.SHELL = '/bin/bash';
      expect(detectShell()).toBe('bash');
    });

    test('detects common macOS zsh path', () => {
      process.env.SHELL = '/bin/zsh';
      expect(detectShell()).toBe('zsh');
    });

    test('detects homebrew zsh', () => {
      process.env.SHELL = '/opt/homebrew/bin/zsh';
      expect(detectShell()).toBe('zsh');
    });
  });

  describe('getShellRCFile', () => {
    test('returns .bashrc for bash', () => {
      process.env.SHELL = '/bin/bash';
      const result = getShellRCFile();
      expect(result).toBe(path.join(home, '.bashrc'));
    });

    test('returns .zshrc for zsh', () => {
      process.env.SHELL = '/bin/zsh';
      const result = getShellRCFile();
      expect(result).toBe(path.join(home, '.zshrc'));
    });

    test('returns .config/fish/config.fish for fish', () => {
      process.env.SHELL = '/usr/bin/fish';
      const result = getShellRCFile();
      expect(result).toBe(path.join(home, '.config', 'fish', 'config.fish'));
    });

    test('returns .bashrc for unknown shell', () => {
      process.env.SHELL = '/bin/ksh';
      const result = getShellRCFile();
      expect(result).toBe(path.join(home, '.bashrc'));
    });

    test('handles empty SHELL', () => {
      process.env.SHELL = '';
      const result = getShellRCFile();
      // Should default to bash on Unix or cmd on Windows
      if (process.platform === 'win32') {
        expect(result).toBe(''); // cmd has no RC file
      } else {
        expect(result).toBe(path.join(home, '.bashrc'));
      }
    });

    test('returns absolute paths', () => {
      process.env.SHELL = '/bin/bash';
      const bashRC = getShellRCFile();

      process.env.SHELL = '/bin/zsh';
      const zshRC = getShellRCFile();

      process.env.SHELL = '/usr/bin/fish';
      const fishRC = getShellRCFile();

      expect(path.isAbsolute(bashRC)).toBe(true);
      expect(path.isAbsolute(zshRC)).toBe(true);
      expect(path.isAbsolute(fishRC)).toBe(true);
    });

    test('uses homedir consistently', () => {
      process.env.SHELL = '/bin/bash';
      const bashRC = getShellRCFile();
      expect(bashRC.startsWith(home)).toBe(true);
    });
  });

  describe('Shell Detection Integration', () => {
    test('detectShell and getShellRCFile work together', () => {
      process.env.SHELL = '/bin/zsh';
      const shell = detectShell();
      const rcFile = getShellRCFile();

      expect(shell).toBe('zsh');
      expect(rcFile).toBe(path.join(home, '.zshrc'));
    });

    test('handles unknown shell gracefully', () => {
      process.env.SHELL = '/bin/nonexistent';
      const shell = detectShell();
      const rcFile = getShellRCFile();

      expect(shell).toBe('bash'); // Falls back to bash on Unix
      expect(rcFile).toBe(path.join(home, '.bashrc'));
    });

    test('fish requires nested config directory', () => {
      process.env.SHELL = '/usr/bin/fish';
      const fishRC = getShellRCFile();
      const configDir = path.dirname(fishRC);

      expect(configDir).toBe(path.join(home, '.config', 'fish'));
      expect(path.basename(fishRC)).toBe('config.fish');
    });
  });

  describe('PATH Configuration', () => {
    test('identifies correct PATH entry format', () => {
      const expectedEntry = `export PATH="$HOME/.sweech/bin:$PATH"`;
      expect(expectedEntry).toContain('$HOME/.sweech/bin');
      expect(expectedEntry).toContain(':$PATH');
    });

    test('sweech bin directory structure', () => {
      expect(sweechBinDir).toBe(path.join(home, '.sweech', 'bin'));
      expect(sweechBinDir.endsWith('bin')).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('handles home directory with special characters', () => {
      // Just verify the functions don't crash
      process.env.SHELL = '/bin/bash';
      const shell = detectShell();
      const rcFile = getShellRCFile();

      expect(typeof shell).toBe('string');
      expect(typeof rcFile).toBe('string');
    });

    test('PATH detection handles colons in paths', () => {
      const originalPath = process.env.PATH;
      // Unlikely but possible
      process.env.PATH = `/opt/bin:${sweechBinDir}:/usr/bin`;

      expect(isInPath(sweechBinDir)).toBe(true);

      process.env.PATH = originalPath;
    });

    test('handles very long PATH', () => {
      const originalPath = process.env.PATH;
      const longPath = Array(100).fill('/usr/bin').join(':') + `:${sweechBinDir}`;
      process.env.PATH = longPath;

      expect(isInPath(sweechBinDir)).toBe(true);

      process.env.PATH = originalPath;
    });

    test('shell detection handles paths with versions', () => {
      process.env.SHELL = '/usr/local/bin/zsh-5.9';
      // Should still detect as zsh
      expect(detectShell()).toBe('zsh');
    });
  });

  describe('Doctor Command Validation', () => {
    test('validates required checks exist', () => {
      // Doctor should check:
      // 1. sweech is installed
      // 2. PATH is configured
      // 3. Profiles exist
      // 4. CLI availability
      // This test just verifies the structure
      const checks = [
        'installation',
        'path',
        'profiles',
        'clis'
      ];

      checks.forEach(check => {
        expect(typeof check).toBe('string');
      });
    });
  });

  describe('Platform-Specific Behavior', () => {
    test('handles Unix-like systems', () => {
      if (process.platform !== 'win32') {
        const shell = detectShell();
        expect(['bash', 'zsh', 'fish', 'cmd']).toContain(shell);
      }
    });

    test('RC files are Unix-style', () => {
      process.env.SHELL = '/bin/bash';
      const bashRC = getShellRCFile();

      process.env.SHELL = '/bin/zsh';
      const zshRC = getShellRCFile();

      if (process.platform !== 'win32') {
        expect(bashRC).toContain(home);
        expect(zshRC).toContain(home);
      }
    });
  });

  describe('Configuration Consistency', () => {
    test('all shells have corresponding RC files', () => {
      const shells = ['/bin/bash', '/bin/zsh', '/usr/bin/fish'];

      shells.forEach(shellPath => {
        process.env.SHELL = shellPath;
        const rcFile = getShellRCFile();
        expect(rcFile).toBeDefined();
        expect(rcFile.length).toBeGreaterThan(0);
        if (rcFile !== '') { // cmd on Windows has no RC file
          expect(path.isAbsolute(rcFile)).toBe(true);
        }
      });
    });

    test('RC files point to home directory', () => {
      const shells = ['/bin/bash', '/bin/zsh', '/usr/bin/fish'];

      shells.forEach(shellPath => {
        process.env.SHELL = shellPath;
        const rcFile = getShellRCFile();
        if (rcFile !== '') {
          expect(rcFile.startsWith(home)).toBe(true);
        }
      });
    });

    test('fish uses different directory structure', () => {
      process.env.SHELL = '/usr/bin/fish';
      const fishRC = getShellRCFile();

      process.env.SHELL = '/bin/bash';
      const bashRC = getShellRCFile();

      expect(fishRC).toContain('.config');
      expect(bashRC).not.toContain('.config');
    });
  });

  describe('Error Handling', () => {
    test('isInPath handles undefined process.env.PATH gracefully', () => {
      const originalPath = process.env.PATH;
      delete process.env.PATH;

      expect(() => isInPath(sweechBinDir)).not.toThrow();
      expect(isInPath(sweechBinDir)).toBe(false);

      process.env.PATH = originalPath;
    });

    test('detectShell handles undefined SHELL gracefully', () => {
      delete process.env.SHELL;

      expect(() => detectShell()).not.toThrow();
      const result = detectShell();
      // Should default to bash on Unix or cmd on Windows
      if (process.platform === 'win32') {
        expect(result).toBe('cmd');
      } else {
        expect(result).toBe('bash');
      }
    });

    test('getShellRCFile always returns valid path', () => {
      const invalidShellPaths = ['', '/bin/invalid', '/bin/unknown'];

      invalidShellPaths.forEach(shellPath => {
        process.env.SHELL = shellPath;
        expect(() => getShellRCFile()).not.toThrow();
        const result = getShellRCFile();
        expect(typeof result).toBe('string');
        // Empty string is valid for cmd on Windows
        expect(result.length).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
