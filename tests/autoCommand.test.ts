/**
 * Unit tests for the pure helpers behind `sweech auto`.
 *
 * The action handler in cli.ts is a thin wrapper; the bits with real
 * logic — JSON shape contract and spawn env construction — live in
 * src/autoCommand.ts and are exercised here.
 */

import {
  buildAutoCommandJson,
  buildAutoExecEnv,
  noProfileErrorMessage,
} from '../src/autoCommand';
import type { AccountRecommendation } from '../src/accountSelector';
import type { CLIConfig } from '../src/clis';

function makeRec(overrides: Partial<AccountRecommendation['account']> = {}, score = 42.5, reason = 'status=allowed, 7d=12%'): AccountRecommendation {
  return {
    account: {
      name: 'claude-main',
      commandName: 'claude-main',
      cliType: 'claude',
      configDir: '/home/u/.claude-main',
      isDefault: false,
      isManaged: true,
      ...overrides,
    },
    score,
    reason,
  };
}

const claudeCli: CLIConfig = {
  name: 'claude',
  displayName: 'Claude Code',
  command: 'claude',
  configDirEnvVar: 'CLAUDE_CONFIG_DIR',
} as CLIConfig;

const codexCli: CLIConfig = {
  name: 'codex',
  displayName: 'Codex',
  command: 'codex',
  configDirEnvVar: 'CODEX_HOME',
} as CLIConfig;

describe('buildAutoCommandJson', () => {
  test('includes profile, cliType, configDir, score, reason, command', () => {
    const rec = makeRec();
    const json = buildAutoCommandJson(rec);
    expect(json).toEqual({
      profile: 'claude-main',
      cliType: 'claude',
      configDir: '/home/u/.claude-main',
      score: 42.5,
      reason: 'status=allowed, 7d=12%',
      command: 'sweech use claude-main',
    });
  });

  test('command field always uses commandName (not display name)', () => {
    const rec = makeRec({ name: 'My Claude', commandName: 'claude-work' });
    expect(buildAutoCommandJson(rec).command).toBe('sweech use claude-work');
  });

  test('preserves negative scores (e.g. for rate-limited accounts)', () => {
    const rec = makeRec({}, -1, 'status=limit_reached');
    expect(buildAutoCommandJson(rec).score).toBe(-1);
  });

  test('preserves Infinity / -Infinity (edge cases from accountScore)', () => {
    const rec = makeRec({}, -Infinity, 'status=limit_reached');
    expect(buildAutoCommandJson(rec).score).toBe(-Infinity);
  });

  test('JSON is serialisable (no circular references)', () => {
    const rec = makeRec();
    expect(() => JSON.stringify(buildAutoCommandJson(rec))).not.toThrow();
  });

  test('codex profile produces sweech use <commandName>', () => {
    const rec = makeRec({
      name: 'codex-work',
      commandName: 'codex-work',
      cliType: 'codex',
      configDir: '/home/u/.codex-work',
    });
    const json = buildAutoCommandJson(rec);
    expect(json.cliType).toBe('codex');
    expect(json.command).toBe('sweech use codex-work');
  });
});

