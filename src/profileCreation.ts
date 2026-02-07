/**
 * Shared profile creation logic for add and init commands
 */

import chalk from 'chalk';
import { ConfigManager, ProfileConfig } from './config';
import { ProviderConfig } from './providers';
import { CLIConfig } from './clis';
import { AddProviderAnswers } from './interactive';
import { getOAuthToken, OAuthToken } from './oauth';

/**
 * Create a new profile with OAuth or API key authentication
 */
export async function createProfile(
  answers: AddProviderAnswers,
  provider: ProviderConfig,
  cli: CLIConfig,
  config: ConfigManager
): Promise<void> {
  // Handle OAuth if selected
  let oauthToken: OAuthToken | undefined = undefined;
  if (answers.authMethod === 'oauth') {
    oauthToken = await getOAuthToken(cli.name, answers.provider);
    console.log(chalk.green('✓ OAuth authentication successful'));
  }

  // Create profile object
  const profile: ProfileConfig = {
    name: answers.commandName,
    commandName: answers.commandName,
    cliType: cli.name,
    provider: answers.provider,
    apiKey: answers.apiKey || undefined,
    oauth: oauthToken,
    baseUrl: provider.baseUrl,
    model: provider.defaultModel,
    smallFastModel: provider.smallFastModel,
    createdAt: new Date().toISOString(),
    // Store custom provider details if present
    ...(answers.customProviderPrompts && {
      customProvider: answers.customProviderPrompts
    })
  };

  // Save profile
  config.addProfile(profile);
  config.createProfileConfig(
    answers.commandName,
    provider,
    answers.apiKey,
    cli.name,
    oauthToken
  );
  config.createWrapperScript(answers.commandName, cli);

  // Display success message
  console.log(chalk.green('\n✓ Provider added successfully!\n'));
  console.log(chalk.cyan('Command:'), chalk.bold(answers.commandName));
  console.log(chalk.cyan('Provider:'), provider.displayName);
  console.log(chalk.cyan('Model:'), provider.defaultModel);
}
