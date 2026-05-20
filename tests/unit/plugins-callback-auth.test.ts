// Unit tests for lib/plugins/callback-auth.
//
// Exercises the auth pipeline end-to-end against the same chainable DB
// fixture pattern used by `plugins-jwt.test.ts` (lifted + extended for
// the registered_apps, registered_app_callbacks_audit, and clientServices
// tables this module touches).
//
// Coverage targets (mandatory):
//   - Missing Authorization header     → 401
//   - Expired JWT                      → 401
//   - Mismatched Origin                → 403
//   - Replayed jti                     → 409
//   - Wrong clientId for allowlist app → 403 tenancy
//   - Happy path                       → ctx returned with correct app/client/jti

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

// ─── DB fixture state ────────────────────────────────────────────────────
// Each test mutates these arrays; the chainable mock filters them.

type SigningKeyRow = {
  appId: number;
  kid: string;
  secretEncrypted: string;
  status: 'active' | 'retiring' | 'revoked';
};
type AppRow = {
  id: number;
  slug: string;
  status: string;
  hostUrl: string;
  visibility: 'allowlist' | 'entitled' | 'global';
  allowedClientIds: number[];
  billingServiceId: number | null;
};
type AuditRow = { jti: string };
type ClientServiceRow = {
  clientId: number;
  serviceId: number;
  status: string;
};

const fixtures: {
  apps: AppRow[];
  signingKeys: SigningKeyRow[];
  audit: AuditRow[];
  clientServices: ClientServiceRow[];
} = { apps: [], signingKeys: [], audit: [], clientServices: [] };

// Recursively walk an `and(...)` / `eq(...)` tree to collect leaf eq nodes.
function collectEqs(
  node: unknown,
): Array<{ col: { __col?: string }; val: unknown }> {
  if (!node || typeof node !== 'object') return [];
  const n = node as { kind?: string; col?: unknown; val?: unknown; parts?: unknown[] };
  if (n.kind === 'eq') {
    return [{ col: (n.col ?? {}) as { __col?: string }, val: n.val }];
  }
  if (n.kind === 'and' && Array.isArray(n.parts)) {
    return n.parts.flatMap(collectEqs);
  }
  return [];
}

vi.mock('@/lib/db', () => {
  type Chain = {
    from: (t: unknown) => Chain;
    where: (w: unknown) => Chain;
    limit: (n: number) => Promise<unknown[]>;
    __rows: unknown[];
  };

  const propFor = (col?: string, tableHint?: string): string | null => {
    switch (col) {
      case 'id':
        return 'id';
      case 'slug':
        return 'slug';
      case 'app_id':
        return 'appId';
      case 'kid':
        return 'kid';
      case 'status':
        return 'status';
      case 'client_id':
        return 'clientId';
      case 'service_id':
        return 'serviceId';
      case 'jti':
        return 'jti';
      default:
        return null;
    }
    void tableHint;
  };

  const select = (_proj?: unknown): Chain => {
    let activeName: string | null = null;
    const c: Chain = {
      __rows: [],
      from(table: unknown) {
        const name = (table as { __name?: string })?.__name ?? null;
        activeName = name;
        if (name === 'registered_apps') c.__rows = fixtures.apps;
        else if (name === 'registered_app_signing_keys') c.__rows = fixtures.signingKeys;
        else if (name === 'client_services') c.__rows = fixtures.clientServices;
        else c.__rows = [];
        return c;
      },
      where(w: unknown) {
        const eqs = collectEqs(w);
        c.__rows = (c.__rows as Array<Record<string, unknown>>).filter((row) =>
          eqs.every(({ col, val }) => {
            const prop = propFor(col.__col, activeName ?? undefined);
            if (prop === null) return true;
            return row[prop] === val;
          }),
        );
        return c;
      },
      limit(_n: number) {
        return Promise.resolve(c.__rows);
      },
    };
    return c;
  };

  // INSERT chain — values(row).returning() OR values(row) used by audit.
  // We model audit as the unique constraint case: throws on duplicate jti.
  const insert = (table: unknown) => {
    const name = (table as { __name?: string })?.__name ?? null;
    return {
      values(row: Record<string, unknown>) {
        const ret = {
          returning(_proj?: unknown) {
            if (name === 'registered_app_callbacks_audit') {
              const jti = row.jti as string;
              if (fixtures.audit.some((a) => a.jti === jti)) {
                const err = new Error(
                  'duplicate key value violates unique constraint "registered_app_callbacks_audit_jti_unique"',
                );
                (err as { code?: string }).code = '23505';
                return Promise.reject(err);
              }
              fixtures.audit.push({ jti });
              return Promise.resolve([{ jti }]);
            }
            return Promise.resolve([row]);
          },
          // values(...).then(): used when caller doesn't chain .returning().
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(this.returning()).then(onFulfilled, onRejected);
          },
        };
        // Also expose the audit-insert path that does NOT chain .returning():
        // emulate by returning a thenable.
        if (name === 'registered_app_callbacks_audit') {
          const jti = row.jti as string;
          if (fixtures.audit.some((a) => a.jti === jti)) {
            const err = new Error(
              'duplicate key value violates unique constraint',
            );
            (err as { code?: string }).code = '23505';
            // Thenable that rejects.
            return {
              returning() {
                return Promise.reject(err);
              },
              then(_onF: unknown, onR?: (e: unknown) => unknown) {
                return (onR ? onR(err) : Promise.reject(err));
              },
            } as unknown as { returning: () => Promise<unknown[]> };
          }
          fixtures.audit.push({ jti });
          return {
            returning() {
              return Promise.resolve([{ jti }]);
            },
            then(onF: (v: unknown) => unknown) {
              return Promise.resolve([{ jti }]).then(onF);
            },
          };
        }
        return ret;
      },
    };
  };

  return { db: { select, insert } };
});

