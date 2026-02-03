/**
 * System command detection and validation
 * Prevents users from creating commands that shadow system commands
 */

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// Critical system commands that should NEVER be shadowed
const BLOCKED_COMMANDS = [
  // Navigation & file system
  'cd', 'ls', 'pwd', 'mkdir', 'rm', 'cp', 'mv', 'touch',

  // File viewing/editing
  'cat', 'less', 'more', 'head', 'tail', 'nano', 'vim', 'vi',

  // System operations
  'sudo', 'su', 'chmod', 'chown', 'kill', 'ps', 'top',

  // Git (very common)
  'git', 'gh',

  // Package managers
  'npm', 'yarn', 'pnpm', 'pip', 'brew',

  // Shell builtins
  'echo', 'export', 'source', 'alias',

  // Common CLIs
  'node', 'python', 'python3', 'ruby', 'java', 'docker',

  // Other AI CLIs
  'copilot',
];

/**
 * Check if a command exists in the system PATH
 * Uses execFile with 'which'/'where' for safety
 */
export async function isSystemCommand(commandName: string): Promise<boolean> {
  try {
    // Validate command name format to prevent injection
    if (!/^[a-z0-9-]+$/i.test(commandName)) {
      return false;
    }

    // Use 'which' on Unix-like systems (safer than shell)
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    await execFileAsync(whichCmd, [commandName], { timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a command is in the blocked list (synchronous)
 */
export function isBlockedCommand(commandName: string): boolean {
  return BLOCKED_COMMANDS.includes(commandName.toLowerCase());
}

/**
 * Get a warning message for system command collision
 */
export function getSystemCommandWarning(commandName: string): string {
  return `⚠️  "${commandName}" exists as a system command. Consider a different name to avoid confusion.`;
}

/**
 * Validate command name against system commands
 * Returns { valid: boolean, error?: string, warning?: string }
 */
export async function validateCommandName(
  commandName: string
): Promise<{ valid: boolean; error?: string; warning?: string }> {

  // Check if blocked (critical system command)
  if (isBlockedCommand(commandName)) {
    return {
      valid: false,
      error: `Cannot use "${commandName}" - this is a critical system command that must not be shadowed`
    };
  }

  // Check if exists in system PATH
  const existsInSystem = await isSystemCommand(commandName);
  if (existsInSystem) {
    return {
      valid: true,
      warning: getSystemCommandWarning(commandName)
    };
  }

  return { valid: true };
}
