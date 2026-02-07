"use strict";
/**
 * OAuth 2.0 authentication support for Claude Code and Codex
 * Handles PKCE flow for both Anthropic and OpenAI APIs
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOAuthToken = getOAuthToken;
exports.refreshOAuthToken = refreshOAuthToken;
exports.isTokenExpired = isTokenExpired;
exports.oauthTokenToEnv = oauthTokenToEnv;
const http = __importStar(require("http"));
const url = __importStar(require("url"));
const crypto_1 = require("crypto");
const chalk_1 = __importDefault(require("chalk"));
const child_process_1 = require("child_process");
/**
 * Get OAuth authentication token via browser flow
 */
async function getOAuthToken(cliType, provider) {
    console.log(chalk_1.default.cyan('\n🔐 Starting OAuth authentication...\n'));
    if (cliType === 'claude') {
        return getAnthropicOAuthToken();
    }
    else if (cliType === 'codex') {
        return getOpenAIOAuthToken();
    }
    else {
        throw new Error(`OAuth not supported for CLI type: ${cliType}`);
    }
}
/**
 * Anthropic OAuth flow using PKCE
 */
async function getAnthropicOAuthToken() {
    const clientId = process.env.ANTHROPIC_CLIENT_ID || 'sweech-cli';
    const redirectUri = 'http://localhost:8888/callback';
    // Create PKCE challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = (0, crypto_1.randomBytes)(32).toString('hex');
    // Build authorization URL
    const authUrl = new url.URL('https://api.anthropic.com/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'claude:api:chat claude:api:usage');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    console.log(chalk_1.default.yellow('📋 Please complete authentication in your browser'));
    console.log(chalk_1.default.gray(`\nIf browser doesn't open, visit:\n${authUrl.toString()}\n`));
    // Open browser (optional - may not work in all environments)
    openBrowser(authUrl.toString()).catch(() => {
        // Silent fail - browser might not be available
    });
    // Start local server to capture callback
    const authCode = await captureOAuthCallback(redirectUri, state);
    // Exchange code for token
    const tokenResponse = await exchangeCodeForToken(clientId, redirectUri, authCode, codeVerifier, 'anthropic');
    return {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: tokenResponse.expires_in
            ? Date.now() + tokenResponse.expires_in * 1000
            : undefined,
        tokenType: tokenResponse.token_type || 'Bearer',
        provider: 'anthropic'
    };
}
/**
 * OpenAI OAuth flow using PKCE
 */
async function getOpenAIOAuthToken() {
    const clientId = process.env.OPENAI_CLIENT_ID || 'sweech-cli';
    const redirectUri = 'http://localhost:8888/callback';
    // Create PKCE challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = (0, crypto_1.randomBytes)(32).toString('hex');
    // Build authorization URL
    const authUrl = new url.URL('https://platform.openai.com/oauth/authorize');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'read:models');
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('state', state);
    console.log(chalk_1.default.yellow('📋 Please complete authentication in your browser'));
    console.log(chalk_1.default.gray(`\nIf browser doesn't open, visit:\n${authUrl.toString()}\n`));
    // Open browser (optional)
    openBrowser(authUrl.toString()).catch(() => {
        // Silent fail
    });
    // Start local server to capture callback
    const authCode = await captureOAuthCallback(redirectUri, state);
    // Exchange code for token
    const tokenResponse = await exchangeCodeForToken(clientId, redirectUri, authCode, codeVerifier, 'openai');
    return {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresAt: tokenResponse.expires_in
            ? Date.now() + tokenResponse.expires_in * 1000
            : undefined,
        tokenType: tokenResponse.token_type || 'Bearer',
        provider: 'openai'
    };
}
/**
 * Open URL in browser safely
 */
function openBrowser(browserUrl) {
    return new Promise((resolve, reject) => {
        const commands = [
            { cmd: 'open', args: [browserUrl] }, // macOS
            { cmd: 'xdg-open', args: [browserUrl] }, // Linux
            { cmd: 'start', args: ['', browserUrl] } // Windows
        ];
        const tryOpen = (index) => {
            if (index >= commands.length) {
                reject(new Error('Could not open browser'));
                return;
            }
            const { cmd, args } = commands[index];
            (0, child_process_1.execFile)(cmd, args, (error) => {
                if (error) {
                    tryOpen(index + 1);
                }
                else {
                    resolve();
                }
            });
        };
        tryOpen(0);
    });
}
/**
 * Start local HTTP server to capture OAuth callback
 */
