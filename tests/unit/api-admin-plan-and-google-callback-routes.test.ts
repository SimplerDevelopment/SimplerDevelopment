// @vitest-environment node
/**
 * Unit tests for two unrelated routes packed into one file:
 *
 *   1. GET / POST /api/admin/portal/clients/[id]/plan
 *      - Staff-only auth (admin/employee), invalid id rejection
 *      - GET returns tier catalog + currently active tier (if any)
 *      - POST cancels prior tier rows + inserts a new active row,
 *        validates target is a tier service, supports null cancel
 *
 *   2. GET /api/portal/integrations/google/callback
 *      - state required + verifyState failures (invalid / expired / unexpected)
 *      - CSRF binding: session user must equal payload.userId
 *      - Google error redirects, missing code branch
 *      - Tenant not provisioned / revoked branches
 *      - Token exchange failure → 502
 *      - Gmail watch failure swallowed (best-effort)
 *      - Upsert onConflictDoUpdate path + sanitizeReturnTo behaviour
 *
 * All external modules (auth, db, drizzle, google libs) are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// Shared schema + drizzle mocks
// ===========================================================================

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    clientServices: wrap('clientServices'),
    services: wrap('services'),
    googleWorkspaceUserConnections: wrap('googleWorkspaceUserConnections'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

// ===========================================================================
// Shared auth mock
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

// ===========================================================================
// Google route dependency mocks
// ===========================================================================

const verifyStateMock = vi.fn();
class TestStateInvalidError extends Error {
  reason: string;
  constructor(reason: string) {
    super(`OAuth state invalid: ${reason}`);
    this.name = 'StateInvalidError';
    this.reason = reason;
  }
}
vi.mock('@/lib/google/oauth-state', () => ({
  verifyState: (...args: unknown[]) => verifyStateMock(...args),
  StateInvalidError: TestStateInvalidError,
}));

const exchangeCodeMock = vi.fn();
vi.mock('@/lib/google/oauth', () => ({
  exchangeCode: (...args: unknown[]) => exchangeCodeMock(...args),
}));

const getTenantCredsMock = vi.fn();
vi.mock('@/lib/google/tenant-credentials', () => ({
  getTenantWorkspaceCredentialsByClientId: (...args: unknown[]) =>
    getTenantCredsMock(...args),
}));

const startGmailWatchMock = vi.fn();
vi.mock('@/lib/google/gmail-watch', () => ({
  startGmailWatch: (...args: unknown[]) => startGmailWatchMock(...args),
}));

// Silence the route's console.error for gmail-watch failures
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ===========================================================================
// In-memory DB
// ===========================================================================

interface MockState {
  clientServices: Array<Record<string, unknown>>;
  services: Array<Record<string, unknown>>;
  googleWorkspaceUserConnections: Array<Record<string, unknown>>;
}

const state: MockState = {
  clientServices: [],
  services: [],
  googleWorkspaceUserConnections: [],
};

let lastInsert: { table: string; values: Record<string, unknown>[] } | null = null;
let lastConflictUpdate: { target: unknown; set: Record<string, unknown> } | null =
  null;
let lastUpdate:
  | { table: string; set: Record<string, unknown>; filter: unknown }
  | null = null;

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[
    name
  ] ?? [];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
    list?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'inArray': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return (f.list ?? []).includes(row[col.__col]);
    }
    default:
      return true;
  }
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

vi.mock('@/lib/billing/domain-catalog', () => ({
  TIERS: [
    { slug: 'plan-starter', name: 'Starter' },
    { slug: 'plan-growth', name: 'Growth' },
    { slug: 'plan-scale', name: 'Scale' },
  ],
}));

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, { __col?: string }>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      innerJoin(_table: unknown, _on: unknown) {
        // For test purposes, we ignore the join — predicates against the joined
        // table's slug column are still resolved by looking up __col on row,
        // which doesn't exist on join, so we add a join-aware filter step.
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      limit(n: number) {
        limit = n;
        return runQuery();
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      // For the GET /plan join: clientServices innerJoin services.
      // We model this by enriching clientServices rows with the matched service
      // when the active table is clientServices.
      let rows = tableArray(activeTable).map((r) => ({ ...r }));
      if (activeTable === 'clientServices') {
        rows = rows.map((cs) => {
          const svc = state.services.find((s) => s.id === cs.serviceId);
          return { ...cs, slug: svc?.slug, name: svc?.name };
        });
      }
      rows = rows.filter((r) => evalPredicate(filter, r));
      let out = rows;
      if (projection) {
        out = out.map((r) => {
          const slim: Record<string, unknown> = {};
          for (const [alias, col] of Object.entries(projection)) {
            const key = col?.__col ?? alias;
            slim[alias] = r[key];
          }
          return slim;
        });
      }
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = {
            ...v,
            id: v.id ?? nextId(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          tableArray(table.__table).push(row);
          return row;
        });
        lastInsert = { table: table.__table, values: arr as Record<string, unknown>[] };
        const result: Record<string, unknown> = {
          returning(_proj?: unknown) {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          onConflictDoUpdate(cfg: { target: unknown; set: Record<string, unknown> }) {
            lastConflictUpdate = cfg;
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
        return result;
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    let setValues: Record<string, unknown> = {};
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      set(vals: Record<string, unknown>) {
        setValues = vals;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return run();
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return run().then(onFulfilled, onRejected);
      },
    };
    function run(): Promise<Record<string, unknown>[]> {
      const rows = tableArray(table.__table);
      const updated: Record<string, unknown>[] = [];
      for (const r of rows) {
        if (evalPredicate(filter, r)) {
          Object.assign(r, setValues);
          updated.push({ ...r });
        }
      }
      lastUpdate = { table: table.__table, set: setValues, filter };
      return Promise.resolve(updated);
    }
    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, { __col?: string }>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection).from(table);
          },
        };
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

// ===========================================================================
// Modules under test
// ===========================================================================

const planRoute = await import(
  '@/app/api/admin/portal/clients/[id]/plan/route'
);
const planGET = planRoute.GET;
const planPOST = planRoute.POST;

const googleCallback = await import(
  '@/app/api/portal/integrations/google/callback/route'
);
const googleGET = googleCallback.GET;

// ===========================================================================
// Shared resets
// ===========================================================================

beforeEach(() => {
  state.clientServices.length = 0;
  state.services.length = 0;
  state.googleWorkspaceUserConnections.length = 0;
  lastInsert = null;
  lastConflictUpdate = null;
  lastUpdate = null;
  idCounter = 1000;

  authMock.mockReset();
  verifyStateMock.mockReset();
  exchangeCodeMock.mockReset();
  getTenantCredsMock.mockReset();
  startGmailWatchMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
});

// ===========================================================================
// GET /api/admin/portal/clients/[id]/plan
// ===========================================================================

function planParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function makeGetReq(): Request {
  return new Request('http://x/api/admin/portal/clients/1/plan');
}

function makePostReq(body: unknown): Request {
  return new Request('http://x/api/admin/portal/clients/1/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePostRaw(raw: string): Request {
  return new Request('http://x/api/admin/portal/clients/1/plan', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: raw,
  });
}

function seedTierCatalog() {
  state.services.push(
    {
      id: 100,
      slug: 'plan-starter',
      name: 'Starter',
      description: 's',
      price: 100,
      billingCycle: 'monthly',
      features: [],
      usageLimits: {},
      active: true,
    },
    {
      id: 101,
      slug: 'plan-growth',
      name: 'Growth',
      description: 'g',
      price: 200,
      billingCycle: 'monthly',
      features: [],
      usageLimits: {},
      active: true,
    },
    {
      id: 102,
      slug: 'plan-scale',
      name: 'Scale',
      description: 's',
      price: 400,
      billingCycle: 'monthly',
      features: [],
      usageLimits: {},
      active: true,
    },
    {
      id: 200,
      slug: 'domain-registration',
      name: 'Domain',
      description: 'd',
      price: 12,
      billingCycle: 'yearly',
      features: [],
      usageLimits: {},
      active: true,
    },
  );
}

describe('GET /api/admin/portal/clients/[id]/plan', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await planGET(makeGetReq(), planParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await planGET(makeGetReq(), planParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is not admin/employee', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'client' } });
    const res = await planGET(makeGetReq(), planParams('1'));
    expect(res.status).toBe(401);
  });

  it('accepts employee role', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'employee' } });
    seedTierCatalog();
    const res = await planGET(makeGetReq(), planParams('1'));
    expect(res.status).toBe(200);
  });

  it('returns 400 on non-numeric client id', async () => {
    const res = await planGET(makeGetReq(), planParams('not-a-number'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid client id');
  });

  it('returns the tier catalog and null active when no clientServices row', async () => {
    seedTierCatalog();
    const res = await planGET(makeGetReq(), planParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.active).toBeNull();
    expect(body.data.catalog).toHaveLength(3);
    expect(body.data.catalog.map((c: { slug: string }) => c.slug).sort()).toEqual([
      'plan-growth',
      'plan-scale',
      'plan-starter',
    ]);
  });

  it('returns the currently active tier when one exists', async () => {
    seedTierCatalog();
    state.clientServices.push({
      id: 500,
      clientId: 1,
      serviceId: 101, // growth
      status: 'active',
      startDate: new Date('2025-01-01'),
    });
    // Cancelled tier row should be ignored
    state.clientServices.push({
      id: 501,
      clientId: 1,
      serviceId: 100,
      status: 'cancelled',
      startDate: new Date('2024-01-01'),
    });
    const res = await planGET(makeGetReq(), planParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.active).not.toBeNull();
    expect(body.data.active.serviceId).toBe(101);
    expect(body.data.active.slug).toBe('plan-growth');
  });

  it('returns active=null when tier catalog is empty', async () => {
    // No tier services seeded — tierIds.length === 0 branch
    const res = await planGET(makeGetReq(), planParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.active).toBeNull();
    expect(body.data.catalog).toEqual([]);
  });
});

// ===========================================================================
// POST /api/admin/portal/clients/[id]/plan
// ===========================================================================

describe('POST /api/admin/portal/clients/[id]/plan', () => {
  it('returns 401 when not staff', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await planPOST(makePostReq({ serviceId: 101 }), planParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid client id', async () => {
    const res = await planPOST(
      makePostReq({ serviceId: 101 }),
      planParams('not-a-num'),
    );
    expect(res.status).toBe(400);
  });

  it('treats malformed JSON body as empty (serviceId undefined → invalid)', async () => {
    seedTierCatalog();
    const res = await planPOST(makePostRaw('not json'), planParams('1'));
    // serviceIdRaw is undefined → targetServiceId = Number(undefined) = NaN → 400
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid serviceId');
  });

  it('returns 400 when serviceId is non-numeric', async () => {
    seedTierCatalog();
    const res = await planPOST(
      makePostReq({ serviceId: 'abc' }),
      planParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid serviceId');
  });

  it('returns 404 when serviceId does not exist', async () => {
    seedTierCatalog();
    const res = await planPOST(
      makePostReq({ serviceId: 99999 }),
      planParams('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Service not found');
  });

  it('returns 400 when serviceId is not a tier service', async () => {
    seedTierCatalog();
    const res = await planPOST(
      makePostReq({ serviceId: 200 }), // domain-registration
      planParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Service is not a pricing tier');
  });

  it('inserts a new active tier row and deactivates prior tier rows', async () => {
    seedTierCatalog();
    // prior active tier
    state.clientServices.push({
      id: 700,
      clientId: 1,
      serviceId: 100, // starter
      status: 'active',
      startDate: new Date('2024-01-01'),
    });
    // unrelated non-tier active row — must NOT be touched
    state.clientServices.push({
      id: 701,
      clientId: 1,
      serviceId: 200,
      status: 'active',
      startDate: new Date('2024-01-01'),
    });

    const res = await planPOST(
      makePostReq({ serviceId: 101 }), // upgrade to growth
      planParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.tier.slug).toBe('plan-growth');
    expect(body.data.assigned).not.toBeNull();
    expect(body.data.assigned.serviceId).toBe(101);
    expect(body.data.assigned.status).toBe('active');

    // Prior starter row was cancelled
    const starter = state.clientServices.find((r) => r.id === 700);
    expect(starter?.status).toBe('cancelled');

    // Domain row untouched
    const domain = state.clientServices.find((r) => r.id === 701);
    expect(domain?.status).toBe('active');

    // New row exists
    const newRow = state.clientServices.find(
      (r) => r.serviceId === 101 && r.status === 'active',
    );
    expect(newRow).toBeTruthy();
  });

  it('serviceId=null cancels current tier without inserting a replacement', async () => {
    seedTierCatalog();
    state.clientServices.push({
      id: 700,
      clientId: 1,
      serviceId: 100,
      status: 'active',
      startDate: new Date('2024-01-01'),
    });
    const res = await planPOST(
      makePostReq({ serviceId: null }),
      planParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.assigned).toBeNull();
    expect(body.data.tier).toBeNull();

    const starter = state.clientServices.find((r) => r.id === 700);
    expect(starter?.status).toBe('cancelled');

    // No new active row inserted
    expect(
      state.clientServices.filter((r) => r.status === 'active'),
    ).toHaveLength(0);
  });
});

// ===========================================================================
// GET /api/portal/integrations/google/callback
// ===========================================================================

function makeCallback(qs: Record<string, string>): Request {
  const u = new URL('http://example.com/api/portal/integrations/google/callback');
  for (const [k, v] of Object.entries(qs)) u.searchParams.set(k, v);
  return new Request(u.toString());
}

function defaultExchange() {
  return {
    accessToken: 'at-1',
    refreshToken: 'rt-1',
    expiresAt: new Date('2030-01-01'),
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    googleAccountEmail: 'user@example.com',
    googleAccountId: 'gid-1',
  };
}

function defaultTenant(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    status: 'configured',
    oauth: {
      clientId: 'cid',
      clientSecret: 'csec',
      redirectUri: 'http://stored/redirect',
    },
    pubsubTopic: 'projects/p/topics/t',
    ...overrides,
  };
}

describe('GET /api/portal/integrations/google/callback — state validation', () => {
  it('returns 400 when state param is missing', async () => {
    const res = await googleGET(
      makeCallback({ code: 'c' }) as unknown as Parameters<typeof googleGET>[0],
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_state');
  });

  it('returns 400 when verifyState throws StateInvalidError', async () => {
    verifyStateMock.mockImplementationOnce(() => {
      throw new TestStateInvalidError('expired');
    });
    const res = await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid_state');
    expect(body.reason).toBe('expired');
  });

  it('rethrows non-StateInvalidError from verifyState', async () => {
    verifyStateMock.mockImplementationOnce(() => {
      throw new Error('unexpected crash');
    });
    await expect(
      googleGET(
        makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
          typeof googleGET
        >[0],
      ),
    ).rejects.toThrow(/unexpected crash/);
  });
});

describe('GET /google/callback — session binding', () => {
  it('returns 403 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    verifyStateMock.mockReturnValueOnce({
      clientId: 10,
      userId: 7,
      surfaces: ['gmail'],
    });
    const res = await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('session_mismatch');
  });

  it('returns 403 when session.user.id !== payload.userId', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '99' } });
    verifyStateMock.mockReturnValueOnce({
      clientId: 10,
      userId: 7,
      surfaces: ['gmail'],
    });
    const res = await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    expect(res.status).toBe(403);
  });
});

describe('GET /google/callback — google error + missing code', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    verifyStateMock.mockReturnValue({
      clientId: 10,
      userId: 7,
      surfaces: ['gmail'],
      returnTo: '/portal/integrations',
    });
  });

  it('redirects with workspace_error when Google passes ?error=', async () => {
    const res = await googleGET(
      makeCallback({
        state: 's',
        error: 'access_denied',
      }) as unknown as Parameters<typeof googleGET>[0],
    );
    expect(res.status).toBe(307);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/portal/integrations');
    expect(loc).toContain('workspace_error=access_denied');
  });

  it('redirects to /portal default when returnTo is not safe', async () => {
    verifyStateMock.mockReturnValueOnce({
      clientId: 10,
      userId: 7,
      surfaces: ['gmail'],
      returnTo: 'https://evil.example/x',
    });
    const res = await googleGET(
      makeCallback({
        state: 's',
        error: 'access_denied',
      }) as unknown as Parameters<typeof googleGET>[0],
    );
    expect(res.status).toBe(307);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/portal?workspace_error=');
  });

  it('returns 400 when code is missing (and no google error)', async () => {
    const res = await googleGET(
      makeCallback({ state: 's' }) as unknown as Parameters<typeof googleGET>[0],
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('missing_code');
  });

  it('rejects protocol-relative returnTo via sanitizer', async () => {
    verifyStateMock.mockReturnValueOnce({
      clientId: 10,
      userId: 7,
      surfaces: ['gmail'],
      returnTo: '//evil.example/path',
    });
    const res = await googleGET(
      makeCallback({
        state: 's',
        error: 'denied',
      }) as unknown as Parameters<typeof googleGET>[0],
    );
    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/portal?workspace_error=denied');
  });
});

describe('GET /google/callback — tenant + token exchange', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    verifyStateMock.mockReturnValue({
      clientId: 10,
      userId: 7,
      surfaces: ['gmail'],
    });
  });

  it('returns 409 when tenant credentials are not provisioned', async () => {
    getTenantCredsMock.mockResolvedValueOnce(null);
    const res = await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('workspace_not_provisioned');
  });

  it('returns 409 when tenant is revoked', async () => {
    getTenantCredsMock.mockResolvedValueOnce(defaultTenant({ status: 'revoked' }));
    const res = await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('workspace_revoked');
  });

  it('returns 502 when token exchange throws', async () => {
    getTenantCredsMock.mockResolvedValueOnce(defaultTenant());
    exchangeCodeMock.mockRejectedValueOnce(new Error('google_offline'));
    const res = await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('token_exchange_failed');
    expect(body.message).toBe('google_offline');
  });
});

describe('GET /google/callback — happy path', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    verifyStateMock.mockReturnValue({
      clientId: 10,
      userId: 7,
      surfaces: ['gmail'],
      returnTo: '/portal/integrations',
    });
    getTenantCredsMock.mockResolvedValue(defaultTenant());
    exchangeCodeMock.mockResolvedValue(defaultExchange());
    startGmailWatchMock.mockResolvedValue({
      historyId: 'hist-42',
      expiration: new Date('2031-01-01'),
    });
  });

  it('overrides redirectUri with the request origin before calling exchangeCode', async () => {
    await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    expect(exchangeCodeMock).toHaveBeenCalledTimes(1);
    const [code, creds] = exchangeCodeMock.mock.calls[0] as [
      string,
      { redirectUri: string; clientId: string },
    ];
    expect(code).toBe('c');
    expect(creds.redirectUri).toBe(
      'http://example.com/api/portal/integrations/google/callback',
    );
    expect(creds.clientId).toBe('cid');
  });

  it('starts Gmail watch when scopes include gmail and stores history id', async () => {
    const res = await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    expect(res.status).toBe(307);
    expect(startGmailWatchMock).toHaveBeenCalledTimes(1);
    expect(lastInsert?.table).toBe('googleWorkspaceUserConnections');
    const v = lastInsert?.values[0] ?? {};
    expect(v.gmailHistoryId).toBe('hist-42');
    expect(v.gmailWatchExpiration).toBeInstanceOf(Date);
    expect(v.clientId).toBe(10);
    expect(v.userId).toBe(7);

    // onConflictDoUpdate ran with target on (clientId,userId) and overwrote watch fields
    expect(lastConflictUpdate).not.toBeNull();
    const setObj = lastConflictUpdate?.set ?? {};
    expect(setObj.gmailHistoryId).toBe('hist-42');
    expect(setObj.revokedAt).toBeNull();
  });

  it('redirects to safeReturnTo with workspace_connected=1', async () => {
    const res = await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    expect(res.status).toBe(307);
    const loc = res.headers.get('location') ?? '';
    expect(loc).toBe(
      'http://example.com/portal/integrations?workspace_connected=1',
    );
  });

  it('redirects to /portal when no returnTo on state', async () => {
    verifyStateMock.mockReturnValueOnce({
      clientId: 10,
      userId: 7,
      surfaces: ['gmail'],
    });
    const res = await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    const loc = res.headers.get('location') ?? '';
    expect(loc).toBe('http://example.com/portal?workspace_connected=1');
  });

  it('swallows gmail watch failures (best-effort) and still upserts the row', async () => {
    startGmailWatchMock.mockRejectedValueOnce(new Error('pubsub_unreachable'));
    const res = await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    expect(res.status).toBe(307);
    expect(lastInsert?.table).toBe('googleWorkspaceUserConnections');
    const v = lastInsert?.values[0] ?? {};
    expect(v.gmailHistoryId).toBeNull();
    expect(v.gmailWatchExpiration).toBeNull();
    // The conflict-update branch should NOT overwrite watch fields when watch failed.
    const setObj = lastConflictUpdate?.set ?? {};
    expect(setObj.gmailHistoryId).toBeUndefined();
    expect(setObj.gmailWatchExpiration).toBeUndefined();
  });

  it('skips Gmail watch entirely when scopes do not include gmail', async () => {
    exchangeCodeMock.mockResolvedValueOnce({
      ...defaultExchange(),
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    });
    const res = await googleGET(
      makeCallback({ state: 's', code: 'c' }) as unknown as Parameters<
        typeof googleGET
      >[0],
    );
    expect(res.status).toBe(307);
    expect(startGmailWatchMock).not.toHaveBeenCalled();
  });
});
