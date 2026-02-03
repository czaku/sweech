# 🍭 Sweech Testing Guide

Sweech includes a comprehensive test suite to ensure changes don't break functionality.

## Running Tests

```bash
# Run all tests
npm test

# Watch mode (auto-rerun on changes)
npm run test:watch

# Coverage report
npm run test:coverage
```

## Test Structure

```
tests/
├── systemCommands.test.ts   # System command detection
├── providers.test.ts         # Provider configurations
├── clis.test.ts             # CLI configurations
├── config.test.ts           # Profile management
├── configManager.test.ts    # Config file operations
├── backup.test.ts           # Encryption and backups
├── interactive.test.ts      # Input validation
├── usage.test.ts            # Usage tracking
├── aliases.test.ts          # Alias management
├── completion.test.ts       # Shell completion
├── reset.test.ts            # Reset/uninstall protection
├── chatBackup.test.ts       # Chat history backup
├── utilityCommands.test.ts  # Utility commands (doctor, path, test, etc.)
└── cliDetection.test.ts     # CLI detection and version checking
```

## Current Coverage

✅ **343 tests passing** across 15 test suites:

### Overall Metrics

```
Coverage:   100.00% statements 🎉
             96.55% branches
            100.00% functions
             98.81% lines
```

**Note:** Branch coverage is 96.55% due to platform-specific code (`process.platform === 'win32'`) that can only be fully tested in multi-platform CI. The 80% branch coverage in `systemCommands.ts` is expected and acceptable.

### System Command Detection (systemCommands.test.ts) - 27 tests

Tests to prevent command name collisions with system commands:

```typescript
✓ Blocks critical commands (mkdir, rm, sudo, git, npm)
✓ Allows safe command names (claude-mini, minimax, qwen)
✓ Case-insensitive blocking
✓ Validates command name format
✓ Rejects blocked commands with helpful errors
✓ Detects real system commands (bash, sh, cmd)
✓ Returns warnings for non-blocked system commands
✓ Distinguishes between blocked and warned commands
✓ Handles edge cases (empty, long names, special chars)
✓ Prevents command injection attacks
✓ Tests complete validation workflow
```

**Why this matters:**
- Prevents `sweetch add` with name "mkdir" which would shadow system command
- Protects critical commands (rm, sudo, git) from being overwritten
- Warns about non-critical system commands (bash, python, etc.)
- Security: prevents command injection through validation

### Provider Management (providers.test.ts)

Tests for provider template configurations:

```typescript
✓ Returns correct provider config (baseUrl, model, etc.)
✓ Handles unknown providers gracefully
✓ All providers have required fields
✓ Provider list is complete and formatted correctly
✓ Includes all major providers (minimax, qwen, kimi, deepseek, glm)
```

### CLI Management (clis.test.ts)

Tests for CLI abstraction layer:

```typescript
✓ Returns correct CLI config (command, configDirEnvVar)
✓ Claude is the default CLI
✓ All CLIs have required fields
✓ CLI list format is correct
```

### Configuration (config.test.ts)

Tests for profile structure and validation:

```typescript
✓ Profile has all required fields
✓ Supports optional fields (baseUrl, model)
✓ Command name validation (lowercase, hyphens, numbers only)
✓ Rejects invalid characters (uppercase, spaces, underscores)
✓ Provider integration works correctly
```

### Config Manager (configManager.test.ts) - 20 tests

Tests for configuration file management:

```typescript
✓ Directory initialization and creation
✓ Profile CRUD operations (get, add, remove)
✓ Settings.json generation with correct structure
✓ Wrapper script creation with proper permissions
✓ Path getters (bin, profile, config directories)
✓ Error handling (duplicate names, file operations)
✓ Provider-specific settings (MiniMax timeout)
✓ CLI-specific wrapper script generation
✓ Legacy profile migration (backward compatibility)
```

### Backup/Restore (backup.test.ts) - 20 tests

Tests for encryption and backup functionality:

```typescript
✓ AES-256-CBC encryption/decryption round-trip
✓ PBKDF2 key derivation (100,000 iterations)
✓ Password validation (minimum length, matching)
✓ Wrong password detection
✓ Salt and IV randomness
✓ Key derivation consistency
✓ Backup file format validation
✓ Security properties (one-way hashing, no password recovery)
✓ Error handling (corrupted data, missing files)
```

### Usage Tracking (usage.test.ts) - 25 tests

Tests for usage statistics functionality:

