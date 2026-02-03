"use strict";
/**
 * System command detection and validation
 * Prevents users from creating commands that shadow system commands
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSystemCommand = isSystemCommand;
exports.isBlockedCommand = isBlockedCommand;
exports.getSystemCommandWarning = getSystemCommandWarning;
exports.validateCommandName = validateCommandName;
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
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
async function isSystemCommand(commandName) {
    try {
        // Validate command name format to prevent injection
        if (!/^[a-z0-9-]+$/i.test(commandName)) {
            return false;
        }
        // Use 'which' on Unix-like systems (safer than shell)
        const whichCmd = process.platform === 'win32' ? 'where' : 'which';
        await execFileAsync(whichCmd, [commandName], { timeout: 1000 });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Check if a command is in the blocked list (synchronous)
 */
function isBlockedCommand(commandName) {
    return BLOCKED_COMMANDS.includes(commandName.toLowerCase());
}
/**
 * Get a warning message for system command collision
 */
function getSystemCommandWarning(commandName) {
    return `⚠️  "${commandName}" exists as a system command. Consider a different name to avoid confusion.`;
}
/**
 * Validate command name against system commands
 * Returns { valid: boolean, error?: string, warning?: string }
 */
async function validateCommandName(commandName) {
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
