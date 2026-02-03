/**
 * Tests for CLI configurations
 */

import { getCLI, getDefaultCLI, getCLIList, SUPPORTED_CLIS } from '../src/clis';

describe('CLI Management', () => {
  describe('getCLI', () => {
    test('returns Claude CLI config', () => {
      const claude = getCLI('claude');
      expect(claude).toBeDefined();
      expect(claude?.name).toBe('claude');
      expect(claude?.command).toBe('claude');
      expect(claude?.configDirEnvVar).toBe('CLAUDE_CONFIG_DIR');
    });

    test('returns undefined for unknown CLI', () => {
      const unknown = getCLI('unknown-cli');
      expect(unknown).toBeUndefined();
    });

    test('all CLIs have required fields', () => {
      Object.values(SUPPORTED_CLIS).forEach(cli => {
        expect(cli.name).toBeDefined();
        expect(cli.displayName).toBeDefined();
        expect(cli.command).toBeDefined();
        expect(cli.configDirEnvVar).toBeDefined();
        expect(cli.description).toBeDefined();
      });
    });
  });

  describe('getDefaultCLI', () => {
    test('returns Claude as default', () => {
      const defaultCLI = getDefaultCLI();
      expect(defaultCLI.name).toBe('claude');
      expect(defaultCLI.command).toBe('claude');
    });
  });

  describe('getCLIList', () => {
    test('returns array of CLIs', () => {
      const list = getCLIList();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });

    test('each item has name and value', () => {
      const list = getCLIList();
      list.forEach(item => {
        expect(item.name).toBeDefined();
        expect(item.value).toBeDefined();
      });
    });
  });
});
