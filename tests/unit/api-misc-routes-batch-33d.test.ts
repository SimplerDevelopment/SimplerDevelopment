// @vitest-environment node
/**
 * Batch 33d — unit tests for 4 portal "tools" route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/tools/gift-certificates/[id]/route.ts       (GET, PUT)
 *  - app/api/portal/tools/gift-certificates/route.ts            (GET, POST)
 *  - app/api/portal/tools/pitch-decks/[id]/route.ts             (GET, PATCH, DELETE)
 *  - app/api/portal/tools/pitch-decks/[id]/versions/route.ts    (GET, POST)
 *
 * Strategy: heavy mocking — `db.select()` returns a chainable thenable that
 * pulls the next pre-queued array of rows from `selectQueue`. `db.insert` /
 * `db.update` / `db.delete` capture their writes and return queued rows from
 * `insertReturnQueue` / `updateReturnQueue`. auth, getPortalClient,
 * authorizePortal, isAuthError, and the pitch-deck-migration helpers are all
 * mocked so the route handlers exercise their full branching without ever
 * touching a real database or migration logic.
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
const isAuthErrorMock = vi.fn((r: unknown) =>
  Boolean(r && typeof r === 'object' && 'response' in (r as Record<string, unknown>)),
);
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) => isAuthErrorMock(r),
}));

// pitch-deck migration helpers — exercise both the "needs migration" and
// "already v2 / no slides" branches via mock control.
const convertAllSlidesToV2Mock = vi.fn();
const isV2SlidesMock = vi.fn();
vi.mock('@/lib/pitch-deck-migration', () => ({
  convertAllSlidesToV2: (...args: unknown[]) => convertAllSlidesToV2Mock(...args),
  isV2Slides: (...args: unknown[]) => isV2SlidesMock(...args),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
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
  return {
    giftCertificates: wrap('giftCertificates'),
    giftCertificateRedemptions: wrap('giftCertificateRedemptions'),
    pitchDecks: wrap('pitchDecks'),
    pitchDeckVersions: wrap('pitchDeckVersions'),
  };
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
  onConflictDoNothing?: boolean;
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
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
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

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        const call: InsertCall = { table: table.__table, values: v };
        insertCalls.push(call);
        const rows = insertReturnQueue.shift() ?? [];
        const cloned = rows.map((r) => ({ ...r }));
        const tail = {
          returning() {
            return Promise.resolve(cloned);
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned).then(onF, onR);
          },
        };
        return {
          ...tail,
          onConflictDoNothing() {
            call.onConflictDoNothing = true;
            return tail;
          },
        };
      },
    };
  }

  function buildDelete(table: { __table: string }) {
    return {
      where(filter: unknown) {
        deleteCalls.push({ table: table.__table, filter });
        return {
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      delete(table: { __table: string }) {
        return buildDelete(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const giftCertIdRoute = await import(
  '@/app/api/portal/tools/gift-certificates/[id]/route'
);
const giftCertListRoute = await import('@/app/api/portal/tools/gift-certificates/route');
const pitchDeckIdRoute = await import('@/app/api/portal/tools/pitch-decks/[id]/route');
const pitchDeckVersionsRoute = await import(
  '@/app/api/portal/tools/pitch-decks/[id]/versions/route'
);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

import { NextResponse } from 'next/server';

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

const SESSION = { user: { id: '7' } };

function setOk(client: Record<string, unknown> = { id: 5 }) {
  authorizePortalMock.mockResolvedValue({ client, userId: 7, role: 'owner' });
  authMock.mockResolvedValue(SESSION);
  getPortalClientMock.mockResolvedValue(client);
}

function setAuthFail(status = 401) {
  const response = NextResponse.json({ success: false, message: 'Unauthorized' }, { status });
  authorizePortalMock.mockResolvedValue({ response });
}

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  updateReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  convertAllSlidesToV2Mock.mockReset();
  isV2SlidesMock.mockReset();
});

// ===========================================================================
// GET /api/portal/tools/gift-certificates/[id]
// ===========================================================================

describe('GET /api/portal/tools/gift-certificates/[id]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await giftCertIdRoute.GET(
      makeReq('http://x/api/portal/tools/gift-certificates/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns the auth error from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    setAuthFail(403);
    const res = await giftCertIdRoute.GET(
      makeReq('http://x/api/portal/tools/gift-certificates/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when the portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await giftCertIdRoute.GET(
      makeReq('http://x/api/portal/tools/gift-certificates/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the cert does not belong to the client', async () => {
    setOk();
    selectQueue.push([]); // cert lookup empty
    const res = await giftCertIdRoute.GET(
      makeReq('http://x/api/portal/tools/gift-certificates/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns cert and redemption history when found', async () => {
    setOk();
    selectQueue.push([{ id: 42, clientId: 5, code: 'CERT-ABCDEF' }]); // cert
    selectQueue.push([
      { id: 101, giftCertificateId: 42, amount: 500 },
      { id: 102, giftCertificateId: 42, amount: 250 },
    ]);
    const res = await giftCertIdRoute.GET(
      makeReq('http://x/api/portal/tools/gift-certificates/42'),
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);
    expect(body.data.code).toBe('CERT-ABCDEF');
    expect(body.data.redemptions).toHaveLength(2);
    expect(body.data.redemptions[0].id).toBe(101);
  });

  it('returns an empty redemption array when none exist', async () => {
    setOk();
    selectQueue.push([{ id: 7, clientId: 5 }]);
    selectQueue.push([]);
    const res = await giftCertIdRoute.GET(
      makeReq('http://x/api/portal/tools/gift-certificates/7'),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.redemptions).toEqual([]);
  });
});

// ===========================================================================
// PUT /api/portal/tools/gift-certificates/[id]
// ===========================================================================

describe('PUT /api/portal/tools/gift-certificates/[id]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await giftCertIdRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/gift-certificates/1', 'PUT', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns the auth error from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    setAuthFail(403);
    const res = await giftCertIdRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/gift-certificates/1', 'PUT', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when the portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await giftCertIdRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/gift-certificates/1', 'PUT', {}),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the cert is not found', async () => {
    setOk();
    selectQueue.push([]); // cert lookup empty
    const res = await giftCertIdRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/gift-certificates/1', 'PUT', { status: 'redeemed' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('updates only the provided fields', async () => {
    setOk();
    selectQueue.push([{ id: 11, clientId: 5 }]);
    updateReturnQueue.push([{ id: 11, status: 'redeemed' }]);
    const res = await giftCertIdRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/gift-certificates/11', 'PUT', {
        status: 'redeemed',
        recipientName: 'Alice',
      }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const patch = updateCalls[0].patch;
    expect(patch.status).toBe('redeemed');
    expect(patch.recipientName).toBe('Alice');
    expect(patch.updatedAt).toBeInstanceOf(Date);
    expect(patch).not.toHaveProperty('recipientEmail');
    expect(patch).not.toHaveProperty('personalMessage');
  });

  it('converts a non-null expiresAt string into a Date', async () => {
    setOk();
    selectQueue.push([{ id: 12, clientId: 5 }]);
    updateReturnQueue.push([{ id: 12 }]);
    const res = await giftCertIdRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/gift-certificates/12', 'PUT', {
        expiresAt: '2027-01-01T00:00:00Z',
      }),
      { params: Promise.resolve({ id: '12' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.expiresAt).toBeInstanceOf(Date);
  });

  it('passes through null expiresAt when explicitly cleared', async () => {
    setOk();
    selectQueue.push([{ id: 13, clientId: 5 }]);
    updateReturnQueue.push([{ id: 13 }]);
    const res = await giftCertIdRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/gift-certificates/13', 'PUT', {
        expiresAt: null,
      }),
      { params: Promise.resolve({ id: '13' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.expiresAt).toBeNull();
  });

  it('passes through optional message / redeemableAt / recipientEmail', async () => {
    setOk();
    selectQueue.push([{ id: 14, clientId: 5 }]);
    updateReturnQueue.push([{ id: 14 }]);
    const res = await giftCertIdRoute.PUT(
      makeJsonReq('http://x/api/portal/tools/gift-certificates/14', 'PUT', {
        personalMessage: 'Hi!',
        redeemableAt: 'website',
        recipientEmail: 'r@x',
      }),
      { params: Promise.resolve({ id: '14' }) },
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.personalMessage).toBe('Hi!');
    expect(patch.redeemableAt).toBe('website');
    expect(patch.recipientEmail).toBe('r@x');
  });
});

// ===========================================================================
// GET /api/portal/tools/gift-certificates
// ===========================================================================

describe('GET /api/portal/tools/gift-certificates', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await giftCertListRoute.GET(
      makeReq('http://x/api/portal/tools/gift-certificates'),
    );
    expect(res.status).toBe(401);
  });

  it('returns the auth error from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    setAuthFail(403);
    const res = await giftCertListRoute.GET(
      makeReq('http://x/api/portal/tools/gift-certificates'),
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when the portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await giftCertListRoute.GET(
      makeReq('http://x/api/portal/tools/gift-certificates'),
    );
    expect(res.status).toBe(401);
  });

  it('returns the list of gift certificates for the client', async () => {
    setOk();
    selectQueue.push([
      { id: 1, clientId: 5, code: 'CERT-ONE' },
      { id: 2, clientId: 5, code: 'CERT-TWO' },
    ]);
    const res = await giftCertListRoute.GET(
      makeReq('http://x/api/portal/tools/gift-certificates'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });

  it('returns an empty list when none exist', async () => {
    setOk();
    selectQueue.push([]);
    const res = await giftCertListRoute.GET(
      makeReq('http://x/api/portal/tools/gift-certificates'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/tools/gift-certificates
// ===========================================================================

describe('POST /api/portal/tools/gift-certificates', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await giftCertListRoute.POST(
      makeJsonReq('http://x/api/portal/tools/gift-certificates', 'POST', { amount: 1000 }),
    );
    expect(res.status).toBe(401);
  });

  it('returns the auth error from authorizePortal', async () => {
    authMock.mockResolvedValue(SESSION);
    setAuthFail(403);
    const res = await giftCertListRoute.POST(
      makeJsonReq('http://x/api/portal/tools/gift-certificates', 'POST', { amount: 1000 }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 401 when the portal client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await giftCertListRoute.POST(
      makeJsonReq('http://x/api/portal/tools/gift-certificates', 'POST', { amount: 1000 }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when amount is missing', async () => {
    setOk();
    const res = await giftCertListRoute.POST(
      makeJsonReq('http://x/api/portal/tools/gift-certificates', 'POST', {}),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/minimum amount/i);
  });

  it('returns 400 when amount is below 100 cents', async () => {
    setOk();
    const res = await giftCertListRoute.POST(
      makeJsonReq('http://x/api/portal/tools/gift-certificates', 'POST', { amount: 99 }),
    );
    expect(res.status).toBe(400);
  });

  it('creates a cert with sensible defaults and a unique code', async () => {
    setOk({ id: 5, company: 'Acme Co' });
    selectQueue.push([]); // unique-code lookup: no collision on first attempt
    insertReturnQueue.push([
      {
        id: 999,
        clientId: 5,
        code: 'CERT-XYZABC',
        initialAmount: 1000,
        remainingAmount: 1000,
      },
    ]);
    const res = await giftCertListRoute.POST(
      makeJsonReq('http://x/api/portal/tools/gift-certificates', 'POST', {
        amount: 1000,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(999);
    expect(insertCalls).toHaveLength(1);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.clientId).toBe(5);
    expect(v.websiteId).toBeNull();
    expect(typeof v.code).toBe('string');
    expect(v.code).toMatch(/^CERT-[A-Z2-9]{6}$/);
    expect(v.initialAmount).toBe(1000);
    expect(v.remainingAmount).toBe(1000);
    expect(v.status).toBe('active');
    expect(v.paymentStatus).toBe('paid');
    expect(v.purchaserName).toBe('Acme Co');
    expect(v.purchaserEmail).toBe('');
    expect(v.recipientName).toBeNull();
    expect(v.recipientEmail).toBeNull();
    expect(v.personalMessage).toBeNull();
    expect(v.redeemableAt).toBe('both');
  });

  it('falls back to "Admin" when client has no company name', async () => {
    setOk({ id: 5 }); // no company
    selectQueue.push([]); // no collision
    insertReturnQueue.push([{ id: 1000 }]);
    const res = await giftCertListRoute.POST(
      makeJsonReq('http://x/api/portal/tools/gift-certificates', 'POST', { amount: 500 }),
    );
    expect(res.status).toBe(201);
    expect((insertCalls[0].values as Record<string, unknown>).purchaserName).toBe('Admin');
  });

  it('uses provided purchaser/recipient/website fields when given', async () => {
    setOk();
    selectQueue.push([]);
    insertReturnQueue.push([{ id: 1001 }]);
    const res = await giftCertListRoute.POST(
      makeJsonReq('http://x/api/portal/tools/gift-certificates', 'POST', {
        amount: 2500,
        websiteId: 8,
        purchaserName: 'Bob',
        purchaserEmail: 'bob@x',
        recipientName: 'Carol',
        recipientEmail: 'carol@x',
        personalMessage: 'Happy birthday!',
        redeemableAt: 'in_person',
      }),
    );
    expect(res.status).toBe(201);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.websiteId).toBe(8);
    expect(v.purchaserName).toBe('Bob');
    expect(v.purchaserEmail).toBe('bob@x');
    expect(v.recipientName).toBe('Carol');
    expect(v.recipientEmail).toBe('carol@x');
    expect(v.personalMessage).toBe('Happy birthday!');
    expect(v.redeemableAt).toBe('in_person');
  });

  it('retries code generation on collisions', async () => {
    setOk();
    // First attempt collides, second attempt is free.
    selectQueue.push([{ id: 1 }]); // collision
    selectQueue.push([]); // free
    insertReturnQueue.push([{ id: 1002 }]);
    const res = await giftCertListRoute.POST(
      makeJsonReq('http://x/api/portal/tools/gift-certificates', 'POST', { amount: 500 }),
    );
    expect(res.status).toBe(201);
    // Two select calls for uniqueness check
    expect(insertCalls).toHaveLength(1);
  });
});

// ===========================================================================
// GET /api/portal/tools/pitch-decks/[id]
// ===========================================================================

describe('GET /api/portal/tools/pitch-decks/[id]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await pitchDeckIdRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await pitchDeckIdRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the deck does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // deck lookup empty
    const res = await pitchDeckIdRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/1'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns the deck when already v2 (no migration performed)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const v2Slides = [{ id: 's1', blocks: [] }];
    selectQueue.push([
      {
        id: 42,
        clientId: 5,
        formatVersion: 2,
        slides: v2Slides,
      },
    ]);
    // Even if it asked: isV2Slides would say true; but it shouldn't be called
    // because formatVersion === 2 short-circuits the condition.
    isV2SlidesMock.mockReturnValue(true);
    const res = await pitchDeckIdRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/42'),
      { params: Promise.resolve({ id: '42' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);
    expect(updateCalls).toHaveLength(0);
    expect(convertAllSlidesToV2Mock).not.toHaveBeenCalled();
  });

  it('does not migrate when deck has no slides', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      {
        id: 43,
        clientId: 5,
        formatVersion: 1,
        slides: [],
      },
    ]);
    const res = await pitchDeckIdRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/43'),
      { params: Promise.resolve({ id: '43' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(0);
    expect(convertAllSlidesToV2Mock).not.toHaveBeenCalled();
  });

  it('migrates a v1 deck to v2 on read', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const v1Slides = [{ id: 's1', layout: 'cover', title: 'Old' }];
    const v2Slides = [{ id: 's1', blocks: [{ type: 'heading', value: 'Old' }] }];
    selectQueue.push([
      {
        id: 44,
        clientId: 5,
        formatVersion: 1,
        slides: v1Slides,
      },
    ]);
    isV2SlidesMock.mockReturnValue(false);
    convertAllSlidesToV2Mock.mockReturnValue(v2Slides);
    updateReturnQueue.push([{ id: 44 }]);
    const res = await pitchDeckIdRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/44'),
      { params: Promise.resolve({ id: '44' }) },
    );
    expect(res.status).toBe(200);
    expect(convertAllSlidesToV2Mock).toHaveBeenCalledTimes(1);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.slides).toEqual(v2Slides);
    expect(updateCalls[0].patch.formatVersion).toBe(2);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    const body = await res.json();
    expect(body.data.slides).toEqual(v2Slides);
    expect(body.data.formatVersion).toBe(2);
  });

  it('skips migration when isV2Slides reports true even with formatVersion !== 2', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const slides = [{ id: 's1', blocks: [] }];
    selectQueue.push([
      {
        id: 45,
        clientId: 5,
        formatVersion: 1,
        slides,
      },
    ]);
    isV2SlidesMock.mockReturnValue(true);
    const res = await pitchDeckIdRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/45'),
      { params: Promise.resolve({ id: '45' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(0);
    expect(convertAllSlidesToV2Mock).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// PATCH /api/portal/tools/pitch-decks/[id]
// ===========================================================================

describe('PATCH /api/portal/tools/pitch-decks/[id]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await pitchDeckIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1', 'PATCH', { title: 'X' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the deck does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // deck lookup empty
    const res = await pitchDeckIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1', 'PATCH', { title: 'X' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('trims title, status, slides (and bumps formatVersion to 2)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 10, clientId: 5, slug: 'old-slug' }]);
    updateReturnQueue.push([{ id: 10 }]);
    const slides = [{ id: 's1', blocks: [] }];
    const res = await pitchDeckIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/10', 'PATCH', {
        title: '  Hello  ',
        status: 'draft',
        slides,
        theme: { background: '#fff' },
      }),
      { params: Promise.resolve({ id: '10' }) },
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.title).toBe('Hello');
    expect(patch.status).toBe('draft');
    expect(patch.slides).toEqual(slides);
    expect(patch.formatVersion).toBe(2);
    expect(patch.theme).toEqual({ background: '#fff' });
  });

  it('normalizes null-ish description and sourceUrl to null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 11, clientId: 5, slug: 's' }]);
    updateReturnQueue.push([{ id: 11 }]);
    const res = await pitchDeckIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/11', 'PATCH', {
        description: '',
        sourceUrl: '',
      }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.description).toBeNull();
    expect(updateCalls[0].patch.sourceUrl).toBeNull();
  });

  it('passes through SEO fields with trimming + noIndex coerced to bool', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 12, clientId: 5, slug: 's' }]);
    updateReturnQueue.push([{ id: 12 }]);
    const res = await pitchDeckIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/12', 'PATCH', {
        seoTitle: '  My Title ',
        seoDescription: ' Desc ',
        ogImage: ' http://img ',
        canonicalUrl: ' http://x ',
        noIndex: 1, // truthy non-bool
      }),
      { params: Promise.resolve({ id: '12' }) },
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.seoTitle).toBe('My Title');
    expect(patch.seoDescription).toBe('Desc');
    expect(patch.ogImage).toBe('http://img');
    expect(patch.canonicalUrl).toBe('http://x');
    expect(patch.noIndex).toBe(true);
  });

  it('clears SEO fields to null when emptied', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 13, clientId: 5, slug: 's' }]);
    updateReturnQueue.push([{ id: 13 }]);
    const res = await pitchDeckIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/13', 'PATCH', {
        seoTitle: '',
        seoDescription: '',
        ogImage: '',
        canonicalUrl: '',
      }),
      { params: Promise.resolve({ id: '13' }) },
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.seoTitle).toBeNull();
    expect(patch.seoDescription).toBeNull();
    expect(patch.ogImage).toBeNull();
    expect(patch.canonicalUrl).toBeNull();
  });

  it('returns 400 when slug normalizes to empty', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 20, clientId: 5, slug: 'old' }]);
    const res = await pitchDeckIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/20', 'PATCH', { slug: '!!!' }),
      { params: Promise.resolve({ id: '20' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/slug must contain/i);
  });

  it('keeps slug unchanged when normalized matches current', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 21, clientId: 5, slug: 'cool-deck' }]);
    updateReturnQueue.push([{ id: 21 }]);
    const res = await pitchDeckIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/21', 'PATCH', {
        slug: 'Cool Deck',
      }),
      { params: Promise.resolve({ id: '21' }) },
    );
    expect(res.status).toBe(200);
    // Since normalized === deck.slug, updates.slug is not set.
    expect(updateCalls[0].patch).not.toHaveProperty('slug');
  });

  it('returns 409 when the new slug collides with another deck', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 22, clientId: 5, slug: 'old' }]);
    selectQueue.push([{ id: 99 }]); // collision
    const res = await pitchDeckIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/22', 'PATCH', {
        slug: 'new-one',
      }),
      { params: Promise.resolve({ id: '22' }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toMatch(/already used/i);
  });

  it('updates to a new normalized slug when no collision', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 23, clientId: 5, slug: 'old' }]);
    selectQueue.push([]); // no collision
    updateReturnQueue.push([{ id: 23 }]);
    const res = await pitchDeckIdRoute.PATCH(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/23', 'PATCH', {
        slug: 'Brand New!!',
      }),
      { params: Promise.resolve({ id: '23' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.slug).toBe('brand-new');
  });
});

// ===========================================================================
// DELETE /api/portal/tools/pitch-decks/[id]
// ===========================================================================

describe('DELETE /api/portal/tools/pitch-decks/[id]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await pitchDeckIdRoute.DELETE(
      makeReq('http://x/api/portal/tools/pitch-decks/1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when the deck does not belong to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // deck lookup empty
    const res = await pitchDeckIdRoute.DELETE(
      makeReq('http://x/api/portal/tools/pitch-decks/1', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('deletes the deck and returns success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 50, clientId: 5 }]);
    const res = await pitchDeckIdRoute.DELETE(
      makeReq('http://x/api/portal/tools/pitch-decks/50', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '50' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('pitchDecks');
  });
});

// ===========================================================================
// GET /api/portal/tools/pitch-decks/[id]/versions
// ===========================================================================

describe('GET /api/portal/tools/pitch-decks/[id]/versions', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await pitchDeckVersionsRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/1/versions'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await pitchDeckVersionsRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/1/versions'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the deck is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await pitchDeckVersionsRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/1/versions'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns version metadata with computed slideCount', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 70, clientId: 5 }]);
    selectQueue.push([
      {
        id: 100,
        label: 'v1',
        trigger: 'manual',
        slideCount: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        id: 101,
        label: null,
        trigger: 'auto',
        slideCount: null, // exercise non-array branch
        createdAt: new Date('2026-01-02T00:00:00Z'),
      },
    ]);
    const res = await pitchDeckVersionsRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/70/versions'),
      { params: Promise.resolve({ id: '70' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].slideCount).toBe(3);
    expect(body.data[1].slideCount).toBe(0);
    expect(body.data[0].label).toBe('v1');
    expect(body.data[1].trigger).toBe('auto');
  });

  it('returns empty array when no versions exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 71, clientId: 5 }]);
    selectQueue.push([]);
    const res = await pitchDeckVersionsRoute.GET(
      makeReq('http://x/api/portal/tools/pitch-decks/71/versions'),
      { params: Promise.resolve({ id: '71' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/tools/pitch-decks/[id]/versions
// ===========================================================================

describe('POST /api/portal/tools/pitch-decks/[id]/versions', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await pitchDeckVersionsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions', 'POST', { label: 'x' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await pitchDeckVersionsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions', 'POST', { label: 'x' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when the deck is not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await pitchDeckVersionsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/1/versions', 'POST', { label: 'x' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
  });

  it('creates a manual version checkpoint from the deck snapshot', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const slides = [{ id: 's1' }, { id: 's2' }];
    const theme = { background: '#000' };
    selectQueue.push([{ id: 80, clientId: 5, slides, theme }]);
    insertReturnQueue.push([
      {
        id: 500,
        label: 'cool',
        trigger: 'manual',
        slides,
        createdAt: new Date('2026-01-10T00:00:00Z'),
      },
    ]);
    const res = await pitchDeckVersionsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/80/versions', 'POST', {
        label: '  cool  ',
      }),
      { params: Promise.resolve({ id: '80' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(500);
    expect(body.data.label).toBe('cool');
    expect(body.data.slideCount).toBe(2);
    expect(insertCalls).toHaveLength(1);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.deckId).toBe(80);
    expect(v.slides).toEqual(slides);
    expect(v.theme).toEqual(theme);
    expect(v.label).toBe('cool');
    expect(v.trigger).toBe('manual');
    expect(v.createdBy).toBe(7);
  });

  it('treats empty label as null and defaults missing slides/theme', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 81, clientId: 5, slides: null, theme: null }]);
    insertReturnQueue.push([
      {
        id: 501,
        label: null,
        trigger: 'manual',
        slides: [],
        createdAt: new Date(),
      },
    ]);
    const res = await pitchDeckVersionsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/81/versions', 'POST', {
        label: '   ',
      }),
      { params: Promise.resolve({ id: '81' }) },
    );
    expect(res.status).toBe(200);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.label).toBeNull();
    expect(v.slides).toEqual([]);
    expect(v.theme).toEqual({});
  });

  it('handles non-JSON body via .catch fallback', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 82, clientId: 5, slides: [], theme: {} }]);
    insertReturnQueue.push([
      { id: 502, label: null, trigger: 'manual', slides: [], createdAt: new Date() },
    ]);
    // Manually craft a Request with a body that cannot be parsed as JSON,
    // so the route's `.catch(() => ({ label: null }))` branch fires.
    const req = new Request('http://x/api/portal/tools/pitch-decks/82/versions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{',
    });
    const res = await pitchDeckVersionsRoute.POST(req, {
      params: Promise.resolve({ id: '82' }),
    });
    expect(res.status).toBe(200);
    const v = insertCalls[0].values as Record<string, unknown>;
    expect(v.label).toBeNull();
  });

  it('handles a non-array slides field with slideCount=0 in the echo', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 83, clientId: 5, slides: [], theme: {} }]);
    // Insert returns a row with slides=null to exercise the !Array.isArray
    // branch in the response shape.
    insertReturnQueue.push([
      { id: 503, label: 'x', trigger: 'manual', slides: null, createdAt: new Date() },
    ]);
    const res = await pitchDeckVersionsRoute.POST(
      makeJsonReq('http://x/api/portal/tools/pitch-decks/83/versions', 'POST', { label: 'x' }),
      { params: Promise.resolve({ id: '83' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slideCount).toBe(0);
  });
});
