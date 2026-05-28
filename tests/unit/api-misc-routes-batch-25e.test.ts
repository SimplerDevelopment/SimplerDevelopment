// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 25e):
 *   - app/api/portal/crm/contacts/titles/route.ts                (GET)
 *   - app/api/portal/crm/notifications/mark-all-read/route.ts    (POST, GET)
 *   - app/api/portal/websites/[siteId]/google/status/route.ts    (GET)
 *   - app/api/portal/tools/booking/[id]/embed/route.ts           (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const headersMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  isNotNull: (a: unknown) => ({ op: 'isNotNull', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ op: 'raw', s }),
    },
  ),
}));

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
  return {
    crmContacts: wrap('crmContacts'),
    crmNotifications: wrap('crmNotifications'),
    clientWebsites: wrap('clientWebsites'),
    googleWebsiteTokens: wrap('googleWebsiteTokens'),
    bookingPages: wrap('bookingPages'),
  };
});

// ---------------------------------------------------------------------------
// DB mock — supports select / selectDistinct / update -> set chains
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateQueue: Array<Array<Record<string, unknown>>> = [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}
function shiftUpdate(): Array<Record<string, unknown>> {
  return updateQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftSelect());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        limit() {
          return {
            then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return materializedPromise!.then(onF, onR);
            },
          };
        },
      };
    };
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftUpdate());
      return materializedPromise;
    };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['set', 'where']) {
      chain[m] = passthrough;
    }
    chain.returning = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      selectDistinct() {
        return buildSelect();
      },
      update() {
        return buildUpdate();
      },
    },
  };
});

// ---- modules under test ----
const titlesRoute = await import('@/app/api/portal/crm/contacts/titles/route');
const markAllReadRoute = await import(
  '@/app/api/portal/crm/notifications/mark-all-read/route'
);
const googleStatusRoute = await import(
  '@/app/api/portal/websites/[siteId]/google/status/route'
);
const embedRoute = await import('@/app/api/portal/tools/booking/[id]/embed/route');

// ---- helpers ----
const SESSION = { user: { id: '7', name: 'Bob' } };

function makeReq(url: string): import('next/server').NextRequest {
  // The titles route uses `req.nextUrl.searchParams.get(...)`. We can stub
  // a minimal shape rather than constructing a full NextRequest.
  const u = new URL(url);
  return {
    nextUrl: u,
  } as unknown as import('next/server').NextRequest;
}

beforeEach(() => {
  selectQueue = [];
  updateQueue = [];
  authMock.mockReset();
  getPortalClientMock.mockReset();
  headersMock.mockReset();
});

// ===========================================================================
// portal/crm/contacts/titles
// ===========================================================================

describe('GET /api/portal/crm/contacts/titles', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await titlesRoute.GET(makeReq('http://x/api/portal/crm/contacts/titles'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/Unauthorized/);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await titlesRoute.GET(makeReq('http://x/api/portal/crm/contacts/titles'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Client not found/);
  });

  it('returns mapped non-empty title list', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([
      { title: 'CEO' },
      { title: 'CTO' },
      { title: null }, // filtered out
      { title: 'Designer' },
    ]);
    const res = await titlesRoute.GET(makeReq('http://x/api/portal/crm/contacts/titles'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(['CEO', 'CTO', 'Designer']);
  });

  it('honors companyId query param (numeric) without throwing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ title: 'Engineer' }]);
    const res = await titlesRoute.GET(
      makeReq('http://x/api/portal/crm/contacts/titles?companyId=10'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(['Engineer']);
  });

  it('ignores companyId when it parses to NaN', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ title: 'PM' }]);
    const res = await titlesRoute.GET(
      makeReq('http://x/api/portal/crm/contacts/titles?companyId=not-a-number'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(['PM']);
  });
});

// ===========================================================================
// portal/crm/notifications/mark-all-read
// ===========================================================================

