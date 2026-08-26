/**
 * HTTP client for the `simpler` CLI: JSON-RPC 2.0 over `/api/mcp`
 * (streamable HTTP, stateless) plus a small REST helper for the one
 * self-bootstrap endpoint (`/api/portal/auth/mobile-sign-in`) that MCP
 * itself can't cover.
 *
 * Request/header shape matches the prior art in
 * `scripts/smoke-sd-skills.ts` (JSON-RPC envelope, SSE fallback parsing,
 * `Accept: application/json, text/event-stream`).
 */

import { redactKey, writeProfile, LEGACY_PROFILE_NAME } from './config.js';
import type { ResolvedConfig } from './config.js';

export type CliErrorCode =
  | 'no_api_url'
  | 'no_api_key'
  | 'network_error'
  | 'timeout'
  | 'unauthorized'
  | 'rpc_error'
  | 'tool_error'
  | 'http_error'
  | 'usage_error'
  | 'confirmation_required'
  | 'manifest_missing'
  | 'not_found'
  | 'tenant_mismatch';

/** Central error type — every non-zero CLI exit flows through one of these. */
export class CliError extends Error {
  readonly exitCode: number;
  readonly code: CliErrorCode;
  readonly details?: unknown;

  constructor(message: string, exitCode: number, code: CliErrorCode, details?: unknown) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.code = code;
    this.details = details;
  }
}

export interface CallOpts {
  timeout?: number;
  verbose?: boolean;
}

export interface McpToolResult {
  /** The parsed JSON payload from content[0].text, or the raw text if it wasn't JSON. */
  data: unknown;
  /** The raw MCP `result` object (content[], isError, etc). */
  raw: unknown;
}

export interface McpToolSpec {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

function verboseLog(verbose: boolean | undefined, ...parts: unknown[]): void {
  if (!verbose) return;
  console.error('[simpler:verbose]', ...parts);
}

function redactedHeaders(headers: Record<string, string>): Record<string, string> {
  const copy = { ...headers };
  if (copy.Authorization) {
    const match = copy.Authorization.match(/^Bearer\s+(.+)$/);
    copy.Authorization = `Bearer ${redactKey(match ? match[1] : undefined)}`;
  }
  return copy;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonRpcResponse(res: Response, verbose: boolean | undefined): Promise<any> {
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    const text = await res.text();
    const last = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice('data: '.length))
      .pop();
    if (!last) {
      throw new CliError('MCP SSE response had no data event', 1, 'rpc_error', { body: text.slice(0, 200) });
    }
    verboseLog(verbose, 'SSE response', last);
    return JSON.parse(last);
  }
  const text = await res.text();
  verboseLog(verbose, 'response body', text);
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError(
      `Non-JSON response from server (status ${res.status})`,
      1,
      'http_error',
      { status: res.status, body: text.slice(0, 500) },
    );
  }
}

function assertConfigured(config: ResolvedConfig): asserts config is ResolvedConfig & { apiUrl: string } {
  if (!config.apiUrl) {
    throw new CliError(
      'No API URL configured. Run `simpler auth login`, set SIMPLER_API_URL, or pass --api-url.',
      3,
      'no_api_url',
    );
  }
}

function requireApiKey(config: ResolvedConfig): string {
  if (!config.apiKey) {
    throw new CliError(
      'No API key configured. Run `simpler auth login`, set SIMPLER_API_KEY, or pass --api-key.',
      3,
      'no_api_key',
    );
  }
  return config.apiKey;
}

async function doFetch(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  verbose: boolean | undefined,
): Promise<Response> {
  verboseLog(verbose, `${init.method ?? 'GET'} ${url}`, redactedHeaders((init.headers as Record<string, string>) ?? {}));
  try {
    return await fetchWithTimeout(url, init, timeoutMs);
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    throw new CliError(
      isAbort
        ? `Request to ${url} timed out after ${timeoutMs}ms`
        : `Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`,
      5,
      isAbort ? 'timeout' : 'network_error',
    );
  }
}

/** Client id of the pre-seeded public OAuth client for `simpler auth login` (see scripts/seed-cli-oauth-client.ts). */
export const CLI_OAUTH_CLIENT_ID = 'oc_simpler-cli';

/**
 * Refresh the stored OAuth access token via `grant_type=refresh_token`
 * (the server rotates the refresh token on every use). Persists the new pair
 * to the SAME named profile the token came from (`config.activeProfile` —
 * falls back to the legacy `default` name for a config built without one,
 * which shouldn't happen via `loadConfig` but keeps this safe standalone)
 * without touching which profile is active, and mutates `config` in place so
 * the running process keeps working. Returns the new access token, or null
 * when refresh isn't possible (no oauth credentials) or the server rejected it.
 */
