/**
 * OAuth 2.0 authentication support for Claude Code and Codex
 * Handles PKCE flow for both Anthropic and OpenAI APIs
 */

import * as http from 'http';
import * as url from 'url';
import { randomBytes } from 'crypto';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { execFile } from 'child_process';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  provider: 'anthropic' | 'openai';
}

export interface OAuthConfig {
  env: {
    [key: string]: string;
  };
}

/**
 * Get OAuth authentication token via browser flow
 */
export async function getOAuthToken(
  cliType: string,
  provider: string
): Promise<OAuthToken> {
  console.log(chalk.cyan('\n🔐 Starting OAuth authentication...\n'));

  if (cliType === 'claude') {
    return getAnthropicOAuthToken();
  } else if (cliType === 'codex') {
    return getOpenAIOAuthToken();
  } else {
    throw new Error(`OAuth not supported for CLI type: ${cliType}`);
  }
}

/**
 * Anthropic OAuth flow using PKCE
 */
async function getAnthropicOAuthToken(): Promise<OAuthToken> {
  const clientId = process.env.ANTHROPIC_CLIENT_ID || 'sweech-cli';
  const redirectUri = 'http://localhost:8888/callback';

  // Create PKCE challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(32).toString('hex');

  // Build authorization URL
  const authUrl = new url.URL('https://api.anthropic.com/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'claude:api:chat claude:api:usage');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  console.log(chalk.yellow('📋 Please complete authentication in your browser'));
  console.log(chalk.gray(`\nIf browser doesn't open, visit:\n${authUrl.toString()}\n`));

  // Open browser (optional - may not work in all environments)
  openBrowser(authUrl.toString()).catch(() => {
    // Silent fail - browser might not be available
  });

  // Start local server to capture callback
  const authCode = await captureOAuthCallback(redirectUri, state);

  // Exchange code for token
  const tokenResponse = await exchangeCodeForToken(
    clientId,
    redirectUri,
    authCode,
    codeVerifier,
    'anthropic'
  );

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
async function getOpenAIOAuthToken(): Promise<OAuthToken> {
  const clientId = process.env.OPENAI_CLIENT_ID || 'sweech-cli';
  const redirectUri = 'http://localhost:8888/callback';

  // Create PKCE challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = randomBytes(32).toString('hex');

  // Build authorization URL
  const authUrl = new url.URL('https://platform.openai.com/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'read:models');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  console.log(chalk.yellow('📋 Please complete authentication in your browser'));
  console.log(chalk.gray(`\nIf browser doesn't open, visit:\n${authUrl.toString()}\n`));

  // Open browser (optional)
  openBrowser(authUrl.toString()).catch(() => {
    // Silent fail
  });

  // Start local server to capture callback
  const authCode = await captureOAuthCallback(redirectUri, state);

  // Exchange code for token
  const tokenResponse = await exchangeCodeForToken(
    clientId,
    redirectUri,
    authCode,
    codeVerifier,
    'openai'
  );

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
function openBrowser(browserUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const commands = [
      { cmd: 'open', args: [browserUrl] }, // macOS
      { cmd: 'xdg-open', args: [browserUrl] }, // Linux
      { cmd: 'start', args: ['', browserUrl] } // Windows
    ];

    const tryOpen = (index: number) => {
      if (index >= commands.length) {
        reject(new Error('Could not open browser'));
        return;
      }

      const { cmd, args } = commands[index];
      execFile(cmd, args, (error) => {
        if (error) {
          tryOpen(index + 1);
        } else {
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
function captureOAuthCallback(
  redirectUri: string,
  expectedState: string
): Promise<string> {
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
      res.end(
        '<h1>✓ Authentication Successful</h1><p>You can close this window and return to the terminal.</p>'
      );
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
async function exchangeCodeForToken(
  clientId: string,
  redirectUri: string,
  code: string,
  codeVerifier: string,
  provider: 'anthropic' | 'openai'
): Promise<any> {
  const tokenEndpoint =
    provider === 'anthropic'
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
export async function refreshOAuthToken(token: OAuthToken): Promise<OAuthToken> {
  if (!token.refreshToken) {
    throw new Error('No refresh token available');
  }

  const clientSecret = process.env.ANTHROPIC_CLIENT_SECRET || process.env.OPENAI_CLIENT_SECRET;

  if (!clientSecret) {
    throw new Error('Client secret not configured for token refresh');
  }

  const tokenEndpoint =
    token.provider === 'anthropic'
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

  const data = (await response.json()) as any;

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
export function isTokenExpired(token: OAuthToken): boolean {
  if (!token.expiresAt) return false;
  // Consider token expired if less than 5 minutes remaining
  return token.expiresAt - Date.now() < 5 * 60 * 1000;
}

/**
 * Convert OAuth token to environment variables
 */
export function oauthTokenToEnv(
  token: OAuthToken,
  cliType: string
): { [key: string]: string } {
  if (cliType === 'claude') {
    return {
      ANTHROPIC_AUTH_TOKEN: `bearer_${token.accessToken}`,
      ANTHROPIC_BEARER_TOKEN: token.accessToken
    };
  } else if (cliType === 'codex') {
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
function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url').slice(0, 128);
}

/**
 * Generate PKCE code challenge from verifier
 */
function generateCodeChallenge(verifier: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}
