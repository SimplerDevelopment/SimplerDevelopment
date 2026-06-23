// @vitest-environment node
/**
 * Batch 32c — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/settings/team/[memberId]/route.ts                          (DELETE)
 *  - app/api/portal/settings/webhooks/[source]/[id]/deliveries/route.ts        (GET)
 *  - app/api/portal/settings/webhooks/[source]/[id]/rotate/route.ts            (POST)
 *  - app/api/portal/sites/[siteId]/export/route.ts                             (POST)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy). db.insert/update/delete are mocked to capture writes
 * and emit the next queued return rows where applicable.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

const generateWebhookSecretMock = vi.fn();
vi.mock('@/lib/pm-webhooks', () => ({
  generateWebhookSecret: (...args: unknown[]) => generateWebhookSecretMock(...args),
}));

const exportSiteMock = vi.fn();
vi.mock('@/lib/snapshots/export', () => ({
  exportSite: (...args: unknown[]) => exportSiteMock(...args),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', s }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// schema — proxy tables
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          if (prop === 'then') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    clients: wrap('clients'),
    clientMembers: wrap('clientMembers'),
    projects: wrap('projects'),
    projectWebhooks: wrap('projectWebhooks'),
    projectWebhookDeliveries: wrap('projectWebhookDeliveries'),
    surveys: wrap('surveys'),
    surveyWebhooks: wrap('surveyWebhooks'),
    siteSnapshots: wrap('siteSnapshots'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}
interface DeleteCall {
  table: string;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;

    const materialize = () => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'groupBy',
      'limit',
      'offset',
    ]) {
      chain[m] = passthrough;
    }
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
            updateCalls.push({ table: table.__table, patch, filter });
            return Promise.resolve(undefined);
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
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
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

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const teamMemberRoute = await import(
  '@/app/api/portal/settings/team/[memberId]/route'
);
const deliveriesRoute = await import(
  '@/app/api/portal/settings/webhooks/[source]/[id]/deliveries/route'
);
const rotateRoute = await import(
  '@/app/api/portal/settings/webhooks/[source]/[id]/rotate/route'
);
const exportRoute = await import(
  '@/app/api/portal/sites/[siteId]/export/route'
);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const SESSION = { user: { id: '7' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  resolveClientSiteMock.mockReset();
  generateWebhookSecretMock.mockReset();
  exportSiteMock.mockReset();
});

// ===========================================================================
// DELETE /api/portal/settings/team/[memberId]
// ===========================================================================

describe('DELETE /api/portal/settings/team/[memberId]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await teamMemberRoute.DELETE(
      makeReq('http://x/api/portal/settings/team/3', { method: 'DELETE' }),
      { params: Promise.resolve({ memberId: '3' }) },
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await teamMemberRoute.DELETE(
      makeReq('http://x/api/portal/settings/team/3', { method: 'DELETE' }),
      { params: Promise.resolve({ memberId: '3' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 403 when caller is not owner and has no owner client_member row', async () => {
    authMock.mockResolvedValue(SESSION);
    // client.userId !== userId (10 vs 7)
    getPortalClientMock.mockResolvedValue({ id: 5, userId: 10 });
    selectQueue.push([]); // ownerMember lookup empty
    const res = await teamMemberRoute.DELETE(
      makeReq('http://x/api/portal/settings/team/3', { method: 'DELETE' }),
      { params: Promise.resolve({ memberId: '3' }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).message).toMatch(/owner/);
  });

  it('returns 404 when target member is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    // caller IS the owner of the client
    getPortalClientMock.mockResolvedValue({ id: 5, userId: 7 });
    selectQueue.push([]); // member lookup empty
    const res = await teamMemberRoute.DELETE(
      makeReq('http://x/api/portal/settings/team/3', { method: 'DELETE' }),
      { params: Promise.resolve({ memberId: '3' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Member not found');
  });

  it('returns 400 when caller tries to remove themselves', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5, userId: 7 });
    selectQueue.push([{ id: 3, clientId: 5, userId: 7 }]); // member is the caller
    const res = await teamMemberRoute.DELETE(
      makeReq('http://x/api/portal/settings/team/3', { method: 'DELETE' }),
      { params: Promise.resolve({ memberId: '3' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/yourself/);
  });

  it('owner removes a member (happy path)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5, userId: 7 });
    selectQueue.push([{ id: 3, clientId: 5, userId: 99 }]); // member belongs to another user
    const res = await teamMemberRoute.DELETE(
      makeReq('http://x/api/portal/settings/team/3', { method: 'DELETE' }),
      { params: Promise.resolve({ memberId: '3' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Member removed');
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('clientMembers');
  });

  it('non-owner caller WITH owner client_member row can remove a member', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5, userId: 10 }); // caller != client.userId
    selectQueue.push([{ id: 99, clientId: 5, userId: 7, role: 'owner' }]); // ownerMember row present
    selectQueue.push([{ id: 3, clientId: 5, userId: 88 }]); // target member
    const res = await teamMemberRoute.DELETE(
      makeReq('http://x/api/portal/settings/team/3', { method: 'DELETE' }),
      { params: Promise.resolve({ memberId: '3' }) },
    );
    expect(res.status).toBe(200);
    expect(deleteCalls).toHaveLength(1);
  });
});

// ===========================================================================
// GET /api/portal/settings/webhooks/[source]/[id]/deliveries
// ===========================================================================

describe('GET /api/portal/settings/webhooks/[source]/[id]/deliveries', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await deliveriesRoute.GET(
      makeReq('http://x/api/portal/settings/webhooks/project/1/deliveries'),
      { params: Promise.resolve({ source: 'project', id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await deliveriesRoute.GET(
      makeReq('http://x/api/portal/settings/webhooks/project/1/deliveries'),
      { params: Promise.resolve({ source: 'project', id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 on unknown source', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await deliveriesRoute.GET(
      makeReq('http://x/api/portal/settings/webhooks/banana/1/deliveries'),
      { params: Promise.resolve({ source: 'banana', id: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Unknown source');
  });

  it('returns 400 on non-numeric id', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await deliveriesRoute.GET(
      makeReq('http://x/api/portal/settings/webhooks/project/abc/deliveries'),
      { params: Promise.resolve({ source: 'project', id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid id');
  });

  it('project: returns 404 when webhook row not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // hook lookup empty
    const res = await deliveriesRoute.GET(
      makeReq('http://x/api/portal/settings/webhooks/project/1/deliveries'),
      { params: Promise.resolve({ source: 'project', id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('project: returns 404 when project does not belong to client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, projectId: 9 }]); // hook
    selectQueue.push([]); // project not owned by client
    const res = await deliveriesRoute.GET(
      makeReq('http://x/api/portal/settings/webhooks/project/1/deliveries'),
      { params: Promise.resolve({ source: 'project', id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('project: returns list of deliveries (happy path)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, projectId: 9 }]); // hook
    selectQueue.push([{ id: 9 }]); // project ownership confirmed
    const ts = new Date('2026-05-19T00:00:00Z');
    selectQueue.push([
      { id: 100, event: 'task.created', status: 200, error: null, createdAt: ts },
      { id: 101, event: 'task.updated', status: null, error: 'timeout', createdAt: ts },
    ]);
    const res = await deliveriesRoute.GET(
      makeReq('http://x/api/portal/settings/webhooks/project/1/deliveries'),
      { params: Promise.resolve({ source: 'project', id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe(100);
    expect(body.data[0].status).toBe(200);
    expect(body.data[0].error).toBeNull();
    expect(body.data[1].error).toBe('timeout');
    expect(body.data[1].status).toBeNull();
    expect(typeof body.data[0].createdAt).toBe('string');
  });

  it('survey: returns 404 when webhook not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // hook lookup empty
    const res = await deliveriesRoute.GET(
      makeReq('http://x/api/portal/settings/webhooks/survey/2/deliveries'),
      { params: Promise.resolve({ source: 'survey', id: '2' }) },
    );
    expect(res.status).toBe(404);
  });

  it('survey: returns 404 when survey does not belong to client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 2, surveyId: 22 }]); // hook
    selectQueue.push([]); // survey not owned by client
    const res = await deliveriesRoute.GET(
      makeReq('http://x/api/portal/settings/webhooks/survey/2/deliveries'),
      { params: Promise.resolve({ source: 'survey', id: '2' }) },
    );
    expect(res.status).toBe(404);
  });

  it('survey: returns empty data array (no delivery log table yet)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 2, surveyId: 22 }]);
    selectQueue.push([{ id: 22 }]); // survey ownership confirmed
    const res = await deliveriesRoute.GET(
      makeReq('http://x/api/portal/settings/webhooks/survey/2/deliveries'),
      { params: Promise.resolve({ source: 'survey', id: '2' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('site: returns empty data array (not implemented)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await deliveriesRoute.GET(
      makeReq('http://x/api/portal/settings/webhooks/site/3/deliveries'),
      { params: Promise.resolve({ source: 'site', id: '3' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/settings/webhooks/[source]/[id]/rotate
// ===========================================================================

describe('POST /api/portal/settings/webhooks/[source]/[id]/rotate', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await rotateRoute.POST(
      makeReq('http://x/api/portal/settings/webhooks/project/1/rotate', { method: 'POST' }),
      { params: Promise.resolve({ source: 'project', id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await rotateRoute.POST(
      makeReq('http://x/api/portal/settings/webhooks/project/1/rotate', { method: 'POST' }),
      { params: Promise.resolve({ source: 'project', id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 on unknown source', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await rotateRoute.POST(
      makeReq('http://x/api/portal/settings/webhooks/banana/1/rotate', { method: 'POST' }),
      { params: Promise.resolve({ source: 'banana', id: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Unknown source');
  });

  it('returns 400 on non-numeric id', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await rotateRoute.POST(
      makeReq('http://x/api/portal/settings/webhooks/project/abc/rotate', { method: 'POST' }),
      { params: Promise.resolve({ source: 'project', id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid id');
  });

  it('project: returns 404 when webhook not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    generateWebhookSecretMock.mockReturnValue('whsec_aaaaXXXX');
    selectQueue.push([]); // hook not found
    const res = await rotateRoute.POST(
      makeReq('http://x/api/portal/settings/webhooks/project/1/rotate', { method: 'POST' }),
      { params: Promise.resolve({ source: 'project', id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('project: returns 404 when project not owned by client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    generateWebhookSecretMock.mockReturnValue('whsec_aaaaXXXX');
    selectQueue.push([{ id: 1, projectId: 9 }]); // hook found
    selectQueue.push([]); // project not owned
    const res = await rotateRoute.POST(
      makeReq('http://x/api/portal/settings/webhooks/project/1/rotate', { method: 'POST' }),
      { params: Promise.resolve({ source: 'project', id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('project: rotates secret and returns plaintext + last4', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    generateWebhookSecretMock.mockReturnValue('whsec_aaaaaaaaXYZW');
    selectQueue.push([{ id: 1, projectId: 9 }]);
    selectQueue.push([{ id: 9 }]); // project ownership
    const res = await rotateRoute.POST(
      makeReq('http://x/api/portal/settings/webhooks/project/1/rotate', { method: 'POST' }),
      { params: Promise.resolve({ source: 'project', id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.secret).toBe('whsec_aaaaaaaaXYZW');
    expect(body.data.secretLast4).toBe('XYZW');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('projectWebhooks');
    expect(updateCalls[0].patch.secret).toBe('whsec_aaaaaaaaXYZW');
  });

  it('survey: returns 404 when webhook not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    generateWebhookSecretMock.mockReturnValue('whsec_bbbbXXXX');
    selectQueue.push([]); // hook not found
    const res = await rotateRoute.POST(
      makeReq('http://x/api/portal/settings/webhooks/survey/2/rotate', { method: 'POST' }),
      { params: Promise.resolve({ source: 'survey', id: '2' }) },
    );
    expect(res.status).toBe(404);
  });

  it('survey: returns 404 when survey not owned by client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    generateWebhookSecretMock.mockReturnValue('whsec_bbbbXXXX');
    selectQueue.push([{ id: 2, surveyId: 22 }]); // hook found
    selectQueue.push([]); // survey not owned
    const res = await rotateRoute.POST(
      makeReq('http://x/api/portal/settings/webhooks/survey/2/rotate', { method: 'POST' }),
      { params: Promise.resolve({ source: 'survey', id: '2' }) },
    );
    expect(res.status).toBe(404);
  });

  it('survey: rotates secret and returns plaintext + last4', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    generateWebhookSecretMock.mockReturnValue('whsec_bbbbbbbbABCD');
    selectQueue.push([{ id: 2, surveyId: 22 }]);
    selectQueue.push([{ id: 22 }]);
    const res = await rotateRoute.POST(
      makeReq('http://x/api/portal/settings/webhooks/survey/2/rotate', { method: 'POST' }),
      { params: Promise.resolve({ source: 'survey', id: '2' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.secret).toBe('whsec_bbbbbbbbABCD');
    expect(body.data.secretLast4).toBe('ABCD');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('surveyWebhooks');
  });

  it('site: returns 501 (not implemented)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    generateWebhookSecretMock.mockReturnValue('whsec_cccc');
    const res = await rotateRoute.POST(
      makeReq('http://x/api/portal/settings/webhooks/site/3/rotate', { method: 'POST' }),
      { params: Promise.resolve({ source: 'site', id: '3' }) },
    );
    expect(res.status).toBe(501);
    expect((await res.json()).message).toMatch(/not implemented/i);
  });
});

// ===========================================================================
// POST /api/portal/sites/[siteId]/export
// ===========================================================================

describe('POST /api/portal/sites/[siteId]/export', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await exportRoute.POST(
      makeJsonReq('http://x/api/portal/sites/4/export', 'POST', {}),
      { params: Promise.resolve({ siteId: '4' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when site cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await exportRoute.POST(
      makeJsonReq('http://x/api/portal/sites/4/export', 'POST', {}),
      { params: Promise.resolve({ siteId: '4' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 500 when exportSite throws (with the error message)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 4, clientId: 5, name: 'My Site' });
    exportSiteMock.mockRejectedValue(new Error('boom'));
    const res = await exportRoute.POST(
      makeJsonReq('http://x/api/portal/sites/4/export', 'POST', {}),
      { params: Promise.resolve({ siteId: '4' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('boom');
  });

  it('returns 500 with default message when exportSite throws non-Error', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 4, clientId: 5, name: 'My Site' });
    exportSiteMock.mockRejectedValue('weird non-error throw');
    const res = await exportRoute.POST(
      makeJsonReq('http://x/api/portal/sites/4/export', 'POST', {}),
      { params: Promise.resolve({ siteId: '4' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Export failed');
  });

  it('inserts a snapshot with defaults and returns the new row', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 4, clientId: 5, name: 'My Site' });
    exportSiteMock.mockResolvedValue({ version: 1, blocks: [] });
    insertReturnQueue.push([
      { id: 50, name: 'My Site snapshot', sourceSiteId: 4, createdAt: '2026-05-19' },
    ]);
    const res = await exportRoute.POST(
      makeJsonReq('http://x/api/portal/sites/4/export', 'POST', {}),
      { params: Promise.resolve({ siteId: '4' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(50);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('siteSnapshots');
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.clientId).toBe(5);
    expect(v.name).toBe('My Site snapshot');
    expect(v.description).toBeNull();
    expect(v.sourceSiteId).toBe(4);
    expect(v.payload).toEqual({ version: 1, blocks: [] });
    expect(v.isPublic).toBe(false);
    expect(v.createdBy).toBe(7);
  });

  it('honors provided name, description, and isPublic', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 4, clientId: 5, name: 'My Site' });
    exportSiteMock.mockResolvedValue({ version: 1 });
    insertReturnQueue.push([{ id: 51, name: 'Custom Snap', sourceSiteId: 4, createdAt: 'd' }]);
    const res = await exportRoute.POST(
      makeJsonReq('http://x/api/portal/sites/4/export', 'POST', {
        name: '  Custom Snap  ',
        description: 'why we forked',
        isPublic: true,
      }),
      { params: Promise.resolve({ siteId: '4' }) },
    );
    expect(res.status).toBe(200);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.name).toBe('Custom Snap'); // trimmed
    expect(v.description).toBe('why we forked');
    expect(v.isPublic).toBe(true);
  });

  it('falls back to default name when name is whitespace-only', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 4, clientId: 5, name: 'My Site' });
    exportSiteMock.mockResolvedValue({});
    insertReturnQueue.push([{ id: 52 }]);
    const res = await exportRoute.POST(
      makeJsonReq('http://x/api/portal/sites/4/export', 'POST', { name: '   ' }),
      { params: Promise.resolve({ siteId: '4' }) },
    );
    expect(res.status).toBe(200);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.name).toBe('My Site snapshot');
  });

  it('survives a malformed JSON body (uses defaults)', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 4, clientId: 5, name: 'Site Z' });
    exportSiteMock.mockResolvedValue({});
    insertReturnQueue.push([{ id: 53 }]);
    const req = new Request('http://x/api/portal/sites/4/export', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    });
    const res = await exportRoute.POST(req, {
      params: Promise.resolve({ siteId: '4' }),
    });
    expect(res.status).toBe(200);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.name).toBe('Site Z snapshot');
    expect(v.description).toBeNull();
    expect(v.isPublic).toBe(false);
  });
});
