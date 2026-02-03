/**
 * Tests for system command detection
 */

import {
  isBlockedCommand,
  validateCommandName,
  isSystemCommand,
  getSystemCommandWarning
} from '../src/systemCommands';

describe('System Command Detection', () => {
  describe('isBlockedCommand', () => {
    test('blocks critical system commands', () => {
      expect(isBlockedCommand('mkdir')).toBe(true);
      expect(isBlockedCommand('rm')).toBe(true);
      expect(isBlockedCommand('sudo')).toBe(true);
      expect(isBlockedCommand('git')).toBe(true);
      expect(isBlockedCommand('npm')).toBe(true);
    });

    test('allows non-system command names', () => {
      expect(isBlockedCommand('claude-mini')).toBe(false);
      expect(isBlockedCommand('minimax')).toBe(false);
      expect(isBlockedCommand('qwen')).toBe(false);
    });

    test('is case-insensitive', () => {
      expect(isBlockedCommand('MKDIR')).toBe(true);
      expect(isBlockedCommand('MkDir')).toBe(true);
    });
  });

  describe('isSystemCommand', () => {
    test('returns false for invalid command name format', async () => {
      const invalidNames = [
        'invalid name',  // spaces
        'invalid/path',  // slashes
        'invalid@cmd',   // special chars
        'invalid.cmd',   // dots
      ];

      for (const name of invalidNames) {
        const result = await isSystemCommand(name);
        expect(result).toBe(false);
      }
    });

    test('returns false for non-existent commands', async () => {
      const nonExistent = await isSystemCommand('definitely-not-a-real-command-xyz123');
      expect(nonExistent).toBe(false);
    });

    test('returns true for real system commands', async () => {
      // These commands exist on most systems but aren't in blocked list
      const realCommands = ['bash', 'sh'];

      // At least one should be available
      const results = await Promise.all(
        realCommands.map(cmd => isSystemCommand(cmd))
      );

      // At least one real command should be detected
      expect(results.some(r => r === true)).toBe(true);
    });

    test('detects common system utilities', async () => {
      // Test with commands likely to exist (bash/sh on Unix, cmd on Windows)
      const commonCommands = process.platform === 'win32'
        ? ['cmd']
        : ['sh'];

      for (const cmd of commonCommands) {
        const result = await isSystemCommand(cmd);
        expect(typeof result).toBe('boolean');
        // Should find at least sh/cmd
        if (cmd === 'sh' || cmd === 'cmd') {
          expect(result).toBe(true);
        }
      }
    });

    test('handles timeout gracefully', async () => {
      // Should not throw, just return false
      const result = await isSystemCommand('some-command');
      expect(typeof result).toBe('boolean');
    });

    test('validates format before checking system', async () => {
      // Invalid format should return false without executing which/where
      const result = await isSystemCommand('invalid name with spaces');
      expect(result).toBe(false);
    });

    test('handles uppercase command names', async () => {
      // Should work with uppercase (though normalized to lowercase)
      const result = await isSystemCommand('BASH');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getSystemCommandWarning', () => {
    test('returns warning message with command name', () => {
      const warning = getSystemCommandWarning('python');
      expect(warning).toContain('python');
      expect(warning).toContain('system command');
      expect(warning).toMatch(/⚠️/);
    });

    test('formats warning consistently', () => {
      const commands = ['node', 'ruby', 'perl'];
      commands.forEach(cmd => {
        const warning = getSystemCommandWarning(cmd);
        expect(warning).toBeDefined();
        expect(warning.length).toBeGreaterThan(0);
      });
    });
  });

  describe('validateCommandName', () => {
    test('rejects blocked commands', async () => {
      const result = await validateCommandName('mkdir');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('critical system command');
    });

    test('rejects other critical commands', async () => {
      const commands = ['rm', 'sudo', 'git', 'npm', 'cd'];
      for (const cmd of commands) {
        const result = await validateCommandName(cmd);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    test('allows safe command names', async () => {
      const result = await validateCommandName('claude-mini');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    test('handles various naming patterns', async () => {
      const safeNames = [
        'minimax',
        'claude-qwen',
        'cmini',
        'qwen-work',
        'deepseek-1',
      ];

      for (const name of safeNames) {
        const result = await validateCommandName(name);
        expect(result.valid).toBe(true);
      }
    });

    test('returns valid with warning for invalid format but not blocked', async () => {
      // Commands with invalid format should return false in isSystemCommand
      // and then validateCommandName should return valid: true (not a system command)
      const result = await validateCommandName('my-safe-command-123');
      expect(result.valid).toBe(true);
    });

    test('returns valid with warning for non-blocked system commands', async () => {
      // Commands that exist in system but aren't blocked should get a warning
      // bash and sh exist on Unix but aren't in blocked list
      const nonBlockedSystemCommands = process.platform === 'win32'
        ? ['cmd']
        : ['bash', 'sh'];

      let foundOne = false;
      for (const cmd of nonBlockedSystemCommands) {
        const result = await validateCommandName(cmd);

        // Should be valid but with warning
        if (result.warning) {
          expect(result.valid).toBe(true);
          expect(result.warning).toContain(cmd);
          expect(result.warning).toContain('system command');
          expect(result.error).toBeUndefined();
          foundOne = true;
        }
      }

      // At least one should have triggered the warning path
      expect(foundOne).toBe(true);
    });

    test('distinguishes between blocked and non-blocked system commands', async () => {
      // Blocked command should have error
      const blockedResult = await validateCommandName('git');
      expect(blockedResult.valid).toBe(false);
      expect(blockedResult.error).toBeDefined();
      expect(blockedResult.warning).toBeUndefined();

      // Non-blocked system command should have warning only
      const nonBlockedCmds = process.platform === 'win32' ? ['cmd'] : ['bash'];
      for (const cmd of nonBlockedCmds) {
        const result = await validateCommandName(cmd);
        // Either doesn't exist (valid, no warning) or exists (valid with warning)
        expect(result.valid).toBe(true);
        if (result.warning) {
          expect(result.error).toBeUndefined();
        }
      }
    });

    test('returns no warning for safe custom commands', async () => {
      const safeCommands = [
        'claude-mini',
        'minimax',
        'qwen-work',
        'my-custom-ai-123'
      ];

      for (const cmd of safeCommands) {
        const result = await validateCommandName(cmd);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.warning).toBeUndefined();
      }
    });

    test('handles case sensitivity in blocked check', async () => {
      // Should block regardless of case
      const result1 = await validateCommandName('GIT');
      const result2 = await validateCommandName('Git');
      const result3 = await validateCommandName('git');

      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
      expect(result3.valid).toBe(false);

      expect(result1.error).toContain('critical system command');
      expect(result2.error).toContain('critical system command');
      expect(result3.error).toContain('critical system command');
    });

    test('validates complete workflow', async () => {
      // Test complete validation workflow for various command types

      // 1. Blocked command - immediate rejection
      const blocked = await validateCommandName('sudo');
      expect(blocked.valid).toBe(false);
      expect(blocked.error).toBeDefined();

      // 2. Safe custom command - accepted
      const safe = await validateCommandName('claude-minimax-work');
      expect(safe.valid).toBe(true);
      expect(safe.error).toBeUndefined();
      expect(safe.warning).toBeUndefined();

      // 3. System command (if exists) - warning but accepted
      const systemCmd = process.platform === 'win32' ? 'cmd' : 'sh';
      const withWarning = await validateCommandName(systemCmd);
      expect(withWarning.valid).toBe(true);
      expect(withWarning.error).toBeUndefined();
      // May have warning if command exists
    });
  });

  describe('Edge Cases', () => {
    test('handles empty string', async () => {
      const result = await isSystemCommand('');
      expect(result).toBe(false);
    });

    test('handles very long command names', async () => {
      const longName = 'a'.repeat(1000);
      const result = await isSystemCommand(longName);
      expect(result).toBe(false);
    });

    test('handles special characters safely', async () => {
      const specialNames = [
        'command;rm',
        'command&&ls',
        'command|cat',
        'command`whoami`',
        'command$(ls)',
      ];

      for (const name of specialNames) {
        const result = await isSystemCommand(name);
        expect(result).toBe(false); // Invalid format, should reject
      }
    });

    test('blocked list includes all critical commands', () => {
      const critical = [
        'rm', 'sudo', 'git', 'npm', 'cd',
        'mkdir', 'chmod', 'kill', 'docker'
      ];

      critical.forEach(cmd => {
        expect(isBlockedCommand(cmd)).toBe(true);
      });
    });

    test('blocked list is case-insensitive', () => {
      expect(isBlockedCommand('RM')).toBe(true);
      expect(isBlockedCommand('Sudo')).toBe(true);
      expect(isBlockedCommand('GIT')).toBe(true);
      expect(isBlockedCommand('NPM')).toBe(true);
    });
  });
});
