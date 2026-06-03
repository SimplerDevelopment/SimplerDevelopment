// @vitest-environment node
/**
 * Unit tests for two unrelated portal routes packed into one file:
 *
 *  1. GET / PUT /api/portal/websites/[siteId]/store/orders/[orderId]
 *     - Auth gate, site/order resolution
 *     - PUT updates basic fields (tracking number / url / internal note)
 *     - Status change inserts a status-history row, sets shippedAt /
 *       deliveredAt, dispatches the right transactional email, emits an
 *       automation event
 *
 *  2. GET / PATCH / DELETE /api/portal/email/campaigns/[id]
 *     - Auth gate, tenant ownership
 *     - PATCH renders blocks/contentBlocks into htmlContent, refuses to
 *       edit a sent campaign, flips status to scheduled when scheduledAt
 *       is supplied
 *     - DELETE refuses to delete a "sending" campaign
 *
 * All externals (auth, db, drizzle, portal-client, transactional email
 * helpers, event bus, block renderer) are mocked. No DB, no network.
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
    orders: wrap('orders'),
    orderItems: wrap('orderItems'),
    orderStatusHistory: wrap('orderStatusHistory'),
    emailCampaigns: wrap('emailCampaigns'),
    emailCampaignSends: wrap('emailCampaignSends'),
    emailSubscribers: wrap('emailSubscribers'),
    emailLists: wrap('emailLists'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: (strings: TemplateStringsArray, ..._values: unknown[]) => ({
    __sql: true,
    raw: strings.join('?'),
  }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ===========================================================================
// Shared auth + portal-client mocks
// ===========================================================================

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

// Mock portal-auth so authorizePortal passes when auth() resolves a session,
// without consuming getPortalClient calls or querying the DB for service access.
// The route calls requireClient() separately for its own 401 checks.
vi.mock('@/lib/portal-auth', async () => {
  const { auth } = await import('@/lib/auth');
  return {
    authorizePortal: async (_opts?: unknown) => {
      const session = await auth();
      if (!(session as { user?: { id?: string } } | null)?.user?.id) {
        const { NextResponse } = await import('next/server');
        return { response: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
      }
      const userId = parseInt((session as { user: { id: string } }).user.id, 10);
      // Return a stub client — the route's own requireClient() does the real lookup.
      return { client: { id: 10 } as Record<string, unknown>, userId, role: 'owner' };
    },
    isAuthError: (result: unknown) =>
      typeof result === 'object' && result !== null && 'response' in result,
  };
});

// sanitizeRichHtml must be a passthrough so rendered block HTML is not mangled.
vi.mock('@/lib/security/sanitize-html', () => ({
  sanitizeRichHtml: (html: string) => html,
}));

// ===========================================================================
// Orders route external helpers
// ===========================================================================

const sendTransactionalEmailMock = vi.fn().mockResolvedValue({ ok: true });
const getWebsiteUrlsMock = vi.fn().mockResolvedValue({
  orderUrl: (n: string) => `https://shop.example/orders/${n}`,
});
vi.mock('@/lib/email/send-transactional', () => ({
  sendTransactionalEmail: (...args: unknown[]) =>
    sendTransactionalEmailMock(...args),
  getWebsiteUrls: (...args: unknown[]) => getWebsiteUrlsMock(...args),
  formatCents: (n: number) => `$${(n / 100).toFixed(2)}`,
  formatAddress: (a: unknown) => (a ? 'addr' : ''),
  formatEmailDate: (_d: unknown) => '2026-05-19',
  buildItemsHtml: (_items: unknown[]) => '<ul/>',
}));

const emitEventMock = vi.fn();
vi.mock('@/lib/automation/event-bus', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

// ===========================================================================
// Email campaigns route external helpers
// ===========================================================================

const renderBlocksToEmailHtmlMock = vi.fn((blocks: unknown) =>
  `<rendered:${Array.isArray(blocks) ? blocks.length : 0}>`,
);
vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: (b: unknown) => renderBlocksToEmailHtmlMock(b),
}));

// ===========================================================================
// In-memory DB
// ===========================================================================

interface MockState {
  orders: Array<Record<string, unknown>>;
  orderItems: Array<Record<string, unknown>>;
  orderStatusHistory: Array<Record<string, unknown>>;
  emailCampaigns: Array<Record<string, unknown>>;
  emailCampaignSends: Array<Record<string, unknown>>;
  emailSubscribers: Array<Record<string, unknown>>;
  emailLists: Array<Record<string, unknown>>;
}

const state: MockState = {
  orders: [],
  orderItems: [],
  orderStatusHistory: [],
  emailCampaigns: [],
  emailCampaignSends: [],
  emailSubscribers: [],
  emailLists: [],
};

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
  };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string; __table?: string } | undefined;
      if (!col?.__col) return true;
      // Prefer the per-table view (for joined rows) so we look at the
      // right side of the join; fall back to the flat row.
      const byTable = (row as { __byTable?: Record<string, Record<string, unknown> | null> }).__byTable;
      if (col.__table && byTable && byTable[col.__table]) {
        return byTable[col.__table]![col.__col] === f.b;
      }
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

vi.mock('@/lib/db', () => {
  /**
   * Build a select chain. `projection` is the optional column shape passed
   * to `db.select({...})`. Join handling: we collect `leftJoin`/`innerJoin`
   * calls and, at query time, build the joined row by shallow-merging the
   * matching foreign rows (or null fields) before projecting.
   */
  function buildSelect(projection?: Record<string, { __col?: string; __table?: string }>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const joins: Array<{
      table: string;
      kind: 'left' | 'inner';
      on: { aCol?: string; aTable?: string; bCol?: string; bTable?: string };
    }> = [];

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy(_arg: unknown) {
        return runQuery();
      },
      limit(n: number) {
        limit = n;
        return runQuery();
      },
      leftJoin(table: { __table: string }, on: unknown) {
        joins.push({ table: table.__table, kind: 'left', on: parseJoinOn(on) });
        return chain;
      },
      innerJoin(table: { __table: string }, on: unknown) {
        joins.push({ table: table.__table, kind: 'inner', on: parseJoinOn(on) });
        return chain;
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function parseJoinOn(on: unknown): {
      aCol?: string;
      aTable?: string;
      bCol?: string;
      bTable?: string;
    } {
      const o = on as { op?: string; a?: { __col?: string; __table?: string }; b?: { __col?: string; __table?: string } };
      if (o?.op !== 'eq') return {};
      return {
        aCol: o.a?.__col,
        aTable: o.a?.__table,
        bCol: o.b?.__col,
        bTable: o.b?.__table,
      };
    }

    function joinedRows(): Array<Record<string, unknown> & { __byTable: Record<string, Record<string, unknown> | null> }> {
      if (!activeTable) return [];
      const baseRows = tableArray(activeTable).map((r) => ({
        ...r,
        __byTable: { [activeTable!]: { ...r } } as Record<string, Record<string, unknown> | null>,
      }));
      let current = baseRows;
      for (const j of joins) {
        const next: typeof current = [];
        for (const row of current) {
          const matches = tableArray(j.table).filter((other) => {
            // join condition: row[aCol when aTable=='active'] === other[bCol] or vice versa
            const leftVal = j.on.aTable && row.__byTable[j.on.aTable]
              ? (row.__byTable[j.on.aTable] as Record<string, unknown>)[j.on.aCol!]
              : row[j.on.aCol!];
            const rightVal = (other as Record<string, unknown>)[j.on.bCol!];
            return leftVal === rightVal;
          });
          if (matches.length === 0) {
            if (j.kind === 'left') {
              next.push({
                ...row,
                __byTable: { ...row.__byTable, [j.table]: null },
              });
            }
            // inner join with no match -> drop
          } else {
            for (const m of matches) {
              next.push({
                ...row,
                ...(m as Record<string, unknown>),
                __byTable: {
                  ...row.__byTable,
                  [j.table]: { ...(m as Record<string, unknown>) },
                },
              });
            }
          }
        }
        current = next;
      }
      return current;
    }

    function project(row: Record<string, unknown> & { __byTable: Record<string, Record<string, unknown> | null> }): Record<string, unknown> {
      if (!projection) {
        // strip __byTable
        const out = { ...row } as Record<string, unknown>;
        delete out.__byTable;
        return out;
      }
      const slim: Record<string, unknown> = {};
      for (const [alias, col] of Object.entries(projection)) {
        const colInfo = col as { __col?: string; __table?: string };
        if (colInfo?.__table && row.__byTable[colInfo.__table] !== undefined) {
          const t = row.__byTable[colInfo.__table];
          slim[alias] = t ? t[colInfo.__col!] : null;
        } else {
          slim[alias] = row[colInfo?.__col ?? alias];
        }
      }
      return slim;
    }

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      const joined = joinedRows();
      const filtered = joined.filter((r) => evalPredicate(filter, r));
      let out = filtered.map(project);
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
            createdAt: v.createdAt ?? new Date(),
            updatedAt: v.updatedAt ?? new Date(),
          };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted.map((r) => ({ ...r }))).then(onFulfilled, onRejected);
          },
        };
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
        return chain;
      },
      returning() {
        const rows = tableArray(table.__table);
        const updated: Record<string, unknown>[] = [];
        for (const r of rows) {
          if (evalPredicate(filter, r)) {
            Object.assign(r, setValues);
            updated.push({ ...r });
          }
        }
        return Promise.resolve(updated);
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const rows = tableArray(table.__table);
        const updated: Record<string, unknown>[] = [];
        for (const r of rows) {
          if (evalPredicate(filter, r)) {
            Object.assign(r, setValues);
            updated.push({ ...r });
          }
        }
        return Promise.resolve(updated).then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildDelete(table: { __table: string }) {
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      where(arg: unknown) {
        filter = arg;
        return runDelete();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runDelete().then(onFulfilled, onRejected);
      },
    };
    function runDelete(): Promise<unknown[]> {
      const rows = tableArray(table.__table);
      const remaining = rows.filter((r) => !evalPredicate(filter, r));
      const removed = rows.length - remaining.length;
      rows.length = 0;
      rows.push(...remaining);
      return Promise.resolve([{ removed }]);
    }
    return chain;
  }

  return {
    db: {
      select(projection?: Record<string, { __col?: string; __table?: string }>) {
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
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ===========================================================================
// Modules under test (import AFTER mocks are in place)
// ===========================================================================

const orderRoute = await import(
  '@/app/api/portal/websites/[siteId]/store/orders/[orderId]/route'
);
const ordersGET = orderRoute.GET;
const ordersPUT = orderRoute.PUT;

const campaignRoute = await import(
  '@/app/api/portal/email/campaigns/[id]/route'
);
const campaignsGET = campaignRoute.GET;
const campaignsPATCH = campaignRoute.PATCH;
const campaignsDELETE = campaignRoute.DELETE;

// ===========================================================================
// Shared resets
// ===========================================================================

beforeEach(() => {
  state.orders.length = 0;
  state.orderItems.length = 0;
  state.orderStatusHistory.length = 0;
  state.emailCampaigns.length = 0;
  state.emailCampaignSends.length = 0;
  state.emailSubscribers.length = 0;
  state.emailLists.length = 0;
  idCounter = 1000;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  resolveClientSiteMock.mockReset();
  sendTransactionalEmailMock.mockReset().mockResolvedValue({ ok: true });
  getWebsiteUrlsMock.mockReset().mockResolvedValue({
    orderUrl: (n: string) => `https://shop.example/orders/${n}`,
  });
  emitEventMock.mockReset();
  renderBlocksToEmailHtmlMock
    .mockReset()
    .mockImplementation((blocks: unknown) =>
      `<rendered:${Array.isArray(blocks) ? blocks.length : 0}>`,
    );

  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
  resolveClientSiteMock.mockResolvedValue({ id: 55 });
});

// ===========================================================================
// Helpers
// ===========================================================================

function orderParams(siteId: string, orderId: string) {
  return { params: Promise.resolve({ siteId, orderId }) };
}

function campaignParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makePut(body: unknown): Request {
  return new Request('http://x/api/portal/websites/55/store/orders/1', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePatch(body: unknown): Request {
  return new Request('http://x/api/portal/email/campaigns/1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeReq(method: string): Request {
  return new Request('http://x/route', { method });
}

function seedOrder(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    websiteId: 55,
    orderNumber: 'ORD-1',
    status: 'pending',
    customerName: 'Jane Doe',
    customerEmail: 'jane@example.com',
    subtotal: 1000,
    shippingTotal: 200,
    taxTotal: 100,
    discountTotal: 0,
    total: 1300,
    shippedAt: null,
    deliveredAt: null,
    trackingNumber: null,
    trackingUrl: null,
    shippingMethod: 'standard',
    internalNote: null,
    shippingAddress: { line1: '1 Main' },
    billingAddress: { line1: '1 Main' },
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
    ...over,
  };
  state.orders.push(row);
  return row;
}

function seedCampaign(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 1,
    clientId: 10,
    listId: 77,
    name: 'Campaign',
    subject: 'subj',
    previewText: null,
    fromName: 'me',
    fromEmail: 'me@example.com',
    replyTo: null,
    htmlContent: '<p>hi</p>',
    blockContent: null,
    contentBlocks: null,
    useBlockEditor: false,
    status: 'draft',
    scheduledAt: null,
    sentAt: null,
    totalRecipients: 0,
    totalSent: 0,
    totalOpened: 0,
    totalClicked: 0,
    totalBounced: 0,
    totalUnsubscribed: 0,
    createdAt: new Date('2026-05-01'),
    updatedAt: new Date('2026-05-01'),
    ...over,
  };
  state.emailCampaigns.push(row);
  return row;
}

// ===========================================================================
// GET /api/portal/websites/[siteId]/store/orders/[orderId]
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/store/orders/[orderId]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await ordersGET(makeReq('GET'), orderParams('55', '1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await ordersGET(makeReq('GET'), orderParams('55', '1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when site cannot be resolved', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await ordersGET(makeReq('GET'), orderParams('55', '1'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when order does not exist in this site', async () => {
    seedOrder({ websiteId: 9999 }); // different site
    const res = await ordersGET(makeReq('GET'), orderParams('55', '1'));
    expect(res.status).toBe(404);
  });

  it('returns 200 with order + items + statusHistory on success', async () => {
    seedOrder();
    state.orderItems.push({ id: 100, orderId: 1, name: 'Widget', quantity: 2 });
    state.orderStatusHistory.push({
      id: 200,
      orderId: 1,
      status: 'pending',
      createdAt: new Date('2026-05-01'),
    });
    const res = await ordersGET(makeReq('GET'), orderParams('55', '1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.statusHistory).toHaveLength(1);
  });
});

// ===========================================================================
// PUT /api/portal/websites/[siteId]/store/orders/[orderId]
// ===========================================================================

describe('PUT /api/portal/websites/[siteId]/store/orders/[orderId]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await ordersPUT(makePut({}), orderParams('55', '1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when order not found for this tenant', async () => {
    const res = await ordersPUT(makePut({ status: 'shipped' }), orderParams('55', '1'));
    expect(res.status).toBe(404);
  });

  it('updates trackingNumber / trackingUrl / internalNote without status change', async () => {
    seedOrder();
    const res = await ordersPUT(
      makePut({
        trackingNumber: 'TRK123',
        trackingUrl: 'https://track.example/TRK123',
        internalNote: 'staff note',
      }),
      orderParams('55', '1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.trackingNumber).toBe('TRK123');
    expect(body.data.trackingUrl).toBe('https://track.example/TRK123');
    expect(body.data.internalNote).toBe('staff note');
    // No status change -> no status-history row, no email, no event
    expect(state.orderStatusHistory).toHaveLength(0);
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it('treats body.status === order.status as a no-op (no history, no email)', async () => {
    seedOrder({ status: 'pending' });
    const res = await ordersPUT(
      makePut({ status: 'pending' }),
      orderParams('55', '1'),
    );
    expect(res.status).toBe(200);
    expect(state.orderStatusHistory).toHaveLength(0);
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
    expect(emitEventMock).not.toHaveBeenCalled();
  });

  it('status change to shipped: inserts history, sets shippedAt, sends email, emits event', async () => {
    seedOrder({ status: 'pending' });
    state.orderItems.push({ id: 100, orderId: 1, name: 'Widget', quantity: 1 });
    const res = await ordersPUT(
      makePut({
        status: 'shipped',
        statusNote: 'left warehouse',
        trackingNumber: 'TRK1',
        trackingUrl: 'https://t/1',
      }),
      orderParams('55', '1'),
    );
    expect(res.status).toBe(200);
    const updated = state.orders[0] as Record<string, unknown>;
    expect(updated.status).toBe('shipped');
    expect(updated.shippedAt).toBeInstanceOf(Date);

    expect(state.orderStatusHistory).toHaveLength(1);
    const hist = state.orderStatusHistory[0] as Record<string, unknown>;
    expect(hist.status).toBe('shipped');
    expect(hist.note).toBe('left warehouse');
    expect(hist.changedBy).toBe(7);

    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(1);
    const emailArgs = sendTransactionalEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(emailArgs.event).toBe('order.shipped');
    expect(emailArgs.to).toBe('jane@example.com');
    const vars = emailArgs.variables as Record<string, string>;
    expect(vars.trackingNumber).toBe('TRK1');
    expect(vars.trackingUrl).toBe('https://t/1');
    expect(vars.orderNumber).toBe('ORD-1');
    expect(vars.firstName).toBe('Jane');
    expect(vars.lastName).toBe('Doe');

    expect(emitEventMock).toHaveBeenCalledWith(
      'order.shipped',
      55,
      7,
      expect.objectContaining({
        orderId: 1,
        orderNumber: 'ORD-1',
        newStatus: 'shipped',
        previousStatus: 'pending',
      }),
    );
  });

  it('status change to delivered: sets deliveredAt and dispatches delivered email', async () => {
    seedOrder({ status: 'shipped', shippedAt: new Date('2026-05-10') });
    const res = await ordersPUT(
      makePut({ status: 'delivered' }),
      orderParams('55', '1'),
    );
    expect(res.status).toBe(200);
    const updated = state.orders[0] as Record<string, unknown>;
    expect(updated.deliveredAt).toBeInstanceOf(Date);

    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(1);
    const args = sendTransactionalEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.event).toBe('order.delivered');
    expect(args.fromName).toBe('Delivery Confirmation');
  });

  it('status change to cancelled: dispatches cancelled email with cancellationReason from statusNote', async () => {
    seedOrder({ status: 'pending' });
    const res = await ordersPUT(
      makePut({ status: 'cancelled', statusNote: 'fraud' }),
      orderParams('55', '1'),
    );
    expect(res.status).toBe(200);
    expect(sendTransactionalEmailMock).toHaveBeenCalledTimes(1);
    const args = sendTransactionalEmailMock.mock.calls[0][0] as Record<string, unknown>;
    expect(args.event).toBe('order.cancelled');
    expect((args.variables as Record<string, string>).cancellationReason).toBe('fraud');
  });

  it('status change to a status not in the email map: no email sent but event still emitted', async () => {
    seedOrder({ status: 'pending' });
    const res = await ordersPUT(
      makePut({ status: 'processing' }),
      orderParams('55', '1'),
    );
    expect(res.status).toBe(200);
    expect(sendTransactionalEmailMock).not.toHaveBeenCalled();
    expect(emitEventMock).toHaveBeenCalledWith(
      'order.processing',
      55,
      7,
      expect.objectContaining({ newStatus: 'processing', previousStatus: 'pending' }),
    );
  });

  it('does not overwrite shippedAt if already set when transitioning back to shipped', async () => {
    const earlier = new Date('2026-04-01');
    seedOrder({ status: 'pending', shippedAt: earlier });
    const res = await ordersPUT(
      makePut({ status: 'shipped' }),
      orderParams('55', '1'),
    );
    expect(res.status).toBe(200);
    expect((state.orders[0] as Record<string, unknown>).shippedAt).toBe(earlier);
  });

  it('handles single-word customer name (lastName becomes empty string)', async () => {
    seedOrder({ status: 'pending', customerName: 'Cher' });
    const res = await ordersPUT(
      makePut({ status: 'shipped' }),
      orderParams('55', '1'),
    );
    expect(res.status).toBe(200);
    const args = sendTransactionalEmailMock.mock.calls[0][0] as Record<string, unknown>;
    const vars = args.variables as Record<string, string>;
    expect(vars.firstName).toBe('Cher');
    expect(vars.lastName).toBe('');
  });
});

// ===========================================================================
// GET /api/portal/email/campaigns/[id]
// ===========================================================================

describe('GET /api/portal/email/campaigns/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await campaignsGET(makeReq('GET'), campaignParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when portal client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await campaignsGET(makeReq('GET'), campaignParams('1'));
    // No client -> requireClient returns null -> 401
    expect(res.status).toBe(401);
  });

  it('returns 404 when campaign does not belong to client', async () => {
    seedCampaign({ clientId: 9999 });
    const res = await campaignsGET(makeReq('GET'), campaignParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns campaign + sends rows on success', async () => {
    seedCampaign();
    state.emailLists.push({ id: 77, name: 'My List' });
    state.emailSubscribers.push({ id: 500, email: 's@example.com', name: 'Sub' });
    state.emailCampaignSends.push({
      id: 600,
      campaignId: 1,
      subscriberId: 500,
      sentAt: new Date('2026-05-10'),
      openedAt: null,
      clickedAt: null,
      bouncedAt: null,
    });
    const res = await campaignsGET(makeReq('GET'), campaignParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.campaign.id).toBe(1);
    expect(body.data.campaign.listName).toBe('My List');
    expect(body.data.sends).toHaveLength(1);
    expect(body.data.sends[0].email).toBe('s@example.com');
  });
});

// ===========================================================================
// PATCH /api/portal/email/campaigns/[id]
// ===========================================================================

describe('PATCH /api/portal/email/campaigns/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await campaignsPATCH(makePatch({}), campaignParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when campaign not owned by client', async () => {
    seedCampaign({ clientId: 9999 });
    const res = await campaignsPATCH(makePatch({ name: 'x' }), campaignParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when attempting to edit a sent campaign', async () => {
    seedCampaign({ status: 'sent' });
    const res = await campaignsPATCH(makePatch({ name: 'x' }), campaignParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/sent campaign/);
  });

  it('trims name/subject/fromName/fromEmail and stores them', async () => {
    seedCampaign();
    const res = await campaignsPATCH(
      makePatch({
        name: '  New Name  ',
        subject: '  New Subj  ',
        previewText: '  preview  ',
        fromName: '  Sender  ',
        fromEmail: '  s@example.com  ',
        replyTo: '  reply@example.com  ',
      }),
      campaignParams('1'),
    );
    expect(res.status).toBe(200);
    const row = state.emailCampaigns[0] as Record<string, unknown>;
    expect(row.name).toBe('New Name');
    expect(row.subject).toBe('New Subj');
    expect(row.previewText).toBe('preview');
    expect(row.fromName).toBe('Sender');
    expect(row.fromEmail).toBe('s@example.com');
    expect(row.replyTo).toBe('reply@example.com');
  });

  it('renders blockContent.blocks into htmlContent via renderBlocksToEmailHtml', async () => {
    seedCampaign();
    const res = await campaignsPATCH(
      makePatch({ blockContent: { blocks: [{ type: 'heading' }, { type: 'p' }] } }),
      campaignParams('1'),
    );
    expect(res.status).toBe(200);
    expect(renderBlocksToEmailHtmlMock).toHaveBeenCalledWith([
      { type: 'heading' },
      { type: 'p' },
    ]);
    expect((state.emailCampaigns[0] as Record<string, unknown>).htmlContent).toBe(
      '<rendered:2>',
    );
  });

  it('renders contentBlocks array into htmlContent (taking precedence over blockContent)', async () => {
    seedCampaign();
    const res = await campaignsPATCH(
      makePatch({
        blockContent: { blocks: [{ type: 'old' }] },
        contentBlocks: [{ type: 'a' }, { type: 'b' }, { type: 'c' }],
      }),
      campaignParams('1'),
    );
    expect(res.status).toBe(200);
    // Both invocations happen but the final htmlContent reflects contentBlocks
    expect(renderBlocksToEmailHtmlMock).toHaveBeenLastCalledWith([
      { type: 'a' },
      { type: 'b' },
      { type: 'c' },
    ]);
    expect((state.emailCampaigns[0] as Record<string, unknown>).htmlContent).toBe(
      '<rendered:3>',
    );
  });

  it('uses htmlContent verbatim (trimmed) when no blocks provided', async () => {
    seedCampaign();
    const res = await campaignsPATCH(
      makePatch({ htmlContent: '  <p>raw</p>  ' }),
      campaignParams('1'),
    );
    expect(res.status).toBe(200);
    expect((state.emailCampaigns[0] as Record<string, unknown>).htmlContent).toBe(
      '<p>raw</p>',
    );
    expect(renderBlocksToEmailHtmlMock).not.toHaveBeenCalled();
  });

  it('flips status to scheduled when scheduledAt is provided', async () => {
    seedCampaign({ status: 'draft' });
    const when = '2026-06-01T10:00:00.000Z';
    const res = await campaignsPATCH(
      makePatch({ scheduledAt: when }),
      campaignParams('1'),
    );
    expect(res.status).toBe(200);
    const row = state.emailCampaigns[0] as Record<string, unknown>;
    expect(row.status).toBe('scheduled');
    expect((row.scheduledAt as Date).toISOString()).toBe(when);
  });

  it('resets status to draft and nulls scheduledAt when scheduledAt is not provided', async () => {
    seedCampaign({ status: 'scheduled', scheduledAt: new Date('2026-06-01') });
    const res = await campaignsPATCH(
      makePatch({ name: 'still editing' }),
      campaignParams('1'),
    );
    expect(res.status).toBe(200);
    const row = state.emailCampaigns[0] as Record<string, unknown>;
    expect(row.status).toBe('draft');
    expect(row.scheduledAt).toBeNull();
  });

  it('flips useBlockEditor when explicitly true/false', async () => {
    seedCampaign({ useBlockEditor: false });
    const res = await campaignsPATCH(
      makePatch({ useBlockEditor: true }),
      campaignParams('1'),
    );
    expect(res.status).toBe(200);
    expect((state.emailCampaigns[0] as Record<string, unknown>).useBlockEditor).toBe(true);
  });
});

// ===========================================================================
// DELETE /api/portal/email/campaigns/[id]
// ===========================================================================

describe('DELETE /api/portal/email/campaigns/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await campaignsDELETE(makeReq('DELETE'), campaignParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when campaign not owned by client', async () => {
    seedCampaign({ clientId: 9999 });
    const res = await campaignsDELETE(makeReq('DELETE'), campaignParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when campaign is currently sending', async () => {
    seedCampaign({ status: 'sending' });
    const res = await campaignsDELETE(makeReq('DELETE'), campaignParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/sending campaign/);
    // Row should still be there
    expect(state.emailCampaigns).toHaveLength(1);
  });

  it('deletes the campaign on success', async () => {
    seedCampaign({ status: 'draft' });
    const res = await campaignsDELETE(makeReq('DELETE'), campaignParams('1'));
    expect(res.status).toBe(200);
    expect(state.emailCampaigns).toHaveLength(0);
  });
});
