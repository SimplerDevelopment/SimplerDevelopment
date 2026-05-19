// @vitest-environment node
/**
 * Unit tests for FOUR unrelated route.ts files packed into one batch:
 *
 *  1. /api/tags                          (GET, POST)            — admin/editor gate, Zod validation
 *  2. /api/portal/crm/saved-views        (GET, POST)            — auth, client scoping, validation
 *  3. /api/portal/crm/dashboard          (GET)                  — parallel count aggregation
 *  4. /api/portal/brain/templates        (GET, POST)            — entitlement gate, dup-name handling
 *
 * Each route lives in its own describe block. Mocks isolate auth, db, drizzle
 * helpers, schema, lib modules. No network/DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// Shared module mocks
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
  return {
    tags: wrap('tags'),
    crmSavedViews: wrap('crmSavedViews'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
    crmActivities: wrap('crmActivities'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    __sql: true,
    strings: Array.from(strings),
    values,
  }),
}));

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// ---- db state ----

interface DbState {
  tags: Array<Record<string, unknown>>;
  crmSavedViews: Array<Record<string, unknown>>;
  crmContacts: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  crmActivities: Array<Record<string, unknown>>;
}
const dbState: DbState = {
  tags: [],
  crmSavedViews: [],
  crmContacts: [],
  crmCompanies: [],
  crmDeals: [],
  crmActivities: [],
};

let selectShouldThrow = false;
let insertShouldThrow = false;

function tableArr(name: string): Array<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (dbState as any)[name] ?? [];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitN: number | null = null;

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(n: number) {
        limitN = n;
        return chain;
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (selectShouldThrow) return Promise.reject(new Error('select boom'));
      if (!activeTable) return Promise.resolve([]);
      let rows = tableArr(activeTable).filter((r) => evalPredicate(filter, r));
      if (limitN != null) rows = rows.slice(0, limitN);

      if (projection) {
        // Check for count(*) projection
        const projected: Record<string, unknown> = {};
        for (const [outKey, ref] of Object.entries(projection)) {
          const r = ref as { __sql?: boolean; strings?: string[] } | undefined;
          if (r?.__sql) {
            const joined = (r.strings ?? []).join(' ').toLowerCase();
            if (joined.includes('count(')) {
              projected[outKey] = rows.length;
            } else if (joined.includes('sum(')) {
              const total = rows.reduce((acc, row) => acc + ((row.value as number) ?? 0), 0);
              projected[outKey] = total;
            } else {
              projected[outKey] = null;
            }
          } else {
            const colRef = r as { __col?: string; __table?: string } | undefined;
            if (colRef?.__col) projected[outKey] = rows.map((row) => row[colRef.__col!])[0] ?? null;
            else projected[outKey] = null;
          }
        }
        return Promise.resolve([projected]);
      }
      return Promise.resolve(rows.map((r) => ({ ...r })));
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(payload: Record<string, unknown>) {
        return {
          returning() {
            if (insertShouldThrow) return Promise.reject(new Error('insert boom'));
            const row = { id: Math.floor(Math.random() * 100000), ...payload };
            tableArr(table.__table).push(row);
            return Promise.resolve([row]);
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
    },
  };
});

// ---- brain modules ----

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

const listTemplatesMock = vi.fn();
const createTemplateMock = vi.fn();
class DuplicateTemplateNameErrorMock extends Error {
  constructor(message = 'dup') {
    super(message);
    this.name = 'DuplicateTemplateNameError';
  }
}
vi.mock('@/lib/brain/templates', () => ({
  listTemplates: (...args: unknown[]) => listTemplatesMock(...args),
  createTemplate: (...args: unknown[]) => createTemplateMock(...args),
  DuplicateTemplateNameError: DuplicateTemplateNameErrorMock,
}));

// ===========================================================================
// Imports under test
// ===========================================================================

const tagsRoute = await import('@/app/api/tags/route');
const savedViewsRoute = await import('@/app/api/portal/crm/saved-views/route');
const crmDashboardRoute = await import('@/app/api/portal/crm/dashboard/route');
const brainTemplatesRoute = await import('@/app/api/portal/brain/templates/route');

// ===========================================================================
// Helpers
// ===========================================================================

function makeJsonRequest(url: string, method: string, body?: unknown): Request {
  // We need NextRequest-like behavior for tags/saved-views (search params accessed via nextUrl).
  // Use a plain Request — Next's NextRequest accepts Request in route handlers via cast at runtime here.
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
}

// next/server's NextRequest wraps Request; the route uses req.nextUrl.searchParams.
// We construct a NextRequest explicitly where needed.
async function makeNextRequest(url: string, init?: RequestInit) {
  const { NextRequest } = await import('next/server');
  return new NextRequest(url, init);
}

beforeEach(() => {
  dbState.tags.length = 0;
  dbState.crmSavedViews.length = 0;
  dbState.crmContacts.length = 0;
  dbState.crmCompanies.length = 0;
  dbState.crmDeals.length = 0;
  dbState.crmActivities.length = 0;
  selectShouldThrow = false;
  insertShouldThrow = false;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  requireBrainEntitlementMock.mockReset();
  listTemplatesMock.mockReset();
  createTemplateMock.mockReset();
});

// ===========================================================================
// 1) /api/tags  (GET, POST)
// ===========================================================================

describe('GET /api/tags', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await tagsRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await tagsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 403 when user role is not admin/editor', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '1', role: 'viewer' } });
    const res = await tagsRoute.GET();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
  });

  it('returns 200 with tags list for admin', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '1', role: 'admin' } });
    dbState.tags.push({ id: 1, name: 'A', slug: 'a' });
    dbState.tags.push({ id: 2, name: 'B', slug: 'b' });
    const res = await tagsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('returns 200 with tags list for editor', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '1', role: 'editor' } });
    const res = await tagsRoute.GET();
    expect(res.status).toBe(200);
  });

  it('returns 500 when db throws', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '1', role: 'admin' } });
    selectShouldThrow = true;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await tagsRoute.GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to fetch tags');
    errSpy.mockRestore();
  });
});

describe('POST /api/tags', () => {
  it('returns 401 without session', async () => {
    authMock.mockResolvedValueOnce(null);
    const req = (await makeNextRequest('http://x/api/tags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'X', slug: 'x' }),
    })) as unknown as Parameters<typeof tagsRoute.POST>[0];
    const res = await tagsRoute.POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 for non-admin/editor', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '1', role: 'viewer' } });
    const req = (await makeNextRequest('http://x/api/tags', {
      method: 'POST',
      body: JSON.stringify({ name: 'X', slug: 'x' }),
    })) as unknown as Parameters<typeof tagsRoute.POST>[0];
    const res = await tagsRoute.POST(req);
    expect(res.status).toBe(403);
  });

  it('returns 400 on missing name (zod fail)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '1', role: 'admin' } });
    const req = (await makeNextRequest('http://x/api/tags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: 'x' }),
    })) as unknown as Parameters<typeof tagsRoute.POST>[0];
    const res = await tagsRoute.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('returns 201 on valid create', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '1', role: 'admin' } });
    const req = (await makeNextRequest('http://x/api/tags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New', slug: 'new' }),
    })) as unknown as Parameters<typeof tagsRoute.POST>[0];
    const res = await tagsRoute.POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('New');
    expect(body.data.slug).toBe('new');
  });

  it('returns 500 on insert error', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '1', role: 'admin' } });
    insertShouldThrow = true;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const req = (await makeNextRequest('http://x/api/tags', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New', slug: 'new' }),
    })) as unknown as Parameters<typeof tagsRoute.POST>[0];
    const res = await tagsRoute.POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to create tag');
    errSpy.mockRestore();
  });
});

// ===========================================================================
// 2) /api/portal/crm/saved-views  (GET, POST)
// ===========================================================================

describe('GET /api/portal/crm/saved-views', () => {
  it('returns 401 without session', async () => {
    authMock.mockResolvedValueOnce(null);
    const req = (await makeNextRequest(
      'http://x/api/portal/crm/saved-views',
    )) as unknown as Parameters<typeof savedViewsRoute.GET>[0];
    const res = await savedViewsRoute.GET(req);
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const req = (await makeNextRequest(
      'http://x/api/portal/crm/saved-views',
    )) as unknown as Parameters<typeof savedViewsRoute.GET>[0];
    const res = await savedViewsRoute.GET(req);
    expect(res.status).toBe(404);
  });

  it('returns 200 with all views for client when no entityType filter', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    dbState.crmSavedViews.push({ id: 1, clientId: 10, entityType: 'contact', name: 'A' });
    dbState.crmSavedViews.push({ id: 2, clientId: 10, entityType: 'deal', name: 'B' });
    dbState.crmSavedViews.push({ id: 3, clientId: 99, entityType: 'contact', name: 'Other' });
    const req = (await makeNextRequest(
      'http://x/api/portal/crm/saved-views',
    )) as unknown as Parameters<typeof savedViewsRoute.GET>[0];
    const res = await savedViewsRoute.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('filters by entityType when query param is present', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    dbState.crmSavedViews.push({ id: 1, clientId: 10, entityType: 'contact', name: 'A' });
    dbState.crmSavedViews.push({ id: 2, clientId: 10, entityType: 'deal', name: 'B' });
    const req = (await makeNextRequest(
      'http://x/api/portal/crm/saved-views?entityType=deal',
    )) as unknown as Parameters<typeof savedViewsRoute.GET>[0];
    const res = await savedViewsRoute.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].entityType).toBe('deal');
  });
});

describe('POST /api/portal/crm/saved-views', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 10 });
  });

  it('returns 401 without session', async () => {
    authMock.mockResolvedValueOnce(null);
    const req = makeJsonRequest('http://x', 'POST', { name: 'A', entityType: 'contact', filters: {} });
    const res = await savedViewsRoute.POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not found', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const req = makeJsonRequest('http://x', 'POST', { name: 'A', entityType: 'contact', filters: {} });
    const res = await savedViewsRoute.POST(req);
    expect(res.status).toBe(404);
  });

  it('returns 400 when name missing', async () => {
    const req = makeJsonRequest('http://x', 'POST', { entityType: 'contact', filters: {} });
    const res = await savedViewsRoute.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Name is required');
  });

  it('returns 400 when name is whitespace only', async () => {
    const req = makeJsonRequest('http://x', 'POST', { name: '   ', entityType: 'contact', filters: {} });
    const res = await savedViewsRoute.POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when entityType missing', async () => {
    const req = makeJsonRequest('http://x', 'POST', { name: 'A', filters: {} });
    const res = await savedViewsRoute.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Entity type is required');
  });

  it('returns 400 when filters missing or not an object', async () => {
    const req = makeJsonRequest('http://x', 'POST', { name: 'A', entityType: 'contact', filters: 'oops' });
    const res = await savedViewsRoute.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Filters object is required');
  });

  it('returns 201 with created view on success', async () => {
    const req = makeJsonRequest('http://x', 'POST', {
      name: '  My View  ',
      entityType: '  contact  ',
      filters: { stage: 'open' },
      isDefault: true,
      sortOrder: 5,
    });
    const res = await savedViewsRoute.POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('My View');
    expect(body.data.entityType).toBe('contact');
    expect(body.data.clientId).toBe(10);
    expect(body.data.isDefault).toBe(true);
    expect(body.data.sortOrder).toBe(5);
  });

  it('applies defaults for isDefault/sortOrder when omitted', async () => {
    const req = makeJsonRequest('http://x', 'POST', {
      name: 'A',
      entityType: 'contact',
      filters: {},
    });
    const res = await savedViewsRoute.POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.isDefault).toBe(false);
    expect(body.data.sortOrder).toBe(0);
  });
});

// ===========================================================================
// 3) /api/portal/crm/dashboard  (GET)
// ===========================================================================

describe('GET /api/portal/crm/dashboard', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await crmDashboardRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await crmDashboardRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await crmDashboardRoute.GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 200 with aggregated counts and recent activities', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    dbState.crmContacts.push({ id: 1, clientId: 10 });
    dbState.crmContacts.push({ id: 2, clientId: 10 });
    dbState.crmCompanies.push({ id: 1, clientId: 10 });
    dbState.crmDeals.push({ id: 1, clientId: 10, status: 'open', value: 100 });
    dbState.crmDeals.push({ id: 2, clientId: 10, status: 'open', value: 200 });
    dbState.crmDeals.push({ id: 3, clientId: 10, status: 'won', value: 500 });
    dbState.crmActivities.push({
      id: 1,
      clientId: 10,
      type: 'note',
      createdAt: new Date('2026-01-01'),
    });

    const res = await crmDashboardRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.totalContacts).toBe(2);
    expect(body.data.totalCompanies).toBe(1);
    expect(body.data.totalDeals).toBe(3);
    expect(body.data.openDealsValue).toBe(300);
    expect(body.data.wonDealsValue).toBe(500);
    expect(body.data.recentActivities).toHaveLength(1);
  });

  it('returns zeros + empty list when client has no CRM data', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    const res = await crmDashboardRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totalContacts).toBe(0);
    expect(body.data.totalCompanies).toBe(0);
    expect(body.data.totalDeals).toBe(0);
    expect(body.data.openDealsValue).toBe(0);
    expect(body.data.wonDealsValue).toBe(0);
    expect(body.data.recentActivities).toEqual([]);
  });

  it('excludes activities for other clients', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValueOnce({ id: 10 });
    dbState.crmActivities.push({ id: 1, clientId: 10, type: 'note', createdAt: new Date() });
    dbState.crmActivities.push({ id: 2, clientId: 999, type: 'note', createdAt: new Date() });
    const res = await crmDashboardRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.recentActivities).toHaveLength(1);
    expect(body.data.recentActivities[0].clientId).toBe(10);
  });
});

// ===========================================================================
// 4) /api/portal/brain/templates  (GET, POST)
// ===========================================================================

describe('GET /api/portal/brain/templates', () => {
  it('short-circuits when entitlement returns a response (denied)', async () => {
    const deniedResponse = new Response(JSON.stringify({ success: false }), { status: 403 });
    requireBrainEntitlementMock.mockResolvedValueOnce({ response: deniedResponse });
    const res = await brainTemplatesRoute.GET(new Request('http://x/api/portal/brain/templates'));
    expect(res).toBe(deniedResponse);
    expect(listTemplatesMock).not.toHaveBeenCalled();
  });

  it('returns 200 with items list — no filters', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    listTemplatesMock.mockResolvedValueOnce([{ id: 1, name: 'T1' }]);
    const res = await brainTemplatesRoute.GET(new Request('http://x/api/portal/brain/templates'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([{ id: 1, name: 'T1' }]);
    expect(listTemplatesMock).toHaveBeenCalledWith(10, { trigger: undefined, enabled: undefined });
  });

  it('passes through valid trigger param', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    listTemplatesMock.mockResolvedValueOnce([]);
    const res = await brainTemplatesRoute.GET(
      new Request('http://x/api/portal/brain/templates?trigger=meeting'),
    );
    expect(res.status).toBe(200);
    expect(listTemplatesMock).toHaveBeenCalledWith(10, { trigger: 'meeting', enabled: undefined });
  });

  it('rejects invalid trigger value (becomes undefined)', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    listTemplatesMock.mockResolvedValueOnce([]);
    await brainTemplatesRoute.GET(
      new Request('http://x/api/portal/brain/templates?trigger=bogus'),
    );
    expect(listTemplatesMock).toHaveBeenCalledWith(10, { trigger: undefined, enabled: undefined });
  });

  it('parses enabled=true', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    listTemplatesMock.mockResolvedValueOnce([]);
    await brainTemplatesRoute.GET(
      new Request('http://x/api/portal/brain/templates?enabled=true'),
    );
    expect(listTemplatesMock).toHaveBeenCalledWith(10, { trigger: undefined, enabled: true });
  });

  it('parses enabled=false', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    listTemplatesMock.mockResolvedValueOnce([]);
    await brainTemplatesRoute.GET(
      new Request('http://x/api/portal/brain/templates?enabled=false'),
    );
    expect(listTemplatesMock).toHaveBeenCalledWith(10, { trigger: undefined, enabled: false });
  });

  it('treats unknown enabled value as undefined', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    listTemplatesMock.mockResolvedValueOnce([]);
    await brainTemplatesRoute.GET(
      new Request('http://x/api/portal/brain/templates?enabled=maybe'),
    );
    expect(listTemplatesMock).toHaveBeenCalledWith(10, { trigger: undefined, enabled: undefined });
  });
});

describe('POST /api/portal/brain/templates', () => {
  it('short-circuits when entitlement returns a response', async () => {
    const deniedResponse = new Response(JSON.stringify({ success: false }), { status: 403 });
    requireBrainEntitlementMock.mockResolvedValueOnce({ response: deniedResponse });
    const res = await brainTemplatesRoute.POST(makeJsonRequest('http://x', 'POST', { name: 'T' }));
    expect(res).toBe(deniedResponse);
  });

  it('returns 400 when body is not an object', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '"a string"',
    });
    const res = await brainTemplatesRoute.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid body');
  });

  it('returns 400 when body parsing fails (invalid JSON)', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await brainTemplatesRoute.POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 when name missing', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    const res = await brainTemplatesRoute.POST(makeJsonRequest('http://x', 'POST', { body: 'hi' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/name is required/i);
  });

  it('returns 400 when name too long', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    const longName = 'x'.repeat(151);
    const res = await brainTemplatesRoute.POST(
      makeJsonRequest('http://x', 'POST', { name: longName, body: 'hi' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when body content missing', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    const res = await brainTemplatesRoute.POST(
      makeJsonRequest('http://x', 'POST', { name: 'T' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/body is required/i);
  });

  it('returns 200 with created template on success', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    createTemplateMock.mockResolvedValueOnce({ id: 99, name: 'T', body: 'hi' });
    const res = await brainTemplatesRoute.POST(
      makeJsonRequest('http://x', 'POST', {
        name: '  T  ',
        body: 'hi',
        trigger: 'daily',
        variables: ['foo', 42, 'bar'],
        defaultTags: ['x', 1, 'y'],
        enabled: false,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({ id: 99, name: 'T', body: 'hi' });
    expect(createTemplateMock).toHaveBeenCalledWith({
      clientId: 10,
      name: 'T',
      body: 'hi',
      trigger: 'daily',
      variables: ['foo', 'bar'],
      defaultTags: ['x', 'y'],
      enabled: false,
      createdBy: 7,
    });
  });

  it('defaults trigger to manual when not provided / invalid', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    createTemplateMock.mockResolvedValueOnce({ id: 1 });
    await brainTemplatesRoute.POST(
      makeJsonRequest('http://x', 'POST', {
        name: 'T',
        body: 'hi',
        trigger: 'bogus',
      }),
    );
    const call = createTemplateMock.mock.calls[0]?.[0] as { trigger?: string };
    expect(call.trigger).toBe('manual');
  });

  it('returns 409 when DuplicateTemplateNameError is thrown', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    createTemplateMock.mockRejectedValueOnce(new DuplicateTemplateNameErrorMock('dup'));
    const res = await brainTemplatesRoute.POST(
      makeJsonRequest('http://x', 'POST', { name: 'T', body: 'hi' }),
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toMatch(/already exists/i);
  });

  it('returns 500 on unexpected error', async () => {
    requireBrainEntitlementMock.mockResolvedValueOnce({ client: { id: 10 }, userId: 7 });
    createTemplateMock.mockRejectedValueOnce(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await brainTemplatesRoute.POST(
      makeJsonRequest('http://x', 'POST', { name: 'T', body: 'hi' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('boom');
    errSpy.mockRestore();
  });
});
