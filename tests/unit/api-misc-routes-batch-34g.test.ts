// @vitest-environment node
/**
 * Batch 34g — unit tests for 4 public booking route.ts files.
 *
 * Routes covered:
 *  - app/api/public/booking/[slug]/validate-discount/route.ts  (POST)
 *  - app/api/public/booking/[slug]/waiver/route.ts             (POST)
 *  - app/api/public/booking/by-domain/[domain]/route.ts        (GET)
 *  - app/api/public/booking/by-site/[siteId]/route.ts          (GET)
 *
 * Strategy: heavy mocking — db.select() materializes from a queue of result
 * rows; db.insert is captured and returns from a queue. drizzle-orm operators
 * are inert object factories. The schema module exposes proxy tables.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

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
    bookingPages: wrap('bookingPages'),
    discountCodes: wrap('discountCodes'),
    clientWebsites: wrap('clientWebsites'),
    bookings: wrap('bookings'),
    bookingWaivers: wrap('bookingWaivers'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// db mock: select-queue + insert capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];

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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const validateDiscountRoute = await import(
  '@/app/api/public/booking/[slug]/validate-discount/route'
);
const waiverRoute = await import('@/app/api/public/booking/[slug]/waiver/route');
const byDomainRoute = await import('@/app/api/public/booking/by-domain/[domain]/route');
const bySiteRoute = await import('@/app/api/public/booking/by-site/[siteId]/route');

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

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
});

// ===========================================================================
// POST /api/public/booking/[slug]/validate-discount
// ===========================================================================

describe('POST /api/public/booking/[slug]/validate-discount', () => {
  it('returns 404 when booking page not found', async () => {
    selectQueue.push([]); // page lookup empty

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'SAVE10' }),
      { params: Promise.resolve({ slug: 'missing' }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Booking page not found');
  });

  it('returns 400 when discount codes are not enabled', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: 100,
        enableDiscountCodes: false,
      },
    ]);

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'SAVE10' }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Discount codes are not enabled');
  });

  it('falls back to first active website when page.websiteId is null', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: null,
        enableDiscountCodes: true,
      },
    ]);
    selectQueue.push([{ id: 200 }]); // website lookup
    selectQueue.push([
      {
        code: 'SAVE10',
        description: '10% off',
        discountType: 'percent',
        amount: 1000, // 10% in basis points
        minOrderAmount: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
      },
    ]);

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'save10', subtotal: 10000 }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.code).toBe('SAVE10');
    // 10000 * (1000/10000) = 1000
    expect(body.data.discountAmount).toBe(1000);
  });

  it('returns 400 when no website is configured (page.websiteId null, no fallback)', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: null,
        enableDiscountCodes: true,
      },
    ]);
    selectQueue.push([]); // no website fallback

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'SAVE10' }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('No website configured for discount codes');
  });

  it('returns 400 when code is missing from body', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: 100,
        enableDiscountCodes: true,
      },
    ]);

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', {}),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Discount code is required');
  });

  it('returns 400 when discount code not found', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: 100,
        enableDiscountCodes: true,
      },
    ]);
    selectQueue.push([]); // discount lookup empty

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'NOPE' }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid discount code');
  });

  it('returns 400 when discount has not started yet', async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24);
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: 100,
        enableDiscountCodes: true,
      },
    ]);
    selectQueue.push([
      {
        code: 'FUTURE',
        description: null,
        discountType: 'percent',
        amount: 1000,
        minOrderAmount: null,
        startsAt: futureDate,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
      },
    ]);

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'FUTURE' }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Discount code is not yet active');
  });

  it('returns 400 when discount has expired', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24);
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: 100,
        enableDiscountCodes: true,
      },
    ]);
    selectQueue.push([
      {
        code: 'OLD',
        description: null,
        discountType: 'percent',
        amount: 1000,
        minOrderAmount: null,
        startsAt: null,
        expiresAt: pastDate,
        maxUses: null,
        usedCount: 0,
      },
    ]);

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'OLD' }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Discount code has expired');
  });

  it('returns 400 when discount has been fully redeemed', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: 100,
        enableDiscountCodes: true,
      },
    ]);
    selectQueue.push([
      {
        code: 'DONE',
        description: null,
        discountType: 'percent',
        amount: 1000,
        minOrderAmount: null,
        startsAt: null,
        expiresAt: null,
        maxUses: 5,
        usedCount: 5,
      },
    ]);

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'DONE' }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Discount code has been fully redeemed');
  });

  it('returns 400 when subtotal is below minOrderAmount', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: 100,
        enableDiscountCodes: true,
      },
    ]);
    selectQueue.push([
      {
        code: 'BIGORDER',
        description: null,
        discountType: 'percent',
        amount: 1000,
        minOrderAmount: 5000,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
      },
    ]);

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'BIGORDER', subtotal: 1000 }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Minimum order amount of 5000 not met/);
  });

  it('returns success with no discountAmount when subtotal not provided', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: 100,
        enableDiscountCodes: true,
      },
    ]);
    selectQueue.push([
      {
        code: 'SAVE10',
        description: '10% off',
        discountType: 'percent',
        amount: 1000,
        minOrderAmount: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
      },
    ]);

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'SAVE10' }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.discountAmount).toBeNull();
    expect(body.data.code).toBe('SAVE10');
    expect(body.data.discountType).toBe('percent');
    expect(body.data.amount).toBe(1000);
  });

  it('computes fixed_amount discount capped at subtotal', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: 100,
        enableDiscountCodes: true,
      },
    ]);
    selectQueue.push([
      {
        code: 'FIVE',
        description: 'Five off',
        discountType: 'fixed_amount',
        amount: 500,
        minOrderAmount: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
      },
    ]);

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'FIVE', subtotal: 200 }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.discountAmount).toBe(200); // capped at subtotal
  });

  it('computes fixed_amount discount without capping when amount < subtotal', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        websiteId: 100,
        enableDiscountCodes: true,
      },
    ]);
    selectQueue.push([
      {
        code: 'FIVE',
        description: 'Five off',
        discountType: 'fixed_amount',
        amount: 500,
        minOrderAmount: null,
        startsAt: null,
        expiresAt: null,
        maxUses: null,
        usedCount: 0,
      },
    ]);

    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'FIVE', subtotal: 2000 }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.discountAmount).toBe(500);
  });

  it('returns 500 when params.then throws (caught by try/catch)', async () => {
    const res = await validateDiscountRoute.POST(
      makeJsonReq('http://x/validate', 'POST', { code: 'X' }),
      { params: Promise.reject(new Error('boom')) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Internal server error');
  });
});

// ===========================================================================
// POST /api/public/booking/[slug]/waiver
// ===========================================================================

describe('POST /api/public/booking/[slug]/waiver', () => {
  it('returns 404 when booking page not found', async () => {
    selectQueue.push([]); // page lookup empty

    const res = await waiverRoute.POST(
      makeJsonReq('http://x/waiver', 'POST', {
        bookingId: 1,
        signerName: 'A',
        signerEmail: 'a@b.com',
        signatureData: 'data:image/png;base64,xxx',
      }),
      { params: Promise.resolve({ slug: 'nope' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Booking page not found');
  });

  it('returns 400 when waivers are not enabled', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        enableWaivers: false,
        waiverContent: '',
      },
    ]);

    const res = await waiverRoute.POST(
      makeJsonReq('http://x/waiver', 'POST', {
        bookingId: 1,
        signerName: 'A',
        signerEmail: 'a@b.com',
        signatureData: 'sig',
      }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Waivers are not enabled');
  });

  it('returns 400 when bookingId missing', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        enableWaivers: true,
        waiverContent: 'You agree...',
      },
    ]);

    const res = await waiverRoute.POST(
      makeJsonReq('http://x/waiver', 'POST', {
        signerName: 'A',
        signerEmail: 'a@b.com',
        signatureData: 'sig',
      }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/bookingId, signerName, signerEmail, and signatureData are required/);
  });

  it('returns 400 when signerName is empty/whitespace', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        enableWaivers: true,
        waiverContent: '',
      },
    ]);

    const res = await waiverRoute.POST(
      makeJsonReq('http://x/waiver', 'POST', {
        bookingId: 1,
        signerName: '   ',
        signerEmail: 'a@b.com',
        signatureData: 'sig',
      }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when signerEmail is empty', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        enableWaivers: true,
        waiverContent: '',
      },
    ]);

    const res = await waiverRoute.POST(
      makeJsonReq('http://x/waiver', 'POST', {
        bookingId: 1,
        signerName: 'A',
        signerEmail: '',
        signatureData: 'sig',
      }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when signatureData is missing', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        enableWaivers: true,
        waiverContent: '',
      },
    ]);

    const res = await waiverRoute.POST(
      makeJsonReq('http://x/waiver', 'POST', {
        bookingId: 1,
        signerName: 'A',
        signerEmail: 'a@b.com',
      }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when booking not found for this page', async () => {
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        enableWaivers: true,
        waiverContent: '',
      },
    ]);
    selectQueue.push([]); // booking lookup empty

    const res = await waiverRoute.POST(
      makeJsonReq('http://x/waiver', 'POST', {
        bookingId: 999,
        signerName: 'A',
        signerEmail: 'a@b.com',
        signatureData: 'sig',
      }),
      { params: Promise.resolve({ slug: 'consult' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Booking not found');
  });

  it('inserts waiver with trimmed signer name/email and uses x-forwarded-for first IP', async () => {
    selectQueue.push([
      {
        id: 10,
        clientId: 5,
        enableWaivers: true,
        waiverContent: 'You agree to terms',
      },
    ]);
    selectQueue.push([{ id: 7 }]); // booking lookup
    insertReturnQueue.push([{ id: 99 }]);

    const req = new Request('http://x/waiver', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.5, 198.51.100.2',
        'x-real-ip': '198.51.100.99',
      },
      body: JSON.stringify({
        bookingId: 7,
        signerName: '  Alice  ',
        signerEmail: '  alice@example.com  ',
        signatureData: 'data:image/png;base64,abc',
      }),
    });

    const res = await waiverRoute.POST(req, {
      params: Promise.resolve({ slug: 'consult' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('bookingWaivers');
    expect(insertCalls[0].values).toMatchObject({
      bookingId: 7,
      bookingPageId: 10,
      clientId: 5,
      signerName: 'Alice',
      signerEmail: 'alice@example.com',
      signatureData: 'data:image/png;base64,abc',
      waiverContent: 'You agree to terms',
      ipAddress: '203.0.113.5', // first in x-forwarded-for
    });
  });

  it('falls back to x-real-ip when no x-forwarded-for is set', async () => {
    selectQueue.push([
      {
        id: 10,
        clientId: 5,
        enableWaivers: true,
        waiverContent: null,
      },
    ]);
    selectQueue.push([{ id: 7 }]);
    insertReturnQueue.push([{ id: 1 }]);

    const req = new Request('http://x/waiver', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-real-ip': '192.0.2.1',
      },
      body: JSON.stringify({
        bookingId: 7,
        signerName: 'A',
        signerEmail: 'a@b.com',
        signatureData: 'sig',
      }),
    });

    const res = await waiverRoute.POST(req, {
      params: Promise.resolve({ slug: 'consult' }),
    });
    expect(res.status).toBe(201);
    expect(insertCalls[0].values).toMatchObject({
      ipAddress: '192.0.2.1',
      waiverContent: '', // empty string fallback for null
    });
  });

  it('uses null ip when no headers present', async () => {
    selectQueue.push([
      {
        id: 10,
        clientId: 5,
        enableWaivers: true,
        waiverContent: '',
      },
    ]);
    selectQueue.push([{ id: 7 }]);
    insertReturnQueue.push([{ id: 1 }]);

    const req = new Request('http://x/waiver', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        bookingId: 7,
        signerName: 'A',
        signerEmail: 'a@b.com',
        signatureData: 'sig',
      }),
    });

    const res = await waiverRoute.POST(req, {
      params: Promise.resolve({ slug: 'consult' }),
    });
    expect(res.status).toBe(201);
    expect(insertCalls[0].values).toMatchObject({ ipAddress: null });
  });

  it('returns 500 when params.then throws', async () => {
    const res = await waiverRoute.POST(
      makeJsonReq('http://x/waiver', 'POST', {
        bookingId: 1,
        signerName: 'A',
        signerEmail: 'a@b.com',
        signatureData: 'sig',
      }),
      { params: Promise.reject(new Error('boom')) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Internal server error');
  });
});

// ===========================================================================
// GET /api/public/booking/by-domain/[domain]
// ===========================================================================

describe('GET /api/public/booking/by-domain/[domain]', () => {
  it('returns empty array when site not found by domain', async () => {
    selectQueue.push([]); // site lookup empty

    const res = await byDomainRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ domain: 'unknown.com' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('returns booking pages for the matched site (by domain)', async () => {
    selectQueue.push([{ id: 100, clientId: 5 }]);
    const pages = [
      {
        id: 1,
        title: 'Consult',
        slug: 'consult',
        description: 'desc',
        duration: 30,
        price: 5000,
        priceLabel: '$50',
        color: '#fff',
        maxGuests: 1,
        thumbnail: null,
      },
      {
        id: 2,
        title: 'Deep dive',
        slug: 'deep-dive',
        description: 'desc 2',
        duration: 60,
        price: 10000,
        priceLabel: '$100',
        color: '#000',
        maxGuests: 2,
        thumbnail: 'thumb.png',
      },
    ];
    selectQueue.push(pages);

    const res = await byDomainRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ domain: 'mybrand.com' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(pages);
  });

  it('matches site via bareSubdomain when given <sub>.simplerdevelopment.com', async () => {
    selectQueue.push([{ id: 101, clientId: 6 }]);
    selectQueue.push([]); // no pages

    const res = await byDomainRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ domain: 'acme.simplerdevelopment.com' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it('returns empty pages list when site exists but no booking pages', async () => {
    selectQueue.push([{ id: 102, clientId: 7 }]);
    selectQueue.push([]);

    const res = await byDomainRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ domain: 'acme.com' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

// ===========================================================================
// GET /api/public/booking/by-site/[siteId]
// ===========================================================================

describe('GET /api/public/booking/by-site/[siteId]', () => {
  it('returns 400 when siteId is not a number', async () => {
    const res = await bySiteRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ siteId: 'abc' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid site ID');
  });

  it('returns empty data array when site not found', async () => {
    selectQueue.push([]); // site lookup empty

    const res = await bySiteRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ siteId: '999' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it('returns booking pages for the site', async () => {
    selectQueue.push([{ clientId: 8 }]);
    const pages = [
      {
        id: 1,
        title: 'Free intro',
        slug: 'intro',
        description: null,
        duration: 15,
        price: 0,
        priceLabel: 'Free',
        color: '#abc',
        maxGuests: 1,
        thumbnail: null,
      },
    ];
    selectQueue.push(pages);

    const res = await bySiteRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ siteId: '42' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(pages);
  });

  it('returns empty pages list when site exists but no booking pages', async () => {
    selectQueue.push([{ clientId: 9 }]);
    selectQueue.push([]);

    const res = await bySiteRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ siteId: '7' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it('parses integer siteIds with leading zeros/whitespace as parseInt allows', async () => {
    selectQueue.push([{ clientId: 10 }]);
    selectQueue.push([]);

    const res = await bySiteRoute.GET(makeReq('http://x'), {
      params: Promise.resolve({ siteId: '007' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});