// Schema mock — same markers as plugins-jwt.test.ts, plus the audit table
// and clientServices.
vi.mock('@/lib/db/schema/plugins', () => ({
  registeredApps: {
    __name: 'registered_apps',
    id: { __col: 'id' },
    slug: { __col: 'slug' },
    status: { __col: 'status' },
  },
  registeredAppSigningKeys: {
    __name: 'registered_app_signing_keys',
    appId: { __col: 'app_id' },
    kid: { __col: 'kid' },
    status: { __col: 'status' },
    secretEncrypted: { __col: 'secret_encrypted' },
  },
  registeredAppCallbacksAudit: {
    __name: 'registered_app_callbacks_audit',
    jti: { __col: 'jti' },
  },
}));

vi.mock('@/lib/db/schema', () => ({
  clientServices: {
    __name: 'client_services',
    clientId: { __col: 'client_id' },
    serviceId: { __col: 'service_id' },
    status: { __col: 'status' },
  },
}));

vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>(
    'drizzle-orm',
  );
  return {
    ...actual,
    eq: (col: unknown, val: unknown) => ({ kind: 'eq', col, val }),
    and: (...parts: unknown[]) => ({ kind: 'and', parts }),
  };
});

vi.mock('@/lib/plugins/kms', () => ({
  encryptSecret: (s: string) => s,
  decryptSecret: (s: string) => s,
}));

process.env.VITEST = 'true';

const { signPluginJwtTestOnly } = await import('@/lib/plugins/jwt');
const { authenticateCallback, isScopeCovered, requireScope } = await import(
  '@/lib/plugins/callback-auth'
);

// ─── Fixtures ─────────────────────────────────────────────────────────────

const APP_SLUG = 'postcaptain-tools';
const APP_ID = 42;
const KID = 'k1';
const SECRET = randomBytes(32).toString('base64');
const HOST_URL = 'https://postcaptain-tools.simplerdevelopment.com';
const PORTAL_CLIENT_ID = 103;

function baseClaims(overrides: Record<string, unknown> = {}) {
  return {
    aud: APP_SLUG,
    sub: '7',
    clientId: PORTAL_CLIENT_ID,
    siteId: null as number | null,
    scopes: ['postcaptain:research:read', 'postcaptain:research:write'],
    ...overrides,
  };
}

