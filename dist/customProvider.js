"use strict";
/**
 * Custom provider setup for local/self-hosted LLMs
 * Supports localhost, LAN, and custom remote hosts
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCAL_LLM_EXAMPLES = void 0;
exports.promptCustomProvider = promptCustomProvider;
exports.createCustomProviderConfig = createCustomProviderConfig;
exports.displayLocalLLMExamples = displayLocalLLMExamples;
const inquirer_1 = __importDefault(require("inquirer"));
const chalk_1 = __importDefault(require("chalk"));
/**
 * Validate URL format (allows localhost, IP addresses, and domains)
 */
function validateUrl(input) {
    if (!input || input.trim().length === 0) {
        return 'Base URL is required';
    }
    const trimmed = input.trim();
    // Allow localhost variations
    if (trimmed.startsWith('http://localhost') ||
        trimmed.startsWith('https://localhost') ||
        trimmed.startsWith('http://127.0.0.1') ||
        trimmed.startsWith('https://127.0.0.1')) {
        return true;
    }
    // Allow local network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    const localIpPattern = /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3})/;
    if (localIpPattern.test(trimmed)) {
        return true;
    }
    // Allow standard URLs
    try {
        const url = new URL(trimmed);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return true;
        }
        return 'URL must use http:// or https://';
    }
    catch {
        return 'Invalid URL format. Examples:\n  - http://localhost:1234\n  - http://192.168.1.100:8080\n  - https://api.example.com';
    }
}
/**
 * Prompt user for custom provider configuration
 */
async function promptCustomProvider() {
    console.log(chalk_1.default.bold('\n🔧 Custom Provider Setup\n'));
    console.log(chalk_1.default.gray('Configure a local or self-hosted LLM provider\n'));
    console.log(chalk_1.default.cyan('Examples:'));
    console.log(chalk_1.default.gray('  Local:     http://localhost:1234'));
    console.log(chalk_1.default.gray('  LAN:       http://192.168.1.100:8080'));
    console.log(chalk_1.default.gray('  Remote:    https://api.your-server.com'));
    console.log();
    const answers = await inquirer_1.default.prompt([
        {
            type: 'input',
            name: 'baseUrl',
            message: 'Base URL:',
            validate: validateUrl,
            filter: (input) => {
                const trimmed = input.trim();
                // Remove trailing slash if present
                return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
            }
        },
        {
            type: 'list',
            name: 'apiFormat',
            message: 'API format:',
            choices: [
                {
                    name: 'OpenAI-compatible (GPT, Codex, LM Studio, llama.cpp, etc.)',
                    value: 'openai'
                },
                {
                    name: 'Anthropic-compatible (Claude API format)',
                    value: 'anthropic'
                }
            ],
            default: 'openai'
        },
        {
            type: 'input',
            name: 'defaultModel',
            message: 'Default model name:',
            validate: (input) => {
                if (!input || input.trim().length === 0) {
                    return 'Model name is required';
                }
                return true;
            },
            default: (answers) => {
                // Suggest defaults based on common setups
                if (answers.apiFormat === 'openai') {
                    return 'gpt-3.5-turbo'; // Common default for OpenAI-compatible
                }
                return 'claude-sonnet-4-5'; // Common default for Anthropic-compatible
            }
        },
        {
            type: 'input',
            name: 'smallFastModel',
            message: 'Small/fast model (optional, press Enter to skip):',
            default: ''
        },
        {
            type: 'input',
            name: 'displayName',
            message: 'Display name (optional, press Enter to use base URL):',
            default: ''
        }
    ]);
    return {
        baseUrl: answers.baseUrl,
        apiFormat: answers.apiFormat,
        defaultModel: answers.defaultModel.trim(),
        smallFastModel: answers.smallFastModel?.trim() || undefined,
        displayName: answers.displayName?.trim() || undefined
    };
}
/**
 * Create ProviderConfig from custom provider prompts
 */
function createCustomProviderConfig(prompts, name) {
    // Generate display name if not provided
    const displayName = prompts.displayName || `Custom (${new URL(prompts.baseUrl).hostname})`;
    // Determine CLI compatibility based on API format
    const compatibility = prompts.apiFormat === 'openai' ? ['codex'] : ['claude'];
    return {
        name,
        displayName,
        baseUrl: prompts.baseUrl,
        defaultModel: prompts.defaultModel,
        smallFastModel: prompts.smallFastModel,
        description: `Custom ${prompts.apiFormat}-compatible provider`,
        pricing: 'Self-hosted / varies',
        compatibility,
        apiFormat: prompts.apiFormat,
        isCustom: true
    };
}
/**
 * Common local LLM examples for reference
 */
exports.LOCAL_LLM_EXAMPLES = {
    'LM Studio': {
        baseUrl: 'http://localhost:1234',
        apiFormat: 'openai',
        description: 'LM Studio local server'
    },
    'Ollama (OpenAI compatible)': {
        baseUrl: 'http://localhost:11434/v1',
        apiFormat: 'openai',
        description: 'Ollama with OpenAI compatibility layer'
    },
    'llama.cpp server': {
        baseUrl: 'http://localhost:8080',
        apiFormat: 'openai',
        description: 'llama.cpp HTTP server'
    },
    'text-generation-webui': {
        baseUrl: 'http://localhost:5000',
        apiFormat: 'openai',
        description: 'oobabooga text-generation-webui'
    },
    'LocalAI': {
        baseUrl: 'http://localhost:8080',
        apiFormat: 'openai',
        description: 'LocalAI server'
    }
};
/**
 * Display examples of local LLM setups
 */
function displayLocalLLMExamples() {
    console.log(chalk_1.default.bold('\n📚 Common Local LLM Setups:\n'));
    Object.entries(exports.LOCAL_LLM_EXAMPLES).forEach(([name, config]) => {
        console.log(chalk_1.default.cyan(`  ${name}:`));
        console.log(chalk_1.default.gray(`    URL: ${config.baseUrl}`));
        console.log(chalk_1.default.gray(`    Format: ${config.apiFormat}`));
        console.log();
    });
}
