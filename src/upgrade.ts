import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { ConfigManager, type ProfileConfig } from './config';
import { getCLI } from './clis';
import { auditProfiles, fixProviderOnProfile } from './profileAudit';
import { DEFAULT_FED_PORT } from './constants';

export interface UpgradeOptions {
  dryRun?: boolean;
  json?: boolean;
  silent?: boolean;
  openDashboard?: boolean;
  opener?: (url: string) => void;
}

export interface UpgradeResult {
  dryRun: boolean;
  wrappers: {
    scanned: number;
    updated: string[];
    skipped: Array<{ profile: string; reason: string }>;
  };
  shareTopology: ReturnType<ConfigManager['healShareTopology']>;
  shareSweep: {
    repairs: Array<{ profile: string; repaired: number }>;
    planned: Array<{ profile: string; name: string; target: string; reason: string }>;
    skipped: Array<{ profile: string; reason: string }>;
  };
  sessionsDb: {
    path: string;
    initialized: boolean;
  };
  providers: {
    scanned: number;
    fixed: Array<{ profile: string; from?: string; to?: string }>;
    planned: Array<{ profile: string; from: string; to: string }>;
    skipped: Array<{ profile: string; reason: string }>;
  };
  dashboard: {
    url: string;
    opened: boolean;
    skippedReason?: string;
  };
  totals: {
    changed: number;
    planned: number;
  };
}

const UPGRADE_STATE_FILE = 'upgrade-state.json';

export async function runUpgrade(opts: UpgradeOptions = {}): Promise<UpgradeResult> {
  const dryRun = !!opts.dryRun;
  const shouldOpenDashboard = opts.openDashboard !== false;

  const prior = ConfigManager.disableConstructorHeal;
  ConfigManager.disableConstructorHeal = true;
  let config: ConfigManager;
  try {
    config = new ConfigManager();
  } finally {
    ConfigManager.disableConstructorHeal = prior;
  }

  const profiles = config.getProfiles();
  const wrappers = updateWrappers(config, profiles, dryRun);
  const shareTopology = config.healShareTopology({ dryRun });
  const shareSweep = sweepSharedProfiles(config, profiles, dryRun);
  const sessionsDb = initializeSessionsDb(dryRun);
  const providers = await classifyProviders(config, dryRun);
  const dashboard = openDashboardOnce(config, dryRun, shouldOpenDashboard, opts.opener ?? defaultOpenUrl);

  const changed =
    wrappers.updated.length +
    shareTopology.linksCreated.length +
    shareTopology.collisionsHealed.length +
    shareSweep.repairs.reduce((sum, item) => sum + item.repaired, 0) +
    (sessionsDb.initialized ? 1 : 0) +
    providers.fixed.length +
    (dashboard.opened ? 1 : 0);
  const planned =
    (dryRun ? wrappers.updated.length : 0) +
    shareTopology.linksCreated.length +
    shareTopology.collisionsHealed.length +
    shareSweep.planned.length +
    providers.planned.length +
    (dashboard.opened || dashboard.skippedReason === 'dry-run' ? 1 : 0);

  const result: UpgradeResult = {
    dryRun,
    wrappers,
    shareTopology,
    shareSweep,
    sessionsDb,
    providers,
    dashboard,
    totals: { changed, planned },
  };

  if (!dryRun) {
    config.logLifecycle({
      event: 'upgrade.completed',
      wrappersUpdated: wrappers.updated.length,
      shareLinksCreated: shareTopology.linksCreated.length,
      shareCollisionsHealed: shareTopology.collisionsHealed.length,
      shareSweepRepairs: shareSweep.repairs.reduce((sum, item) => sum + item.repaired, 0),
      providersFixed: providers.fixed.length,
      sessionsDbInitialized: sessionsDb.initialized,
      dashboardOpened: dashboard.opened,
    });
  }

  return result;
}

