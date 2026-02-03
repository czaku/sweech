"use strict";
/**
 * CLI detection - check which AI coding CLIs are installed
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCLIInstalled = isCLIInstalled;
exports.getCLIVersion = getCLIVersion;
exports.detectInstalledCLIs = detectInstalledCLIs;
exports.formatCLIChoices = formatCLIChoices;
const child_process_1 = require("child_process");
const util_1 = require("util");
const clis_1 = require("./clis");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
/**
 * Check if a specific CLI is installed
 */
async function isCLIInstalled(cliCommand) {
    try {
        const whichCmd = process.platform === 'win32' ? 'where' : 'which';
        await execFileAsync(whichCmd, [cliCommand], { timeout: 1000 });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Get version of installed CLI
 */
async function getCLIVersion(cliCommand) {
    try {
        const result = await execFileAsync(cliCommand, ['--version'], { timeout: 2000 });
        return result.stdout.trim() || result.stderr.trim();
    }
    catch {
        return undefined;
    }
}
/**
 * Detect all supported CLIs
 */
async function detectInstalledCLIs() {
    const results = [];
    for (const cli of Object.values(clis_1.SUPPORTED_CLIS)) {
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
function formatCLIChoices(detectionResults) {
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
                disabled: installMsg
            };
        }
        return {
            name,
            value: result.cli.name
        };
    });
}