function captureOAuthCallback(redirectUri, expectedState) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new url.URL(redirectUri);
        const port = parseInt(parsedUrl.port || '8888');
        const server = http.createServer((req, res) => {
            const reqUrl = new url.URL(req.url || '', `http://${req.headers.host}`);
            const code = reqUrl.searchParams.get('code');
            const state = reqUrl.searchParams.get('state');
            const error = reqUrl.searchParams.get('error');
            if (error) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<h1>Authentication Failed</h1><p>You can close this window.</p>');
                server.close();
                reject(new Error(`OAuth error: ${error}`));
                return;
            }
            if (state !== expectedState) {
                res.writeHead(403, { 'Content-Type': 'text/html' });
                res.end('<h1>Invalid State</h1><p>You can close this window.</p>');
                server.close();
                reject(new Error('Invalid state parameter'));
                return;
            }
            if (!code) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<h1>Missing Authorization Code</h1><p>You can close this window.</p>');
                server.close();
                reject(new Error('No authorization code received'));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>✓ Authentication Successful</h1><p>You can close this window and return to the terminal.</p>');
            server.close();
            resolve(code);
        });
        server.listen(port, () => {
            // Server started
        });
        server.on('error', reject);
    });
}
/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(clientId, redirectUri, code, codeVerifier, provider) {
    const tokenEndpoint = provider === 'anthropic'
        ? 'https://api.anthropic.com/oauth/token'
        : 'https://api.openai.com/oauth/token';
    const clientSecret = process.env.ANTHROPIC_CLIENT_SECRET || process.env.OPENAI_CLIENT_SECRET;
    if (!clientSecret) {
        throw new Error(`${provider.toUpperCase()}_CLIENT_SECRET environment variable not set`);
    }
    const params = new url.URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
    });
    const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Token exchange failed: ${error}`);
    }
    return response.json();
}
/**
 * Refresh OAuth token
 */
async function refreshOAuthToken(token) {
    if (!token.refreshToken) {
        throw new Error('No refresh token available');
    }
    const clientSecret = process.env.ANTHROPIC_CLIENT_SECRET || process.env.OPENAI_CLIENT_SECRET;
    if (!clientSecret) {
        throw new Error('Client secret not configured for token refresh');
    }
    const tokenEndpoint = token.provider === 'anthropic'
        ? 'https://api.anthropic.com/oauth/token'
        : 'https://api.openai.com/oauth/token';
    const params = new url.URLSearchParams({
        grant_type: 'refresh_token',
        client_id: token.provider === 'anthropic' ? 'sweech-cli' : 'sweech-cli',
        client_secret: clientSecret,
        refresh_token: token.refreshToken
    });
    const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
    });
    if (!response.ok) {
        throw new Error('Token refresh failed');
    }
    const data = (await response.json());
    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || token.refreshToken,
        expiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
        tokenType: data.token_type || 'Bearer',
        provider: token.provider
    };
}
/**
 * Check if OAuth token is expired
 */
function isTokenExpired(token) {
    if (!token.expiresAt)
        return false;
    // Consider token expired if less than 5 minutes remaining
    return token.expiresAt - Date.now() < 5 * 60 * 1000;
}
/**
 * Convert OAuth token to environment variables
 */
function oauthTokenToEnv(token, cliType) {
    if (cliType === 'claude') {
        return {
            ANTHROPIC_AUTH_TOKEN: `bearer_${token.accessToken}`,
            ANTHROPIC_BEARER_TOKEN: token.accessToken
        };
    }
    else if (cliType === 'codex') {
        return {
            OPENAI_API_KEY: `sk-oauth-${token.accessToken}`,
            OPENAI_BEARER_TOKEN: token.accessToken
        };
    }
    throw new Error(`Unsupported CLI type: ${cliType}`);
}
/**
 * Generate PKCE code verifier (43-128 characters)
 */
function generateCodeVerifier() {
    return (0, crypto_1.randomBytes)(32).toString('base64url').slice(0, 128);
}
/**
 * Generate PKCE code challenge from verifier
 */
function generateCodeChallenge(verifier) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(verifier).digest('base64url');
}