describe('buildAutoExecEnv', () => {
  test('sets configDirEnvVar from the cli config', () => {
    const env = buildAutoExecEnv(claudeCli, '/home/u/.claude-main', { PATH: '/usr/bin' });
    expect(env.CLAUDE_CONFIG_DIR).toBe('/home/u/.claude-main');
    expect(env.PATH).toBe('/usr/bin');
  });

  test('codex sets CODEX_HOME not CLAUDE_CONFIG_DIR', () => {
    const env = buildAutoExecEnv(codexCli, '/home/u/.codex-work', { PATH: '/usr/bin' });
    expect(env.CODEX_HOME).toBe('/home/u/.codex-work');
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });

  test('strips CLAUDECODE nesting var', () => {
    const env = buildAutoExecEnv(claudeCli, '/x', { CLAUDECODE: '1', PATH: '/usr/bin' });
    expect(env.CLAUDECODE).toBeUndefined();
  });

  test('strips CLAUDE_CODE_ENTRYPOINT nesting var', () => {
    const env = buildAutoExecEnv(claudeCli, '/x', { CLAUDE_CODE_ENTRYPOINT: 'cli', PATH: '/usr/bin' });
    expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined();
  });

  test('does not mutate the input base env', () => {
    const baseEnv = { CLAUDECODE: '1', PATH: '/usr/bin' };
    const env = buildAutoExecEnv(claudeCli, '/x', baseEnv);
    expect(baseEnv.CLAUDECODE).toBe('1');
    expect(env.CLAUDECODE).toBeUndefined();
  });

  test('overrides existing configDirEnvVar value', () => {
    const env = buildAutoExecEnv(claudeCli, '/new', { CLAUDE_CONFIG_DIR: '/old', PATH: '/usr/bin' });
    expect(env.CLAUDE_CONFIG_DIR).toBe('/new');
  });

  test('strips shadowing API keys (Anthropic / OpenAI / Kimi / GLM / DeepSeek / Qwen)', () => {
    const baseEnv = {
      ANTHROPIC_AUTH_TOKEN: 'stale-token',
      ANTHROPIC_API_KEY: 'stale-key',
      OPENAI_API_KEY: 'leak-openai',
      KIMI_API_KEY: 'leak-kimi',
      MOONSHOT_API_KEY: 'leak-moonshot',
      GLM_API_KEY: 'leak-glm',
      ZAI_API_KEY: 'leak-zai',
      ZHIPU_API_KEY: 'leak-zhipu',
      DEEPSEEK_API_KEY: 'leak-deepseek',
      QWEN_API_KEY: 'leak-qwen',
      DASHSCOPE_API_KEY: 'leak-dashscope',
      PATH: '/usr/bin',
    };
    const env = buildAutoExecEnv(claudeCli, '/x', baseEnv);
    expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.KIMI_API_KEY).toBeUndefined();
    expect(env.MOONSHOT_API_KEY).toBeUndefined();
    expect(env.GLM_API_KEY).toBeUndefined();
    expect(env.ZAI_API_KEY).toBeUndefined();
    expect(env.ZHIPU_API_KEY).toBeUndefined();
    expect(env.DEEPSEEK_API_KEY).toBeUndefined();
    expect(env.QWEN_API_KEY).toBeUndefined();
    expect(env.DASHSCOPE_API_KEY).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin'); // non-secret env preserved
  });

  test('strips other Claude Code nesting vars (SSE_PORT, OAUTH_TOKEN)', () => {
    const env = buildAutoExecEnv(claudeCli, '/x', {
      CLAUDE_CODE_SSE_PORT: '12345',
      CLAUDE_CODE_OAUTH_TOKEN: 'tok',
      PATH: '/usr/bin',
    });
    expect(env.CLAUDE_CODE_SSE_PORT).toBeUndefined();
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  test('strips MCP_SERVERS_PATH so the child does not inherit an unintended MCP graph', () => {
    const env = buildAutoExecEnv(claudeCli, '/x', { MCP_SERVERS_PATH: '/parent/mcp', PATH: '/usr/bin' });
    expect(env.MCP_SERVERS_PATH).toBeUndefined();
  });

  test('strip happens BEFORE configDirEnvVar set — picked profile wins', () => {
    // Regression: if the strip ran AFTER the configDirEnvVar set, we'd
    // delete the value we just wrote. Verify the order is correct by
    // passing both the inherited and the new configDir.
    const env = buildAutoExecEnv(codexCli, '/picked-codex', {
      CODEX_HOME: '/inherited-codex',
      CLAUDE_CONFIG_DIR: '/inherited-claude',
      PATH: '/usr/bin',
    });
    expect(env.CODEX_HOME).toBe('/picked-codex');
    // CLAUDE_CONFIG_DIR was stripped (not the picked CLI's var)
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined();
  });
});

describe('noProfileErrorMessage', () => {
  test('returns generic message when no cli filter', () => {
    expect(noProfileErrorMessage(undefined)).toBe('no available profile');
  });

  test('includes --cli filter in message when set', () => {
    expect(noProfileErrorMessage('claude')).toBe('no available profile for --cli claude');
  });

  test('includes codex filter', () => {
    expect(noProfileErrorMessage('codex')).toBe('no available profile for --cli codex');
  });

  test('empty string filter is treated as no filter', () => {
    expect(noProfileErrorMessage('')).toBe('no available profile');
  });
});
