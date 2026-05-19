// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 24b):
 *   - app/api/admin/email/domains/route.ts          (GET, POST)
 *   - app/api/admin/email/subscribers/route.ts      (POST, PUT, DELETE)
 *   - app/api/admin/portal/ai-credits/route.ts      (GET)
 *   - app/api/admin/portal/booking/route.ts         (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

// Email lib mock — resend + generateUnsubscribeToken
const resendDomainsListMock = vi.fn();
const resendDomainsCreateMock = vi.fn();
const generateUnsubscribeTokenMock = vi.fn(() => 'tok_FAKE');
vi.mock('@/lib/email', () => ({
  resend: {
    domains: {
      list: (...args: unknown[]) => resendDomainsListMock(...args),
      create: (...args: unknown[]) => resendDomainsCreateMock(...args),
    },
  },
  generateUnsubscribeToken: () => generateUnsubscribeTokenMock(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  count: () => ({ op: 'count' }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
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
    emailSubscribers: wrap('emailSubscribers'),
    aiCreditBalances: wrap('aiCreditBalances'),
    aiCreditLedger: wrap('aiCreditLedger'),
    aiCreditPackages: wrap('aiCreditPackages'),
    clients: wrap('clients'),
    users: wrap('users'),
    bookingPages: wrap('bookingPages'),
    bookings: wrap('bookings'),
  };
});

// ---------------------------------------------------------------------------
// DB mock: select queue + insert/update/delete with returning + onConflict*
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: unknown;
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
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
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

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        const cloned = () => rows.map((r) => ({ ...r }));
        const onConflictApi = {
          returning(_proj?: unknown) {
            return Promise.resolve(cloned());
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned()).then(onF, onR);
          },
        };
        return {
          returning(_proj?: unknown) {
            return Promise.resolve(cloned());
          },
          onConflictDoNothing() {
            return onConflictApi;
          },
          onConflictDoUpdate(_arg: unknown) {
            return onConflictApi;
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned()).then(onF, onR);
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

  return {
    db: {
      select() {
        return buildSelect();
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ---- modules under test ----
const emailDomainsRoute = await import('@/app/api/admin/email/domains/route');
const emailSubscribersRoute = await import('@/app/api/admin/email/subscribers/route');
const aiCreditsRoute = await import('@/app/api/admin/portal/ai-credits/route');
const adminBookingRoute = await import('@/app/api/admin/portal/booking/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const ADMIN_SESSION = { user: { id: '1', name: 'Admin', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '2', name: 'Emp', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '3', name: 'Cli', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  resendDomainsListMock.mockReset();
  resendDomainsCreateMock.mockReset();
  generateUnsubscribeTokenMock.mockClear();
  generateUnsubscribeTokenMock.mockReturnValue('tok_FAKE');
});

// =====================================================================
// /api/admin/email/domains
// =====================================================================
describe('GET /api/admin/email/domains', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await emailDomainsRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 when non-admin', async () => {
    authMock.mockResolvedValueOnce(EMPLOYEE_SESSION);
    const res = await emailDomainsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 500 when resend returns an error', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    resendDomainsListMock.mockResolvedValueOnce({ data: null, error: { message: 'oops' } });
    const res = await emailDomainsRoute.GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('oops');
  });

  it('returns 200 with domain list when authorized', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    resendDomainsListMock.mockResolvedValueOnce({
      data: { data: [{ id: 'd1', name: 'example.com' }] },
      error: null,
    });
    const res = await emailDomainsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: 'd1', name: 'example.com' }]);
  });

  it('returns empty array when resend returns null data list', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    resendDomainsListMock.mockResolvedValueOnce({ data: null, error: null });
    const res = await emailDomainsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe('POST /api/admin/email/domains', () => {
  it('returns 401 when not admin', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await emailDomainsRoute.POST(
      makeReq('http://x/api/admin/email/domains', {
        method: 'POST',
        body: JSON.stringify({ name: 'example.com' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing or empty', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    const res = await emailDomainsRoute.POST(
      makeReq('http://x/api/admin/email/domains', {
        method: 'POST',
        body: JSON.stringify({ name: '   ' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/required/i);
  });

  it('lowercases and trims domain on create and returns 201', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    resendDomainsCreateMock.mockResolvedValueOnce({
      data: { id: 'd99', name: 'example.com' },
      error: null,
    });
    const res = await emailDomainsRoute.POST(
      makeReq('http://x/api/admin/email/domains', {
        method: 'POST',
        body: JSON.stringify({ name: '  EXAMPLE.com ' }),
      }),
    );
    expect(res.status).toBe(201);
    expect(resendDomainsCreateMock).toHaveBeenCalledWith({ name: 'example.com' });
    const body = await res.json();
    expect(body.data.id).toBe('d99');
  });

  it('returns 500 when resend create errors', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    resendDomainsCreateMock.mockResolvedValueOnce({ data: null, error: { message: 'dup' } });
    const res = await emailDomainsRoute.POST(
      makeReq('http://x/api/admin/email/domains', {
        method: 'POST',
        body: JSON.stringify({ name: 'dup.com' }),
      }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('dup');
  });
});

// =====================================================================
// /api/admin/email/subscribers
// =====================================================================
describe('POST /api/admin/email/subscribers', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await emailSubscribersRoute.POST(
      makeReq('http://x/api/admin/email/subscribers', {
        method: 'POST',
        body: JSON.stringify({ listId: 1, email: 'a@b.co' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await emailSubscribersRoute.POST(
      makeReq('http://x/api/admin/email/subscribers', {
        method: 'POST',
        body: JSON.stringify({ listId: 1, email: 'a@b.co' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when listId or email missing', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    const res = await emailSubscribersRoute.POST(
      makeReq('http://x/api/admin/email/subscribers', {
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.co' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 409 when email already subscribed in this list', async () => {
    authMock.mockResolvedValueOnce(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 42 }]); // duplicate found
    const res = await emailSubscribersRoute.POST(
      makeReq('http://x/api/admin/email/subscribers', {
        method: 'POST',
        body: JSON.stringify({ listId: '7', email: 'A@B.co' }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it('inserts and returns 201 on success, lowercasing and trimming email', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    selectQueue.push([]); // no duplicate
    insertReturnQueue.push([{ id: 5, listId: 7, email: 'a@b.co', name: 'Anna' }]);
    const res = await emailSubscribersRoute.POST(
      makeReq('http://x/api/admin/email/subscribers', {
        method: 'POST',
        body: JSON.stringify({ listId: '7', email: '  A@B.co ', name: ' Anna ' }),
      }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('emailSubscribers');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.email).toBe('a@b.co');
    expect(inserted.name).toBe('Anna');
    expect(inserted.listId).toBe(7);
    expect(inserted.unsubscribeToken).toBe('tok_FAKE');
    const body = await res.json();
    expect(body.data.id).toBe(5);
  });
});

describe('PUT /api/admin/email/subscribers (bulk import)', () => {
  it('returns 401 when unauthorized', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await emailSubscribersRoute.PUT(
      makeReq('http://x/api/admin/email/subscribers', {
        method: 'PUT',
        body: JSON.stringify({ listId: 1, subscribers: [{ email: 'a@b.co' }] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when listId or subscribers missing/empty', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    const res = await emailSubscribersRoute.PUT(
      makeReq('http://x/api/admin/email/subscribers', {
        method: 'PUT',
        body: JSON.stringify({ listId: 1, subscribers: [] }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('imports valid emails only, skipping invalid ones via filter', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    // Two rows queued as inserted-after-onConflictDoNothing
    insertReturnQueue.push([
      { id: 1, listId: 5, email: 'a@b.co' },
      { id: 2, listId: 5, email: 'c@d.co' },
    ]);
    const res = await emailSubscribersRoute.PUT(
      makeReq('http://x/api/admin/email/subscribers', {
        method: 'PUT',
        body: JSON.stringify({
          listId: 5,
          subscribers: [
            { email: 'A@B.co', name: ' Anna ' },
            { email: 'not-an-email' }, // filtered out
            { email: 'c@d.co' },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(2);
    expect(body.data.total).toBe(2); // invalid filtered out before insert
    expect(insertCalls).toHaveLength(1);
    const rows = insertCalls[0].values as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0].email).toBe('a@b.co');
    expect(rows[0].name).toBe('Anna');
    expect(rows[1].email).toBe('c@d.co');
    expect(rows[1].name).toBeNull();
  });
});

describe('DELETE /api/admin/email/subscribers', () => {
  it('returns 401 when unauthorized', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await emailSubscribersRoute.DELETE(
      makeReq('http://x/api/admin/email/subscribers?id=5', { method: 'DELETE' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when id missing', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    const res = await emailSubscribersRoute.DELETE(
      makeReq('http://x/api/admin/email/subscribers', { method: 'DELETE' }),
    );
    expect(res.status).toBe(400);
  });

  it('deletes by id and returns success', async () => {
    authMock.mockResolvedValueOnce(EMPLOYEE_SESSION);
    const res = await emailSubscribersRoute.DELETE(
      makeReq('http://x/api/admin/email/subscribers?id=99', { method: 'DELETE' }),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('emailSubscribers');
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// =====================================================================
// /api/admin/portal/ai-credits
// =====================================================================
describe('GET /api/admin/portal/ai-credits', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await aiCreditsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await aiCreditsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns summary, balances, ledger, packages for admin', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    // summary (single row)
    selectQueue.push([{ totalBalance: 1234, totalMonthlyGrants: 500, payAsYouGoClients: 3 }]);
    // balances
    selectQueue.push([
      { clientId: 1, company: 'Acme', clientName: 'A', balance: 1000, monthlyGrant: 200, payAsYouGo: false },
    ]);
    // ledger
    selectQueue.push([
      {
        id: 11,
        clientId: 1,
        company: 'Acme',
        clientName: 'A',
        type: 'usage',
        amount: -10,
        balanceAfter: 990,
        description: 'use',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    // packages
    selectQueue.push([{ id: 1, name: 'starter', price: 9 }]);

    const res = await aiCreditsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.summary.totalBalance).toBe(1234);
    expect(body.data.balances).toHaveLength(1);
    expect(body.data.ledger).toHaveLength(1);
    expect(body.data.packages).toHaveLength(1);
  });

  it('handles empty result sets gracefully', async () => {
    authMock.mockResolvedValueOnce(EMPLOYEE_SESSION);
    selectQueue.push([{ totalBalance: 0, totalMonthlyGrants: 0, payAsYouGoClients: 0 }]);
    selectQueue.push([]);
    selectQueue.push([]);
    selectQueue.push([]);

    const res = await aiCreditsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.balances).toEqual([]);
    expect(body.data.ledger).toEqual([]);
    expect(body.data.packages).toEqual([]);
  });
});

// =====================================================================
// /api/admin/portal/booking
// =====================================================================
describe('GET /api/admin/portal/booking', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await adminBookingRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await adminBookingRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns pages with counts, upcoming bookings, and stats for admin', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    // pages
    selectQueue.push([
      {
        id: 1,
        title: 'Discovery',
        slug: 'discovery',
        duration: 30,
        active: true,
        googleCalendarSync: false,
        timezone: 'UTC',
        createdAt: new Date(),
        company: 'Acme',
        clientName: 'A',
      },
      {
        id: 2,
        title: 'Inactive',
        slug: 'inactive',
        duration: 60,
        active: false,
        googleCalendarSync: false,
        timezone: 'UTC',
        createdAt: new Date(),
        company: 'Acme',
        clientName: 'A',
      },
    ]);
    // bookingCounts
    selectQueue.push([
      { bookingPageId: 1, total: 5, upcoming: 2 },
    ]);
    // upcomingBookings
    selectQueue.push([
      {
        id: 100,
        guestName: 'G',
        guestEmail: 'g@x.co',
        guestPhone: null,
        startTime: new Date(),
        endTime: new Date(),
        timezone: 'UTC',
        status: 'confirmed',
        createdAt: new Date(),
        bookingPageTitle: 'Discovery',
        company: 'Acme',
        clientName: 'A',
      },
    ]);

    const res = await adminBookingRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.pages).toHaveLength(2);
    const p1 = body.pages.find((p: { id: number }) => p.id === 1);
    expect(p1.totalBookings).toBe(5);
    expect(p1.upcomingBookings).toBe(2);
    const p2 = body.pages.find((p: { id: number }) => p.id === 2);
    expect(p2.totalBookings).toBe(0);
    expect(p2.upcomingBookings).toBe(0);
    expect(body.upcomingBookings).toHaveLength(1);
    expect(body.stats).toEqual({ totalPages: 2, activePages: 1, totalUpcoming: 1 });
  });

  it('returns 500 envelope when a query throws', async () => {
    authMock.mockResolvedValueOnce(EMPLOYEE_SESSION);
    // Don't enqueue selects; instead override db.select on the first call to throw.
    // Easiest: monkey-patch with an unhandled empty queue is fine — every query returns [].
    // For an explicit throw path, push results that lead to .filter on non-array → throw.
    // Use selectQueue.push for pages, then make countMap-line crash by returning a non-array.
    // Simpler: spy console.error and pass through; route returns 200 with empty data normally.
    // Force a throw by making the first select reject:
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Replace selectQueue's shiftNext result with a rejecting promise via a custom hook is
    // not directly supported; instead, simulate by making pages.filter blow up by injecting a
    // non-iterable into the array. The cleanest is to push a non-array as pages result, which
    // will cause .filter and .map to throw.
    selectQueue.push({} as unknown as Array<Record<string, unknown>>);
    const res = await adminBookingRoute.GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/.+/);
    errSpy.mockRestore();
  });
});