```typescript
✓ Creates new usage file with first record
✓ Appends to existing usage file
✓ Limits records to last 1000
✓ Handles corrupted usage file gracefully
✓ Returns empty array when no usage file exists
✓ Calculates stats for single command
✓ Calculates stats for multiple commands
✓ Filters stats by command name
✓ Sorts stats by total uses descending
✓ Includes recent uses (last 10)
✓ Clears all stats when no command specified
✓ Clears stats for specific command only
```

### Alias Management (aliases.test.ts) - 22 tests

Tests for command alias functionality:

```typescript
✓ Returns empty object when no alias file exists
✓ Returns aliases from file
✓ Handles corrupted alias file
✓ Adds alias to empty file
✓ Adds alias to existing aliases
✓ Throws error when alias already exists
✓ Removes existing alias
✓ Throws error when alias does not exist
✓ Resolves existing alias to command
✓ Returns input when not an alias
✓ Checks if name is alias
✓ Supports multiple aliases to same command
✓ Can add, resolve, and remove aliases
```

### Shell Completion (completion.test.ts) - 32 tests

Tests for completion script generation:

```typescript
✓ Generates valid bash completion script
✓ Includes all command names in completion
✓ Includes profile names for relevant commands
✓ Includes alias names in completion
✓ Handles remove/rm commands
✓ Handles alias subcommands
✓ Handles completion shell options
✓ Uses bash variable syntax
✓ Handles empty profiles and aliases lists
✓ Generates valid zsh completion script
✓ Includes command descriptions (zsh)
✓ Uses zsh variable syntax
✓ Script format is executable
✓ Scripts update dynamically with profiles
✓ Scripts update dynamically with aliases
```

### Reset/Uninstall Protection (reset.test.ts) - 28 tests

Tests for safe uninstall and default directory protection:

```typescript
✓ Identifies Claude and Codex default directories
✓ Identifies alternate config locations (~/.config/claude)
✓ Does not identify sweetch-managed directories
✓ Handles relative paths, trailing slashes
✓ Case-sensitive on Unix, insensitive on Windows
✓ Protects default CLI names (claude, codex)
✓ Allows custom profile names
✓ Handles case-insensitively for names
✓ Protects all default directories from removal
✓ Allows removing sweetch-managed profiles
✓ Edge cases: empty strings, root, home, nested paths
```

### Chat Backup (chatBackup.test.ts) - 23 tests

Tests for chat history backup functionality:

```typescript
✓ Formats bytes correctly (B, KB, MB, GB)
✓ Calculates directory sizes recursively
✓ Detects .jsonl files (conversation logs)
✓ Detects projects/, conversations/, history/, transcripts/ directories
✓ Returns false for directory without chat data
✓ Searches recursively for chat data
✓ Handles errors gracefully
✓ Returns correct backup info for directories
✓ Recognizes Claude Code project structure
✓ Ignores non-chat files
```

### Utility Commands (utilityCommands.test.ts) - 44 tests

Tests for utility commands (doctor, path, test, edit, clone, rename):

```typescript
✓ isInPath checks if sweetch bin in PATH correctly
✓ Handles empty PATH, undefined PATH
✓ Normalizes paths with trailing slashes
✓ Case-sensitive path checking on Unix
✓ detectShell identifies bash, zsh, fish
✓ Returns default shell when SHELL not set
✓ Handles shell paths with versions
✓ getShellRCFile returns correct RC file paths
✓ Fish uses nested config directory structure
✓ Handles unknown shells gracefully
✓ RC files point to home directory
✓ Error handling for undefined environment variables
```

### CLI Detection (cliDetection.test.ts) - 35 tests

Tests for CLI detection and version checking:

```typescript
✓ isCLIInstalled uses 'which' on Unix, 'where' on Windows
✓ Returns true when CLI is installed
✓ Returns false when CLI is not installed
✓ Has timeout configured for detection
✓ getCLIVersion returns version from stdout/stderr
✓ Trims whitespace from version output
✓ Returns undefined when version command fails
✓ detectInstalledCLIs checks all supported CLIs
✓ Returns consistent CLIDetectionResult format
✓ Includes CLI even if version unavailable
✓ formatCLIChoices formats installed CLIs with versions
✓ Formats non-installed CLIs with disabled message
✓ Includes install URL in disabled message
✓ Handles mixed installation states
✓ Integration tests for full detection workflow
✓ Error handling for ENOENT, EACCES, timeouts
```

## What's Protected by Tests

### 1. System Command Collisions

**Problem:** User tries to name their command `mkdir`
```bash
$ sweetch add
? Command name: mkdir
✗ Cannot use "mkdir" - this is a critical system command
```

**Test:** `systemCommands.test.ts`
- Blocks: mkdir, rm, cp, mv, git, npm, docker, etc.
- Warns: other system commands found in PATH

### 2. Provider Configurations