function updateWrappers(
  config: ConfigManager,
  profiles: ProfileConfig[],
  dryRun: boolean,
): UpgradeResult['wrappers'] {
  const result: UpgradeResult['wrappers'] = { scanned: profiles.length, updated: [], skipped: [] };

  for (const profile of profiles) {
    const cli = getCLI(profile.cliType);
    if (!cli) {
      result.skipped.push({ profile: profile.commandName, reason: `unsupported cliType: ${profile.cliType}` });
      continue;
    }
    if (!dryRun) config.createWrapperScript(profile.commandName, cli);
    result.updated.push(profile.commandName);
  }

  return result;
}

function sweepSharedProfiles(
  config: ConfigManager,
  profiles: ProfileConfig[],
  dryRun: boolean,
): UpgradeResult['shareSweep'] {
  const result: UpgradeResult['shareSweep'] = { repairs: [], planned: [], skipped: [] };

  for (const profile of profiles) {
    if (!profile.sharedWith) continue;
    if (dryRun) {
      result.planned.push(...config.previewProfileSharedDirRepairs(profile.commandName));
      continue;
    }
    try {
      const repaired = config.healProfileSharedDirs(profile.commandName);
      if (repaired > 0) result.repairs.push({ profile: profile.commandName, repaired });
    } catch (err) {
      result.skipped.push({
        profile: profile.commandName,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

function initializeSessionsDb(dryRun: boolean): UpgradeResult['sessionsDb'] {
  const dbPath = path.join(os.homedir(), '.sweech', 'sessions.db');
  if (dryRun) return { path: dbPath, initialized: false };

  const existed = fs.existsSync(dbPath);
  const { SessionsDb } = require('./sessionsDb') as typeof import('./sessionsDb');
  const db = new SessionsDb(dbPath);
  db.close();
  return { path: dbPath, initialized: !existed && fs.existsSync(dbPath) };
}

async function classifyProviders(config: ConfigManager, dryRun: boolean): Promise<UpgradeResult['providers']> {
  const report = await auditProfiles({ config });
  const findings = report.findings.filter(f => f.kind === 'provider_misconfig');
  const result: UpgradeResult['providers'] = {
    scanned: report.scanned,
    fixed: [],
    planned: [],
    skipped: [],
  };

  for (const finding of findings) {
    const expectedProvider = typeof finding.evidence.expectedProvider === 'string'
      ? finding.evidence.expectedProvider
      : null;
    if (!expectedProvider) {
      result.skipped.push({ profile: finding.profile, reason: 'missing expected provider' });
      continue;
    }
    if (dryRun) {
      result.planned.push({ profile: finding.profile, from: finding.provider, to: expectedProvider });
      continue;
    }
    const fixed = fixProviderOnProfile(config, finding.profile, expectedProvider);
    if (fixed.changed) result.fixed.push({ profile: finding.profile, from: fixed.from, to: fixed.to });
    else result.skipped.push({ profile: finding.profile, reason: fixed.reason ?? 'not changed' });
  }

  return result;
}

function openDashboardOnce(
  config: ConfigManager,
  dryRun: boolean,
  enabled: boolean,
  opener: (url: string) => void,
): UpgradeResult['dashboard'] {
  const url = `http://127.0.0.1:${DEFAULT_FED_PORT}/`;
  if (!enabled) return { url, opened: false, skippedReason: 'disabled' };

  const statePath = path.join(config.getConfigDir(), UPGRADE_STATE_FILE);
  const state = readUpgradeState(statePath);
  if (typeof state.dashboardOpenedAt === 'string') {
    return { url, opened: false, skippedReason: 'already-opened' };
  }

  if (dryRun) return { url, opened: false, skippedReason: 'dry-run' };

  opener(url);
  writeUpgradeState(statePath, { ...state, dashboardOpenedAt: new Date().toISOString() });
  return { url, opened: true };
}

function readUpgradeState(statePath: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function writeUpgradeState(statePath: string, state: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(statePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 });
}

function defaultOpenUrl(url: string): void {
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(command, args, () => { /* best effort; users can run `sweech dashboard` manually */ });
}
