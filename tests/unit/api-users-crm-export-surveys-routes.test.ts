// @vitest-environment node
/**
 * Unit tests for THREE API routes (combined to maximize coverage in one shot):
 *
 *   1. app/api/users/[id]/route.ts                  (GET / PUT / DELETE)
 *      Admin/editor-only CRUD for a single user. Hashes password on update.
 *
 *   2. app/api/portal/crm/export/route.ts           (GET)
 *      CSV export for portal CRM contacts/companies/deals — auth + portal-client
 *      scoped. Composes search and status filters into the select chain.
 *
 *   3. app/api/surveys/[slug]/route.ts              (GET / POST / OPTIONS)
 *      Public survey fetch and response submit. Transaction wraps insert + count
 *      bump. Branding lookup + webhook dispatcher are fired post-write.
 *
 * Strategy: each describe block sets up its own db / auth mocks. The select()
 * chain is mocked with a queue-driven thenable so we can line up rows in the
 * order the route consumes them. Writes (insert/update/delete) are mocked to
 * capture payloads and return queued rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// shared mocks (top-level because vi.mock is hoisted)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const hashMock = vi.fn(async (s: string) => `hashed:${s}`);
vi.mock('bcryptjs', () => ({ hash: (s: string, r: number) => hashMock(s, r) }));

const emitEventMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

const getBrandingBySurveySlugMock = vi.fn();
const brandingToCssVarsMock = vi.fn();
vi.mock('@/lib/branding', () => ({
  getBrandingBySurveySlug: (...args: unknown[]) => getBrandingBySurveySlugMock(...args),
  brandingToCssVars: (...args: unknown[]) => brandingToCssVarsMock(...args),
}));

const dispatchSurveyResponseWebhooksMock = vi.fn(async () => undefined);
vi.mock('@/lib/survey-webhooks/dispatcher', () => ({
  dispatchSurveyResponseWebhooks: (...args: unknown[]) => dispatchSurveyResponseWebhooksMock(...args),
}));

const headersMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

// drizzle-orm — stub operators to plain objects (we don't introspect them)
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({ op: 'sql', strings, vals }),
    {
      raw: (s: string) => ({ op: 'sqlRaw', s }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables so `table.col` works and tables have a stable name
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) => {
    const handler: ProxyHandler<{ __table: string }> = {
      get(_t, prop: string) {
        if (prop === '__table') return tableName;
        if (prop === 'then') return undefined; // not thenable
        return { __col: prop, __table: tableName };
      },
    };
    return new Proxy({ __table: tableName }, handler);
  };
  return {
    users: wrap('users'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
    crmPipelineStages: wrap('crmPipelineStages'),
    surveys: wrap('surveys'),
    surveyResponses: wrap('surveyResponses'),
    surveyVariants: wrap('surveyVariants'),
  };
});

// ---- db mock with select-queue + capture for writes ----
interface DeleteCall {
  table: string;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
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
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: DeleteCall[] = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];
let transactionThrow: Error | null = null;

function shiftNextSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

function makeDbLike() {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;

    const materialize = () => {
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
            const settled = Promise.resolve(rows.map((r) => ({ ...r })));
            const ret = {
              returning() {
                return settled;
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return settled.then(onF, onR);
              },
            };
            return ret;
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        const rows = deleteReturnQueue.shift() ?? [];
        deleteCalls.push({ table: table.__table, filter, returnedRows: rows });
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        const rows = insertReturnQueue.shift() ?? [];
        insertCalls.push({ table: table.__table, values: v, returnedRows: rows });
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  return {
    select: () => buildSelect(),
    update: (table: { __table: string }) => buildUpdate(table),
    delete: (table: { __table: string }) => buildDelete(table),
    insert: (table: { __table: string }) => buildInsert(table),
  };
}

vi.mock('@/lib/db', () => {
  const base = makeDbLike();
  return {
    db: {
      ...base,
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        if (transactionThrow) throw transactionThrow;
        return fn(makeDbLike());
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Import routes (after mocks)
// ---------------------------------------------------------------------------

const usersIdRoute = await import('@/app/api/users/[id]/route');
const crmExportRoute = await import('@/app/api/portal/crm/export/route');
const surveysSlugRoute = await import('@/app/api/surveys/[slug]/route');

const ADMIN_SESSION = { user: { id: '7', role: 'admin' } };
const EDITOR_SESSION = { user: { id: '8', role: 'editor' } };
const CLIENT_SESSION = { user: { id: '12', role: 'client' } };

function makeParams<T>(p: T) {
  return { params: Promise.resolve(p) };
}

function makeJsonRequest(body: unknown, method = 'POST'): Request {
  return new Request('http://x/api/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeNextGet(qs = ''): NextRequest {
  const url = `http://x/api/portal/crm/export${qs ? '?' + qs : ''}`;
  return new NextRequest(url, { method: 'GET' });
}

function makeNextPut(body: unknown): NextRequest {
  return new NextRequest('http://x/api/users/1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeNextGetReq(): NextRequest {
  return new NextRequest('http://x/api/users/1', { method: 'GET' });
}

function makeNextDelete(): NextRequest {
  return new NextRequest('http://x/api/users/1', { method: 'DELETE' });
}

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  deleteReturnQueue = [];
  insertReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  transactionThrow = null;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  hashMock.mockClear();
  emitEventMock.mockReset();
  getBrandingBySurveySlugMock.mockReset();
  brandingToCssVarsMock.mockReset();
  dispatchSurveyResponseWebhooksMock.mockClear();
  headersMock.mockReset();

  headersMock.mockResolvedValue({
    get: (_k: string) => null,
  });
});

// ===========================================================================
// 1) /api/users/[id]
// ===========================================================================

describe('GET /api/users/[id]', () => {
  const { GET } = usersIdRoute;

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeNextGetReq(), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 403 when role is neither admin nor editor', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await GET(makeNextGetReq(), makeParams({ id: '1' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Forbidden' });
  });

  it('returns 400 when id is not numeric', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await GET(makeNextGetReq(), makeParams({ id: 'abc' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid user ID');
  });

  it('returns 404 when user is not found', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([]); // user lookup empty
    const res = await GET(makeNextGetReq(), makeParams({ id: '1' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('User not found');
  });

  it('returns the user for admin role', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const user = { id: 1, name: 'Alice', email: 'a@x.test', role: 'admin', active: true };
    selectQueue.push([user]);
    const res = await GET(makeNextGetReq(), makeParams({ id: '1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: user });
  });

  it('returns the user for editor role', async () => {
    authMock.mockResolvedValue(EDITOR_SESSION);
    selectQueue.push([{ id: 2, name: 'E', email: 'e@x.test', role: 'editor', active: true }]);
    const res = await GET(makeNextGetReq(), makeParams({ id: '2' }));
    expect(res.status).toBe(200);
  });

  it('returns 500 when the db throws', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    // No items in select queue means default empty []; force a throw by stubbing
    // the db at the schema layer is overkill — instead, simulate via params.
    // Override db.select to throw once.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Push a "tripwire" — by making params throw downstream of parseInt we can't,
    // so we hijack selectQueue with a getter that throws.
    const original = selectQueue.shift.bind(selectQueue);
    selectQueue.shift = (() => {
      selectQueue.shift = original;
      throw new Error('db boom');
    }) as typeof selectQueue.shift;
    const res = await GET(makeNextGetReq(), makeParams({ id: '1' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to fetch user');
    errSpy.mockRestore();
  });
});

describe('PUT /api/users/[id]', () => {
  const { PUT } = usersIdRoute;

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(makeNextPut({ name: 'New' }), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is wrong', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await PUT(makeNextPut({ name: 'New' }), makeParams({ id: '1' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when id is not numeric', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await PUT(makeNextPut({ name: 'New' }), makeParams({ id: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 with validation details on invalid body', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await PUT(
      makeNextPut({ email: 'not-an-email' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation failed');
    expect(Array.isArray(body.details)).toBe(true);
  });

  it('returns 404 when no row was updated', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturnQueue.push([]); // no rows
    const res = await PUT(
      makeNextPut({ name: 'New' }),
      makeParams({ id: '999' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('User not found');
  });

  it('updates user without password and returns the updated row', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturnQueue.push([
      { id: 1, name: 'New', email: 'a@x.test', role: 'admin', active: true },
    ]);
    const res = await PUT(
      makeNextPut({ name: 'New', role: 'admin', active: true }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('New');
    expect(hashMock).not.toHaveBeenCalled();
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch).not.toHaveProperty('password');
    expect(updateCalls[0].patch.name).toBe('New');
  });

  it('hashes the password when provided', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateReturnQueue.push([{ id: 1, name: 'A', email: 'a@x.test', role: 'admin', active: true }]);
    const res = await PUT(
      makeNextPut({ password: 'secret-pass' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    expect(hashMock).toHaveBeenCalledWith('secret-pass', 10);
    expect(updateCalls[0].patch.password).toBe('hashed:secret-pass');
  });

  it('returns 500 when json parsing throws', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Build a bad request whose body is not valid JSON
    const bad = new NextRequest('http://x/api/users/1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await PUT(bad, makeParams({ id: '1' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to update user');
    errSpy.mockRestore();
  });
});

describe('DELETE /api/users/[id]', () => {
  const { DELETE } = usersIdRoute;

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(makeNextDelete(), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when role is wrong', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await DELETE(makeNextDelete(), makeParams({ id: '1' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when id is not numeric', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const res = await DELETE(makeNextDelete(), makeParams({ id: 'abc' }));
    expect(res.status).toBe(400);
  });

  it('returns 404 when delete affects no rows', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    deleteReturnQueue.push([]);
    const res = await DELETE(makeNextDelete(), makeParams({ id: '999' }));
    expect(res.status).toBe(404);
  });

  it('deletes the user and returns success message', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    deleteReturnQueue.push([{ id: 1 }]);
    const res = await DELETE(makeNextDelete(), makeParams({ id: '1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, message: 'User deleted successfully' });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('users');
  });

  it('returns 500 when the db throws', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Make deleteReturnQueue.shift throw once
    const original = deleteReturnQueue.shift.bind(deleteReturnQueue);
    deleteReturnQueue.shift = (() => {
      deleteReturnQueue.shift = original;
      throw new Error('delete boom');
    }) as typeof deleteReturnQueue.shift;
    const res = await DELETE(makeNextDelete(), makeParams({ id: '1' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to delete user');
    errSpy.mockRestore();
  });
});

// ===========================================================================
// 2) /api/portal/crm/export
// ===========================================================================

describe('GET /api/portal/crm/export', () => {
  const { GET } = crmExportRoute;

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(makeNextGet('entityType=contact'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET(makeNextGet('entityType=contact'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 400 when entityType is missing', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 10 });
    const res = await GET(makeNextGet(''));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('entityType');
  });

  it('returns 400 when entityType is unknown', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 10 });
    const res = await GET(makeNextGet('entityType=bogus'));
    expect(res.status).toBe(400);
  });

  it('exports contacts CSV with headers and CSV-escaped fields', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([
      {
        firstName: 'Al, ice',
        lastName: 'Sm"ith',
        email: 'a@x.test',
        phone: '555-0001',
        title: 'CEO',
        companyName: 'Acme',
        status: 'new',
        source: 'web',
        score: 80,
        createdAt: '2026-01-01',
      },
      {
        firstName: 'Bob',
        lastName: null,
        email: 'b@x.test',
        phone: null,
        title: null,
        companyName: null,
        status: null,
        source: null,
        score: null,
        createdAt: null,
      },
    ]);
    const res = await GET(makeNextGet('entityType=contact&search=ali&status=new'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toContain('crm-contacts-');
    const csv = await res.text();
    const lines = csv.split('\n');
    expect(lines[0]).toBe(
      'firstName,lastName,email,phone,title,company,status,source,score,createdAt',
    );
    // First row: firstName has a comma → wrapped in quotes; lastName has a quote → escaped
    expect(lines[1]).toContain('"Al, ice"');
    expect(lines[1]).toContain('"Sm""ith"');
    // Second row's null fields render as empty
    expect(lines[2]).toBe('Bob,,b@x.test,,,,,,,');
  });

  it('exports contacts CSV without search/status filters', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([]);
    const res = await GET(makeNextGet('entityType=contact'));
    expect(res.status).toBe(200);
  });

  it('exports companies CSV with search filter applied', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([
      {
        name: 'Acme',
        domain: 'acme.test',
        industry: 'Tech',
        size: '10-50',
        phone: '555',
        website: 'https://acme.test',
        address: '1 Main St',
        createdAt: '2026-01-01',
      },
    ]);
    const res = await GET(makeNextGet('entityType=company&search=acme'));
    expect(res.status).toBe(200);
    const csv = await res.text();
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,domain,industry,size,phone,website,address,createdAt');
    expect(lines[1]).toContain('Acme');
    expect(res.headers.get('Content-Disposition')).toContain('crm-companys-');
  });

  it('exports companies CSV without search filter', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([]);
    const res = await GET(makeNextGet('entityType=company'));
    expect(res.status).toBe(200);
  });

  it('exports deals CSV with both search and status filters', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([
      {
        title: 'Big\ndeal',
        value: '1000',
        status: 'open',
        priority: 'high',
        stageName: 'Discovery',
        contactFirstName: 'Al',
        contactLastName: 'ice',
        companyName: 'Acme',
        expectedCloseDate: '2026-06-01',
        createdAt: '2026-01-01',
      },
      {
        title: 'Solo',
        value: null,
        status: null,
        priority: null,
        stageName: null,
        contactFirstName: null,
        contactLastName: null,
        companyName: null,
        expectedCloseDate: null,
        createdAt: null,
      },
    ]);
    const res = await GET(makeNextGet('entityType=deal&search=big&status=open'));
    expect(res.status).toBe(200);
    const csv = await res.text();
    // Header line is independent
    expect(csv.startsWith(
      'title,value,status,priority,stageName,contactName,companyName,expectedCloseDate,createdAt\n',
    )).toBe(true);
    // The embedded newline in "Big\ndeal" stays inside the CSV-quoted field
    expect(csv).toContain('"Big\ndeal"');
    expect(csv).toContain('Al ice');
    // Solo row's contactName collapses to empty string (both nulls filtered)
    expect(csv).toContain('\nSolo,,,,,,,,');
  });

  it('exports deals CSV without filters', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 10 });
    selectQueue.push([]);
    const res = await GET(makeNextGet('entityType=deal'));
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// 3) /api/surveys/[slug]
// ===========================================================================

describe('OPTIONS /api/surveys/[slug]', () => {
  it('returns 204 with CORS headers', async () => {
    const { OPTIONS } = surveysSlugRoute;
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});

describe('GET /api/surveys/[slug]', () => {
  const { GET } = surveysSlugRoute;

  it('returns 404 when survey is not found', async () => {
    selectQueue.push([]);
    const res = await GET(new Request('http://x'), makeParams({ slug: 'missing' }));
    expect(res.status).toBe(404);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const body = await res.json();
    expect(body.message).toBe('Survey not found');
  });

  it('returns 403 when survey is not active', async () => {
    selectQueue.push([{ id: 1, status: 'draft', closesAt: null, maxResponses: null, responseCount: 0 }]);
    const res = await GET(new Request('http://x'), makeParams({ slug: 's' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Survey is not active');
  });

  it('returns 403 when survey has closed (closesAt in the past)', async () => {
    selectQueue.push([
      { id: 1, status: 'active', closesAt: '2020-01-01', maxResponses: null, responseCount: 0 },
    ]);
    const res = await GET(new Request('http://x'), makeParams({ slug: 's' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Survey is closed');
  });

  it('returns 403 when survey has reached max responses', async () => {
    selectQueue.push([
      { id: 1, status: 'active', closesAt: null, maxResponses: 5, responseCount: 5 },
    ]);
    const res = await GET(new Request('http://x'), makeParams({ slug: 's' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Survey has reached maximum responses');
  });

  it('returns 200 with branding when available', async () => {
    selectQueue.push([
      {
        id: 1,
        title: 'T',
        description: 'd',
        fields: [],
        color: '#000',
        status: 'active',
        requireEmail: false,
        closesAt: null,
        maxResponses: null,
        responseCount: 0,
        thankYouTitle: 'thanks',
        thankYouMessage: 'msg',
        redirectUrl: null,
        styling: null,
        recommendation: null,
      },
    ]);
    getBrandingBySurveySlugMock.mockResolvedValue({
      primaryColor: '#111',
      secondaryColor: '#222',
      accentColor: '#333',
      backgroundColor: '#fff',
      textColor: '#000',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      logoUrl: 'https://x/logo.png',
      logoRectUrl: null,
      borderRadius: '8px',
      buttonStyle: 'rounded',
    });
    brandingToCssVarsMock.mockReturnValue({ '--primary': '#111' });
    const res = await GET(new Request('http://x'), makeParams({ slug: 's' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.branding.primaryColor).toBe('#111');
    expect(body.data.cssVars).toEqual({ '--primary': '#111' });
  });

  it('returns 200 with branding falling back to logoRectUrl when logoUrl is missing', async () => {
    selectQueue.push([
      {
        id: 1,
        title: 'T',
        description: null,
        fields: [],
        color: null,
        status: 'active',
        requireEmail: false,
        closesAt: null,
        maxResponses: null,
        responseCount: 0,
        thankYouTitle: null,
        thankYouMessage: null,
        redirectUrl: null,
        styling: null,
        recommendation: null,
      },
    ]);
    getBrandingBySurveySlugMock.mockResolvedValue({
      primaryColor: null,
      secondaryColor: null,
      accentColor: null,
      backgroundColor: null,
      textColor: null,
      headingFont: null,
      bodyFont: null,
      logoUrl: null,
      logoRectUrl: 'https://x/rect.png',
      borderRadius: null,
      buttonStyle: null,
    });
    brandingToCssVarsMock.mockReturnValue({});
    const res = await GET(new Request('http://x'), makeParams({ slug: 's' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.branding.logoUrl).toBe('https://x/rect.png');
  });

  it('returns 200 with branding=null when none is available', async () => {
    selectQueue.push([
      {
        id: 1,
        title: 'T',
        description: null,
        fields: [],
        color: null,
        status: 'active',
        requireEmail: false,
        closesAt: null,
        maxResponses: null,
        responseCount: 0,
        thankYouTitle: null,
        thankYouMessage: null,
        redirectUrl: null,
        styling: null,
        recommendation: null,
      },
    ]);
    getBrandingBySurveySlugMock.mockResolvedValue(null);
    const res = await GET(new Request('http://x'), makeParams({ slug: 's' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.branding).toBeNull();
    expect(body.data.cssVars).toBeUndefined();
  });
});

describe('POST /api/surveys/[slug]', () => {
  const { POST } = surveysSlugRoute;

  function makeBodyReq(body: unknown): Request {
    return new Request('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 404 when survey is not found', async () => {
    selectQueue.push([]);
    const res = await POST(makeBodyReq({ answers: {}, formName: 'f' }), makeParams({ slug: 'x' }));
    expect(res.status).toBe(404);
  });

  it('returns 403 when survey is not active', async () => {
    selectQueue.push([
      { id: 1, status: 'draft', closesAt: null, maxResponses: null, responseCount: 0, fields: [], requireEmail: false },
    ]);
    const res = await POST(makeBodyReq({ answers: {}, formName: 'f' }), makeParams({ slug: 's' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when survey is closed', async () => {
    selectQueue.push([
      { id: 1, status: 'active', closesAt: '2020-01-01', maxResponses: null, responseCount: 0, fields: [], requireEmail: false },
    ]);
    const res = await POST(makeBodyReq({ answers: {}, formName: 'f' }), makeParams({ slug: 's' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 when survey has hit max responses', async () => {
    selectQueue.push([
      { id: 1, status: 'active', closesAt: null, maxResponses: 1, responseCount: 1, fields: [], requireEmail: false },
    ]);
    const res = await POST(makeBodyReq({ answers: {}, formName: 'f' }), makeParams({ slug: 's' }));
    expect(res.status).toBe(403);
  });

  it('returns 400 when answers is missing', async () => {
    selectQueue.push([
      { id: 1, status: 'active', closesAt: null, maxResponses: null, responseCount: 0, fields: [], requireEmail: false },
    ]);
    const res = await POST(makeBodyReq({ formName: 'f' }), makeParams({ slug: 's' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Answers are required');
  });

  it('returns 400 when formName is missing', async () => {
    selectQueue.push([
      { id: 1, status: 'active', closesAt: null, maxResponses: null, responseCount: 0, fields: [], requireEmail: false },
    ]);
    const res = await POST(makeBodyReq({ answers: {} }), makeParams({ slug: 's' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('formName is required');
  });

  it('returns 400 when formName exceeds 100 characters', async () => {
    selectQueue.push([
      { id: 1, status: 'active', closesAt: null, maxResponses: null, responseCount: 0, fields: [], requireEmail: false },
    ]);
    const long = 'a'.repeat(101);
    const res = await POST(
      makeBodyReq({ answers: {}, formName: long }),
      makeParams({ slug: 's' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('100 characters');
  });

  it('returns 400 when requireEmail is true and email is missing', async () => {
    selectQueue.push([
      { id: 1, status: 'active', closesAt: null, maxResponses: null, responseCount: 0, fields: [], requireEmail: true },
    ]);
    const res = await POST(
      makeBodyReq({ answers: { q1: 'a' }, formName: 'f' }),
      makeParams({ slug: 's' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Email is required');
  });

  it('returns 400 when a required structured field is missing', async () => {
    selectQueue.push([
      {
        id: 1,
        status: 'active',
        closesAt: null,
        maxResponses: null,
        responseCount: 0,
        requireEmail: false,
        fields: [
          { id: 'q1', label: 'Name', type: 'text', required: true },
          { id: 'q2', label: 'Skip me', type: 'heading', required: true },
        ],
      },
    ]);
    const res = await POST(
      makeBodyReq({ answers: { q1: '' }, formName: 'f' }),
      makeParams({ slug: 's' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Name is required');
  });

  it('inserts response, bumps count, emits event, dispatches webhook, returns 201', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 99,
        slug: 's',
        status: 'active',
        closesAt: null,
        maxResponses: null,
        responseCount: 0,
        requireEmail: false,
        fields: [{ id: 'q1', label: 'Name', type: 'text', required: true }],
        title: 'My Survey',
        thankYouTitle: 'Thanks!',
        thankYouMessage: 'Done',
        redirectUrl: null,
      },
    ]);
    insertReturnQueue.push([
      {
        id: 555,
        surveyId: 1,
        formName: 'f',
        answers: { q1: 'Alice' },
        respondentEmail: 'a@x.test',
        respondentName: 'Alice',
        source: 'link',
        sourceId: null,
        ipAddress: '1.2.3.4',
        userAgent: 'ua',
        completedAt: new Date(),
      },
    ]);
    headersMock.mockResolvedValue({
      get: (k: string) => {
        if (k === 'x-forwarded-for') return '1.2.3.4, 5.6.7.8';
        if (k === 'user-agent') return 'ua';
        return null;
      },
    });

    const res = await POST(
      makeBodyReq({
        answers: { q1: 'Alice' },
        email: ' a@x.test ',
        name: ' Alice ',
        source: 'embed',
        sourceId: 'block-1',
        formName: ' f ',
      }),
      makeParams({ slug: 's' }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.thankYouTitle).toBe('Thanks!');

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('surveyResponses');
    expect(insertCalls[0].values).toMatchObject({
      surveyId: 1,
      formName: 'f',
      respondentEmail: 'a@x.test',
      respondentName: 'Alice',
      source: 'embed',
      sourceId: 'block-1',
      ipAddress: '1.2.3.4',
      userAgent: 'ua',
    });

    // Count bump update happened against the surveys table
    expect(updateCalls.some((c) => c.table === 'surveys')).toBe(true);

    expect(emitEventMock).toHaveBeenCalledWith(
      'survey.response_submitted',
      99,
      0,
      expect.objectContaining({ surveyId: 1, responseId: 555, formName: 'f' }),
    );

    // setImmediate-fired webhook dispatch
    await new Promise((r) => setImmediate(r));
    expect(dispatchSurveyResponseWebhooksMock).toHaveBeenCalledTimes(1);
    expect(dispatchSurveyResponseWebhooksMock.mock.calls[0][0]).toMatchObject({
      surveyTitle: 'My Survey',
      surveySlug: 's',
    });
  });

  it('falls back to x-real-ip when x-forwarded-for is absent and defaults source to "link"', async () => {
    selectQueue.push([
      {
        id: 2,
        clientId: 99,
        slug: 's2',
        status: 'active',
        closesAt: null,
        maxResponses: null,
        responseCount: 0,
        requireEmail: false,
        fields: null,
        title: 'T',
        thankYouTitle: null,
        thankYouMessage: null,
        redirectUrl: null,
      },
    ]);
    insertReturnQueue.push([
      { id: 1, surveyId: 2, formName: 'f', answers: {}, respondentEmail: null, respondentName: null, source: 'link', sourceId: null, ipAddress: '9.9.9.9', userAgent: null, completedAt: new Date() },
    ]);
    headersMock.mockResolvedValue({
      get: (k: string) => (k === 'x-real-ip' ? '9.9.9.9' : null),
    });

    const res = await POST(
      makeBodyReq({ answers: { x: 1 }, formName: 'f' }),
      makeParams({ slug: 's2' }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].values).toMatchObject({ ipAddress: '9.9.9.9', source: 'link' });
  });

  it('survives webhook dispatcher errors without breaking the response', async () => {
    selectQueue.push([
      {
        id: 3,
        clientId: 99,
        slug: 's3',
        status: 'active',
        closesAt: null,
        maxResponses: null,
        responseCount: 0,
        requireEmail: false,
        fields: [],
        title: 'T',
        thankYouTitle: null,
        thankYouMessage: null,
        redirectUrl: null,
      },
    ]);
    insertReturnQueue.push([
      { id: 1, surveyId: 3, formName: 'f', answers: {}, respondentEmail: null, respondentName: null, source: 'link', sourceId: null, ipAddress: null, userAgent: null, completedAt: new Date() },
    ]);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    dispatchSurveyResponseWebhooksMock.mockRejectedValueOnce(new Error('webhook boom'));

    const res = await POST(
      makeBodyReq({ answers: { x: 1 }, formName: 'f' }),
      makeParams({ slug: 's3' }),
    );
    expect(res.status).toBe(201);
    await new Promise((r) => setImmediate(r));
    // Allow the rejection to flush
    await new Promise((r) => setImmediate(r));
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