**Problem:** Provider template missing required fields
```typescript
// This would fail tests:
minimax: {
  name: 'minimax',
  // Missing baseUrl, defaultModel, description!
}
```

**Test:** `providers.test.ts`
- Ensures all providers have complete configs
- Validates URLs and model names
- Checks description exists

### 3. Command Name Format

**Problem:** Invalid command names slip through
```bash
# These should be rejected:
"Claude-Mini"   # Uppercase
"claude_mini"   # Underscore
"claude mini"   # Space
```

**Test:** `config.test.ts`
- Regex validation: `/^[a-z0-9-]+$/`
- Only lowercase, numbers, hyphens

### 4. CLI Abstraction

**Problem:** CLI config missing environment variable
```typescript
// This would fail:
codex: {
  name: 'codex',
  command: 'codex',
  // Missing configDirEnvVar!
}
```

**Test:** `clis.test.ts`
- All required fields present
- Default CLI returns correctly

## Running Specific Tests

```bash
# Run only system command tests
npm test systemCommands

# Run only provider tests
npm test providers

# Run tests matching pattern
npm test "command"
```

## Coverage Report

```bash
npm run test:coverage
```

Generates HTML report in `coverage/` directory:
- Line coverage
- Branch coverage
- Function coverage
- Statement coverage

Open `coverage/index.html` in browser for detailed view.

## Adding New Tests

### Test Structure

```typescript
import { functionToTest } from '../src/module';

describe('Feature Name', () => {
  describe('functionToTest', () => {
    test('does what it should', () => {
      const result = functionToTest('input');
      expect(result).toBe('expected');
    });

    test('handles edge cases', () => {
      const result = functionToTest('edge-case');
      expect(result).toBeDefined();
    });
  });
});
```

### Example: Testing New Provider

```typescript
// tests/providers.test.ts

test('gemini provider is configured', () => {
  const gemini = getProvider('gemini');
  expect(gemini).toBeDefined();
  expect(gemini?.displayName).toBe('Google Gemini');
  expect(gemini?.baseUrl).toContain('generativelanguage');
});
```

### Example: Testing CLI Configuration

```typescript
// tests/clis.test.ts

test('codex CLI is configured', () => {
  const codex = getCLI('codex');
  expect(codex).toBeDefined();
  expect(codex?.command).toBe('codex');
  expect(codex?.configDirEnvVar).toBe('CODEX_CONFIG_DIR');
});
```

## Continuous Integration

### GitHub Actions Example

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

## Test-Driven Development

When adding new features:

### 1. Write Test First

```typescript
// tests/newFeature.test.ts
test('new feature works', () => {
  const result = newFeature();
  expect(result).toBe('expected');
});
```

### 2. Watch It Fail

```bash
npm run test:watch
# Test fails (feature doesn't exist yet)
```

### 3. Implement Feature

```typescript
// src/newFeature.ts
export function newFeature() {
  return 'expected';
}
```

### 4. Watch It Pass

```bash
# Test passes automatically in watch mode!
```

## Common Test Patterns

### Testing Async Functions

```typescript
test('validates command asynchronously', async () => {
  const result = await validateCommandName('test');
  expect(result.valid).toBe(true);
});
```

### Testing Error Cases

```typescript
test('rejects blocked commands', async () => {
  const result = await validateCommandName('mkdir');
  expect(result.valid).toBe(false);
  expect(result.error).toBeDefined();
});
```

### Testing Multiple Inputs

```typescript
test('accepts various formats', () => {
  const validNames = ['claude-mini', 'minimax', 'qwen-1'];
  validNames.forEach(name => {
    expect(/^[a-z0-9-]+$/.test(name)).toBe(true);
  });
});
```

## Debugging Tests

### Run Single Test

```bash
npm test -- -t "specific test name"
```

### Verbose Output

```bash
npm test -- --verbose
```

### Show Console Logs

```bash
npm test -- --silent=false
```

## Benefits of Testing

1. **Catch regressions** - Changes don't break existing features
2. **Document behavior** - Tests show how code should work
3. **Refactor confidently** - Change implementation without fear
4. **Faster debugging** - Know exactly what broke
5. **Better design** - Testable code is better code

## What to Test Next

Priority features that need tests:

1. **ConfigManager** - File I/O mocking
2. **Backup/Restore** - Encryption/decryption
3. **Interactive prompts** - User input simulation
4. **Wrapper script generation** - File creation
5. **CLI commands** - End-to-end testing

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Testing TypeScript](https://kulshekhar.github.io/ts-jest/)
- [Testing Best Practices](https://testingjavascript.com/)

---

Back to [README](README.md) | [Contributing](ARCHITECTURE.md)
