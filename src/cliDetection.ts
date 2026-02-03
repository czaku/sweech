/**
 * CLI detection - check which AI coding CLIs are installed
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { SUPPORTED_CLIS, CLIConfig } from './clis';

const execFileAsync = promisify(execFile);

export interface CLIDetectionResult {
  cli: CLIConfig;
  installed: boolean;
  version?: string;
}

/**
 * Check if a specific CLI is installed
 */
export async function isCLIInstalled(cliCommand: string): Promise<boolean> {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    await execFileAsync(whichCmd, [cliCommand], { timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get version of installed CLI
 */
export async function getCLIVersion(cliCommand: string): Promise<string | undefined> {
  try {
    const result = await execFileAsync(cliCommand, ['--version'], { timeout: 2000 });
    return result.stdout.trim() || result.stderr.trim();
  } catch {
    return undefined;
  }
}

/**
 * Detect all supported CLIs
 */
export async function detectInstalledCLIs(): Promise<CLIDetectionResult[]> {
  const results: CLIDetectionResult[] = [];

  for (const cli of Object.values(SUPPORTED_CLIS)) {
    const installed = await isCLIInstalled(cli.command);
    const version = installed ? await getCLIVersion(cli.command) : undefined;

    results.push({
      cli,
      installed,
      version
    });
  }

  return results;
}

/**
 * Get formatted CLI list for inquirer choices
 */
export function formatCLIChoices(detectionResults: CLIDetectionResult[]): Array<{
  name: string;
  value: string;
  disabled?: boolean | string;
}> {
  return detectionResults.map(result => {
    const status = result.installed ? '✓' : '✗';
    const versionInfo = result.version ? ` (${result.version})` : '';
    const name = `${result.cli.displayName} ${status}${versionInfo}`;

    if (!result.installed) {
      const installMsg = result.cli.installUrl
        ? `Not installed - get it from ${result.cli.installUrl}`
        : 'Not installed';

      return {
        name,
        value: result.cli.name,
        disabled: installMsg as string
      };
    }

    return {
      name,
      value: result.cli.name
    };
  });
}
