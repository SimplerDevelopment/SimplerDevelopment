// @vitest-environment node
/**
 * Batch 22b — unit tests for 4 small/medium portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/media/route.ts                  (GET)
 *  - app/api/portal/branding/audit/route.ts         (POST)
 *  - app/api/portal/api-keys/route.ts               (GET / POST / DELETE)
 *  - app/api/portal/notifications/preferences/route.ts (GET / PUT)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit). db.insert/update/delete are mocked to capture writes and emit
 * the next queued return rows.
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
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn((r: unknown) => Boolean(r && typeof r === 'object' && 'response' in (r as Record<string, unknown>)));
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) => isAuthErrorMock(r),
}));

const auditBrandingMock = vi.fn();
vi.mock('@/lib/branding/audit', () => ({
  auditBranding: (...args: unknown[]) => auditBrandingMock(...args),
}));

const messagingRowToContextMock = vi.fn();
vi.mock('@/lib/branding/block-defaults', () => ({
  messagingRowToContext: (...args: unknown[]) => messagingRowToContextMock(...args),
}));

const generatePortalApiKeyMock = vi.fn();
vi.mock('@/lib/mcp-auth', () => ({
  generatePortalApiKey: () => generatePortalApiKeyMock(),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  sql: Object.assign((..._args: unknown[]) => ({ op: 'sql' }), {
    raw: (s: string) => ({ op: 'raw', s }),
  }),
}));

// schema — proxy tables. We also re-export the NOTIFICATION_TYPES /
// NOTIFICATION_DELIVERIES constants since the preferences route reads them
// at module top-level.
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
  return {
    media: wrap('media'),
    brandingProfiles: wrap('brandingProfiles'),
    brandingMessaging: wrap('brandingMessaging'),
    portalApiKeys: wrap('portalApiKeys'),
    notificationPreferences: wrap('notificationPreferences'),
    NOTIFICATION_TYPES: [
      'mention',
      'deal_stage_changed',
      'deal_assigned',
    ] as const,
    NOTIFICATION_DELIVERIES: ['instant', 'digest_daily', 'off'] as const,
  };
});

// ---- db mock with select-queue + write capture --------------------------------

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
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy', 'limit', 'offset']) {
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
    const ctx: { values: Record<string, unknown> | Record<string, unknown>[] | null } = { values: null };
    const api = {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        ctx.values = v;
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        const onConflictRet = {
          returning(_proj?: unknown) {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
        return {
          returning(_proj?: unknown) {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          onConflictDoUpdate(_arg: unknown) {
            return onConflictRet;
          },
          onConflictDoNothing() {
            return Promise.resolve(undefined);
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
    return api;
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

const mediaRoute = await import('@/app/api/portal/media/route');
const brandingAuditRoute = await import('@/app/api/portal/branding/audit/route');
const apiKeysRoute = await import('@/app/api/portal/api-keys/route');
const notifPrefsRoute = await import('@/app/api/portal/notifications/preferences/route');

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

const SESSION = { user: { id: '7', role: 'admin' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  auditBrandingMock.mockReset().mockReturnValue({ issues: [], summary: 'ok' });
  messagingRowToContextMock.mockReset().mockReturnValue({});
  generatePortalApiKeyMock.mockReset().mockReturnValue({
    key: 'sk_live_FAKEFULL_abc',
    hash: 'h@$h',
    preview: 'sk_live_FAKE',
  });
});

// ===========================================================================
// GET /api/portal/media
// ===========================================================================

describe('GET /api/portal/media', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await mediaRoute.GET(new Request('http://x/api/portal/media'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await mediaRoute.GET(new Request('http://x/api/portal/media'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with rows + pagination + branding profiles (default query)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    // Order: branding profiles → media rows → count
    selectQueue.push([{ id: 1, name: 'Default' }]);
    selectQueue.push([{ id: 10, filename: 'a.png' }]);
    selectQueue.push([{ count: 1 }]);
    const res = await mediaRoute.GET(new Request('http://x/api/portal/media'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.brandingProfiles).toEqual([{ id: 1, name: 'Default' }]);
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 1 });
  });

  it('parses limit/offset/search/mimeType/brandingProfileId query params', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // profiles
    selectQueue.push([]); // rows
    selectQueue.push([{ count: 0 }]);
    const res = await mediaRoute.GET(
      new Request('http://x/api/portal/media?limit=5&offset=10&search=cat&mimeType=image&brandingProfileId=2'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ limit: 5, offset: 10, total: 0 });
  });

  it('handles brandingProfileId=unassigned (isNull branch)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([{ count: 0 }]);
    const res = await mediaRoute.GET(
      new Request('http://x/api/portal/media?brandingProfileId=unassigned'),
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// POST /api/portal/branding/audit
// ===========================================================================

describe('POST /api/portal/branding/audit', () => {
  function req(body: unknown): Request {
    return new Request('http://x/api/portal/branding/audit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await brandingAuditRoute.POST(req({ profileId: 1 }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await brandingAuditRoute.POST(req({ profileId: 1 }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when profileId is missing / NaN', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await brandingAuditRoute.POST(req({ profileId: 'not-a-number' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/profileId is required/);
  });

  it('returns 404 when profile not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // profile lookup empty
    const res = await brandingAuditRoute.POST(req({ profileId: 9 }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Profile not found');
  });

  it('returns 200 with report when profile-scoped messaging exists', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const profile = {
      id: 9,
      name: 'Brand A',
      primaryColor: '#fff',
      buttonStyle: { primaryBg: '#000' },
    };
    selectQueue.push([profile]); // profile lookup
    selectQueue.push([{ id: 1, brandingProfileId: 9 }]); // messaging scoped
    auditBrandingMock.mockReturnValueOnce({ issues: [{ id: 'x', severity: 'warn' }], summary: 'one issue' });
    const res = await brandingAuditRoute.POST(req({ profileId: 9 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.report.summary).toBe('one issue');
    expect(auditBrandingMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to default client messaging when no profile-scoped row exists', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 9, name: 'Brand B' }]); // profile
    selectQueue.push([]); // no scoped messaging
    selectQueue.push([{ id: 2, brandingProfileId: null }]); // default messaging
    const res = await brandingAuditRoute.POST(req({ profileId: 9 }));
    expect(res.status).toBe(200);
    expect(messagingRowToContextMock).toHaveBeenCalled();
  });

  it('returns 500 when downstream throws', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 9, name: 'X' }]); // profile
    selectQueue.push([{ id: 1 }]); // messaging
    auditBrandingMock.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const res = await brandingAuditRoute.POST(req({ profileId: 9 }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('boom');
  });
});

// ===========================================================================
// /api/portal/api-keys — GET / POST / DELETE
// ===========================================================================

describe('GET /api/portal/api-keys', () => {
  it('returns 401 without session', async () => {
    authMock.mockResolvedValue(null);
    const res = await apiKeysRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await apiKeysRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns 200 with the keys list', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, name: 'mcp', keyPreview: 'sk_live_xxx', active: true }]);
    const res = await apiKeysRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('mcp');
  });
});

describe('POST /api/portal/api-keys', () => {
  function makePostReq(body: unknown): Request {
    return new Request('http://x/api/portal/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns 401 without session', async () => {
    authMock.mockResolvedValue(null);
    const res = await apiKeysRoute.POST(makePostReq({ name: 'k' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await apiKeysRoute.POST(makePostReq({ name: 'k' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is empty', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await apiKeysRoute.POST(makePostReq({ name: '   ' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Name is required/);
  });

  it('creates a key and returns 201 with one-time `key` field', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    insertReturnQueue.push([
      {
        id: 99,
        name: 'mcp',
        keyPreview: 'sk_live_FAKE',
        scopes: ['*'],
        expiresAt: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const res = await apiKeysRoute.POST(
      makePostReq({ name: 'mcp', scopes: ['posts:write'], expiresAt: '2026-12-31T00:00:00Z', requireCmsApproval: true }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.key).toBe('sk_live_FAKEFULL_abc'); // raw key returned ONCE
    expect(body.data.keyPreview).toBe('sk_live_FAKE');
    expect(insertCalls).toHaveLength(1);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.clientId).toBe(33);
    expect(inserted.userId).toBe(7);
    expect(inserted.scopes).toEqual(['posts:write']);
    expect(inserted.requireCmsApproval).toBe(true);
    expect(inserted.expiresAt).toBeInstanceOf(Date);
  });

  it('falls back to default scope and ignores invalid expiresAt', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    insertReturnQueue.push([{ id: 100, name: 'plain', keyPreview: 'sk_live_FAKE', scopes: ['*'], expiresAt: null, createdAt: new Date() }]);
    const res = await apiKeysRoute.POST(makePostReq({ name: 'plain', expiresAt: 'not-a-date' }));
    expect(res.status).toBe(201);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.scopes).toEqual(['*']);
    expect(inserted.expiresAt).toBeNull();
    expect(inserted.requireCmsApproval).toBe(false);
  });
});

describe('DELETE /api/portal/api-keys', () => {
  it('returns 401 without session', async () => {
    authMock.mockResolvedValue(null);
    const res = await apiKeysRoute.DELETE(new Request('http://x/api/portal/api-keys?id=1', { method: 'DELETE' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await apiKeysRoute.DELETE(new Request('http://x/api/portal/api-keys?id=1', { method: 'DELETE' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when id is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await apiKeysRoute.DELETE(new Request('http://x/api/portal/api-keys', { method: 'DELETE' }));
    expect(res.status).toBe(400);
  });

  it('soft-deletes (active=false, revokedAt set) and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await apiKeysRoute.DELETE(new Request('http://x/api/portal/api-keys?id=44', { method: 'DELETE' }));
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('portalApiKeys');
    expect(updateCalls[0].patch.active).toBe(false);
    expect(updateCalls[0].patch.revokedAt).toBeInstanceOf(Date);
  });
});

// ===========================================================================
// /api/portal/notifications/preferences — GET / PUT
// ===========================================================================

describe('GET /api/portal/notifications/preferences', () => {
  it('returns the auth error response when authorize fails', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(JSON.stringify({ success: false }), { status: 401 }),
    });
    const res = await notifPrefsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns full type set with stored preferences merged in', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    // user has one stored row → mention=off; remaining types default to instant
    selectQueue.push([{ notificationType: 'mention', delivery: 'off' }]);
    const res = await notifPrefsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const items = body.data.items as Array<{ notificationType: string; delivery: string }>;
    expect(items).toHaveLength(3); // we mocked NOTIFICATION_TYPES with 3 entries
    const mention = items.find((i) => i.notificationType === 'mention');
    const dealAssigned = items.find((i) => i.notificationType === 'deal_assigned');
    expect(mention?.delivery).toBe('off');
    expect(dealAssigned?.delivery).toBe('instant'); // default
  });
});

describe('PUT /api/portal/notifications/preferences', () => {
  function putReq(body: unknown): Request {
    return new Request('http://x/api/portal/notifications/preferences', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('returns the auth error response when authorize fails', async () => {
    authorizePortalMock.mockResolvedValue({
      response: new Response(JSON.stringify({ success: false }), { status: 401 }),
    });
    const res = await notifPrefsRoute.PUT(putReq({ notificationType: 'mention', delivery: 'off' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 on invalid JSON body', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    const res = await notifPrefsRoute.PUT(putReq('not-json{{'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Invalid body/);
  });

  it('returns 400 on unknown notificationType', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    const res = await notifPrefsRoute.PUT(putReq({ notificationType: 'bogus_type', delivery: 'instant' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Unknown notificationType/);
  });

  it('returns 400 on unknown delivery', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    const res = await notifPrefsRoute.PUT(putReq({ notificationType: 'mention', delivery: 'whenever' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Unknown delivery/);
  });

  it('upserts the preference and echoes the row', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    insertReturnQueue.push([{ notificationType: 'mention', delivery: 'digest_daily' }]);
    const res = await notifPrefsRoute.PUT(putReq({ notificationType: 'mention', delivery: 'digest_daily' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ notificationType: 'mention', delivery: 'digest_daily' });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('notificationPreferences');
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.clientId).toBe(33);
    expect(v.userId).toBe(7);
    expect(v.notificationType).toBe('mention');
    expect(v.delivery).toBe('digest_daily');
  });

  it('falls back to the request payload when returning() is empty', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'admin' });
    // No insertReturnQueue push → returning() resolves to []
    const res = await notifPrefsRoute.PUT(putReq({ notificationType: 'mention', delivery: 'instant' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ notificationType: 'mention', delivery: 'instant' });
  });
});