function mkRequest(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
  } = {},
) {
  // Use the global Request constructor; callback-auth treats the argument as
  // NextRequest but only reads `.headers`, `.url`, `.method` — all part of the
  // Request interface.
  return new Request(url, {
    method: init.method ?? 'POST',
    headers: init.headers,
  }) as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  fixtures.apps = [
    {
      id: APP_ID,
      slug: APP_SLUG,
      status: 'active',
      hostUrl: HOST_URL,
      visibility: 'allowlist',
      allowedClientIds: [PORTAL_CLIENT_ID],
      billingServiceId: null,
    },
  ];
  fixtures.signingKeys = [
    { appId: APP_ID, kid: KID, secretEncrypted: SECRET, status: 'active' },
  ];
  fixtures.audit = [];
  fixtures.clientServices = [];
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe('authenticateCallback — failure modes', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const req = mkRequest(
      'https://simplerdevelopment.com/api/plugin-callback/postcaptain-tools/scripts/run',
      { headers: { origin: HOST_URL } },
    );
    const res = await authenticateCallback(req, APP_SLUG);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.code).toBe('unauthorized');
    }
  });

  it('returns 401 on expired JWT', async () => {
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims(), {
      now: Date.now() - 120_000,
      ttlSeconds: 60,
    });
    const req = mkRequest(
      'https://simplerdevelopment.com/api/plugin-callback/postcaptain-tools/scripts/run',
      {
        headers: {
          authorization: `Bearer ${token}`,
          origin: HOST_URL,
        },
      },
    );
    const res = await authenticateCallback(req, APP_SLUG);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.code).toBe('unauthorized');
      expect(res.message).toMatch(/expired/);
    }
  });

  it('returns 403 when Origin header does not match app.hostUrl', async () => {
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    const req = mkRequest(
      'https://simplerdevelopment.com/api/plugin-callback/postcaptain-tools/scripts/run',
      {
        headers: {
          authorization: `Bearer ${token}`,
          origin: 'https://evil.example.com',
        },
      },
    );
    const res = await authenticateCallback(req, APP_SLUG);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.code).toBe('forbidden');
      expect(res.message).toMatch(/origin/i);
    }
  });

  it('returns 409 when the jti has already been seen (replay)', async () => {
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    const headers = {
      authorization: `Bearer ${token}`,
      origin: HOST_URL,
    };
    const req1 = mkRequest(
      'https://simplerdevelopment.com/api/plugin-callback/postcaptain-tools/scripts/run',
      { headers },
    );
    const first = await authenticateCallback(req1, APP_SLUG);
    expect(first.ok).toBe(true);

    // Second use of the SAME token (same jti) must be rejected.
    const req2 = mkRequest(
      'https://simplerdevelopment.com/api/plugin-callback/postcaptain-tools/scripts/run',
      { headers },
    );
    const second = await authenticateCallback(req2, APP_SLUG);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.status).toBe(409);
      expect(second.code).toBe('replay');
    }
  });

  it('returns 403 tenancy when clientId is not in allowlist', async () => {
    // App's allowlist does NOT include the JWT's clientId.
    fixtures.apps[0].allowedClientIds = [999, 888];

    const token = await signPluginJwtTestOnly(
      SECRET,
      KID,
      baseClaims({ clientId: PORTAL_CLIENT_ID }),
    );
    const req = mkRequest(
      'https://simplerdevelopment.com/api/plugin-callback/postcaptain-tools/scripts/run',
      {
        headers: {
          authorization: `Bearer ${token}`,
          origin: HOST_URL,
        },
      },
    );
    const res = await authenticateCallback(req, APP_SLUG);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.code).toBe('forbidden');
      expect(res.message).toMatch(/entitled|tenant/i);
    }
  });

  it('returns 401 when the registered app row is missing or disabled', async () => {
    // Drop the active app row — JWT still verifies (signing key + slug
    // mapping are independent) but the row reload fails closed.
    fixtures.apps[0].status = 'disabled';

    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    const req = mkRequest(
      'https://simplerdevelopment.com/api/plugin-callback/postcaptain-tools/scripts/run',
      {
        headers: {
          authorization: `Bearer ${token}`,
          origin: HOST_URL,
        },
      },
    );
    const res = await authenticateCallback(req, APP_SLUG);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.code).toBe('unauthorized');
    }
  });
});

describe('authenticateCallback — happy path', () => {
  it('returns a context populated with app, client, jti', async () => {
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    const req = mkRequest(
      'https://simplerdevelopment.com/api/plugin-callback/postcaptain-tools/scripts/run',
      {
        headers: {
          authorization: `Bearer ${token}`,
          origin: HOST_URL,
          'x-sd-request-id': 'req-abc-123',
        },
      },
    );
    const res = await authenticateCallback(req, APP_SLUG);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ctx.app.id).toBe(APP_ID);
      expect(res.ctx.app.slug).toBe(APP_SLUG);
      expect(res.ctx.client.id).toBe(PORTAL_CLIENT_ID);
      expect(res.ctx.requestId).toBe('req-abc-123');
      expect(typeof res.ctx.jti).toBe('string');
      expect(res.ctx.jti).toBe(res.ctx.claims.jti);
      expect(res.ctx.claims.scopes).toContain('postcaptain:research:read');
    }
  });

  it('generates a request id when x-sd-request-id is absent', async () => {
    const token = await signPluginJwtTestOnly(SECRET, KID, baseClaims());
    const req = mkRequest(
      'https://simplerdevelopment.com/api/plugin-callback/postcaptain-tools/scripts/run',
      {
        headers: {
          authorization: `Bearer ${token}`,
          origin: HOST_URL,
        },
      },
    );
    const res = await authenticateCallback(req, APP_SLUG);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ctx.requestId.length).toBeGreaterThan(0);
    }
  });
});

describe('scope helpers', () => {
  it('isScopeCovered exact match', () => {
    expect(isScopeCovered('a:b:read', ['a:b:read'])).toBe(true);
  });
  it('isScopeCovered wildcard suffix', () => {
    expect(isScopeCovered('a:b:read', ['a:b:*'])).toBe(true);
    expect(isScopeCovered('a:b:read', ['a:*'])).toBe(true);
  });
  it('isScopeCovered miss', () => {
    expect(isScopeCovered('a:b:read', ['a:c:*'])).toBe(false);
  });
  it('requireScope mirrors isScopeCovered', () => {
    expect(requireScope(['postcaptain:research:*'], 'postcaptain:research:write')).toBe(true);
    expect(requireScope(['postcaptain:research:read'], 'postcaptain:research:write')).toBe(false);
  });
});
