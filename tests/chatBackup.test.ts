/**
 * Tests for chat history backup functionality
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getDirectorySize,
  formatBytes,
  hasChatData,
  getChatBackupInfo
} from '../src/chatBackup';

jest.mock('fs');
jest.mock('inquirer', () => ({})); // Mock inquirer to avoid ES module issues
jest.mock('archiver', () => jest.fn()); // Mock archiver
jest.mock('chalk', () => ({
  cyan: jest.fn((str) => str),
  green: jest.fn((str) => str),
  gray: jest.fn((str) => str),
  yellow: jest.fn((str) => str),
  bold: { cyan: jest.fn((str) => str) }
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe('Chat Backup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('formatBytes', () => {
    test('formats bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(1000)).toBe('1000.00 B');
      expect(formatBytes(1024)).toBe('1.00 KB');
      expect(formatBytes(1048576)).toBe('1.00 MB');
      expect(formatBytes(1073741824)).toBe('1.00 GB');
    });

    test('formats intermediate values', () => {
      expect(formatBytes(1500)).toBe('1.46 KB');
      expect(formatBytes(2500000)).toBe('2.38 MB');
      expect(formatBytes(5000000000)).toBe('4.66 GB');
    });

    test('handles very small values', () => {
      expect(formatBytes(1)).toBe('1.00 B');
      expect(formatBytes(10)).toBe('10.00 B');
      expect(formatBytes(100)).toBe('100.00 B');
    });

    test('handles very large values', () => {
      const twoGB = 2 * 1024 * 1024 * 1024;
      expect(formatBytes(twoGB)).toBe('2.00 GB');
    });
  });

  describe('getDirectorySize', () => {
    test('returns 0 for non-existent directory', () => {
      mockFs.existsSync.mockReturnValue(false);

      const size = getDirectorySize('/non/existent');

      expect(size).toBe(0);
    });

    test('calculates size of single file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 1000
      } as any);

      const size = getDirectorySize('/test/file.txt');

      expect(size).toBe(1000);
    });

    test('calculates size of directory with files', () => {
      mockFs.existsSync.mockReturnValue(true);

      // Mock directory structure
      let callCount = 0;
      mockFs.statSync.mockImplementation((p: any) => {
        if (callCount === 0) {
          callCount++;
          return { isFile: () => false, isDirectory: () => true } as any;
        }
        return { isFile: () => true, isDirectory: () => false, size: 500 } as any;
      });

      mockFs.readdirSync.mockReturnValue(['file1.txt', 'file2.txt'] as any);

      const size = getDirectorySize('/test/dir');

      expect(size).toBe(1000); // 2 files × 500 bytes
    });

    test('handles nested directories', () => {
      mockFs.existsSync.mockReturnValue(true);

      // Complex mock for nested structure
      const structure: Record<string, any> = {
        '/test': { isDir: true, files: ['subdir', 'file1.txt'] },
        '/test/subdir': { isDir: true, files: ['file2.txt'] },
        '/test/file1.txt': { isFile: true, size: 100 },
        '/test/subdir/file2.txt': { isFile: true, size: 200 }
      };

      mockFs.statSync.mockImplementation((p: any) => {
        const pathStr = p.toString();
        const info = structure[pathStr];

        if (info?.isDir) {
          return { isFile: () => false, isDirectory: () => true } as any;
        }
        if (info?.isFile) {
          return { isFile: () => true, isDirectory: () => false, size: info.size } as any;
        }
        return { isFile: () => false, isDirectory: () => false } as any;
      });

      mockFs.readdirSync.mockImplementation((p: any) => {
        const pathStr = p.toString();
        return structure[pathStr]?.files || [];
      });

      const size = getDirectorySize('/test');

      expect(size).toBe(300); // 100 + 200
    });
  });

  describe('hasChatData', () => {
    test('returns false for non-existent directory', () => {
      mockFs.existsSync.mockReturnValue(false);

      expect(hasChatData('/non/existent')).toBe(false);
    });

    test('detects .jsonl files', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'conversation.jsonl', isDirectory: () => false, isFile: () => true }
      ] as any);

      expect(hasChatData('/test')).toBe(true);
    });

    test('detects projects directory', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'projects', isDirectory: () => true, isFile: () => false }
      ] as any);

      expect(hasChatData('/test')).toBe(true);
    });

    test('detects conversations directory', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'conversations', isDirectory: () => true, isFile: () => false }
      ] as any);

      expect(hasChatData('/test')).toBe(true);
    });

    test('detects history directory', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'history', isDirectory: () => true, isFile: () => false }
      ] as any);

      expect(hasChatData('/test')).toBe(true);
    });

    test('detects transcripts directory', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'transcripts', isDirectory: () => true, isFile: () => false }
      ] as any);

      expect(hasChatData('/test')).toBe(true);
    });

    test('returns false for directory without chat data', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'settings.json', isDirectory: () => false, isFile: () => true },
        { name: 'config.txt', isDirectory: () => false, isFile: () => true }
      ] as any);

      expect(hasChatData('/test')).toBe(false);
    });

    test('searches recursively', () => {
      mockFs.existsSync.mockReturnValue(true);

      let callCount = 0;
      mockFs.readdirSync.mockImplementation(() => {
        if (callCount === 0) {
          callCount++;
          return [
            { name: 'subdir', isDirectory: () => true, isFile: () => false }
          ] as any;
        }
        return [
          { name: 'chat.jsonl', isDirectory: () => false, isFile: () => true }
        ] as any;
      });

      expect(hasChatData('/test')).toBe(true);
    });

    test('handles errors gracefully', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      expect(hasChatData('/test')).toBe(false);
    });
  });

  describe('getChatBackupInfo', () => {
    test('returns correct info for non-existent directory', () => {
      mockFs.existsSync.mockReturnValue(false);

      const info = getChatBackupInfo('/non/existent');

      expect(info.exists).toBe(false);
      expect(info.hasChats).toBe(false);
      expect(info.size).toBe(0);
      expect(info.sizeFormatted).toBe('0 B');
    });

    test('returns correct info for directory with chats', () => {
      mockFs.existsSync.mockReturnValue(true);

      // First call for hasChatData
      mockFs.readdirSync.mockReturnValueOnce([
        { name: 'projects', isDirectory: () => true, isFile: () => false }
      ] as any);

      // Mock size calculation - return empty array for size calc to avoid recursion
      mockFs.readdirSync.mockReturnValue([] as any);
      mockFs.statSync.mockReturnValue({
        isFile: () => false,
        isDirectory: () => true
      } as any);

      const info = getChatBackupInfo('/test');

      expect(info.exists).toBe(true);
      expect(info.hasChats).toBe(true);
      expect(typeof info.size).toBe('number');
      expect(typeof info.sizeFormatted).toBe('string');
    });

    test('returns correct info for directory without chats', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'settings.json', isDirectory: () => false, isFile: () => true }
      ] as any);
      mockFs.statSync.mockReturnValue({
        isFile: () => true,
        isDirectory: () => false,
        size: 100
      } as any);

      const info = getChatBackupInfo('/test');

      expect(info.exists).toBe(true);
      expect(info.hasChats).toBe(false);
      expect(info.size).toBe(100);
      expect(info.sizeFormatted).toContain('B');
    });
  });

  describe('Chat Data Patterns', () => {
    test('recognizes Claude Code project structure', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'projects', isDirectory: () => true, isFile: () => false },
        { name: 'settings.json', isDirectory: () => false, isFile: () => true }
      ] as any);

      expect(hasChatData('/test')).toBe(true);
    });

    test('recognizes conversation logs', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: '20250203-session.jsonl', isDirectory: () => false, isFile: () => true }
      ] as any);

      expect(hasChatData('/test')).toBe(true);
    });

    test('ignores non-chat files', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([
        { name: 'config.json', isDirectory: () => false, isFile: () => true },
        { name: 'settings.json', isDirectory: () => false, isFile: () => true },
        { name: 'cache', isDirectory: () => true, isFile: () => false }
      ] as any);

      expect(hasChatData('/test')).toBe(false);
    });
  });
});
