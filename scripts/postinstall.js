#!/usr/bin/env node

const path = require('path');

async function main() {
  try {
    const { runPostinstallHeal } = require(path.join(__dirname, '..', 'dist', 'utilityCommands.js'));
    const result = await runPostinstallHeal();
    if (result && result.totalRepaired > 0) {
      process.stdout.write(`sweech: resynced ${result.profilesScanned} profiles after upgrade to v${result.sweechVersion || 'unknown'}\n`);
    }
  } catch {
    // npm lifecycle hooks must never block install/upgrade. runPostinstallHeal
    // logs operational failures itself when it can be loaded.
  }
}

main().finally(() => process.exit(0));