describe('/api/portal/crm/notifications/mark-all-read', () => {
  describe('POST', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await markAllReadRoute.POST();
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
    });

    it('returns 404 when portal client missing', async () => {
      authMock.mockResolvedValue(SESSION);
      getPortalClientMock.mockResolvedValue(null);
      const res = await markAllReadRoute.POST();
      expect(res.status).toBe(404);
    });

    it('marks unread notifications as read and returns count', async () => {
      authMock.mockResolvedValue(SESSION);
      getPortalClientMock.mockResolvedValue({ id: 11 });
      updateQueue.push([{ id: 1 }, { id: 2 }, { id: 3 }]);
      const res = await markAllReadRoute.POST();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.updated).toBe(3);
    });

    it('returns 0 updated when nothing was unread', async () => {
      authMock.mockResolvedValue(SESSION);
      getPortalClientMock.mockResolvedValue({ id: 11 });
      updateQueue.push([]);
      const res = await markAllReadRoute.POST();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.updated).toBe(0);
    });
  });

  describe('GET', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await markAllReadRoute.GET();
      expect(res.status).toBe(401);
    });

    it('returns unread count from db row', async () => {
      authMock.mockResolvedValue(SESSION);
      getPortalClientMock.mockResolvedValue({ id: 11 });
      selectQueue.push([{ count: 5 }]);
      const res = await markAllReadRoute.GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.unreadCount).toBe(5);
    });

    it('falls back to 0 when no row is returned', async () => {
      authMock.mockResolvedValue(SESSION);
      getPortalClientMock.mockResolvedValue({ id: 11 });
      selectQueue.push([]);
      const res = await markAllReadRoute.GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.unreadCount).toBe(0);
    });
  });
});

// ===========================================================================
// portal/websites/[siteId]/google/status
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/google/status', () => {
  const makeParams = (siteId: string) => ({ params: Promise.resolve({ siteId }) });

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await googleStatusRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await googleStatusRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Client not found/);
  });

  it('returns 404 when the website does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // First select (clientWebsites) -> empty
    selectQueue.push([]);
    const res = await googleStatusRoute.GET(new Request('http://x'), makeParams('99'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Website not found/);
  });

  it('returns connected=false with null fields when no token exists', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 12, clientId: 5 }]); // site exists
    selectQueue.push([]); // no token
    const res = await googleStatusRoute.GET(new Request('http://x'), makeParams('12'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      connected: false,
      gscSiteUrl: null,
      gaPropertyId: null,
      gaMeasurementId: null,
    });
  });

  it('returns connected=true and token fields when present', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 12, clientId: 5 }]);
    selectQueue.push([
      {
        websiteId: 12,
        gscSiteUrl: 'sc-domain:example.com',
        gaPropertyId: 'properties/123',
        gaMeasurementId: 'G-ABC',
      },
    ]);
    const res = await googleStatusRoute.GET(new Request('http://x'), makeParams('12'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      connected: true,
      gscSiteUrl: 'sc-domain:example.com',
      gaPropertyId: 'properties/123',
      gaMeasurementId: 'G-ABC',
    });
  });

  it('falls back to null fields when token has undefined fields', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 12, clientId: 5 }]);
    selectQueue.push([{ websiteId: 12 }]);
    const res = await googleStatusRoute.GET(new Request('http://x'), makeParams('12'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.connected).toBe(true);
    expect(body.data.gscSiteUrl).toBeNull();
    expect(body.data.gaPropertyId).toBeNull();
    expect(body.data.gaMeasurementId).toBeNull();
  });
});

// ===========================================================================
// portal/tools/booking/[id]/embed
// ===========================================================================

describe('GET /api/portal/tools/booking/[id]/embed', () => {
  const makeParams = (id: string) => ({ params: Promise.resolve({ id }) });
  const makeHeaders = (entries: Record<string, string | null>) => ({
    get: (k: string) => entries[k] ?? null,
  });

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await embedRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await embedRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Client not found/);
  });

  it('returns 404 when the booking page does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    selectQueue.push([]); // bookingPages empty
    const res = await embedRoute.GET(new Request('http://x'), makeParams('500'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Not found/);
  });

  it('returns iframe + script embed strings using forwarded host + protocol', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    selectQueue.push([{ id: 7, clientId: 9, slug: 'discovery' }]);
    headersMock.mockResolvedValue(
      makeHeaders({ host: 'app.example.com', 'x-forwarded-proto': 'https' }),
    );
    const res = await embedRoute.GET(new Request('http://x'), makeParams('7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.url).toBe('https://app.example.com/book/discovery');
    expect(body.data.iframe).toContain('https://app.example.com/book/discovery');
    expect(body.data.iframe).toContain('<iframe');
    expect(body.data.script).toContain('simpler-booking-discovery');
    expect(body.data.script).toContain('data-slug="discovery"');
  });

  it('falls back to localhost:3000 + https when headers are missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 9 });
    selectQueue.push([{ id: 1, clientId: 9, slug: 'demo' }]);
    headersMock.mockResolvedValue(makeHeaders({}));
    const res = await embedRoute.GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.url).toBe('https://localhost:3000/book/demo');
  });
});