export async function refreshOAuthTokens(config: ResolvedConfig, opts: CallOpts = {}): Promise<string | null> {
  if (!config.oauth || !config.apiUrl) return null;
  try {
    const res = await fetchWithTimeout(
      `${config.apiUrl}/oauth/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: config.oauth.refreshToken,
          client_id: CLI_OAUTH_CLIENT_ID,
        }).toString(),
      },
      opts.timeout ?? config.timeout,
    );
    if (res.status !== 200) return null;
    const body = JSON.parse(await res.text());
    if (typeof body?.access_token !== 'string') return null;
    const expiresAt = new Date(Date.now() + (Number(body.expires_in) || 3600) * 1000).toISOString();
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : config.oauth.refreshToken;
    writeProfile(
      config.activeProfile ?? LEGACY_PROFILE_NAME,
      { apiUrl: config.apiUrl, accessToken: body.access_token, refreshToken, expiresAt },
      { activate: false },
    );
    config.apiKey = body.access_token;
    config.oauth = { refreshToken, expiresAt };
    return body.access_token;
  } catch {
    return null;
  }
}

/** Proactively refresh when the OAuth access token is within 60s of expiry. Fail-open — a 401 downstream still triggers the retry path. */
async function ensureFreshToken(config: ResolvedConfig, opts: CallOpts): Promise<void> {
  if (!config.oauth?.expiresAt) return;
  if (new Date(config.oauth.expiresAt).getTime() - Date.now() > 60_000) return;
  await refreshOAuthTokens(config, opts);
}

/** POST {origin}/api/mcp — JSON-RPC 2.0 `tools/call`. */
export async function mcpCall(
  config: ResolvedConfig,
  toolName: string,
  args: Record<string, unknown>,
  opts: CallOpts = {},
): Promise<McpToolResult> {
  assertConfigured(config);
  await ensureFreshToken(config, opts);
  const timeout = opts.timeout ?? config.timeout;
  const url = `${config.apiUrl}/api/mcp`;

  const attempt = (key: string) =>
    doFetch(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: { name: toolName, arguments: args },
        }),
      },
      timeout,
      opts.verbose,
    );

  let res = await attempt(requireApiKey(config));

  // Expired/rotated OAuth access token: refresh once and retry.
  if ((res.status === 401 || res.status === 403) && config.oauth) {
    const freshKey = await refreshOAuthTokens(config, opts);
    if (freshKey) res = await attempt(freshKey);
  }

  if (res.status === 401 || res.status === 403) {
    throw new CliError(
      `Authentication rejected (HTTP ${res.status}). Run \`simpler auth login\` again.`,
      3,
      'unauthorized',
      { status: res.status },
    );
  }
  if (!res.ok && res.status !== 400) {
    // 400 often carries a JSON-RPC error body worth surfacing below; other
    // non-2xx statuses are treated as hard HTTP errors.
    throw new CliError(`HTTP ${res.status} calling ${toolName}`, 1, 'http_error', { status: res.status });
  }

  const payload = await readJsonRpcResponse(res, opts.verbose);

  if (payload.error) {
    throw new CliError(
      typeof payload.error?.message === 'string' ? payload.error.message : `JSON-RPC error calling ${toolName}`,
      1,
      'rpc_error',
      payload.error,
    );
  }

  const result = payload.result;
  const contentText = result?.content?.[0]?.text;
  let data: unknown = result;
  if (typeof contentText === 'string') {
    try {
      data = JSON.parse(contentText);
    } catch {
      data = contentText;
    }
  }

  if (result?.isError) {
    const message =
      data && typeof data === 'object' && data !== null && 'error' in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).error)
        : `Tool ${toolName} returned an error`;
    throw new CliError(message, 1, 'tool_error', data);
  }

  return { data, raw: result };
}

export interface WhoamiClientRoster {
  id: number;
  company: string;
  role?: string;
}

export interface ClientAssertionResult {
  resolvedClientId: number;
  resolvedCompany: string;
  reachable: WhoamiClientRoster[];
}

/**
 * The `--client <id>` safety gate (JUL9-001): before running a command, ask
 * the SERVER which tenant(s) the configured credential can actually act for
 * (a live `whoami` call — see `lib/mcp/tools/meta.ts`), and hard-fail if
 * `expectedClientId` isn't one of them. This is deliberately NOT a check
 * against a locally-stored label (a profile name, a cached "last known"
 * value) — a local label is exactly what was wrong in the incident this
 * ticket is named for: a stored key silently belonged to a different tenant
 * than the operator believed, and nothing caught it before a destructive
 * Brain operation nearly ran against the wrong company.
 */
