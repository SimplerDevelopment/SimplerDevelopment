// @vitest-environment node
/**
 * Unit tests for four portal branding API routes (batch 29b):
 *   - app/api/portal/branding/profiles/[profileId]/route.ts  (GET, PUT, DELETE)
 *   - app/api/portal/branding/profiles/route.ts               (GET, POST)
 *   - app/api/portal/branding/rewrite-field/route.ts          (POST)
 *   - app/api/portal/branding/route.ts                        (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks (declared before importing route modules)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const resolveClientApiKeyMock = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => resolveClientApiKeyMock(...args),
}));

const recordAiUsageMock = vi.fn();
vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: (...args: unknown[]) => recordAiUsageMock(...args),
}));

const checkAiPlanGateMock = vi.fn();
vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => checkAiPlanGateMock(...args),
}));

// LLM seam — block all network access
const completeMock = vi.fn();
vi.mock('@/lib/ai/llm', () => ({
  complete: (...args: unknown[]) => completeMock(...args),
  completeObject: vi.fn(),
  streamComplete: vi.fn(),
}));

// drizzle-orm — stub operators to plain objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables so `table.col` is inert
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    brandingProfiles: wrap('brandingProfiles'),
    clientWebsites: wrap('clientWebsites'),
    siteBranding: wrap('siteBranding'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---- db mock with select-queue + capture for writes ----

interface DeleteCall {
  table: string;
  filter: unknown;
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}
interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: DeleteCall[] = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

function shiftNextSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(shiftNextSelect());
      }
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = updateReturnQueue.shift() ?? [];
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: rows });
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
              },
            };
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        deleteCalls.push({ table: table.__table, filter });
        return Promise.resolve(undefined);
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        return {
          onConflictDoNothing() {
            return Promise.resolve(undefined);
          },
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---- modules under test (loaded AFTER mocks) ----

const profileIdRoute = await import('@/app/api/portal/branding/profiles/[profileId]/route');
const profilesRoute = await import('@/app/api/portal/branding/profiles/route');
const rewriteFieldRoute = await import('@/app/api/portal/branding/rewrite-field/route');
const brandingRoute = await import('@/app/api/portal/branding/route');

// ---- helpers ----

function makeProfileIdParams(profileId: string) {
  return { params: Promise.resolve({ profileId }) };
}

function makeJsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const STAFF_SESSION = { user: { id: '7', role: 'admin' } };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  insertReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  resolveClientApiKeyMock.mockReset();
  recordAiUsageMock.mockReset();
  checkAiPlanGateMock.mockReset();
  completeMock.mockReset();
});

// ===========================================================================
// app/api/portal/branding/profiles/[profileId]/route.ts
// ===========================================================================

describe('GET /api/portal/branding/profiles/[profileId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await profileIdRoute.GET(
      new Request('http://x/api/portal/branding/profiles/5') as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when the portal client is not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await profileIdRoute.GET(
      new Request('http://x/api/portal/branding/profiles/5') as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when the branding profile is not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // profile lookup
    const res = await profileIdRoute.GET(
      new Request('http://x/api/portal/branding/profiles/5') as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns the profile data on success', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33, name: 'My Profile' }]);
    const res = await profileIdRoute.GET(
      new Request('http://x/api/portal/branding/profiles/5') as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 5, name: 'My Profile' });
  });
});

describe('PUT /api/portal/branding/profiles/[profileId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await profileIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/branding/profiles/5', 'PUT', { name: 'X' }) as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the portal client is not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await profileIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/branding/profiles/5', 'PUT', { name: 'X' }) as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when the branding profile does not exist', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // profile lookup empty
    const res = await profileIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/branding/profiles/5', 'PUT', { name: 'X' }) as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('updates the profile without changing defaults when isDefault flag is unchanged', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33, name: 'Old', isDefault: false }]);
    updateReturnQueue.push([{ id: 5, name: 'NewName', isDefault: false }]);

    const res = await profileIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/branding/profiles/5', 'PUT', {
        name: '  NewName  ',
        primaryColor: '#abc',
        logoUrl: null, // explicitly null still applies (uses !== undefined)
      }) as never,
      makeProfileIdParams('5'),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('NewName');
    // Should have NOT unset other defaults (only one update call)
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].table).toBe('brandingProfiles');
    expect(updateCalls[0].patch).toMatchObject({
      name: 'NewName',
      primaryColor: '#abc',
      logoUrl: null,
    });
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('unsets other defaults when promoting this profile to default', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33, name: 'X', isDefault: false }]);
    // First update unsets others; second updates this profile
    updateReturnQueue.push([]); // unset-others update
    updateReturnQueue.push([{ id: 5, isDefault: true }]); // this update

    const res = await profileIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/branding/profiles/5', 'PUT', {
        isDefault: true,
      }) as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls.length).toBe(2);
    expect(updateCalls[0].patch).toMatchObject({ isDefault: false });
  });

  it('preserves existing values when fields are omitted from the body', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const existing = {
      id: 5,
      clientId: 33,
      name: 'OriginalName',
      isDefault: true,
      primaryColor: '#111',
      logoUrl: 'http://logo.png',
      logoText: 'Brand',
      darkMode: { foo: 'bar' },
    };
    selectQueue.push([existing]);
    updateReturnQueue.push([existing]);

    const res = await profileIdRoute.PUT(
      makeJsonRequest('http://x/api/portal/branding/profiles/5', 'PUT', {
        name: '', // empty/falsy => fallback to existing.name
      }) as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toMatchObject({
      name: 'OriginalName',
      primaryColor: '#111',
      logoUrl: 'http://logo.png',
      logoText: 'Brand',
      darkMode: { foo: 'bar' },
    });
  });
});

describe('DELETE /api/portal/branding/profiles/[profileId]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await profileIdRoute.DELETE(
      new Request('http://x/api/portal/branding/profiles/5', { method: 'DELETE' }) as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the portal client is not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await profileIdRoute.DELETE(
      new Request('http://x/api/portal/branding/profiles/5', { method: 'DELETE' }) as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the branding profile does not exist', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await profileIdRoute.DELETE(
      new Request('http://x/api/portal/branding/profiles/5', { method: 'DELETE' }) as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('deletes the profile when found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, clientId: 33 }]);
    const res = await profileIdRoute.DELETE(
      new Request('http://x/api/portal/branding/profiles/5', { method: 'DELETE' }) as never,
      makeProfileIdParams('5'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(deleteCalls.some((d) => d.table === 'brandingProfiles')).toBe(true);
  });
});

// ===========================================================================
// app/api/portal/branding/profiles/route.ts
// ===========================================================================

describe('GET /api/portal/branding/profiles', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await profilesRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when the portal client is not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await profilesRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the list of branding profiles', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      { id: 1, name: 'A', isDefault: true },
      { id: 2, name: 'B', isDefault: false },
    ]);
    const res = await profilesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('A');
  });
});

describe('POST /api/portal/branding/profiles', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await profilesRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/profiles', 'POST', { name: 'X' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the portal client is not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await profilesRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/profiles', 'POST', { name: 'X' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing or empty', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await profilesRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/profiles', 'POST', { name: '   ' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/name is required/i);
  });

  it('inserts a new profile with defaults applied', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    insertReturnQueue.push([{ id: 99, name: 'Brand', clientId: 33 }]);

    const res = await profilesRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/profiles', 'POST', {
        name: '  Brand  ',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 99, name: 'Brand' });

    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0].table).toBe('brandingProfiles');
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.name).toBe('Brand');
    expect(v.clientId).toBe(33);
    expect(v.isDefault).toBe(false);
    expect(v.primaryColor).toBe('#2563eb');
    expect(v.secondaryColor).toBe('#1e40af');
    expect(v.accentColor).toBe('#f59e0b');
    expect(v.backgroundColor).toBe('#ffffff');
    expect(v.textColor).toBe('#111827');
    expect(v.navTemplate).toBe('classic');
    expect(v.navPosition).toBe('top');
    expect(v.headingFont).toBeNull();
    expect(v.bodyFont).toBeNull();
    expect(v.logoUrl).toBeNull();
  });

  it('unsets existing defaults when creating a new default profile', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    updateReturnQueue.push([]); // unset other defaults
    insertReturnQueue.push([{ id: 99, name: 'Brand', isDefault: true }]);

    const res = await profilesRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/profiles', 'POST', {
        name: 'Brand',
        isDefault: true,
        primaryColor: '#aaaaaa',
        logoText: 'My Brand',
      }),
    );
    expect(res.status).toBe(201);
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].patch).toMatchObject({ isDefault: false });
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.isDefault).toBe(true);
    expect(v.primaryColor).toBe('#aaaaaa');
    expect(v.logoText).toBe('My Brand');
  });
});

// ===========================================================================
// app/api/portal/branding/rewrite-field/route.ts
// ===========================================================================

describe('POST /api/portal/branding/rewrite-field', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await rewriteFieldRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/rewrite-field', 'POST', {
        fieldName: 'tagline',
        prompt: 'Make it punchy',
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the portal client is not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await rewriteFieldRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/rewrite-field', 'POST', {
        fieldName: 'tagline',
        prompt: 'Make it punchy',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when fieldName is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await rewriteFieldRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/rewrite-field', 'POST', {
        prompt: 'Do something',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/field name and prompt are required/i);
  });

  it('returns 400 when prompt is empty/whitespace', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await rewriteFieldRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/rewrite-field', 'POST', {
        fieldName: 'tagline',
        prompt: '   ',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 402 when AI plan gate denies access', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({
      allowed: false,
      message: 'No AI on this plan',
      reason: 'plan_locked',
    });
    const res = await rewriteFieldRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/rewrite-field', 'POST', {
        fieldName: 'tagline',
        prompt: 'Make it punchy',
      }),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.message).toBe('No AI on this plan');
    expect(body.reason).toBe('plan_locked');
  });

  it('calls complete(), records usage, and returns the rewritten text', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    resolveClientApiKeyMock.mockResolvedValue({ key: 'sk-test', source: 'platform' });
    completeMock.mockResolvedValue({
      text: 'Punchy new tagline.',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });

    const res = await rewriteFieldRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/rewrite-field', 'POST', {
        fieldName: 'tagline',
        fieldLabel: 'Tagline',
        currentValue: 'Old tagline',
        prompt: 'Make it punchy',
        companyContext: 'B2B SaaS',
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toBe('Punchy new tagline.');

    expect(recordAiUsageMock).toHaveBeenCalledWith({
      clientId: 33,
      source: 'platform',
      tokens: 15,
    });
  });

  it('falls back gracefully when currentValue is empty and companyContext is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    resolveClientApiKeyMock.mockResolvedValue({ key: 'sk-test', source: 'client' });
    completeMock.mockResolvedValue({
      text: '  Trimmed text  ',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });

    const res = await rewriteFieldRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/rewrite-field', 'POST', {
        fieldName: 'tagline',
        prompt: 'Do it',
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toBe('Trimmed text');
  });

  it('returns 500 when complete() throws', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    resolveClientApiKeyMock.mockResolvedValue({ key: 'sk-test', source: 'platform' });
    completeMock.mockRejectedValue(new Error('anthropic down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await rewriteFieldRoute.POST(
      makeJsonRequest('http://x/api/portal/branding/rewrite-field', 'POST', {
        fieldName: 'tagline',
        prompt: 'Make it punchy',
      }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toMatch(/failed to rewrite/i);
  });
});

// ===========================================================================
// app/api/portal/branding/route.ts
// ===========================================================================

describe('GET /api/portal/branding', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await brandingRoute.GET();
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when the portal client is not found', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await brandingRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns the list of websites with branding fields', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        id: 1,
        name: 'Site A',
        domain: 'a.example',
        brandingProfileId: 7,
        brandingId: 100,
        primaryColor: '#abc',
        accentColor: '#def',
        logoUrl: 'http://logo',
        headingFont: 'Inter',
        bodyFont: 'Roboto',
      },
    ]);

    const res = await brandingRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 1,
      name: 'Site A',
      domain: 'a.example',
      brandingProfileId: 7,
      primaryColor: '#abc',
    });
  });

  it('returns an empty list when the client has no websites', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await brandingRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
