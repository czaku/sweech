import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { EngineId, RunOptions } from '../types.js';
import type { CredentialProfile } from './types.js';
import {
  createEmptyRuntimeDocument,
  migrateRuntimeDocument,
  serializeRuntimeDocument,
  toLegacyRuntimeConfig,
  type OmnaiLegacyRuntimeConfig,
} from '../persistence-contract.js';

const PROFILES_PATH = join(homedir(), '.omnai', 'profiles.json');
const SWEECH_CONFIG_PATH = join(homedir(), '.sweech', 'config.json');

function isSafeProfileName(name: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(name) && !name.includes('..');
}

export type ProfilesConfig = OmnaiLegacyRuntimeConfig;

let cached: ProfilesConfig | null = null;

export function getProfilesPath(): string {
  return PROFILES_PATH;
}

export async function loadProfilesConfig(): Promise<ProfilesConfig> {
  if (cached) return cached;
  try {
    const raw = await readFile(PROFILES_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    const document = migrateRuntimeDocument(parsed, PROFILES_PATH);
    cached = toLegacyRuntimeConfig(document);
    if (!('schema' in (parsed as Record<string, unknown>)) || (parsed as Record<string, unknown>).version !== document.version) {
      await mkdir(dirname(PROFILES_PATH), { recursive: true });
      await writeFile(PROFILES_PATH, serializeRuntimeDocument(cached), 'utf-8');
    }
    return cached;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      cached = toLegacyRuntimeConfig(createEmptyRuntimeDocument());
      return cached;
    }
    throw error;
  }
}

export async function loadProfiles(): Promise<Record<string, CredentialProfile>> {
  const config = await loadProfilesConfig();
  const result: Record<string, CredentialProfile> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key === '_config' || !value || typeof value !== 'object' || !('name' in value)) continue;
    result[key] = value as CredentialProfile;
  }
  return result;
}

export async function saveProfilesConfig(config: ProfilesConfig): Promise<void> {
  await mkdir(dirname(PROFILES_PATH), { recursive: true });
  await writeFile(PROFILES_PATH, serializeRuntimeDocument(config), 'utf-8');
  cached = config;
}

export async function saveProfiles(profiles: Record<string, CredentialProfile>): Promise<void> {
  const existing = await loadProfilesConfig();
  const config: ProfilesConfig = {
    ...(existing._config ? { _config: existing._config } : {}),
    ...profiles,
  };
  await saveProfilesConfig(config);
}

export function clearProfileCache(): void {
  cached = null;
}

export async function getDefaultProfile(engine: EngineId): Promise<string | undefined> {
  const config = await loadProfilesConfig();
  return config._config?.defaults?.[engine];
}

export async function setDefaultProfile(engine: EngineId, profileName: string): Promise<void> {
  const config = await loadProfilesConfig();
  if (!config._config) config._config = {};
  if (!config._config.defaults) config._config.defaults = {};
  config._config.defaults[engine] = profileName;
  await saveProfilesConfig(config);
}

export async function getFailoverOrder(): Promise<string[]> {
  const config = await loadProfilesConfig();
  return config._config?.failoverOrder ?? [];
}

export async function setFailoverOrder(order: string[]): Promise<void> {
  const config = await loadProfilesConfig();
  if (!config._config) config._config = {};
  config._config.failoverOrder = order;
  await saveProfilesConfig(config);
}

/**
 * Check if multiple profiles exist for an engine, and whether a default is set.
 * Returns the default profile name, or throws with an actionable error.
 */
export async function resolveDefaultForEngine(engine: EngineId): Promise<string | null> {
  const profiles = await loadProfiles();
  const matching = Object.values(profiles).filter(p => {
    if (engine === 'claude-code') return p.provider === 'claude';
    return false;
  });

  if (matching.length <= 1) return null; // No ambiguity

  const defaultName = await getDefaultProfile(engine);
  if (defaultName && profiles[defaultName]) return defaultName;

  const names = matching.map(p => p.name).join(', ');
  throw new Error(
    `Multiple profiles found for ${engine}: ${names}\n` +
    `Set a default: omnai profiles set-default ${engine} <profile-name>\n` +
    `Or specify explicitly: omnai run "prompt" --profile <name>`
  );
}

export async function resolveProfile(profileName: string, opts: RunOptions): Promise<RunOptions> {
  if (!isSafeProfileName(profileName)) {
    throw new Error(`Unsafe profile name: "${profileName}". Only alphanumeric, underscore, hyphen, and dot are allowed.`);
  }

  const profiles = await loadProfiles();
  const profile = profiles[profileName];
  if (!profile) throw new Error(`Profile "${profileName}" not found in ${PROFILES_PATH}`);

  const env = { ...opts.env, ...profile.env };

  if (profile.claudeConfigDir) {
    env['CLAUDE_CONFIG_DIR'] = profile.claudeConfigDir;
  }

  // For codex profiles, derive CODEX_HOME from the Sweech convention ~/.<profileName>/
  // (mirrors how claudeConfigDir works for claude profiles)
  if (profile.provider === 'codex' && !env['CODEX_HOME']) {
    const { homedir } = await import('node:os');
    const { existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const codexHome = join(homedir(), `.${profileName}`);
    if (existsSync(codexHome)) {
      env['CODEX_HOME'] = codexHome;
    }
  }

  return {
    ...opts,
    provider: profile.provider ?? opts.provider,
    apiKey: profile.apiKey ?? opts.apiKey,
    baseUrl: profile.baseUrl ?? opts.baseUrl,
    env,
  };
}

interface SweechProfile {
  name: string;
  commandName: string;
  cliType: string;
  provider: string;
  baseUrl?: string;
  model?: string;
  sharedWith?: string;
}

export async function importSweechProfiles(): Promise<{ imported: string[]; skipped: string[] }> {
  const imported: string[] = [];
  const skipped: string[] = [];

  let sweechProfiles: SweechProfile[];
  try {
    const raw = await readFile(SWEECH_CONFIG_PATH, 'utf-8');
    sweechProfiles = JSON.parse(raw);
  } catch {
    return { imported, skipped };
  }

  const config = await loadProfilesConfig();

  if (!config['claude']) {
    config['claude'] = { name: 'claude', provider: 'claude' };
    imported.push('claude');
  } else {
    skipped.push('claude');
  }

  for (const sp of sweechProfiles) {
    const name = sp.commandName;
    if (!isSafeProfileName(name)) {
      skipped.push(name);
      continue;
    }
    if (config[name]) {
      skipped.push(name);
      continue;
    }

    const claudeConfigDir = join(homedir(), `.claude-${name.replace(/^claude-/, '')}`);
    config[name] = {
      name,
      provider: sp.cliType === 'claude' ? 'claude' : (sp.provider as any),
      baseUrl: sp.baseUrl || undefined,
      claudeConfigDir,
    };
    imported.push(name);
  }

  await saveProfilesConfig(config);
  return { imported, skipped };
}
