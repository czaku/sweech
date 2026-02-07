/**
 * Interactive prompts for adding providers
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { getProviderList, getProvider, ProviderConfig } from './providers';
import { ProfileConfig } from './config';
import { isBlockedCommand, validateCommandName } from './systemCommands';
import { detectInstalledCLIs, formatCLIChoices } from './cliDetection';
import { promptCustomProvider, createCustomProviderConfig, CustomProviderPrompts } from './customProvider';

export interface AddProviderAnswers {
  cliType: string;
  provider: string;
  commandName: string;
  apiKey?: string;
  authMethod?: string;
  customProviderConfig?: ProviderConfig; // For custom providers
  customProviderPrompts?: CustomProviderPrompts; // Store custom provider details
}

export async function interactiveAddProvider(existingProfiles: ProfileConfig[] = []): Promise<AddProviderAnswers> {
  console.log('\n🍭 Sweetch - Add New Provider\n');

  // Show existing setup if any
  if (existingProfiles.length > 0) {
    console.log(chalk.bold('Your current setup:'));

    // Group by CLI type
    const grouped = existingProfiles.reduce((acc, p) => {
      const cliType = p.cliType || 'claude';
      if (!acc[cliType]) acc[cliType] = [];
      acc[cliType].push(p);
      return acc;
    }, {} as Record<string, ProfileConfig[]>);

    Object.entries(grouped).forEach(([cliType, profiles]) => {
      console.log(chalk.cyan(`  • ${cliType}:`), chalk.gray(`${profiles.length} profile${profiles.length > 1 ? 's' : ''} (${profiles.map(p => p.commandName).join(', ')})`));
    });
    console.log();
  }

  // Detect installed CLIs
  console.log(chalk.gray('🔍 Detecting installed CLIs...\n'));
  const detectedCLIs = await detectInstalledCLIs();
  const installedCount = detectedCLIs.filter(d => d.installed).length;

  if (installedCount === 0) {
    console.log(chalk.red('✗ No supported CLIs found. Please install at least one:'));
    detectedCLIs.forEach(d => {
      if (d.cli.installUrl) {
        console.log(chalk.yellow(`  • ${d.cli.displayName}: ${d.cli.installUrl}`));
      }
    });
    console.log();
    throw new Error('No supported CLIs installed');
  }

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'cliType',
      message: 'Which CLI are you configuring?',
      choices: formatCLIChoices(detectedCLIs),
      when: () => installedCount > 1 // Skip if only one CLI installed
    },
    {
      type: 'list',
      name: 'providerType',
      message: (answers: any) => {
        const selectedCLI = detectedCLIs.find(d => d.cli.name === (answers.cliType || 'claude'));
        return `What would you like to add for ${selectedCLI?.cli.displayName}?`;
      },
      choices: (answers: any) => {
        const cliType = answers.cliType || detectedCLIs.find(d => d.installed)?.cli.name || 'claude';
        const cliName = detectedCLIs.find(d => d.cli.name === cliType)?.cli.displayName || 'this CLI';

        return [
          {
            name: `Another ${cliName} account (official provider)`,
            value: 'official'
          },
          {
            name: 'External AI provider (MiniMax, Qwen, Kimi, DeepSeek, etc.)',
            value: 'external'
          }
        ];
      }
    },
    {
      type: 'list',
      name: 'provider',
      message: 'Choose a provider:',
      choices: (answers: any) => {
        if (answers.providerType === 'official') {
          // For official, use the CLI's native provider (anthropic for claude)
          const cliType = answers.cliType || 'claude';
          if (cliType === 'claude') {
            return [
              {
                name: 'Claude (Anthropic) - Official Anthropic Claude models',
                value: 'anthropic'
              }
            ];
          }
          // Future: add official providers for other CLIs
          return [];
        }

        // For external, show compatible providers for the selected CLI
        const cliType = answers.cliType || detectedCLIs.find(d => d.installed)?.cli.name || 'claude';
        return getProviderList(cliType as 'claude' | 'codex').filter(p => p.value !== 'anthropic');
      },
      pageSize: 10
    },
    {
      type: 'input',
      name: 'commandName',
      message: (answers: any) => {
        const provider = getProvider(answers.provider);
        const providerName = provider?.name || answers.provider;

        // Suggest command names based on provider
        const suggestionMap: Record<string, string> = {
          'minimax': '"cmini", "claude-mini", "mini", "minimax-work"',
          'qwen': '"qwen", "claude-qwen", "cqwen", "qwen-personal"',
          'kimi': '"kimi", "claude-kimi", "ckimi", "kimi-work"',
          'deepseek': '"deep", "claude-deep", "cdeep", "deepseek"',
          'glm': '"glm", "claude-glm", "cglm", "glm4"',
          'anthropic': '"claude-2", "claude-work", "claude-personal"'
        };
        const suggestions = suggestionMap[providerName];

        return `What command name? (e.g., ${suggestions || '"my-command"'})`;
      },
      validate: async (input: string, answers: any) => {
        const trimmed = input.trim().toLowerCase();

        if (!trimmed || trimmed.length === 0) {
          return 'Command name is required';
        }

        if (!/^[a-z0-9-]+$/.test(trimmed)) {
          return 'Use only lowercase letters, numbers, and hyphens (e.g., "claude-mini", "cmini")';
        }

        if (trimmed === 'claude') {
          return 'Cannot use "claude" - this is reserved for your default account';
        }

        // Check for clashes with existing commands
        const existing = existingProfiles.find(p => p.commandName === trimmed);
        if (existing) {
          const provider = getProvider(existing.provider);
          return `Command "${trimmed}" already exists (${provider?.displayName || existing.provider}). Choose a different name.`;
        }

        // Check for system command collisions
        const systemCheck = await validateCommandName(trimmed);
        if (!systemCheck.valid) {
          return systemCheck.error || 'Invalid command name';
        }

        // Show warning but allow (for non-critical system commands)
        if (systemCheck.warning) {
          console.log('\n' + chalk.yellow(systemCheck.warning));
        }

        return true;
      },
      transformer: (input: string) => input.toLowerCase().trim()
    },
    {
      type: 'password',
      name: 'apiKey',
      message: (answers: any) => {
        const provider = getProvider(answers.provider);
        return `Enter API key for ${provider?.displayName}:`;
      },
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API key is required';
        }
        return true;
      }
    }
  ]);

  // Set CLI type (default to first installed if not explicitly chosen)
  const cliType = answers.cliType || detectedCLIs.find(d => d.installed)?.cli.name || 'claude';

  // Handle custom provider setup
  let customProviderConfig: ProviderConfig | undefined;
  let customProviderPrompts: CustomProviderPrompts | undefined;

  if (answers.provider === 'custom') {
    console.log(); // Add spacing before custom provider prompts
    customProviderPrompts = await promptCustomProvider();
    customProviderConfig = createCustomProviderConfig(customProviderPrompts, answers.commandName);

    // Show summary of custom provider
    console.log(chalk.green('\n✓ Custom provider configured:'));
    console.log(chalk.cyan('  Base URL:'), customProviderConfig.baseUrl);
    console.log(chalk.cyan('  API Format:'), customProviderConfig.apiFormat);
    console.log(chalk.cyan('  Model:'), customProviderConfig.defaultModel);
    console.log();
  }

  return {
    cliType,
    provider: answers.provider,
    commandName: answers.commandName.toLowerCase().trim(),
    apiKey: answers.apiKey ? answers.apiKey.trim() : undefined,
    authMethod: answers.authMethod,
    customProviderConfig,
    customProviderPrompts
  };
}

export async function confirmRemoveProvider(commandName: string): Promise<boolean> {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Are you sure you want to remove '${commandName}'?`,
      default: false
    }
  ]);

  return confirm;
}
