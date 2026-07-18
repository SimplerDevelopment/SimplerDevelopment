// @vitest-environment node
/**
 * Unit tests for two unrelated API routes packed into one file:
 *
 *  1. GET / PATCH / DELETE /api/admin/email/campaigns/[id]
 *     - Staff (admin/employee) auth gate
 *     - GET projects campaign + joined listName, and recent sends with subscriber
 *     - PATCH refuses sent campaigns, trims fields, toggles status based on
 *       scheduledAt presence
 *     - DELETE refuses to delete a "sending" campaign
 *
 *  2. POST /api/public/gift-certificates/purchase
 *     - Input validation (websiteId / amount / purchaser fields)
 *     - Resolves website + (optional) Stripe Connect store
 *     - Generates a unique CERT-xxxxxx code, retries on collision
 *     - Creates a gift_certificate row, creates a Stripe PaymentIntent,
 *       stamps the intent id back onto the row
 *     - Applies Stripe Connect application_fee_amount / transfer_data when
 *       the website's store has finished Connect onboarding
 *
 * All externals (auth, db, drizzle, stripe, crypto.random) are mocked.
 * No DB, no network.
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
    emailCampaigns: wrap('emailCampaigns'),
    emailCampaignSends: wrap('emailCampaignSends'),
    emailSubscribers: wrap('emailSubscribers'),
    emailLists: wrap('emailLists'),
    giftCertificates: wrap('giftCertificates'),
    clientWebsites: wrap('clientWebsites'),
    storeSettings: wrap('storeSettings'),
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
// auth mock
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

// ===========================================================================
// Stripe mock (for gift-cert purchase route)
// ===========================================================================

const paymentIntentsCreateMock = vi.fn();
class StripeMock {
  paymentIntents = { create: paymentIntentsCreateMock };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_secret: string) {}
}
vi.mock('stripe', () => ({
  default: StripeMock,
}));

// ===========================================================================
// In-memory DB
// ===========================================================================

interface MockState {
  emailCampaigns: Array<Record<string, unknown>>;
  emailCampaignSends: Array<Record<string, unknown>>;
  emailSubscribers: Array<Record<string, unknown>>;
  emailLists: Array<Record<string, unknown>>;
  giftCertificates: Array<Record<string, unknown>>;
  clientWebsites: Array<Record<string, unknown>>;
  storeSettings: Array<Record<string, unknown>>;
}

const state: MockState = {
  emailCampaigns: [],
  emailCampaignSends: [],
  emailSubscribers: [],
  emailLists: [],
  giftCertificates: [],
  clientWebsites: [],
  storeSettings: [],
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

const campaignRoute = await import(
  '@/app/api/admin/email/campaigns/[id]/route'
);
const campaignsGET = campaignRoute.GET;
const campaignsPATCH = campaignRoute.PATCH;
const campaignsDELETE = campaignRoute.DELETE;

const giftCertRoute = await import(
  '@/app/api/public/gift-certificates/purchase/route'
);
const giftCertPOST = giftCertRoute.POST;

// ===========================================================================
// Shared resets
// ===========================================================================

beforeEach(() => {
  state.emailCampaigns.length = 0;
  state.emailCampaignSends.length = 0;
  state.emailSubscribers.length = 0;
  state.emailLists.length = 0;
  state.giftCertificates.length = 0;
  state.clientWebsites.length = 0;
  state.storeSettings.length = 0;
  idCounter = 1000;

  authMock.mockReset();
  paymentIntentsCreateMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
  paymentIntentsCreateMock.mockResolvedValue({
    id: 'pi_test_123',
    client_secret: 'pi_test_123_secret',
  });

  process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
});

// ===========================================================================
// Helpers
// ===========================================================================

function campaignParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReq(method: string): Request {
  return new Request('http://x/route', { method });
}

function makePatch(body: unknown): Request {
  return new Request('http://x/api/admin/email/campaigns/1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makePost(body: unknown): Request {
  return new Request('http://x/api/public/gift-certificates/purchase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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

function seedWebsite(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 55,
    clientId: 10,
    name: 'Acme',
    active: true,
    ...over,
  };
  state.clientWebsites.push(row);
  return row;
}

function seedStore(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  const row = {
    id: 800,
    websiteId: 55,
    enabled: true,
    stripeAccountId: null,
    stripeOnboardingComplete: false,
    platformFeePercent: null,
    currency: 'usd',
    ...over,
  };
  state.storeSettings.push(row);
  return row;
}

// ===========================================================================
// GET /api/admin/email/campaigns/[id]
// ===========================================================================

describe('GET /api/admin/email/campaigns/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await campaignsGET(makeReq('GET'), campaignParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: { role: 'admin' } });
    const res = await campaignsGET(makeReq('GET'), campaignParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when user role is not admin or employee', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'customer' } });
    const res = await campaignsGET(makeReq('GET'), campaignParams('1'));
    expect(res.status).toBe(401);
  });

  it('allows employee role', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'employee' } });
    seedCampaign();
    const res = await campaignsGET(makeReq('GET'), campaignParams('1'));
    expect(res.status).toBe(200);
  });

  it('returns 404 when campaign not found', async () => {
    const res = await campaignsGET(makeReq('GET'), campaignParams('999'));
    expect(res.status).toBe(404);
  });

  it('returns campaign with joined listName and recent sends', async () => {
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

  it('returns campaign with null listName when no list joined', async () => {
    seedCampaign({ listId: 9999 }); // listId points to a non-existent list
    const res = await campaignsGET(makeReq('GET'), campaignParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.campaign.listName).toBeNull();
  });
});

// ===========================================================================
// PATCH /api/admin/email/campaigns/[id]
// ===========================================================================

describe('PATCH /api/admin/email/campaigns/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await campaignsPATCH(makePatch({}), campaignParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is not staff', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'customer' } });
    const res = await campaignsPATCH(makePatch({}), campaignParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when campaign not found', async () => {
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

  it('trims name/subject/previewText/fromName/fromEmail/replyTo/htmlContent', async () => {
    seedCampaign();
    const res = await campaignsPATCH(
      makePatch({
        name: '  New Name  ',
        subject: '  New Subj  ',
        previewText: '  preview  ',
        fromName: '  Sender  ',
        fromEmail: '  s@example.com  ',
        replyTo: '  reply@example.com  ',
        htmlContent: '  <p>raw</p>  ',
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
    expect(row.htmlContent).toBe('<p>raw</p>');
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

  it('nulls previewText and replyTo when empty strings provided', async () => {
    seedCampaign({ previewText: 'old', replyTo: 'old@example.com' });
    const res = await campaignsPATCH(
      makePatch({ previewText: '   ', replyTo: '' }),
      campaignParams('1'),
    );
    expect(res.status).toBe(200);
    const row = state.emailCampaigns[0] as Record<string, unknown>;
    expect(row.previewText).toBeNull();
    expect(row.replyTo).toBeNull();
  });

  it('returns updated row in response data', async () => {
    seedCampaign();
    const res = await campaignsPATCH(
      makePatch({ name: 'Changed' }),
      campaignParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Changed');
  });
});

// ===========================================================================
// DELETE /api/admin/email/campaigns/[id]
// ===========================================================================

describe('DELETE /api/admin/email/campaigns/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await campaignsDELETE(makeReq('DELETE'), campaignParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when role is not staff', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'customer' } });
    const res = await campaignsDELETE(makeReq('DELETE'), campaignParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when campaign not found', async () => {
    const res = await campaignsDELETE(makeReq('DELETE'), campaignParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when campaign is currently sending', async () => {
    seedCampaign({ status: 'sending' });
    const res = await campaignsDELETE(makeReq('DELETE'), campaignParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/currently sending/);
    expect(state.emailCampaigns).toHaveLength(1);
  });

  it('deletes the campaign on success', async () => {
    seedCampaign({ status: 'draft' });
    const res = await campaignsDELETE(makeReq('DELETE'), campaignParams('1'));
    expect(res.status).toBe(200);
    expect(state.emailCampaigns).toHaveLength(0);
  });
});

// ===========================================================================
// POST /api/public/gift-certificates/purchase
// ===========================================================================

describe('POST /api/public/gift-certificates/purchase', () => {
  it('returns 400 when websiteId is missing/non-numeric', async () => {
    const res = await giftCertPOST(
      makePost({
        amount: 5000,
        purchaserName: 'A',
        purchaserEmail: 'a@example.com',
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/websiteId/);
  });

  it('returns 400 when amount is missing', async () => {
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        purchaserName: 'A',
        purchaserEmail: 'a@example.com',
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/\$1\.00/);
  });

  it('returns 400 when amount is below minimum', async () => {
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 50,
        purchaserName: 'A',
        purchaserEmail: 'a@example.com',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when purchaser name is empty', async () => {
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 5000,
        purchaserName: '   ',
        purchaserEmail: 'a@example.com',
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Purchaser/);
  });

  it('returns 400 when purchaser email is missing', async () => {
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 5000,
        purchaserName: 'A',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when website does not exist', async () => {
    const res = await giftCertPOST(
      makePost({
        websiteId: 999,
        amount: 5000,
        purchaserName: 'Alice',
        purchaserEmail: 'a@example.com',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when website is inactive', async () => {
    seedWebsite({ active: false });
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 5000,
        purchaserName: 'Alice',
        purchaserEmail: 'a@example.com',
      }),
    );
    expect(res.status).toBe(404);
  });

  it('creates a gift certificate and Stripe PaymentIntent on success (no Connect)', async () => {
    seedWebsite();
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 5000,
        purchaserName: '  Alice  ',
        purchaserEmail: '  alice@example.com  ',
        recipientName: '  Bob  ',
        recipientEmail: '  bob@example.com  ',
        personalMessage: '  Enjoy!  ',
        redeemableAt: 'booking',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.clientSecret).toBe('pi_test_123_secret');
    expect(body.data.amount).toBe(5000);
    expect(body.data.code).toMatch(/^CERT-[A-Z0-9]{6}$/);

    const cert = state.giftCertificates[0] as Record<string, unknown>;
    expect(cert.purchaserName).toBe('Alice');
    expect(cert.purchaserEmail).toBe('alice@example.com');
    expect(cert.recipientName).toBe('Bob');
    expect(cert.recipientEmail).toBe('bob@example.com');
    expect(cert.personalMessage).toBe('Enjoy!');
    expect(cert.redeemableAt).toBe('booking');
    expect(cert.status).toBe('pending_payment');
    expect(cert.initialAmount).toBe(5000);
    expect(cert.remainingAmount).toBe(5000);
    expect(cert.clientId).toBe(10);
    expect(cert.websiteId).toBe(55);
    expect(cert.stripePaymentIntentId).toBe('pi_test_123');

    expect(paymentIntentsCreateMock).toHaveBeenCalledTimes(1);
    const params = paymentIntentsCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.amount).toBe(5000);
    expect(params.currency).toBe('usd');
    expect(params.application_fee_amount).toBeUndefined();
    expect(params.transfer_data).toBeUndefined();
    const meta = params.metadata as Record<string, string>;
    expect(meta.type).toBe('gift_certificate');
    expect(meta.clientId).toBe('10');
    expect(meta.websiteId).toBe('55');
  });

  it('defaults redeemableAt to "both" when not provided', async () => {
    seedWebsite();
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 5000,
        purchaserName: 'Alice',
        purchaserEmail: 'alice@example.com',
      }),
    );
    expect(res.status).toBe(200);
    expect((state.giftCertificates[0] as Record<string, unknown>).redeemableAt).toBe('both');
  });

  it('nullifies recipient fields when not provided', async () => {
    seedWebsite();
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 5000,
        purchaserName: 'Alice',
        purchaserEmail: 'alice@example.com',
      }),
    );
    expect(res.status).toBe(200);
    const cert = state.giftCertificates[0] as Record<string, unknown>;
    expect(cert.recipientName).toBeNull();
    expect(cert.recipientEmail).toBeNull();
    expect(cert.personalMessage).toBeNull();
  });

  it('applies Stripe Connect application_fee_amount and transfer_data when onboarding complete', async () => {
    seedWebsite();
    seedStore({
      stripeAccountId: 'acct_123',
      stripeOnboardingComplete: true,
      platformFeePercent: '7',
      currency: 'EUR',
    });
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 10000,
        purchaserName: 'Alice',
        purchaserEmail: 'alice@example.com',
      }),
    );
    expect(res.status).toBe(200);
    const params = paymentIntentsCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.application_fee_amount).toBe(700); // 7% of 10000
    expect(params.transfer_data).toEqual({ destination: 'acct_123' });
    expect(params.currency).toBe('eur');
  });

  it('defaults platform fee to 5% when not set on store', async () => {
    seedWebsite();
    seedStore({
      stripeAccountId: 'acct_123',
      stripeOnboardingComplete: true,
      platformFeePercent: null,
    });
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 10000,
        purchaserName: 'Alice',
        purchaserEmail: 'alice@example.com',
      }),
    );
    expect(res.status).toBe(200);
    const params = paymentIntentsCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.application_fee_amount).toBe(500); // default 5% of 10000
  });

  it('does NOT apply Connect when store has stripeAccountId but onboarding incomplete', async () => {
    seedWebsite();
    seedStore({
      stripeAccountId: 'acct_123',
      stripeOnboardingComplete: false,
    });
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 5000,
        purchaserName: 'Alice',
        purchaserEmail: 'alice@example.com',
      }),
    );
    expect(res.status).toBe(200);
    const params = paymentIntentsCreateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.application_fee_amount).toBeUndefined();
    expect(params.transfer_data).toBeUndefined();
  });

  it('does NOT apply Connect when store is disabled', async () => {
    seedWebsite();
    seedStore({
      enabled: false,
      stripeAccountId: 'acct_123',
      stripeOnboardingComplete: true,
    });
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 5000,
        purchaserName: 'Alice',
        purchaserEmail: 'alice@example.com',
      }),
    );
    expect(res.status).toBe(200);
    const params = paymentIntentsCreateMock.mock.calls[0][0] as Record<string, unknown>;
    // disabled store -> not selected -> no connect params
    expect(params.application_fee_amount).toBeUndefined();
  });

  it('regenerates code when a collision is found', async () => {
    seedWebsite();
    // Pre-seed a row that will collide with the first generated code.
    // The route generates a code via Math.random; force collision by spying.
    const originalRandom = Math.random;
    let calls = 0;
    // First 6 calls produce 0 (=> 'A' chars). Subsequent calls produce 0.5 (=> 'P').
    Math.random = () => {
      calls++;
      return calls <= 6 ? 0 : 0.5;
    };
    try {
      // Pre-insert a cert with the all-A code so first attempt collides.
      state.giftCertificates.push({
        id: 9000,
        code: 'CERT-AAAAAA',
        clientId: 10,
        websiteId: 55,
      });
      const res = await giftCertPOST(
        makePost({
          websiteId: 55,
          amount: 5000,
          purchaserName: 'Alice',
          purchaserEmail: 'alice@example.com',
        }),
      );
      expect(res.status).toBe(200);
      const created = state.giftCertificates.find(
        (c) => (c as Record<string, unknown>).id !== 9000,
      ) as Record<string, unknown>;
      expect(created).toBeDefined();
      // New code must differ from the colliding one.
      expect(created.code).not.toBe('CERT-AAAAAA');
      expect(String(created.code)).toMatch(/^CERT-[A-Z0-9]{6}$/);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('returns 500 on JSON parse error', async () => {
    const req = new Request('http://x/api/public/gift-certificates/purchase', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    });
    const res = await giftCertPOST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 500 when Stripe createPaymentIntent throws', async () => {
    seedWebsite();
    paymentIntentsCreateMock.mockRejectedValueOnce(new Error('stripe down'));
    const res = await giftCertPOST(
      makePost({
        websiteId: 55,
        amount: 5000,
        purchaserName: 'Alice',
        purchaserEmail: 'alice@example.com',
      }),
    );
    expect(res.status).toBe(500);
  });
});
