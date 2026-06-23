// @vitest-environment node
/**
 * Batch 30h — unit tests for 4 portal CRM route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/crm/proposals/[id]/send/route.ts   (POST)
 *  - app/api/portal/crm/proposals/route.ts             (GET, POST)
 *  - app/api/portal/crm/scoring-rules/route.ts         (GET, POST)
 *  - app/api/portal/crm/tags/[id]/route.ts             (DELETE)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy / .offset). db.insert/update/delete are mocked to capture
 * writes and emit the next queued return rows.
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

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
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
    crmProposals: wrap('crmProposals'),
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
    crmScoringRules: wrap('crmScoringRules'),
    crmTags: wrap('crmTags'),
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
  returnedRows: Array<Record<string, unknown>>;
}
interface DeleteCall {
  table: string;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
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
            const rows = updateReturnQueue.shift() ?? [];
            const cloned = rows.map((r) => ({ ...r }));
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: cloned });
            return {
              returning() {
                return Promise.resolve(cloned);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(cloned).then(onF, onR);
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
        const rows = deleteReturnQueue.shift() ?? [];
        const cloned = rows.map((r) => ({ ...r }));
        deleteCalls.push({ table: table.__table, filter, returnedRows: cloned });
        return {
          returning() {
            return Promise.resolve(cloned);
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned).then(onF, onR);
          },
        };
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

const proposalsSendRoute = await import(
  '@/app/api/portal/crm/proposals/[id]/send/route'
);
const proposalsRoute = await import('@/app/api/portal/crm/proposals/route');
const scoringRulesRoute = await import('@/app/api/portal/crm/scoring-rules/route');
const tagsIdRoute = await import('@/app/api/portal/crm/tags/[id]/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

// NextRequest helper — proposals GET uses req.nextUrl.searchParams
function makeNextReq(url: string) {
  const u = new URL(url);
  return {
    nextUrl: u,
    url,
  } as unknown as import('next/server').NextRequest;
}

const SESSION = { user: { id: '7' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  deleteReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
});

// ===========================================================================
// POST /api/portal/crm/proposals/[id]/send
// ===========================================================================

describe('POST /api/portal/crm/proposals/[id]/send', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await proposalsSendRoute.POST(
      makeReq('http://x/api/portal/crm/proposals/9/send', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await proposalsSendRoute.POST(
      makeReq('http://x/api/portal/crm/proposals/9/send', { method: 'POST' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 when id is NaN', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await proposalsSendRoute.POST(
      makeReq('http://x/api/portal/crm/proposals/abc/send', { method: 'POST' }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid ID');
  });

  it('returns 404 when proposal does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // no proposal
    const res = await proposalsSendRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposals/9/send', 'POST', { recipientEmail: 'test@example.com' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Proposal not found');
  });

  it('returns 400 when proposal status is not draft or sent', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 9, clientToken: 'tok123', status: 'accepted' },
    ]);
    const res = await proposalsSendRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposals/9/send', 'POST', { recipientEmail: 'test@example.com' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Cannot send/);
    expect(body.message).toMatch(/accepted/);
  });

  it('updates proposal to sent and returns proposalUrl with token', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 9, clientToken: 'tok123', status: 'draft' },
    ]);
    updateReturnQueue.push([
      {
        id: 9,
        clientToken: 'tok123',
        status: 'sent',
        title: 'My proposal',
      },
    ]);
    const res = await proposalsSendRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposals/9/send', 'POST', { recipientEmail: 'client@example.com' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(9);
    expect(body.data.status).toBe('sent');
    expect(body.data.proposalUrl).toBe('/proposal/tok123');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('crmProposals');
    expect(updateCalls[0].patch.status).toBe('sent');
    expect(updateCalls[0].patch.sentAt).toBeInstanceOf(Date);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('allows resending when status is sent', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 9, clientToken: 'tok123', status: 'sent' },
    ]);
    updateReturnQueue.push([
      { id: 9, clientToken: 'tok123', status: 'sent' },
    ]);
    const res = await proposalsSendRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposals/9/send', 'POST', { recipientEmail: 'client@example.com' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.proposalUrl).toBe('/proposal/tok123');
  });
});

// ===========================================================================
// GET /api/portal/crm/proposals
// ===========================================================================

describe('GET /api/portal/crm/proposals', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await proposalsRoute.GET(
      makeNextReq('http://x/api/portal/crm/proposals'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await proposalsRoute.GET(
      makeNextReq('http://x/api/portal/crm/proposals'),
    );
    expect(res.status).toBe(404);
  });

  it('returns proposals list without filters', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, title: 'Proposal A', status: 'draft' },
      { id: 2, title: 'Proposal B', status: 'sent' },
    ]);
    const res = await proposalsRoute.GET(
      makeNextReq('http://x/api/portal/crm/proposals'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('applies status, dealId, and search filters', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, title: 'foo bar', status: 'sent' }]);
    const res = await proposalsRoute.GET(
      makeNextReq(
        'http://x/api/portal/crm/proposals?status=sent&dealId=42&search=foo',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

// ===========================================================================
// POST /api/portal/crm/proposals
// ===========================================================================

describe('POST /api/portal/crm/proposals', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await proposalsRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposals', 'POST', { title: 'X' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await proposalsRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposals', 'POST', { title: 'X' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when title is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await proposalsRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposals', 'POST', {}),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/title is required/i);
  });

  it('returns 400 when title is only whitespace', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await proposalsRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposals', 'POST', { title: '   ' }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a proposal with minimal fields and defaults', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    insertReturnQueue.push([
      { id: 100, title: 'My Proposal', status: 'draft' },
    ]);

    const res = await proposalsRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposals', 'POST', {
        title: '  My Proposal  ',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(100);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('crmProposals');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.clientId).toBe(5);
    expect(inserted.title).toBe('My Proposal');
    expect(inserted.summary).toBeNull();
    expect(inserted.status).toBe('draft');
    expect(inserted.currency).toBe('USD');
    expect(inserted.accentColor).toBe('#2563eb');
    expect(inserted.contactId).toBeNull();
    expect(inserted.companyId).toBeNull();
    expect(inserted.dealId).toBeNull();
    expect(inserted.validUntil).toBeNull();
    expect(inserted.logoUrl).toBeNull();
    expect(inserted.coverImageUrl).toBeNull();
    expect(inserted.footerText).toBeNull();
    expect(inserted.sections).toEqual([]);
    expect(inserted.lineItems).toEqual([]);
    expect(inserted.fees).toEqual([]);
    expect(inserted.createdBy).toBe(7);
    expect(typeof inserted.clientToken).toBe('string');
    expect((inserted.clientToken as string).length).toBe(64); // 32 bytes hex
  });

  it('creates a proposal honoring all custom fields', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    insertReturnQueue.push([{ id: 200, title: 'Custom' }]);

    const res = await proposalsRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposals', 'POST', {
        title: 'Custom',
        summary: '  Summary text  ',
        contactId: 11,
        companyId: 22,
        dealId: 33,
        sections: [{ heading: 'h' }],
        lineItems: [{ name: 'x' }],
        fees: [{ name: 'y' }],
        currency: 'EUR',
        validUntil: '2026-06-15T00:00:00Z',
        accentColor: '#ff0000',
        logoUrl: 'https://x/logo.png',
        coverImageUrl: 'https://x/cover.png',
        footerText: '  footer  ',
      }),
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.summary).toBe('Summary text');
    expect(inserted.contactId).toBe(11);
    expect(inserted.companyId).toBe(22);
    expect(inserted.dealId).toBe(33);
    expect(inserted.sections).toEqual([{ heading: 'h' }]);
    expect(inserted.lineItems).toEqual([{ name: 'x' }]);
    expect(inserted.fees).toEqual([{ name: 'y' }]);
    expect(inserted.currency).toBe('EUR');
    expect(inserted.validUntil).toBeInstanceOf(Date);
    expect(inserted.accentColor).toBe('#ff0000');
    expect(inserted.logoUrl).toBe('https://x/logo.png');
    expect(inserted.coverImageUrl).toBe('https://x/cover.png');
    expect(inserted.footerText).toBe('footer');
  });
});

// ===========================================================================
// GET /api/portal/crm/scoring-rules
// ===========================================================================

describe('GET /api/portal/crm/scoring-rules', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await scoringRulesRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await scoringRulesRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns scoring rules list', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, eventType: 'email_open', points: 5, enabled: true },
      { id: 2, eventType: 'page_view', points: 1, enabled: true },
    ]);
    const res = await scoringRulesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

// ===========================================================================
// POST /api/portal/crm/scoring-rules
// ===========================================================================

describe('POST /api/portal/crm/scoring-rules', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await scoringRulesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/scoring-rules', 'POST', {}),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await scoringRulesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/scoring-rules', 'POST', {
        eventType: 'x',
        points: 1,
      }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when eventType is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await scoringRulesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/scoring-rules', 'POST', {
        points: 5,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/event type/i);
  });

  it('returns 400 when eventType is only whitespace', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await scoringRulesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/scoring-rules', 'POST', {
        eventType: '  ',
        points: 5,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when points is not a number', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await scoringRulesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/scoring-rules', 'POST', {
        eventType: 'email_open',
        points: 'five',
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/points/i);
  });

  it('returns 400 when points is missing entirely', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await scoringRulesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/scoring-rules', 'POST', {
        eventType: 'email_open',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a rule with defaults (enabled=true, description=null)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    insertReturnQueue.push([
      { id: 1, eventType: 'email_open', points: 5, enabled: true },
    ]);
    const res = await scoringRulesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/scoring-rules', 'POST', {
        eventType: '  email_open  ',
        points: 5,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.clientId).toBe(5);
    expect(inserted.eventType).toBe('email_open');
    expect(inserted.points).toBe(5);
    expect(inserted.description).toBeNull();
    expect(inserted.enabled).toBe(true);
  });

  it('creates a rule honoring description and enabled=false', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    insertReturnQueue.push([
      { id: 2, eventType: 'page_view', points: -1, enabled: false },
    ]);
    const res = await scoringRulesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/scoring-rules', 'POST', {
        eventType: 'page_view',
        points: -1,
        description: '  Heavy negative  ',
        enabled: false,
      }),
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.description).toBe('Heavy negative');
    expect(inserted.enabled).toBe(false);
    expect(inserted.points).toBe(-1);
  });

  it('accepts points=0 (zero is a valid number)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    insertReturnQueue.push([{ id: 3, eventType: 'noop', points: 0 }]);
    const res = await scoringRulesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/scoring-rules', 'POST', {
        eventType: 'noop',
        points: 0,
      }),
    );
    expect(res.status).toBe(201);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.points).toBe(0);
  });
});

// ===========================================================================
// DELETE /api/portal/crm/tags/[id]
// ===========================================================================

describe('DELETE /api/portal/crm/tags/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await tagsIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/tags/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await tagsIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/tags/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 when id is NaN', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await tagsIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/tags/abc', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid ID');
  });

  it('returns 404 when tag does not exist or is not owned by client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // deleteReturnQueue empty → returning() yields []
    const res = await tagsIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/tags/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Tag not found');
  });

  it('deletes the tag and returns the deleted row', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    deleteReturnQueue.push([{ id: 9, name: 'urgent', clientId: 5 }]);
    const res = await tagsIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/tags/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(9);
    expect(body.data.name).toBe('urgent');
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('crmTags');
  });
});
