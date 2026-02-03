/**
 * Tests for CLI detection and version checking
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  isCLIInstalled,
  getCLIVersion,
  detectInstalledCLIs,
  formatCLIChoices,
  CLIDetectionResult
} from '../src/cliDetection';
import { SUPPORTED_CLIS } from '../src/clis';

jest.mock('child_process');
jest.mock('chalk', () => ({
  green: jest.fn((str) => str),
  gray: jest.fn((str) => str),
  dim: jest.fn((str) => str)
}));

const mockExecFile = execFile as jest.MockedFunction<typeof execFile>;

describe('CLI Detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isCLIInstalled', () => {
    test('returns true when CLI is installed', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(null, { stdout: '/usr/local/bin/claude', stderr: '' });
      }) as any);

      const result = await isCLIInstalled('claude');
      expect(result).toBe(true);
    });

    test('returns false when CLI is not installed', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(new Error('Command not found'), null);
      }) as any);

      const result = await isCLIInstalled('nonexistent');
      expect(result).toBe(false);
    });

    test('uses which on Unix systems', async () => {
      if (process.platform !== 'win32') {
        mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
          callback(null, { stdout: '/usr/bin/claude', stderr: '' });
        }) as any);

        await isCLIInstalled('claude');

        expect(mockExecFile).toHaveBeenCalledWith(
          'which',
          ['claude'],
          expect.any(Object),
          expect.any(Function)
        );
      }
    });

    test('uses where on Windows', async () => {
      if (process.platform === 'win32') {
        mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
          callback(null, { stdout: 'C:\\Program Files\\claude\\claude.exe', stderr: '' });
        }) as any);

        await isCLIInstalled('claude');

        expect(mockExecFile).toHaveBeenCalledWith(
          'where',
          ['claude'],
          expect.any(Object),
          expect.any(Function)
        );
      }
    });

    test('has timeout configured', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        expect(options.timeout).toBeDefined();
        callback(null, { stdout: '', stderr: '' });
      }) as any);

      await isCLIInstalled('claude');
    });

    test('handles timeout errors', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        const error: any = new Error('Timeout');
        error.code = 'ETIMEDOUT';
        callback(error, null);
      }) as any);

      const result = await isCLIInstalled('claude');
      expect(result).toBe(false);
    });
  });

  describe('getCLIVersion', () => {
    test('returns version from stdout', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(null, { stdout: 'claude 1.2.3\n', stderr: '' });
      }) as any);

      const version = await getCLIVersion('claude');
      expect(version).toBe('claude 1.2.3');
    });

    test('returns version from stderr if stdout is empty', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(null, { stdout: '', stderr: 'codex version 2.1.0\n' });
      }) as any);

      const version = await getCLIVersion('codex');
      expect(version).toBe('codex version 2.1.0');
    });

    test('returns undefined when version command fails', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(new Error('Command failed'), null);
      }) as any);

      const version = await getCLIVersion('claude');
      expect(version).toBeUndefined();
    });

    test('uses --version flag', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(null, { stdout: '1.0.0', stderr: '' });
      }) as any);

      await getCLIVersion('test-cli');

      expect(mockExecFile).toHaveBeenCalledWith(
        'test-cli',
        ['--version'],
        expect.any(Object),
        expect.any(Function)
      );
    });

    test('trims whitespace from output', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(null, { stdout: '  claude 1.0.0  \n', stderr: '' });
      }) as any);

      const version = await getCLIVersion('claude');
      expect(version).toBe('claude 1.0.0');
    });

    test('handles timeout configured', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        expect(options.timeout).toBeDefined();
        callback(null, { stdout: '1.0.0', stderr: '' });
      }) as any);

      await getCLIVersion('claude');
    });
  });

  describe('detectInstalledCLIs', () => {
    test('detects multiple installed CLIs', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        // All which/where commands succeed
        if (cmd === 'which' || cmd === 'where') {
          callback(null, { stdout: '/usr/bin/' + args[0], stderr: '' });
        }
        // Version commands return versions
        else if (args[0] === '--version') {
          if (cmd === 'claude') {
            callback(null, { stdout: 'claude 1.0.0', stderr: '' });
          } else if (cmd === 'codex') {
            callback(null, { stdout: 'codex 2.0.0', stderr: '' });
          } else {
            callback(null, { stdout: '1.0.0', stderr: '' });
          }
        } else {
          callback(new Error('Not found'), null);
        }
      }) as any);

      const results = await detectInstalledCLIs();

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => r.cli && typeof r.installed === 'boolean')).toBe(true);
    });

    test('returns empty array on complete failure', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(new Error('Not found'), null);
      }) as any);

      const results = await detectInstalledCLIs();

      // Should still return results for each CLI, just marked as not installed
      expect(Array.isArray(results)).toBe(true);
      expect(results.every(r => r.installed === false)).toBe(true);
    });

    test('includes CLI even if version unavailable', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        // which/where succeeds
        if (cmd === 'which' || cmd === 'where') {
          callback(null, { stdout: '/usr/bin/claude', stderr: '' });
        }
        // --version fails
        else if (args[0] === '--version') {
          callback(new Error('Version not available'), null);
        } else {
          callback(new Error('Not found'), null);
        }
      }) as any);

      const results = await detectInstalledCLIs();

      expect(results.some(r => r.installed === true && r.version === undefined)).toBe(true);
    });

    test('checks all supported CLIs', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(new Error('Not found'), null);
      }) as any);

      const results = await detectInstalledCLIs();

      // Should have result for each supported CLI
      expect(results.length).toBe(Object.keys(SUPPORTED_CLIS).length);
    });

    test('returns consistent format', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        if (cmd === 'which' || cmd === 'where') {
          callback(null, { stdout: '/usr/bin/test', stderr: '' });
        } else {
          callback(null, { stdout: '1.0.0', stderr: '' });
        }
      }) as any);

      const results = await detectInstalledCLIs();

      results.forEach(result => {
        expect(result).toHaveProperty('cli');
        expect(result).toHaveProperty('installed');
        expect(result.cli).toHaveProperty('name');
        expect(result.cli).toHaveProperty('displayName');
        expect(typeof result.installed).toBe('boolean');
      });
    });

    test('marks installed CLI with version', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        if (cmd === 'which' || cmd === 'where') {
          if (args[0] === 'claude') {
            callback(null, { stdout: '/usr/bin/claude', stderr: '' });
          } else {
            callback(new Error('Not found'), null);
          }
        } else if (cmd === 'claude' && args[0] === '--version') {
          callback(null, { stdout: 'claude 1.0.0', stderr: '' });
        } else {
          callback(new Error('Not found'), null);
        }
      }) as any);

      const results = await detectInstalledCLIs();
      const claude = results.find(r => r.cli.name === 'claude');

      expect(claude).toBeDefined();
      expect(claude?.installed).toBe(true);
      expect(claude?.version).toBeDefined();
    });
  });

  describe('formatCLIChoices', () => {
    test('formats installed CLIs with versions', () => {
      const detectionResults: CLIDetectionResult[] = [
        {
          cli: SUPPORTED_CLIS.claude,
          installed: true,
          version: 'claude 1.0.0'
        },
        {
          cli: SUPPORTED_CLIS.codex,
          installed: true,
          version: 'codex 2.0.0'
        }
      ];

      const choices = formatCLIChoices(detectionResults);

      expect(choices).toHaveLength(2);
      expect(choices[0].name).toContain('Claude Code');
      expect(choices[0].name).toContain('1.0.0');
      expect(choices[0].name).toContain('✓');
      expect(choices[0].value).toBe('claude');
    });

    test('formats CLI without version', () => {
      const detectionResults: CLIDetectionResult[] = [
        {
          cli: SUPPORTED_CLIS.claude,
          installed: true
        }
      ];

      const choices = formatCLIChoices(detectionResults);

      expect(choices[0].name).toContain('Claude Code');
      expect(choices[0].name).toContain('✓');
      expect(choices[0].value).toBe('claude');
    });

    test('formats non-installed CLIs with disabled message', () => {
      const detectionResults: CLIDetectionResult[] = [
        {
          cli: SUPPORTED_CLIS.claude,
          installed: false
        }
      ];

      const choices = formatCLIChoices(detectionResults);

      expect(choices[0].name).toContain('Claude Code');
      expect(choices[0].name).toContain('✗');
      expect(choices[0].disabled).toBeDefined();
      expect(typeof choices[0].disabled).toBe('string');
    });

    test('includes install URL in disabled message', () => {
      const detectionResults: CLIDetectionResult[] = [
        {
          cli: SUPPORTED_CLIS.claude,
          installed: false
        }
      ];

      const choices = formatCLIChoices(detectionResults);

      expect(choices[0].disabled).toContain('https://');
    });

    test('maintains choice structure', () => {
      const detectionResults: CLIDetectionResult[] = [
        {
          cli: SUPPORTED_CLIS.claude,
          installed: true,
          version: 'claude 1.0.0'
        }
      ];

      const choices = formatCLIChoices(detectionResults);

      choices.forEach(choice => {
        expect(choice).toHaveProperty('name');
        expect(choice).toHaveProperty('value');
        expect(typeof choice.name).toBe('string');
        expect(typeof choice.value).toBe('string');
      });
    });

    test('handles mixed installation states', () => {
      const detectionResults: CLIDetectionResult[] = [
        {
          cli: SUPPORTED_CLIS.claude,
          installed: true,
          version: 'claude 1.0.0'
        },
        {
          cli: SUPPORTED_CLIS.codex,
          installed: false
        }
      ];

      const choices = formatCLIChoices(detectionResults);

      const claudeChoice = choices.find(c => c.value === 'claude');
      const codexChoice = choices.find(c => c.value === 'codex');

      expect(claudeChoice?.name).toContain('✓');
      expect(claudeChoice?.disabled).toBeUndefined();
      expect(codexChoice?.name).toContain('✗');
      expect(codexChoice?.disabled).toBeDefined();
    });

    test('returns at least one choice', () => {
      const detectionResults: CLIDetectionResult[] = Object.values(SUPPORTED_CLIS).map(cli => ({
        cli,
        installed: false
      }));

      const choices = formatCLIChoices(detectionResults);

      expect(choices.length).toBeGreaterThan(0);
    });
  });

  describe('Integration Tests', () => {
    test('detection workflow from check to format', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        if (cmd === 'which' || cmd === 'where') {
          if (args[0] === 'claude') {
            callback(null, { stdout: '/usr/bin/claude', stderr: '' });
          } else {
            callback(new Error('Not found'), null);
          }
        } else if (cmd === 'claude' && args[0] === '--version') {
          callback(null, { stdout: 'claude 1.0.0', stderr: '' });
        } else {
          callback(new Error('Not found'), null);
        }
      }) as any);

      // Full workflow
      const results = await detectInstalledCLIs();
      const choices = formatCLIChoices(results);

      expect(results.length).toBeGreaterThan(0);
      expect(choices.length).toBeGreaterThan(0);

      const claudeResult = results.find(r => r.cli.name === 'claude');
      expect(claudeResult).toBeDefined();
      expect(claudeResult?.installed).toBe(true);
      expect(claudeResult?.version).toBe('claude 1.0.0');
    });

    test('handles complete failure gracefully', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(new Error('All commands failed'), null);
      }) as any);

      const results = await detectInstalledCLIs();
      const choices = formatCLIChoices(results);

      expect(results.every(r => r.installed === false)).toBe(true);
      expect(choices.length).toBeGreaterThan(0); // Still shows all CLIs
      expect(choices.every(c => c.disabled)).toBe(true); // All disabled
    });
  });

  describe('Edge Cases', () => {
    test('handles version command with different output formats', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(null, { stdout: 'CLI™ version 1.0.0\nBuild: 12345', stderr: '' });
      }) as any);

      const version = await getCLIVersion('claude');
      expect(version).toContain('1.0.0');
    });

    test('handles empty version output', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(null, { stdout: '', stderr: '' });
      }) as any);

      const version = await getCLIVersion('claude');
      expect(version).toBe('');
    });

    test('handles concurrent detection calls', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(null, { stdout: '1.0.0', stderr: '' });
      }) as any);

      const results = await Promise.all([
        detectInstalledCLIs(),
        detectInstalledCLIs(),
        detectInstalledCLIs()
      ]);

      // Should not interfere with each other
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    test('handles ENOENT error', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        const error: any = new Error('Command not found');
        error.code = 'ENOENT';
        callback(error, null);
      }) as any);

      expect(await isCLIInstalled('nonexistent')).toBe(false);
      expect(await getCLIVersion('nonexistent')).toBeUndefined();
    });

    test('handles permission errors', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        const error: any = new Error('Permission denied');
        error.code = 'EACCES';
        callback(error, null);
      }) as any);

      expect(await isCLIInstalled('claude')).toBe(false);
    });

    test('does not throw on any error', async () => {
      mockExecFile.mockImplementation(((cmd: string, args: string[], options: any, callback: Function) => {
        callback(new Error('Random error'), null);
      }) as any);

      await expect(isCLIInstalled('claude')).resolves.toBe(false);
      await expect(getCLIVersion('claude')).resolves.toBeUndefined();
      await expect(detectInstalledCLIs()).resolves.toBeDefined();
    });
  });

  describe('Type Safety', () => {
    test('CLIDetectionResult has correct structure', () => {
      const result: CLIDetectionResult = {
        cli: SUPPORTED_CLIS.claude,
        installed: true,
        version: '1.0.0'
      };

      expect(result.cli).toBeDefined();
      expect(result.cli.name).toBe('claude');
      expect(result.installed).toBe(true);
      expect(result.version).toBe('1.0.0');
    });

    test('formatCLIChoices returns correct structure', () => {
      const detectionResults: CLIDetectionResult[] = [
        {
          cli: SUPPORTED_CLIS.claude,
          installed: true,
          version: '1.0.0'
        }
      ];

      const choices = formatCLIChoices(detectionResults);

      choices.forEach(choice => {
        expect(typeof choice.name).toBe('string');
        expect(typeof choice.value).toBe('string');
        if (choice.disabled !== undefined) {
          expect(typeof choice.disabled === 'string' || typeof choice.disabled === 'boolean').toBe(true);
        }
      });
    });
  });
});
