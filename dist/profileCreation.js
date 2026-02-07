"use strict";
/**
 * Shared profile creation logic for add and init commands
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProfile = createProfile;
const chalk_1 = __importDefault(require("chalk"));
const oauth_1 = require("./oauth");
/**
 * Create a new profile with OAuth or API key authentication
 */
async function createProfile(answers, provider, cli, config) {
    // Handle OAuth if selected
    let oauthToken = undefined;
    if (answers.authMethod === 'oauth') {
        oauthToken = await (0, oauth_1.getOAuthToken)(cli.name, answers.provider);
        console.log(chalk_1.default.green('✓ OAuth authentication successful'));
    }
    // Create profile object
    const profile = {
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
    config.createProfileConfig(answers.commandName, provider, answers.apiKey, cli.name, oauthToken);
    config.createWrapperScript(answers.commandName, cli);
    // Display success message
    console.log(chalk_1.default.green('\n✓ Provider added successfully!\n'));
    console.log(chalk_1.default.cyan('Command:'), chalk_1.default.bold(answers.commandName));
    console.log(chalk_1.default.cyan('Provider:'), provider.displayName);
    console.log(chalk_1.default.cyan('Model:'), provider.defaultModel);
}
