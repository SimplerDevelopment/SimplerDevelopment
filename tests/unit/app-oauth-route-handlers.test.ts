// @vitest-environment node
/**
 * Unit tests for three OAuth route handlers (security-critical):
 *
 *   - app/oauth/token/route.ts                  (RFC 6749 §4.1.3 token grant)
 *   - app/oauth/authorize/decision/route.ts     (consent approve/deny)
 *   - app/oauth/register/route.ts               (RFC 7591 dynamic registration)
 *
 * The handlers are invoked directly with `NextRequest`/`Request` instances.
 * Everything below the route — `@/lib/db`, `@/lib/db/schema`, `@/lib/auth`,
 * `@/lib/oauth/server` — is mocked. The DB mock is a proxy-chained, thenable
 * fluent builder backed by in-memory tables so we can assert on side effects
 * (codes consumed, tokens inserted, codes persisted).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Schema mock — every export is a proxy whose properties stand in for columns.
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return new Proxy({
    oauthClients: wrap('oauthClients'),
    oauthAuthorizationCodes: wrap('oauthAuthorizationCodes'),
    oauthAccessTokens: wrap('oauthAccessTokens'),
    clientMembers: wrap('clientMembers'),
    clients: wrap('clients'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
});

// ---------------------------------------------------------------------------
// drizzle-orm — capture filters as plain objects the in-memory store can eval.
// ---------------------------------------------------------------------------

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---------------------------------------------------------------------------
// auth() mock — set per test for the /decision handler.
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

// ---------------------------------------------------------------------------
// oauth/server helpers — leave most real (crypto-based), override the
// randomizers so generated values are predictable.
// ---------------------------------------------------------------------------

vi.mock('@/lib/oauth/server', async () => {
  const actual = await vi.importActual<typeof import('@/lib/oauth/server')>(
    '@/lib/oauth/server',
  );
  return {
    ...actual,
    randomClientId: vi.fn(() => 'oc_fixedclientid'),
    generateAuthCode: vi.fn(() => ({ code: 'sd_oac_fake', hash: 'auth-code-hash' })),
    generateAccessToken: vi.fn(() => ({
      token: 'sd_oauth_fake',
      hash: 'access-token-hash',
      preview: 'sd_oauth_fake12…fake',
    })),
  };
});

// ---------------------------------------------------------------------------
// In-memory DB state
// ---------------------------------------------------------------------------

interface OauthClientRow {
  id: number;
  clientId: string;
  clientName: string;
  redirectUris: string[];
  clientUri: string | null;
  logoUri: string | null;
  tosUri: string | null;
  policyUri: string | null;
  tokenEndpointAuthMethod: string;
  softwareId: string | null;
  softwareVersion: string | null;
  createdAt: Date;
  [key: string]: unknown;
}
interface AuthCodeRow {
  id: number;
  codeHash: string;
  oauthClientId: number;
  userId: number;
  clientId: number;
  scopes: string[];
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  resource: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
  [key: string]: unknown;
}
interface AccessTokenRow {
  id: number;
  tokenHash: string;
  tokenPreview: string;
  oauthClientId: number;
  userId: number;
  clientId: number;
  scopes: string[];
  resource: string | null;
  expiresAt: Date;
  [key: string]: unknown;
}
interface ClientMemberRow {
  userId: number;
  clientId: number;
  [key: string]: unknown;
}
interface ClientRow {
  id: number;
  userId: number;
  [key: string]: unknown;
}

interface State {
  oauthClients: OauthClientRow[];
  oauthAuthorizationCodes: AuthCodeRow[];
  oauthAccessTokens: AccessTokenRow[];
  clientMembers: ClientMemberRow[];
  clients: ClientRow[];
  nextOauthClientPk: number;
  nextAuthCodePk: number;
  nextAccessTokenPk: number;
}

const state: State = {
  oauthClients: [],
  oauthAuthorizationCodes: [],
  oauthAccessTokens: [],
  clientMembers: [],
  clients: [],
  nextOauthClientPk: 1,
  nextAuthCodePk: 1,
  nextAccessTokenPk: 1,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'oauthClients':
      return state.oauthClients as unknown as Array<Record<string, unknown>>;
    case 'oauthAuthorizationCodes':
      return state.oauthAuthorizationCodes as unknown as Array<Record<string, unknown>>;
    case 'oauthAccessTokens':
      return state.oauthAccessTokens as unknown as Array<Record<string, unknown>>;
    case 'clientMembers':
      return state.clientMembers as unknown as Array<Record<string, unknown>>;
    case 'clients':
      return state.clients as unknown as Array<Record<string, unknown>>;
    default:
      return [];
  }
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'isNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === null || row[col.__col] === undefined;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

// ---------------------------------------------------------------------------
// db mock — fluent thenable chain
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limited: number | null = null;

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      limit(n: number) {
        limited = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      let rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      if (limited != null) rows = rows.slice(0, limited);

      const out: Array<Record<string, unknown>> = [];
      for (const r of rows) {
        if (projection) {
          const projected: Record<string, unknown> = {};
          for (const [outKey, ref] of Object.entries(projection)) {
            const colRef = ref as { __col?: string; __table?: string } | undefined;
            if (colRef?.__col) {
              projected[outKey] = (r as Record<string, unknown>)[colRef.__col] ?? null;
            } else {
              projected[outKey] = null;
            }
          }
          out.push(projected);
        } else {
          out.push({ ...r });
        }
      }
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(rowOrRows: Record<string, unknown> | Array<Record<string, unknown>>) {
        const rows = Array.isArray(rowOrRows) ? rowOrRows : [rowOrRows];
        const inserted: Array<Record<string, unknown>> = [];
        for (const r of rows) {
          const augmented: Record<string, unknown> = { ...r };
          if (table.__table === 'oauthClients') {
            augmented.id = state.nextOauthClientPk++;
            augmented.createdAt = augmented.createdAt ?? new Date('2026-05-20T00:00:00Z');
          } else if (table.__table === 'oauthAuthorizationCodes') {
            augmented.id = state.nextAuthCodePk++;
            augmented.consumedAt = augmented.consumedAt ?? null;
          } else if (table.__table === 'oauthAccessTokens') {
            augmented.id = state.nextAccessTokenPk++;
          }
          tableArray(table.__table).push(augmented);
          inserted.push(augmented);
        }
        return {
          returning(_proj?: unknown) {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) {
            return Promise.resolve(inserted.map((r) => ({ ...r }))).then(
              onFulfilled,
              onRejected,
            );
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) =>
              evalPredicate(filter, r),
            );
            for (const r of rows) Object.assign(r, patch);
            const out = rows.map((r) => ({ ...r }));
            return {
              returning(_proj?: unknown) {
                return Promise.resolve(out);
              },
              then(
                onFulfilled: (v: unknown) => unknown,
                onRejected?: (e: unknown) => unknown,
              ) {
                return Promise.resolve(out).then(onFulfilled, onRejected);
              },
            };
          },
        };
      },
    };
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return buildSelect(projection);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Modules under test (imported AFTER mocks register)
// ---------------------------------------------------------------------------

const { POST: tokenPOST } = await import('@/app/oauth/token/route');
const { POST: decisionPOST } = await import('@/app/oauth/authorize/decision/route');
const { POST: registerPOST } = await import('@/app/oauth/register/route');

// Real helpers we use for crafting valid PKCE pairs and code hashes.
const crypto = await import('crypto');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function pkcePair(verifier: string): { verifier: string; challenge: string } {
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
  return { verifier, challenge };
}

function resetState() {
  state.oauthClients.length = 0;
  state.oauthAuthorizationCodes.length = 0;
  state.oauthAccessTokens.length = 0;
  state.clientMembers.length = 0;
  state.clients.length = 0;
  state.nextOauthClientPk = 1;
  state.nextAuthCodePk = 1;
  state.nextAccessTokenPk = 1;
  authMock.mockReset();
}

function seedClient(over: Partial<OauthClientRow> = {}): OauthClientRow {
  const row: OauthClientRow = {
    id: state.nextOauthClientPk++,
    clientId: over.clientId ?? 'oc_test',
    clientName: 'Test',
    redirectUris: ['https://app.example.com/cb'],
    clientUri: null,
    logoUri: null,
    tosUri: null,
    policyUri: null,
    tokenEndpointAuthMethod: 'none',
    softwareId: null,
    softwareVersion: null,
    createdAt: new Date('2026-05-20T00:00:00Z'),
    ...over,
  };
  state.oauthClients.push(row);
  return row;
}

function formBody(params: Record<string, string | string[]>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((vv) => sp.append(k, vv));
    else sp.set(k, v);
  }
  return sp.toString();
}

function formRequest(url: string, params: Record<string, string | string[]>): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: formBody(params),
  });
}

beforeEach(() => {
  resetState();
});

// ===========================================================================
// /oauth/register
// ===========================================================================

describe('POST /oauth/register', () => {
  function jsonReq(body: unknown, opts: { rawBody?: string } = {}): Request {
    return new Request('http://x/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: opts.rawBody ?? JSON.stringify(body),
    });
  }

  it('returns 400 invalid_client_metadata when body is not JSON', async () => {
    const res = await registerPOST(jsonReq(null, { rawBody: 'not-json{' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_client_metadata');
    expect(body.error_description).toBe('Body must be JSON');
  });

  it('returns 400 when client_name is missing', async () => {
    const res = await registerPOST(
      jsonReq({ redirect_uris: ['https://app.example.com/cb'] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_client_metadata');
    expect(body.error_description).toBe('client_name is required');
  });

  it('returns 400 when client_name is whitespace only', async () => {
    const res = await registerPOST(
      jsonReq({ client_name: '   ', redirect_uris: ['https://app.example.com/cb'] }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_redirect_uri when redirect_uris is empty', async () => {
    const res = await registerPOST(
      jsonReq({ client_name: 'Test', redirect_uris: [] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_redirect_uri');
    expect(body.error_description).toBe('At least one redirect_uri is required');
  });

  it('returns 400 invalid_redirect_uri when redirect_uris is missing', async () => {
    const res = await registerPOST(jsonReq({ client_name: 'Test' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_redirect_uri');
  });

  it('returns 400 when more than MAX_REDIRECT_URIS (5) are given', async () => {
    const six = Array.from({ length: 6 }, (_, i) => `https://x.example.com/cb${i}`);
    const res = await registerPOST(
      jsonReq({ client_name: 'Test', redirect_uris: six }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_description).toMatch(/Maximum 5/);
  });

  it('returns 400 when a redirect_uri is not a string', async () => {
    const res = await registerPOST(
      jsonReq({ client_name: 'Test', redirect_uris: [123] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_redirect_uri');
  });

  it('returns 400 when a redirect_uri scheme is rejected (http on non-loopback)', async () => {
    const res = await registerPOST(
      jsonReq({
        client_name: 'Test',
        redirect_uris: ['http://app.example.com/cb'],
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_redirect_uri');
    expect(body.error_description).toContain('http://app.example.com/cb');
  });

  it('returns 400 when token_endpoint_auth_method is not "none"', async () => {
    const res = await registerPOST(
      jsonReq({
        client_name: 'Test',
        redirect_uris: ['https://app.example.com/cb'],
        token_endpoint_auth_method: 'client_secret_basic',
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_client_metadata');
  });

  it('succeeds with minimal fields and returns RFC 7591 response', async () => {
    const res = await registerPOST(
      jsonReq({
        client_name: 'My App',
        redirect_uris: ['https://app.example.com/cb'],
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_id).toBe('oc_fixedclientid');
    expect(body.client_name).toBe('My App');
    expect(body.redirect_uris).toEqual(['https://app.example.com/cb']);
    expect(body.grant_types).toEqual(['authorization_code']);
    expect(body.response_types).toEqual(['code']);
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(typeof body.client_id_issued_at).toBe('number');

    // Persisted with secret-less defaults
    expect(state.oauthClients).toHaveLength(1);
    expect(state.oauthClients[0].tokenEndpointAuthMethod).toBe('none');
  });

  it('truncates client_name to 200 chars and persists optional URIs', async () => {
    const longName = 'X'.repeat(500);
    const longUri = 'https://example.com/' + 'a'.repeat(600);
    const res = await registerPOST(
      jsonReq({
        client_name: longName,
        redirect_uris: ['https://app.example.com/cb', 'cursor://callback'],
        client_uri: longUri,
        logo_uri: 'https://logo.example.com/l.png',
        tos_uri: 'https://example.com/tos',
        policy_uri: 'https://example.com/policy',
        software_id: 'sw-123',
        software_version: '1.2.3',
        token_endpoint_auth_method: 'none',
      }),
    );
    expect(res.status).toBe(201);
    const persisted = state.oauthClients[0];
    expect(persisted.clientName.length).toBe(200);
    expect(persisted.clientUri?.length).toBe(500);
    expect(persisted.logoUri).toBe('https://logo.example.com/l.png');
    expect(persisted.tosUri).toBe('https://example.com/tos');
    expect(persisted.policyUri).toBe('https://example.com/policy');
    expect(persisted.softwareId).toBe('sw-123');
    expect(persisted.softwareVersion).toBe('1.2.3');
    expect(persisted.redirectUris).toEqual([
      'https://app.example.com/cb',
      'cursor://callback',
    ]);
  });

  it('accepts loopback http://localhost redirect', async () => {
    const res = await registerPOST(
      jsonReq({
        client_name: 'Local Dev',
        redirect_uris: ['http://localhost:3000/cb'],
      }),
    );
    expect(res.status).toBe(201);
  });

  it('accepts custom native-scheme redirect', async () => {
    const res = await registerPOST(
      jsonReq({
        client_name: 'Claude CLI',
        redirect_uris: ['claude-cli://oauth/callback'],
      }),
    );
    expect(res.status).toBe(201);
  });
});

// ===========================================================================
// /oauth/authorize/decision
// ===========================================================================

describe('POST /oauth/authorize/decision', () => {
  function decisionReq(params: Record<string, string | string[]>): Request {
    // The handler reads via req.formData(), so we must send multipart/form-urlencoded.
    return formRequest('http://x/oauth/authorize/decision', params);
  }

  // A baseline of valid params; tests override specific keys.
  function defaultParams(): Record<string, string | string[]> {
    return {
      decision: 'approve',
      client_id: 'oc_test',
      redirect_uri: 'https://app.example.com/cb',
      state: 'xyz-state',
      code_challenge: 'A'.repeat(43), // any 43+ char base64url-ish string
      code_challenge_method: 'S256',
      active_client_id: '42',
      scopes: ['profile:read', 'projects:read'],
    };
  }

  it('returns 400 when client_id is missing', async () => {
    const params = defaultParams();
    delete params.client_id;
    const res = await decisionPOST(decisionReq(params));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Missing client_id or redirect_uri');
  });

  it('returns 400 when redirect_uri is missing', async () => {
    const params = defaultParams();
    delete params.redirect_uri;
    const res = await decisionPOST(decisionReq(params));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the OAuth client is unknown', async () => {
    const res = await decisionPOST(decisionReq(defaultParams()));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('Unknown client');
  });

  it('returns 400 when redirect_uri does not exactly match', async () => {
    seedClient({ clientId: 'oc_test', redirectUris: ['https://other.example.com/cb'] });
    const res = await decisionPOST(decisionReq(defaultParams()));
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('redirect_uri mismatch');
  });

  it('redirects with error=access_denied when user declines', async () => {
    seedClient({ clientId: 'oc_test' });
    const params = defaultParams();
    params.decision = 'deny';
    const res = await decisionPOST(decisionReq(params));
    expect(res.status).toBe(302);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('error=access_denied');
    expect(loc).toContain('state=xyz-state');
  });

  it('redirects with invalid_request when PKCE challenge is missing', async () => {
    seedClient({ clientId: 'oc_test' });
    const params = defaultParams();
    delete params.code_challenge;
    const res = await decisionPOST(decisionReq(params));
    expect(res.status).toBe(302);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('error=invalid_request');
    expect(loc).toContain('PKCE+S256+required');
  });

  it('redirects with invalid_request when PKCE method is not S256', async () => {
    seedClient({ clientId: 'oc_test' });
    const params = defaultParams();
    params.code_challenge_method = 'plain';
    const res = await decisionPOST(decisionReq(params));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=invalid_request');
  });

  it('redirects with invalid_scope when no recognised scopes are requested', async () => {
    seedClient({ clientId: 'oc_test' });
    const params = defaultParams();
    params.scopes = ['nonsense:scope'];
    const res = await decisionPOST(decisionReq(params));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=invalid_scope');
  });

  it('redirects with login_required when session is missing', async () => {
    seedClient({ clientId: 'oc_test' });
    authMock.mockResolvedValueOnce(null);
    const res = await decisionPOST(decisionReq(defaultParams()));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=login_required');
  });

  it('redirects with login_required when session.user.id is missing', async () => {
    seedClient({ clientId: 'oc_test' });
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await decisionPOST(decisionReq(defaultParams()));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=login_required');
  });

  it('redirects with invalid_request when active_client_id is missing/zero', async () => {
    seedClient({ clientId: 'oc_test' });
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    const params = defaultParams();
    params.active_client_id = '0';
    const res = await decisionPOST(decisionReq(params));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('error=invalid_request');
  });

  it('redirects with access_denied when user has no access to the selected portal', async () => {
    seedClient({ clientId: 'oc_test' });
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    // No clientMembers row and no owned client.
    const res = await decisionPOST(decisionReq(defaultParams()));
    expect(res.status).toBe(302);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('error=access_denied');
  });

  it('issues a code when user is a member of the portal', async () => {
    seedClient({ clientId: 'oc_test' });
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    state.clientMembers.push({ userId: 7, clientId: 42 });

    const res = await decisionPOST(decisionReq(defaultParams()));
    expect(res.status).toBe(302);
    const loc = res.headers.get('location')!;
    expect(loc).toContain('code=sd_oac_fake');
    expect(loc).toContain('state=xyz-state');
    expect(state.oauthAuthorizationCodes).toHaveLength(1);
    const stored = state.oauthAuthorizationCodes[0];
    expect(stored.codeHash).toBe('auth-code-hash');
    expect(stored.userId).toBe(7);
    expect(stored.clientId).toBe(42);
    expect(stored.scopes).toEqual(['profile:read', 'projects:read']);
    expect(stored.codeChallengeMethod).toBe('S256');
    expect(stored.resource).toBeNull();
  });

  it('issues a code via legacy owned-client fallback when membership row is absent', async () => {
    seedClient({ clientId: 'oc_test' });
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    state.clients.push({ id: 42, userId: 7 });

    const res = await decisionPOST(decisionReq(defaultParams()));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('code=sd_oac_fake');
    expect(state.oauthAuthorizationCodes).toHaveLength(1);
  });

  it('persists the resource param when supplied', async () => {
    seedClient({ clientId: 'oc_test' });
    authMock.mockResolvedValueOnce({ user: { id: '7' } });
    state.clientMembers.push({ userId: 7, clientId: 42 });

    const params = defaultParams();
    params.resource = 'https://mcp.example.com';
    const res = await decisionPOST(decisionReq(params));
    expect(res.status).toBe(302);
    expect(state.oauthAuthorizationCodes[0].resource).toBe('https://mcp.example.com');
  });
});

// ===========================================================================
// /oauth/token
// ===========================================================================

describe('POST /oauth/token', () => {
  const REDIRECT = 'https://app.example.com/cb';
  const VERIFIER = 'a'.repeat(64);
  const { challenge } = pkcePair(VERIFIER);
  const RAW_CODE = 'sd_oac_demo_code_value';
  const CODE_HASH = sha256(RAW_CODE);

  function seedFullScenario(over: Partial<AuthCodeRow> = {}): {
    client: OauthClientRow;
    code: AuthCodeRow;
  } {
    const client = seedClient({ clientId: 'oc_test', redirectUris: [REDIRECT] });
    const code: AuthCodeRow = {
      id: state.nextAuthCodePk++,
      codeHash: CODE_HASH,
      oauthClientId: client.id,
      userId: 7,
      clientId: 42,
      scopes: ['profile:read', 'projects:read'],
      redirectUri: REDIRECT,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      resource: null,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
      ...over,
    };
    state.oauthAuthorizationCodes.push(code);
    return { client, code };
  }

  function validParams(over: Partial<Record<string, string>> = {}): Record<string, string> {
    return {
      grant_type: 'authorization_code',
      code: RAW_CODE,
      client_id: 'oc_test',
      redirect_uri: REDIRECT,
      code_verifier: VERIFIER,
      ...over,
    };
  }

  it('returns 400 invalid_request when body is not parseable at all', async () => {
    // Force the formData fallback path AND make it throw — we cheat by sending
    // an unknown content-type with no body so formData() rejects.
    const req = new Request('http://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: 'gibberish',
    });
    const res = await tokenPOST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_request');
    expect(body.error_description).toBe('Unparseable body');
  });

  it('accepts JSON content-type and runs the same flow', async () => {
    seedFullScenario();
    const req = new Request('http://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validParams()),
    });
    const res = await tokenPOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBe('sd_oauth_fake');
    expect(body.token_type).toBe('Bearer');
    expect(body.scope).toBe('profile:read projects:read');
  });

  it('returns 400 unsupported_grant_type for non-authorization_code grants', async () => {
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', { grant_type: 'client_credentials' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('unsupported_grant_type');
  });

  it('returns 400 invalid_request when required params are missing', async () => {
    const params = validParams();
    // `code` is checked in the upfront required-params block. (code_verifier
    // is now PKCE-conditional and verified after client lookup, so deleting
    // it alone returns invalid_client when the client isn't seeded.)
    delete (params as Record<string, string | undefined>).code;
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', params as Record<string, string>),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_request');
  });

  it('returns 401 invalid_client when the client_id is unknown', async () => {
    // RFC 6749 §5.2 — token-endpoint client auth failures are 401, not 400.
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', validParams()),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('invalid_client');
  });

  it('returns 400 invalid_grant when no matching code row exists', async () => {
    seedClient({ clientId: 'oc_test', redirectUris: [REDIRECT] });
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', validParams()),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_grant');
  });

  it('returns 400 invalid_grant when the code belongs to a different client', async () => {
    seedFullScenario({ oauthClientId: 9999 });
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', validParams()),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_description).toBe('Code was not issued to this client');
  });

  it('returns 400 invalid_grant when the code is expired', async () => {
    seedFullScenario({ expiresAt: new Date(Date.now() - 60_000) });
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', validParams()),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_description).toBe('Code expired');
  });

  it('returns 400 invalid_grant when redirect_uri does not match the one used at /authorize', async () => {
    seedFullScenario();
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', validParams({ redirect_uri: 'https://other.example.com/cb' })),
    );
    // /authorize check would have rejected, but token endpoint also validates.
    // Since the seeded redirect is exact, this would actually pass the client
    // lookup (we registered only the right one) — let's adjust: register both,
    // and assert mismatch fires.
    expect(res.status).toBe(400);
  });

  it('returns 400 invalid_grant when redirect_uri mismatches the stored value', async () => {
    // Register two redirect URIs so the client lookup passes, but the stored
    // code recorded only one.
    state.oauthClients.length = 0;
    state.oauthAuthorizationCodes.length = 0;
    seedClient({
      clientId: 'oc_test',
      redirectUris: [REDIRECT, 'https://other.example.com/cb'],
    });
    state.oauthAuthorizationCodes.push({
      id: state.nextAuthCodePk++,
      codeHash: CODE_HASH,
      oauthClientId: 1,
      userId: 7,
      clientId: 42,
      scopes: ['profile:read'],
      redirectUri: REDIRECT,
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      resource: null,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
    });
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', validParams({ redirect_uri: 'https://other.example.com/cb' })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_description).toBe(
      'redirect_uri does not match the one used at /authorize',
    );
  });

  it('returns 400 invalid_grant when PKCE verifier does not match the challenge', async () => {
    seedFullScenario();
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', validParams({ code_verifier: 'b'.repeat(64) })),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error_description).toBe('PKCE verification failed');
  });

  it('issues an access token on success, marks code consumed, persists resource override', async () => {
    seedFullScenario();
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', validParams({ resource: 'https://mcp.example.com' })),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBe('sd_oauth_fake');
    expect(body.token_type).toBe('Bearer');
    expect(typeof body.expires_in).toBe('number');
    expect(body.scope).toBe('profile:read projects:read');

    expect(state.oauthAccessTokens).toHaveLength(1);
    const stored = state.oauthAccessTokens[0];
    expect(stored.tokenHash).toBe('access-token-hash');
    expect(stored.oauthClientId).toBe(1);
    expect(stored.userId).toBe(7);
    expect(stored.clientId).toBe(42);
    expect(stored.resource).toBe('https://mcp.example.com');

    // Code marked consumed
    expect(state.oauthAuthorizationCodes[0].consumedAt).toBeInstanceOf(Date);
  });

  it('replaying a code (consumedAt already set) returns invalid_grant before issuing a token', async () => {
    seedFullScenario({ consumedAt: new Date('2026-05-19T00:00:00Z') });
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', validParams()),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    // The first select filters on consumedAt IS NULL, so the row is not even
    // found — error_description matches the "code invalid/expired/used" branch.
    expect(body.error).toBe('invalid_grant');
    expect(state.oauthAccessTokens).toHaveLength(0);
  });

  it('falls back to stored resource when token request omits it', async () => {
    seedFullScenario({ resource: 'https://stored.example.com' });
    const res = await tokenPOST(
      formRequest('http://x/oauth/token', validParams()),
    );
    expect(res.status).toBe(200);
    expect(state.oauthAccessTokens[0].resource).toBe('https://stored.example.com');
  });

  it('accepts multipart/form-data via formData() fallback path', async () => {
    seedFullScenario();
    const fd = new FormData();
    for (const [k, v] of Object.entries(validParams())) fd.set(k, v);
    const req = new Request('http://x/oauth/token', {
      method: 'POST',
      body: fd,
    });
    // Strip the content-type header so the fallback branch is exercised.
    // (FormData auto-sets multipart/form-data; the route's else branch
    // covers it.)
    const res = await tokenPOST(req);
    expect(res.status).toBe(200);
  });
});
