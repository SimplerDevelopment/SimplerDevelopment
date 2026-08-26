/**
 * `simpler auth login` — browser OAuth flow (default on a TTY).
 *
 * PKCE authorization-code against the portal's existing OAuth server:
 * discover endpoints via /.well-known/oauth-authorization-server, open the
 * consent page in the user's browser (which handles sign-in AND tenant
 * selection), receive the code on a loopback listener, exchange it at the
 * token endpoint, and store the rotating access/refresh pair. The password
 * flow in auth.ts remains for --password-stdin / headless use.
 */

import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { spawn } from 'node:child_process';

import type { ResolvedConfig } from '../config.js';
import { writeProfile, userConfigPath, LEGACY_PROFILE_NAME } from '../config.js';
import { CliError, CLI_OAUTH_CLIENT_ID, mcpCall, resolveCanonicalOrigin } from '../client.js';

/** Must mirror scripts/seed-cli-oauth-client.ts — exact-match redirect URIs. */
const CALLBACK_PORTS = [8976, 8977, 8978];
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

export function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function makePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

interface OAuthEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

/** RFC 8414 discovery, falling back to the portal's known paths. */
export async function discoverEndpoints(origin: string, timeout: number): Promise<OAuthEndpoints> {
  const fallback: OAuthEndpoints = {
    authorizationEndpoint: `${origin}/oauth/authorize`,
    tokenEndpoint: `${origin}/oauth/token`,
  };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(`${origin}/.well-known/oauth-authorization-server`, { signal: controller.signal });
      if (!res.ok) return fallback;
      const doc = (await res.json()) as Record<string, unknown>;
      return {
        authorizationEndpoint: typeof doc.authorization_endpoint === 'string' ? doc.authorization_endpoint : fallback.authorizationEndpoint,
        tokenEndpoint: typeof doc.token_endpoint === 'string' ? doc.token_endpoint : fallback.tokenEndpoint,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return fallback;
  }
}

/** Bind a loopback listener on the first free registered callback port. */
function listenOnCallbackPort(server: Server): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    const tryPort = (idx: number) => {
      if (idx >= CALLBACK_PORTS.length) {
        reject(
          new CliError(
            `Ports ${CALLBACK_PORTS.join(', ')} are all in use — free one and retry, or use \`--password-stdin\`.`,
            1,
            'network_error',
          ),
        );
        return;
      }
      const port = CALLBACK_PORTS[idx];
      server.once('error', () => tryPort(idx + 1));
      server.listen(port, '127.0.0.1', () => {
        server.removeAllListeners('error');
        resolvePromise(port);
      });
    };
    tryPort(0);
  });
}

const SUCCESS_HTML = `<!doctype html><meta charset="utf-8"><title>simpler CLI</title>
<body style="font-family:system-ui;display:grid;place-items:center;height:90vh">
<div style="text-align:center"><h2>Signed in</h2><p>You can close this tab and return to the terminal.</p></div>`;

/** Open `url` in the default browser; returns false if we couldn't spawn an opener. */
export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): boolean {
  const [cmd, args] =
    platform === 'darwin'
      ? ['open', [url]]
      : platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export interface OAuthLoginResult {
  apiUrl: string;
  user?: { email?: string };
  client?: { id: number; company: string };
  scopes?: string[];
  expiresAt: string;
  configPath: string;
  /** Which named profile the credential was stored under (and made active). */
  profile: string;
}

export async function oauthLogin(
  config: Pick<ResolvedConfig, 'apiUrl' | 'timeout'>,
  opts: { log?: (line: string) => void; profile?: string } = {},
): Promise<OAuthLoginResult> {
  if (!config.apiUrl) {
    throw new CliError('No API URL configured. Pass --api-url or set SIMPLER_API_URL.', 2, 'usage_error');
  }
  const log = opts.log ?? ((line: string) => process.stderr.write(line + '\n'));

  const origin = await resolveCanonicalOrigin(config);
  const endpoints = await discoverEndpoints(origin, config.timeout);
  const { verifier, challenge } = makePkcePair();
  const state = base64url(randomBytes(16));

  // Loopback listener that resolves with the authorization code.
  let settle!: (result: { code: string } | { error: string }) => void;
  const callbackResult = new Promise<{ code: string } | { error: string }>((r) => (settle = r));
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== '/callback') {
      res.writeHead(404).end();
      return;
    }
    const gotState = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (gotState !== state) {
      res.writeHead(400, { 'content-type': 'text/plain' }).end('State mismatch — retry the login.');
      settle({ error: 'state_mismatch' });
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' }).end(SUCCESS_HTML);
    settle(code ? { code } : { error: error ?? 'access_denied' });
  });

  try {
    const port = await listenOnCallbackPort(server);
    const redirectUri = `http://127.0.0.1:${port}/callback`;

    const authUrl = new URL(endpoints.authorizationEndpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', CLI_OAUTH_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('scope', '*');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('resource', `${origin}/api/mcp`);

    const opened = openBrowser(authUrl.toString());
    log(opened ? 'Opening your browser to sign in…' : 'Could not open a browser automatically.');
    log(`If the browser didn't open, visit:\n  ${authUrl.toString()}`);

    const timer = setTimeout(() => settle({ error: 'timeout' }), LOGIN_TIMEOUT_MS);
    const outcome = await callbackResult;
    clearTimeout(timer);

    if ('error' in outcome) {
      const messages: Record<string, string> = {
        timeout: `Login timed out after ${LOGIN_TIMEOUT_MS / 60000} minutes.`,
        access_denied: 'Login was cancelled in the browser.',
        state_mismatch: 'State mismatch on the OAuth callback — retry the login.',
      };
      throw new CliError(messages[outcome.error] ?? `Login failed: ${outcome.error}`, 3, 'unauthorized');
    }

    const tokenRes = await fetch(endpoints.tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: outcome.code,
        redirect_uri: redirectUri,
        client_id: CLI_OAUTH_CLIENT_ID,
        code_verifier: verifier,
      }).toString(),
    });
    const tokenBody = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (tokenRes.status !== 200 || typeof tokenBody.access_token !== 'string') {
      throw new CliError(
        `Token exchange failed (HTTP ${tokenRes.status}): ${String(tokenBody.error_description ?? tokenBody.error ?? 'unknown error')}`,
        3,
        'unauthorized',
        tokenBody,
      );
    }

    const expiresAt = new Date(Date.now() + (Number(tokenBody.expires_in) || 3600) * 1000).toISOString();
    const profile = opts.profile ?? LEGACY_PROFILE_NAME;
    writeProfile(
      profile,
      {
        apiUrl: origin,
        accessToken: tokenBody.access_token,
        refreshToken: typeof tokenBody.refresh_token === 'string' ? tokenBody.refresh_token : undefined,
        expiresAt,
      },
      { activate: true },
    );

    // Show the tenant this session operates on (the consent page's picker chose it).
    let who: { userId?: number; client?: { id: number; company: string }; scopes?: string[] } = {};
    try {
      const fullConfig: ResolvedConfig = {
        apiUrl: origin,
        apiKey: tokenBody.access_token,
        source: 'user-file',
        apiUrlSource: 'user-file',
        apiKeySource: 'user-file',
        timeout: config.timeout,
      };
      who = (await mcpCall(fullConfig, 'whoami', {})).data as typeof who;
    } catch {
      // Login itself succeeded; whoami display is best-effort.
    }

    return {
      apiUrl: origin,
      client: who.client,
      scopes: who.scopes,
      expiresAt,
      configPath: userConfigPath(),
      profile,
    };
  } finally {
    server.close();
  }
}
