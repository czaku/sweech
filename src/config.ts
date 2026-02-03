/**
 * Configuration manager for sweetch profiles
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProviderConfig } from './providers';
import { CLIConfig, getDefaultCLI } from './clis';

export interface ProfileConfig {
  name: string;
  commandName: string;
  cliType: string; // 'claude' or 'codex'
  provider: string;
  apiKey: string;
  baseUrl?: string;
  model?: string;
  smallFastModel?: string;
  createdAt: string;
}

export class ConfigManager {
  private configDir: string;
  private configFile: string;
  private profilesDir: string;
  private binDir: string;

  constructor() {
    this.configDir = path.join(os.homedir(), '.sweech');
    this.configFile = path.join(this.configDir, 'config.json');
    this.profilesDir = path.join(this.configDir, 'profiles');
    this.binDir = path.join(this.configDir, 'bin');

    this.ensureDirectories();
  }

  private ensureDirectories(): void {
    [this.configDir, this.profilesDir, this.binDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  public getProfiles(): ProfileConfig[] {
    if (!fs.existsSync(this.configFile)) {
      return [];
    }

    const data = fs.readFileSync(this.configFile, 'utf-8');
    const profiles = JSON.parse(data);

    // Backward compatibility: add cliType if missing
    return profiles.map((p: any) => ({
      ...p,
      cliType: p.cliType || 'claude'
    }));
  }

  public addProfile(profile: ProfileConfig): void {
    const profiles = this.getProfiles();

    // Check if command name already exists
    if (profiles.some(p => p.commandName === profile.commandName)) {
      throw new Error(`Command name '${profile.commandName}' already exists`);
    }

    profiles.push(profile);
    fs.writeFileSync(this.configFile, JSON.stringify(profiles, null, 2));
  }

  public removeProfile(commandName: string): void {
    const profiles = this.getProfiles().filter(p => p.commandName !== commandName);
    fs.writeFileSync(this.configFile, JSON.stringify(profiles, null, 2));

    // Remove wrapper script
    const wrapperPath = path.join(this.binDir, commandName);
    if (fs.existsSync(wrapperPath)) {
      fs.unlinkSync(wrapperPath);
    }

    // Remove profile config directory
    const profileDir = path.join(this.profilesDir, commandName);
    if (fs.existsSync(profileDir)) {
      fs.rmSync(profileDir, { recursive: true, force: true });
    }
  }

  public createProfileConfig(commandName: string, provider: ProviderConfig, apiKey: string, cliType: string = 'claude'): void {
    const profileDir = path.join(this.profilesDir, commandName);

    if (!fs.existsSync(profileDir)) {
      fs.mkdirSync(profileDir, { recursive: true });
    }

    const settings: any = { env: {} };

    // Set environment variables based on CLI type
    if (cliType === 'codex') {
      // Codex CLI uses OpenAI environment variables
      settings.env.OPENAI_API_KEY = apiKey;

      if (provider.baseUrl) {
        settings.env.OPENAI_BASE_URL = provider.baseUrl;
      }

      if (provider.defaultModel) {
        settings.env.OPENAI_MODEL = provider.defaultModel;
      }

      if (provider.smallFastModel) {
        settings.env.OPENAI_SMALL_FAST_MODEL = provider.smallFastModel;
      }
    } else {
      // Claude Code CLI uses Anthropic environment variables
      settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;

      if (provider.baseUrl) {
        settings.env.ANTHROPIC_BASE_URL = provider.baseUrl;
      }

      if (provider.defaultModel) {
        settings.env.ANTHROPIC_MODEL = provider.defaultModel;
      }

      if (provider.smallFastModel) {
        settings.env.ANTHROPIC_SMALL_FAST_MODEL = provider.smallFastModel;
      }
    }

    // Add timeout for providers that need it
    if (provider.name === 'minimax') {
      settings.env.API_TIMEOUT_MS = '3000000';
    }

    const settingsPath = path.join(profileDir, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Create .claude.json to skip onboarding for external providers
    // This prevents Claude Code from asking for authentication when using custom providers
    const claudeJsonPath = path.join(profileDir, '.claude.json');
    const claudeConfig = {
      hasCompletedOnboarding: true,
      loginMethod: 'api_key',
      apiKey: 'sk-ant-external-provider',
      userID: this.generateUserID(),
      firstStartTime: new Date().toISOString()
    };
    fs.writeFileSync(claudeJsonPath, JSON.stringify(claudeConfig, null, 2));
  }

  private generateUserID(): string {
    // Generate a deterministic user ID based on timestamp and random data
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  public createWrapperScript(commandName: string, cli: CLIConfig): void {
    const profileDir = path.join(this.profilesDir, commandName);
    const wrapperPath = path.join(this.binDir, commandName);
    const usageFile = path.join(this.configDir, 'usage.json');

    // Create bash wrapper script with usage tracking
    const wrapperContent = `#!/bin/bash
# 🍭 Sweetch wrapper for ${commandName} (${cli.displayName})

# Log usage (background process to not slow down startup)
(
  USAGE_FILE="${usageFile}"
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

  # Create or update usage.json
  if [ -f "$USAGE_FILE" ]; then
    CONTENT=$(cat "$USAGE_FILE")
  else
    CONTENT="[]"
  fi

  # Append new record (simple JSON append)
  RECORD="{\\"commandName\\":\\"${commandName}\\",\\"timestamp\\":\\"$TIMESTAMP\\"}"
  UPDATED=$(echo "$CONTENT" | sed "s/\\]$/,$RECORD]/")
  echo "$UPDATED" > "$USAGE_FILE"
) &

# Transform arguments: --yolo -> --dangerously-skip-permissions (Claude Code only)
ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--yolo" ] && [ "${cli.command}" = "claude" ]; then
    ARGS+=("--dangerously-skip-permissions")
  else
    ARGS+=("$arg")
  fi
done

export ${cli.configDirEnvVar}="${profileDir}"
exec ${cli.command} "\${ARGS[@]}"
`;

    fs.writeFileSync(wrapperPath, wrapperContent, { mode: 0o755 });
  }

  public getBinDir(): string {
    return this.binDir;
  }

  public getProfileDir(commandName: string): string {
    return path.join(this.profilesDir, commandName);
  }

  public getConfigDir(): string {
    return this.configDir;
  }

  public getConfigFile(): string {
    return this.configFile;
  }

  public getProfilesDir(): string {
    return this.profilesDir;
  }
}