export async function assertClientMatches(
  config: ResolvedConfig,
  expectedClientId: number,
  opts: CallOpts = {},
): Promise<ClientAssertionResult> {
  const { data } = await mcpCall(config, 'whoami', {}, opts);
  const who = data as { client?: WhoamiClientRoster; clients?: WhoamiClientRoster[] } | null;
  const reachable = who?.clients ?? (who?.client ? [who.client] : []);
  const match = reachable.find((c) => c.id === expectedClientId);
  if (!match) {
    const known = reachable.length > 0 ? reachable.map((c) => `${c.id} (${c.company})`).join(', ') : '(whoami returned no companies)';
    throw new CliError(
      `--client ${expectedClientId} does not match this credential's tenant. It resolves to: ${known}. ` +
        'Refusing to run — this is exactly the mismatch JUL9-001 was filed over. ' +
        'Run `simpler profiles list` / `simpler auth switch <profile>` to use the right credential.',
      3,
      'tenant_mismatch',
      { expectedClientId, reachable },
    );
  }
  return { resolvedClientId: match.id, resolvedCompany: match.company, reachable };
}

/** POST {origin}/api/mcp — JSON-RPC 2.0 `tools/list`, following `nextCursor` pagination. */
export async function mcpListTools(config: ResolvedConfig, opts: CallOpts = {}): Promise<McpToolSpec[]> {
  assertConfigured(config);
  await ensureFreshToken(config, opts);
  const apiKey = requireApiKey(config);
  const timeout = opts.timeout ?? config.timeout;
  const url = `${config.apiUrl}/api/mcp`;

  const tools: McpToolSpec[] = [];
  let cursor: string | undefined;

  do {
    const res = await doFetch(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/list',
          params: cursor ? { cursor } : {},
        }),
      },
      timeout,
      opts.verbose,
    );

    if (res.status === 401 || res.status === 403) {
      throw new CliError(
        `Authentication rejected (HTTP ${res.status}). Run \`simpler auth login\` again.`,
        3,
        'unauthorized',
        { status: res.status },
      );
    }

    const payload = await readJsonRpcResponse(res, opts.verbose);
    if (payload.error) {
      throw new CliError(
        typeof payload.error?.message === 'string' ? payload.error.message : 'JSON-RPC error calling tools/list',
        1,
        'rpc_error',
        payload.error,
      );
    }

    const result = payload.result ?? {};
    tools.push(...(result.tools ?? []));
    cursor = result.nextCursor;
  } while (cursor);

  return tools;
}

/**
 * Follow same-origin-changing redirects on /api/health to find the canonical
 * API origin. Vercel 307s the apex domain to www, and fetch strips the
 * Authorization header on cross-host redirects — so a key stored against the
 * apex origin health-checks fine but 401s on every authed call. Resolving
 * once at login time and storing the final origin kills that trap.
 * Fail-open: on any network error, returns the input unchanged.
 */
export async function resolveCanonicalOrigin(
  config: Pick<ResolvedConfig, 'apiUrl' | 'timeout'>,
): Promise<string> {
  let origin = (config.apiUrl ?? '').replace(/\/+$/, '');
  for (let hop = 0; hop < 3; hop++) {
    try {
      const res = await fetchWithTimeout(`${origin}/api/health`, { redirect: 'manual' }, config.timeout);
      const location = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
      if (!location) return origin;
      origin = new URL(location, `${origin}/`).origin;
    } catch {
      return origin;
    }
  }
  return origin;
}

/** GET {origin}{path} — plain REST, used only for `doctor`'s health check. */
export async function restGet(
  config: Pick<ResolvedConfig, 'apiUrl' | 'timeout'>,
  path: string,
  opts: CallOpts = {},
): Promise<{ status: number; data: unknown }> {
  if (!config.apiUrl) {
    throw new CliError('No API URL configured. Set SIMPLER_API_URL or pass --api-url.', 3, 'no_api_url');
  }
  const timeout = opts.timeout ?? config.timeout;
  const url = `${config.apiUrl}${path}`;

  const res = await doFetch(url, { method: 'GET' }, timeout, opts.verbose);

  const text = await res.text();
  verboseLog(opts.verbose, 'response body', text);
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // leave as raw text
  }
  return { status: res.status, data };
}

/** POST {origin}{path} — plain REST, used only for the auth bootstrap endpoint. */
export async function restPost(
  config: Pick<ResolvedConfig, 'apiUrl' | 'timeout'>,
  path: string,
  body: Record<string, unknown>,
  opts: CallOpts = {},
): Promise<{ status: number; data: unknown }> {
  if (!config.apiUrl) {
    throw new CliError(
      'No API URL configured. Set SIMPLER_API_URL or pass --api-url.',
      3,
      'no_api_url',
    );
  }
  const timeout = opts.timeout ?? config.timeout;
  const url = `${config.apiUrl}${path}`;

  const res = await doFetch(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    timeout,
    opts.verbose,
  );

  const text = await res.text();
  verboseLog(opts.verbose, 'response body', text);
  let data: unknown = text;
  try {
    data = JSON.parse(text);
  } catch {
    // leave as raw text
  }

  if (res.status === 401 || res.status === 403) {
    const message =
      data && typeof data === 'object' && data !== null && 'message' in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>).message)
        : `Authentication rejected (HTTP ${res.status})`;
    throw new CliError(message, 3, 'unauthorized', data);
  }

  return { status: res.status, data };
}
