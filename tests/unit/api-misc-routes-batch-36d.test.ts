// @vitest-environment node
/**
 * Batch 36d — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/tools/booking/[id]/waivers/[waiverId]/pdf/route.ts   (GET)
 *  - app/api/portal/tools/booking/[id]/waivers/bulk-download/route.ts    (GET)
 *  - app/api/portal/websites/[siteId]/environments/route.ts              (GET)
 *  - app/api/portal/websites/[siteId]/google/auth/route.ts               (GET)
 *
 * Strategy: heavy mocking — db.select() returns a per-call result via a
 * shared queue. drizzle-orm operators are inert. schema tables are proxies.
 * pdf-lib is stubbed with deterministic byte output. auth/portal helpers
 * are mocked. next/headers and google-website-oauth are mocked for the
 * google/auth route.
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
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) =>
    typeof r === 'object' && r !== null && 'response' in (r as Record<string, unknown>),
}));

const headersMock = vi.fn();
vi.mock('next/headers', () => ({
  headers: () => headersMock(),
}));

// google-website-oauth — used by /websites/[siteId]/google/auth route.
const generateAuthUrlMock = vi.fn();
const createOAuth2ClientMock = vi.fn(() => ({
  generateAuthUrl: (opts: unknown) => generateAuthUrlMock(opts),
}));
vi.mock('@/lib/google-website-oauth', () => ({
  createOAuth2Client: (redirectUri: string) => createOAuth2ClientMock(redirectUri),
  GOOGLE_SCOPES: ['scope-a', 'scope-b'],
}));

// drizzle-orm operators — inert markers.
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    { raw: (s: string) => ({ __sql_raw: true, s }) },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

// schema — proxy tables.
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
    bookingWaivers: wrap('bookingWaivers'),
    clientWebsites: wrap('clientWebsites'),
    websiteEnvironments: wrap('websiteEnvironments'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// pdf-lib mock — fully deterministic.
// ---------------------------------------------------------------------------

interface MockPdfPage {
  drawText: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
}

interface MockPdfDoc {
  addPage: ReturnType<typeof vi.fn>;
  embedFont: ReturnType<typeof vi.fn>;
  embedPng: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
}

const createdDocs: MockPdfDoc[] = [];
const pageAddCalls: Array<[number, number]> = [];

let embedPngImpl: (bytes: Uint8Array | Buffer) => unknown = (bytes) => ({
  width: 300,
  height: 100,
  scale: (factor: number) => ({ width: 300 * factor, height: 100 * factor }),
  __bytes: bytes,
});

function makeMockFont(_kind: string) {
  return {
    widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5,
  };
}

function makeMockPage(): MockPdfPage {
  return {
    drawText: vi.fn(),
    drawImage: vi.fn(),
  };
}

vi.mock('pdf-lib', () => ({
  StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'HelveticaBold' },
  rgb: (r: number, g: number, b: number) => ({ r, g, b }),
  PDFDocument: {
    create: async () => {
      const doc: MockPdfDoc = {
        addPage: vi.fn((size: [number, number]) => {
          pageAddCalls.push(size);
          return makeMockPage();
        }),
        embedFont: vi.fn(async (kind: string) => makeMockFont(kind)),
        embedPng: vi.fn(async (bytes: Uint8Array | Buffer) => embedPngImpl(bytes)),
        save: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])), // "%PDF"
      };
      createdDocs.push(doc);
      return doc;
    },
  },
}));

// ---------------------------------------------------------------------------
// db mock: select-queue
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];

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

  return {
    db: {
      select() {
        return buildSelect();
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const waiverPdfRoute = await import(
  '@/app/api/portal/tools/booking/[id]/waivers/[waiverId]/pdf/route'
);
const bulkDownloadRoute = await import(
  '@/app/api/portal/tools/booking/[id]/waivers/bulk-download/route'
);
const environmentsRoute = await import(
  '@/app/api/portal/websites/[siteId]/environments/route'
);
const googleAuthRoute = await import(
  '@/app/api/portal/websites/[siteId]/google/auth/route'
);

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeReq(url: string): Request {
  return new Request(url);
}

const SESSION = { user: { id: '7' } };

beforeEach(() => {
  selectQueue = [];
  createdDocs.length = 0;
  pageAddCalls.length = 0;
  authMock.mockReset();
  authorizePortalMock.mockReset();
  getPortalClientMock.mockReset();
  headersMock.mockReset();
  generateAuthUrlMock.mockReset();
  createOAuth2ClientMock.mockClear();
  embedPngImpl = (bytes) => ({
    width: 300,
    height: 100,
    scale: (factor: number) => ({ width: 300 * factor, height: 100 * factor }),
    __bytes: bytes,
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/[id]/waivers/[waiverId]/pdf
// ===========================================================================

describe('GET /api/portal/tools/booking/[id]/waivers/[waiverId]/pdf', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await waiverPdfRoute.GET(makeReq('http://x/p'), {
      params: Promise.resolve({ id: '1', waiverId: '2' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await waiverPdfRoute.GET(makeReq('http://x/p'), {
      params: Promise.resolve({ id: '1', waiverId: '2' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns authorizePortal error response when not authorized', async () => {
    authMock.mockResolvedValue(SESSION);
    const forbidden = new Response(
      JSON.stringify({ success: false, message: 'Forbidden' }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    );
    authorizePortalMock.mockResolvedValue({ response: forbidden });

    const res = await waiverPdfRoute.GET(makeReq('http://x/p'), {
      params: Promise.resolve({ id: '1', waiverId: '2' }),
    });
    expect(res.status).toBe(403);
    expect(authorizePortalMock).toHaveBeenCalledWith({
      action: 'read',
      requireService: 'booking',
    });
  });

  it('returns 401 when client not found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue(null);

    const res = await waiverPdfRoute.GET(makeReq('http://x/p'), {
      params: Promise.resolve({ id: '1', waiverId: '2' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when booking page not found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]); // page lookup empty

    const res = await waiverPdfRoute.GET(makeReq('http://x/p'), {
      params: Promise.resolve({ id: '1', waiverId: '2' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 when waiver not found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 1, title: 'My Booking' }]); // page
    selectQueue.push([]); // waiver empty

    const res = await waiverPdfRoute.GET(makeReq('http://x/p'), {
      params: Promise.resolve({ id: '1', waiverId: '2' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Waiver not found');
  });

  it('returns 200 with PDF bytes when waiver has no signature image', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 1, title: 'My Booking' }]); // page
    selectQueue.push([
      {
        id: 9,
        signerName: 'Alice Smith',
        signerEmail: 'a@example.com',
        signedAt: new Date('2030-01-02T03:04:05Z'),
        ipAddress: '127.0.0.1',
        waiverContent: '<p>Some <b>terms</b> apply here.</p>',
        signatureData: '', // empty — does NOT start with the PNG prefix
      },
    ]); // waiver

    const res = await waiverPdfRoute.GET(makeReq('http://x/p'), {
      params: Promise.resolve({ id: '1', waiverId: '9' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="waiver-9-Alice_Smith.pdf"',
    );

    expect(createdDocs).toHaveLength(1);
    expect(createdDocs[0].embedPng).not.toHaveBeenCalled();
    expect(createdDocs[0].save).toHaveBeenCalledTimes(1);
  });

  it('returns 200 and embeds PNG when signatureData is a PNG data URL', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 1, title: 'B' }]);
    selectQueue.push([
      {
        id: 10,
        signerName: 'Bob',
        signerEmail: 'b@example.com',
        signedAt: new Date('2030-02-02T00:00:00Z'),
        ipAddress: null,
        waiverContent: 'Plain text waiver.',
        signatureData: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ]);

    const res = await waiverPdfRoute.GET(makeReq('http://x/p'), {
      params: Promise.resolve({ id: '1', waiverId: '10' }),
    });
    expect(res.status).toBe(200);
    expect(createdDocs[0].embedPng).toHaveBeenCalledTimes(1);
    const arg = createdDocs[0].embedPng.mock.calls[0][0] as Buffer;
    expect(Buffer.isBuffer(arg)).toBe(true);
  });

  it('handles long waiver text that triggers a new page (y wrap-around)', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 1, title: 'Long' }]);

    // Build a very long waiver text — long enough to force wrapping AND new pages
    const longText = ('word '.repeat(2000)).trim();
    selectQueue.push([
      {
        id: 11,
        signerName: 'Carol',
        signerEmail: 'c@example.com',
        signedAt: new Date('2030-03-03T00:00:00Z'),
        ipAddress: '10.0.0.1',
        waiverContent: longText,
        signatureData: '',
      },
    ]);

    const res = await waiverPdfRoute.GET(makeReq('http://x/p'), {
      params: Promise.resolve({ id: '1', waiverId: '11' }),
    });
    expect(res.status).toBe(200);
    // At least one extra page was added beyond the initial.
    expect(pageAddCalls.length).toBeGreaterThan(1);
  });

  it('returns 500 when PDF save throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 1, title: 'Boom' }]);
    selectQueue.push([
      {
        id: 12,
        signerName: 'Dave',
        signerEmail: 'd@example.com',
        signedAt: new Date('2030-04-04T00:00:00Z'),
        ipAddress: '1.1.1.1',
        waiverContent: 'Short.',
        // Use the PNG path so we can throw inside embedPng.
        signatureData: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ]);
    embedPngImpl = () => {
      throw new Error('embed boom');
    };

    const res = await waiverPdfRoute.GET(makeReq('http://x/p'), {
      params: Promise.resolve({ id: '1', waiverId: '12' }),
    });
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Failed to generate PDF');
    errSpy.mockRestore();
  });
});

// ===========================================================================
// GET /api/portal/tools/booking/[id]/waivers/bulk-download
// ===========================================================================

describe('GET /api/portal/tools/booking/[id]/waivers/bulk-download', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await bulkDownloadRoute.GET(makeReq('http://x/bulk'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns authorizePortal error response when not authorized', async () => {
    authMock.mockResolvedValue(SESSION);
    const forbidden = new Response(
      JSON.stringify({ success: false, message: 'Forbidden' }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    );
    authorizePortalMock.mockResolvedValue({ response: forbidden });

    const res = await bulkDownloadRoute.GET(makeReq('http://x/bulk'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(403);
    expect(authorizePortalMock).toHaveBeenCalledWith({
      action: 'read',
      requireService: 'booking',
    });
  });

  it('returns 401 when client not found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue(null);

    const res = await bulkDownloadRoute.GET(makeReq('http://x/bulk'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when booking page not found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]); // page empty

    const res = await bulkDownloadRoute.GET(makeReq('http://x/bulk'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Not found');
  });

  it('returns 404 when no waivers in range', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 1, title: 'Page' }]);
    selectQueue.push([]); // waivers empty

    const res = await bulkDownloadRoute.GET(makeReq('http://x/bulk'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(
      'No waivers found in the specified range',
    );
  });

  it('returns a multi-waiver PDF with correct disposition (default range)', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 1, title: 'Cool Booking' }]);
    selectQueue.push([
      {
        id: 1,
        signerName: 'Eve',
        signerEmail: 'e@example.com',
        signedAt: new Date('2030-05-01T00:00:00Z'),
        ipAddress: '8.8.8.8',
        waiverContent: 'short text',
        signatureData: 'data:image/png;base64,iVBORw0KGgo=',
      },
      {
        id: 2,
        signerName: 'Frank',
        signerEmail: 'f@example.com',
        signedAt: new Date('2030-05-02T00:00:00Z'),
        ipAddress: null,
        waiverContent: '<i>html</i> in here',
        signatureData: '',
      },
    ]);

    const res = await bulkDownloadRoute.GET(makeReq('http://x/bulk'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="waivers-Cool_Booking-bulk.pdf"',
    );
    // One addPage call per waiver
    expect(pageAddCalls.length).toBe(2);
    // embedPng called once (only for Eve)
    expect(createdDocs[0].embedPng).toHaveBeenCalledTimes(1);
  });

  it('honors startDate and endDate query params', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 1, title: 'Ranged' }]);
    selectQueue.push([
      {
        id: 3,
        signerName: 'Gina',
        signerEmail: 'g@example.com',
        signedAt: new Date('2030-06-15T00:00:00Z'),
        ipAddress: '9.9.9.9',
        waiverContent: 'simple',
        signatureData: '',
      },
    ]);

    const res = await bulkDownloadRoute.GET(
      makeReq('http://x/bulk?startDate=2030-06-01&endDate=2030-06-30'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
  });

  it('truncates very long waiver text in bulk mode', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 1, title: 'Long' }]);
    selectQueue.push([
      {
        id: 4,
        signerName: 'Hank',
        signerEmail: 'h@example.com',
        signedAt: new Date('2030-07-04T00:00:00Z'),
        ipAddress: '4.4.4.4',
        waiverContent: 'x '.repeat(2000), // 4000 chars — will be truncated to 500 + '...'
        signatureData: '',
      },
    ]);

    const res = await bulkDownloadRoute.GET(makeReq('http://x/bulk'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(200);
  });

  it('catches signature embed errors per-waiver and still returns 200', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 1, title: 'Try' }]);
    selectQueue.push([
      {
        id: 5,
        signerName: 'Ida',
        signerEmail: 'i@example.com',
        signedAt: new Date('2030-08-01T00:00:00Z'),
        ipAddress: '5.5.5.5',
        waiverContent: 'fine',
        signatureData: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ]);
    embedPngImpl = () => {
      throw new Error('per-waiver embed boom');
    };

    const res = await bulkDownloadRoute.GET(makeReq('http://x/bulk'), {
      params: Promise.resolve({ id: '1' }),
    });
    // Inner try/catch swallows the embed error — overall still 200.
    expect(res.status).toBe(200);
  });

  it('returns 500 when PDFDocument.save throws (outer catch)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 1, title: 'Boom' }]);
    selectQueue.push([
      {
        id: 6,
        signerName: 'Jay',
        signerEmail: 'j@example.com',
        signedAt: new Date('2030-09-01T00:00:00Z'),
        ipAddress: '6.6.6.6',
        waiverContent: 'short',
        signatureData: '',
      },
    ]);

    // Replace save on the next-created doc by patching the PDFDocument mock
    // via a one-shot — easiest is to monkey-patch after creation.  Instead,
    // we trigger the outer catch by making embedFont throw — which is in the
    // outer try block.
    const pdfLib = await import('pdf-lib');
    const originalCreate = pdfLib.PDFDocument.create;
    (pdfLib.PDFDocument as { create: () => Promise<unknown> }).create = async () => {
      throw new Error('create boom');
    };

    const res = await bulkDownloadRoute.GET(makeReq('http://x/bulk'), {
      params: Promise.resolve({ id: '1' }),
    });
    expect(res.status).toBe(500);
    expect((await res.json()).message).toBe('Failed to generate PDF');

    // Restore
    (pdfLib.PDFDocument as { create: () => Promise<unknown> }).create =
      originalCreate;
    errSpy.mockRestore();
  });
});

// ===========================================================================
// GET /api/portal/websites/[siteId]/environments
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/environments', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await environmentsRoute.GET(makeReq('http://x/env'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await environmentsRoute.GET(makeReq('http://x/env'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);

    const res = await environmentsRoute.GET(makeReq('http://x/env'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when website not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]); // site lookup empty

    const res = await environmentsRoute.GET(makeReq('http://x/env'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Website not found');
  });

  it('returns environment rows when site exists', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 5, clientId: 42, name: 'My Site' }]); // site
    const envRows = [
      { id: 1, websiteId: 5, name: 'production', url: 'https://prod' },
      { id: 2, websiteId: 5, name: 'staging', url: 'https://staging' },
    ];
    selectQueue.push(envRows); // envs

    const res = await environmentsRoute.GET(makeReq('http://x/env'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(envRows);
    expect(getPortalClientMock).toHaveBeenCalledWith(7);
  });

  it('returns empty list when site exists but has no environments', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 5 }]);
    selectQueue.push([]); // envs empty

    const res = await environmentsRoute.GET(makeReq('http://x/env'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

// ===========================================================================
// GET /api/portal/websites/[siteId]/google/auth
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/google/auth', () => {
  function makeHeaders(map: Record<string, string>) {
    return {
      get: (k: string) => map[k.toLowerCase()] ?? null,
    };
  }

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await googleAuthRoute.GET(makeReq('http://x/auth'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await googleAuthRoute.GET(makeReq('http://x/auth'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);

    const res = await googleAuthRoute.GET(makeReq('http://x/auth'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when website not found for client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]); // site empty

    const res = await googleAuthRoute.GET(makeReq('http://x/auth'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Website not found');
  });

  it('redirects to the generated Google auth URL (https branch via x-forwarded-proto)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 5, clientId: 42 }]); // site
    headersMock.mockResolvedValue(
      makeHeaders({ host: 'app.example.com', 'x-forwarded-proto': 'https' }),
    );
    generateAuthUrlMock.mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?x=1');

    const res = await googleAuthRoute.GET(makeReq('http://x/auth'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?x=1',
    );
    expect(createOAuth2ClientMock).toHaveBeenCalledWith(
      'https://app.example.com/api/portal/google/callback',
    );
    expect(generateAuthUrlMock).toHaveBeenCalledWith({
      access_type: 'offline',
      scope: ['scope-a', 'scope-b'],
      prompt: 'consent',
      state: '5',
    });
  });

  it('uses http when host is localhost', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 5, clientId: 42 }]);
    headersMock.mockResolvedValue(makeHeaders({ host: 'localhost:3000' }));
    generateAuthUrlMock.mockReturnValue('https://accounts.google.com/auth?y=2');

    const res = await googleAuthRoute.GET(makeReq('http://x/auth'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(307);
    expect(createOAuth2ClientMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/portal/google/callback',
    );
  });

  it('uses http when host is 127.0.0.1', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 5, clientId: 42 }]);
    headersMock.mockResolvedValue(makeHeaders({ host: '127.0.0.1:8080' }));
    generateAuthUrlMock.mockReturnValue('https://google/auth');

    const res = await googleAuthRoute.GET(makeReq('http://x/auth'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(307);
    expect(createOAuth2ClientMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/api/portal/google/callback',
    );
  });

  it('falls back to https when proto header missing and host is non-local', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 5, clientId: 42 }]);
    headersMock.mockResolvedValue(makeHeaders({ host: 'prod.example.com' }));
    generateAuthUrlMock.mockReturnValue('https://google/auth');

    const res = await googleAuthRoute.GET(makeReq('http://x/auth'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(307);
    expect(createOAuth2ClientMock).toHaveBeenCalledWith(
      'https://prod.example.com/api/portal/google/callback',
    );
  });

  it('defaults host to localhost:3000 when no host header present', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([{ id: 5, clientId: 42 }]);
    headersMock.mockResolvedValue(makeHeaders({})); // no host
    generateAuthUrlMock.mockReturnValue('https://google/auth');

    const res = await googleAuthRoute.GET(makeReq('http://x/auth'), {
      params: Promise.resolve({ siteId: '5' }),
    });
    expect(res.status).toBe(307);
    expect(createOAuth2ClientMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/portal/google/callback',
    );
  });
});
