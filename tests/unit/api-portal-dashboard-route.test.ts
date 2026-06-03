// @vitest-environment node
/**
 * Unit tests for app/api/portal/dashboard/route.ts
 *
 * GET — returns dashboard JSON for the authenticated portal client. Auth and
 * client lookup are mocked. The route fans out a fixed sequence of db.select
 * calls (services list, my subscriptions, then conditional per-service stats
 * for websites / email / booking / pitch-decks / projects / tickets /
 * invoices). We mock @/lib/db with a FIFO queue keyed by the calling table
 * so we can return predetermined rows for each query in order.
 *
 * Coverage targets:
 *  - 401 when unauthenticated
 *  - 404 when getPortalClient returns null
 *  - happy path with at least one active subscription in every category
 *    (cms, email, booking, pitch-decks) and core counts
 *  - branches where active subscriptions are empty (websiteStats === null)
 *  - branches where category meta is missing → fallback meta used
 *  - branches where lists/pages/decks counts are zero → null stats
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (typeof prop === 'symbol') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    services: wrap('services'),
    clientServices: wrap('clientServices'),
    clientWebsites: wrap('clientWebsites'),
    posts: wrap('posts'),
    emailLists: wrap('emailLists'),
    emailSubscribers: wrap('emailSubscribers'),
    emailCampaigns: wrap('emailCampaigns'),
    bookingPages: wrap('bookingPages'),
    bookings: wrap('bookings'),
    pitchDecks: wrap('pitchDecks'),
    projects: wrap('projects'),
    supportTickets: wrap('supportTickets'),
    invoices: wrap('invoices'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  count: () => ({ __agg: 'count' }),
  sum: (col: unknown) => ({ __agg: 'sum', col }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    {
      join: (parts: unknown[], sep: unknown) => ({
        __sqlJoin: true,
        parts,
        sep,
      }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- FIFO query mock ----
//
// Each invocation of db.select(...).from(table).where(...) consumes the next
// entry from `queue` for the matching table name. If no entry is present we
// return an empty array. Tests push results in route execution order.

interface QueueEntry {
  table: string;
  rows: unknown[];
}

const queue: QueueEntry[] = [];

function enqueue(table: string, rows: unknown[]) {
  queue.push({ table, rows });
}

function dequeueFor(table: string): unknown[] {
  const idx = queue.findIndex((q) => q.table === table);
  if (idx === -1) return [];
  const [entry] = queue.splice(idx, 1);
  return entry.rows;
}

vi.mock('@/lib/db', () => {
  function builder(_projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    const chain: Record<string, unknown> = {
      from(t: { __table?: string }) {
        activeTable = t?.__table ?? null;
        return chain;
      },
      where(_w: unknown) {
        return chain;
      },
      orderBy(_o: unknown) {
        return chain;
      },
      then(resolve: (value: unknown) => unknown, reject?: (err: unknown) => unknown) {
        try {
          const rows = activeTable ? dequeueFor(activeTable) : [];
          return Promise.resolve(rows).then(resolve, reject);
        } catch (err) {
          return Promise.reject(err).then(resolve, reject);
        }
      },
    };
    return chain;
  }
  return {
    db: {
      select: (projection?: Record<string, unknown>) => builder(projection),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  authMock.mockReset();
  getPortalClientMock.mockReset();
  queue.length = 0;
});

async function callGet() {
  const mod = await import('@/app/api/portal/dashboard/route');
  return mod.GET();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/portal/dashboard', () => {
  it('returns 401 when not authenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await callGet();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: { id: undefined } });
    const res = await callGet();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client cannot be resolved', async () => {
    authMock.mockResolvedValue({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValue(null);
    const res = await callGet();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('No client');
    expect(getPortalClientMock).toHaveBeenCalledWith(42);
  });

  it('happy path: returns company, core counts, and service cards with stats for every subscribed category', async () => {
    authMock.mockResolvedValue({ user: { id: '7' } });
    getPortalClientMock.mockResolvedValue({ id: 100, company: 'Acme Co' });

    // Queries execute in this order (Promise.all is parallel but mock is
    // sequential-per-table — order across distinct tables doesn't matter):
    //
    // 1. services list  -> 4 services across 4 categories + 1 unknown
    enqueue('services', [
      { id: 1, name: 'CMS', category: 'cms', price: 100, billingCycle: 'monthly', features: ['a'], active: true, description: 'cms desc' },
      { id: 2, name: 'Email', category: 'email', price: 50, billingCycle: 'monthly', features: [], active: true, description: 'email desc' },
      { id: 3, name: 'Booking', category: 'booking', price: 25, billingCycle: 'monthly', features: [], active: true, description: 'booking desc' },
      { id: 4, name: 'Decks', category: 'pitch-decks', price: 75, billingCycle: 'monthly', features: [], active: true, description: 'decks desc' },
      { id: 5, name: 'Mystery', category: 'unknown-cat', price: 0, billingCycle: 'monthly', features: [], active: true, description: 'fallback desc' },
    ]);
    // 2. mySubscriptions -> all four subscribed + an inactive one filtered out
    enqueue('clientServices', [
      { serviceId: 1, status: 'active' },
      { serviceId: 2, status: 'active' },
      { serviceId: 3, status: 'active' },
      { serviceId: 4, status: 'active' },
      { serviceId: 99, status: 'paused' },
    ]);
    // 3. websites stats: sites count, sites rows, totalPages count, publishedPages count
    enqueue('clientWebsites', [{ count: 2 }]);
    enqueue('clientWebsites', [{ id: 11 }, { id: 12 }]);
    enqueue('posts', [{ count: 10 }]);
    enqueue('posts', [{ count: 6 }]);
    // 4. email: lists count, list rows, sub count, campaign aggregate
    enqueue('emailLists', [{ count: 2 }]);
    enqueue('emailLists', [{ id: 21 }, { id: 22 }]);
    enqueue('emailSubscribers', [{ count: 500 }]);
    enqueue('emailCampaigns', [{ count: 3, avgOpen: 42.7 }]);
    // 5. booking: pages count, upcoming bookings count
    enqueue('bookingPages', [{ count: 1 }]);
    enqueue('bookings', [{ count: 4 }]);
    // 6. pitch decks: count
    enqueue('pitchDecks', [{ count: 5 }]);
    // 7. core counts
    enqueue('projects', [{ count: 2 }]);
    enqueue('supportTickets', [{ count: 1 }]);
    enqueue('invoices', [{ count: 3, total: '1500.50' }]);

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.company).toBe('Acme Co');
    expect(body.core).toEqual({
      projects: 2,
      tickets: 1,
      invoices: 3,
      amountDue: 1500.5,
    });

    const byId: Record<number, Record<string, unknown>> = {};
    for (const card of body.services) byId[card.id as number] = card;

    expect(byId[1].subscribed).toBe(true);
    expect(byId[1].icon).toBe('language');
    expect(byId[1].stats).toEqual({ Websites: 2, 'Total Pages': 10, Published: 6 });

    expect(byId[2].stats).toEqual({
      Subscribers: 500,
      'Campaigns Sent': 3,
      'Avg Open Rate': '43%',
    });

    expect(byId[3].stats).toEqual({ 'Booking Pages': 1, Upcoming: 4 });

    expect(byId[4].stats).toEqual({ 'Decks Created': 5 });

    // Unknown category: fallback meta, no stats (no branch matches).
    expect(byId[5].subscribed).toBe(false);
    expect(byId[5].icon).toBe('category');
    expect(byId[5].href).toBe('/portal/services');
    expect(byId[5].description).toBe('fallback desc');
    expect(byId[5].stats).toBeNull();
  });

  it('returns null stats branches when subscription set is empty and counts are zero', async () => {
    authMock.mockResolvedValue({ user: { id: '1' } });
    getPortalClientMock.mockResolvedValue({ id: 9, company: 'Empty Inc' });

    // services list contains an email/booking/pitch entry — but none are
    // subscribed, so `subscribed` is false for all and `stats` stays null even
    // though the per-category queries still run.
    enqueue('services', [
      { id: 10, name: 'Email', category: 'email', price: 0, billingCycle: 'monthly', features: [], active: true, description: '' },
      { id: 11, name: 'Booking', category: 'booking', price: 0, billingCycle: 'monthly', features: [], active: true, description: '' },
      { id: 12, name: 'Decks', category: 'pitch-decks', price: 0, billingCycle: 'monthly', features: [], active: true, description: '' },
    ]);
    enqueue('clientServices', []); // no active subscriptions → activeIds is empty

    // Because activeIds.size === 0, the website branch is Promise.resolve(null)
    // (no websites queries consumed). Email/booking/deck closures still run.
    enqueue('emailLists', [{ count: 0 }]); // → returns null
    enqueue('bookingPages', [{ count: 0 }]); // → returns null
    enqueue('pitchDecks', [{ count: 0 }]); // → returns null
    enqueue('projects', [{ count: 0 }]);
    enqueue('supportTickets', [{ count: 0 }]);
    enqueue('invoices', [{ count: 0, total: null }]);

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.company).toBe('Empty Inc');
    expect(body.core).toEqual({
      projects: 0,
      tickets: 0,
      invoices: 0,
      amountDue: 0,
    });
    expect(body.services).toHaveLength(3);
    for (const card of body.services) {
      expect(card.subscribed).toBe(false);
      expect(card.stats).toBeNull();
    }
  });

  it('handles websites-with-zero-sites and email-with-zero-lists nullable branches', async () => {
    authMock.mockResolvedValue({ user: { id: '3' } });
    getPortalClientMock.mockResolvedValue({ id: 50, company: 'Partial LLC' });

    enqueue('services', [
      { id: 100, name: 'CMS', category: 'cms', price: 0, billingCycle: 'monthly', features: [], active: true, description: '' },
      { id: 101, name: 'Email', category: 'email', price: 0, billingCycle: 'monthly', features: [], active: true, description: '' },
      { id: 102, name: 'Booking', category: 'booking', price: 0, billingCycle: 'monthly', features: [], active: true, description: '' },
    ]);
    // Subscribed to all three so the branches execute.
    enqueue('clientServices', [
      { serviceId: 100, status: 'active' },
      { serviceId: 101, status: 'active' },
      { serviceId: 102, status: 'active' },
    ]);

    // Websites branch: sites count > 0 but no site rows → siteIds.length === 0,
    // totalPages / publishedPages stay 0 and posts queries are NOT consumed.
    enqueue('clientWebsites', [{ count: 0 }]);
    enqueue('clientWebsites', []); // no rows
    // Email branch: lists count > 0 (so returns object) but no list rows.
    enqueue('emailLists', [{ count: 1 }]);
    enqueue('emailLists', []);
    // Booking branch: pages count > 0, upcoming count is 0.
    enqueue('bookingPages', [{ count: 2 }]);
    enqueue('bookings', [{ count: 0 }]);

    enqueue('projects', [{ count: 1 }]);
    enqueue('supportTickets', [{ count: 0 }]);
    enqueue('invoices', [{ count: 1, total: '99.99' }]);

    const res = await callGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.core.amountDue).toBeCloseTo(99.99);

    const byId: Record<number, Record<string, unknown>> = {};
    for (const card of body.services) byId[card.id as number] = card;

    // CMS card: subscribed, but websiteStats has zero sites / zero pages.
    expect(byId[100].subscribed).toBe(true);
    expect(byId[100].stats).toEqual({ Websites: 0, 'Total Pages': 0, Published: 0 });

    // Email card: subscribed, email branch returns object with zero subs.
    expect(byId[101].stats).toEqual({
      Subscribers: 0,
      'Campaigns Sent': 0,
      'Avg Open Rate': '0%',
    });

    // Booking card: subscribed, two pages, zero upcoming.
    expect(byId[102].stats).toEqual({ 'Booking Pages': 2, Upcoming: 0 });
  });
});
