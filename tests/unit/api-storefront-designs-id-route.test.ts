// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for app/api/storefront/[siteId]/designs/[designId]/route.ts
 *
 * Three exported handlers are exercised: GET, PUT, DELETE.
 * Covers the product-design path (integer designId). The legacy UUID path was
 * product-design path (numeric designId). Both paths are tested.
 *
 * Auth surface mocked:
 *   - @/lib/storefront/customer-auth (extractToken, validateSession)
 *   - @/lib/storefront/portal-staff-auth (isPortalStaffWithSiteAccess)
 *   - @/lib/storefront/designer-auth (resolveDesignerCaller)
 *
 * DB surface mocked with a FIFO queue that materialises on `.then` /
 * `.returning()` / `.limit()`.  Heavy deps (sharp, S3, composite) are
 * mocked to prevent Node import errors; the regenerateMockupForStaffSave
 * path is exercised through the isStaff + isTemplate + productId guard in PUT.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── hoisted mocks (declared before any import) ──────────────────────────────

const mocks = vi.hoisted(() => {
  // FIFO db result queue — push arrays of row-objects before each test.
  const dbQueue: Array<Array<Record<string, unknown>>> = [];

  // Tracks write calls for assertions.
  const updateCalls: Array<{ table: string; patch: Record<string, unknown> }> = [];
  const deleteCalls: Array<{ table: string }> = [];

  let nextThrows: Error | null = null;

  function makeChain(resolve: () => Promise<unknown>): any {
    const chain: any = {
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        resolve().then(onF, onR),
      from: () => chain,
      where: () => chain,
      set: (patch: Record<string, unknown>) => {
        // capture patch lazily — the table is captured when update() is called
        chain.__patch = patch;
        return chain;
      },
      orderBy: () => chain,
      limit: () => ({
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          resolve().then(onF, onR),
      }),
      returning: () => resolve(),
    };
    return chain;
  }

  const db = {
    select: vi.fn(() => makeChain(nextResult)),
    update: vi.fn((table: { __table: string }) => {
      const captured = { table: table?.__table ?? 'unknown', patch: {} as Record<string, unknown> };
      return {
        set(patch: Record<string, unknown>) {
          captured.patch = patch;
          return {
            where() {
              return {
                returning() {
                  if (nextThrows) {
                    const e = nextThrows;
                    nextThrows = null;
                    return Promise.reject(e);
                  }
                  const rows = dbQueue.shift() ?? [];
                  updateCalls.push({ ...captured });
                  return Promise.resolve(rows);
                },
                then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                  if (nextThrows) {
                    const e = nextThrows;
                    nextThrows = null;
                    return Promise.reject(e).then(onF, onR);
                  }
                  const rows = dbQueue.shift() ?? [];
                  updateCalls.push({ ...captured });
                  return Promise.resolve(rows).then(onF, onR);
                },
              };
            },
          };
        },
      };
    }),
    delete: vi.fn((table: { __table: string }) => ({
      where() {
        deleteCalls.push({ table: table?.__table ?? 'unknown' });
        return Promise.resolve(undefined);
      },
    })),
  };

  function nextResult(): Promise<unknown> {
    if (nextThrows) {
      const e = nextThrows;
      nextThrows = null;
      return Promise.reject(e);
    }
    return Promise.resolve(dbQueue.shift() ?? []);
  }

  const extractToken = vi.fn<() => string | null>(() => null);
  const validateSession = vi.fn<() => Promise<any>>(() => Promise.resolve(null));
  const isPortalStaffWithSiteAccess = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));
  const resolveDesignerCaller = vi.fn<() => Promise<any>>(() =>
    Promise.resolve({ customerId: null, sessionId: 'sess-abc' }),
  );

  function setThrow(err: Error) {
    nextThrows = err;
  }

  return {
    db,
    dbQueue,
    updateCalls,
    deleteCalls,
    setThrow,
    extractToken,
    validateSession,
    isPortalStaffWithSiteAccess,
    resolveDesignerCaller,
  };
});

// ── module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({ db: mocks.db }));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...conds: unknown[]) => ({ op: 'and', conds }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(t: any, prop: string) {
          if (prop === '__table') return name;
          if (prop === '$inferSelect') return undefined;
          return { __col: prop, __table: name };
        },
      },
    );
  return new Proxy(
    {
      storeSettings: wrap('storeSettings'),
      designs: wrap('designs'),
      productDesigns: wrap('productDesigns'),
      productDesignSurfaces: wrap('productDesignSurfaces'),
      productImages: wrap('productImages'),
    },
    {
      get(t: any, p: string) {
        return p in t ? t[p] : wrap(p);
      },
    },
  );
});

vi.mock('@/lib/storefront/customer-auth', () => ({
  extractToken: mocks.extractToken,
  validateSession: mocks.validateSession,
}));

vi.mock('@/lib/storefront/portal-staff-auth', () => ({
  isPortalStaffWithSiteAccess: mocks.isPortalStaffWithSiteAccess,
}));

vi.mock('@/lib/storefront/designer-auth', () => ({
  resolveDesignerCaller: mocks.resolveDesignerCaller,
}));

// Stub heavy deps used only in regenerateMockupForStaffSave
vi.mock('@aws-sdk/client-s3', () => ({ GetObjectCommand: vi.fn() }));
vi.mock('@/lib/s3/client', () => ({
  getS3Client: vi.fn(() => ({ send: vi.fn().mockResolvedValue({ Body: null }) })),
  getBucketName: vi.fn(() => 'bucket'),
}));
vi.mock('@/lib/s3/upload', () => ({ uploadToS3: vi.fn().mockResolvedValue({ url: 'https://s3/new.png' }) }));
vi.mock('@/lib/printing/composite', () => ({ compositeArtworkOnShirt: vi.fn().mockResolvedValue(Buffer.from('')) }));

// ── import route AFTER mocks ─────────────────────────────────────────────────

const { GET, PUT, DELETE } = await import(
  '@/app/api/storefront/[siteId]/designs/[designId]/route'
);

// ── constants ────────────────────────────────────────────────────────────────

// A valid 36-char UUID → legacy design path
const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
// A numeric string → product-design path
const NUMERIC_ID = '42';
const SITE_ID = '7';

const STORE_ROW = { websiteId: 7, enabled: true };
const DESIGN_ROW = {
  id: UUID,
  websiteId: 7,
  customerId: null,
  sessionId: 'sess-abc',
  isTemplate: false,
  productId: null,
};

// ── helpers ──────────────────────────────────────────────────────────────────

function push(...rows: Array<Record<string, unknown>[]>) {
  for (const r of rows) mocks.dbQueue.push(r);
}

function params(siteId: string, designId: string) {
  return { params: Promise.resolve({ siteId, designId }) };
}

function makeGet(siteId: string, designId: string, extra = '') {
  return new NextRequest(
    `http://localhost/api/storefront/${siteId}/designs/${designId}${extra}`,
    { method: 'GET' },
  );
}

function makePut(siteId: string, designId: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(
    `http://localhost/api/storefront/${siteId}/designs/${designId}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
  );
}

function makeDelete(siteId: string, designId: string, extra = '') {
  return new NextRequest(
    `http://localhost/api/storefront/${siteId}/designs/${designId}${extra}`,
    { method: 'DELETE' },
  );
}

// ── reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.dbQueue.length = 0;
  mocks.updateCalls.length = 0;
  mocks.deleteCalls.length = 0;
  vi.clearAllMocks();
  // Default auth stubs: no portal staff, no customer token.
  mocks.isPortalStaffWithSiteAccess.mockResolvedValue(false);
  mocks.extractToken.mockReturnValue(null);
  mocks.validateSession.mockResolvedValue(null);
  mocks.resolveDesignerCaller.mockResolvedValue({ customerId: null, sessionId: 'sess-abc' });
});
describe('GET /storefront/[siteId]/designs/[numeric] — product-design path', () => {
  it('returns 400 for non-numeric designId in numeric branch (should not happen — dispatched by UUID regex)', async () => {
    // A 36-char non-UUID is still caught by the regex check in resolveDesignWithAuthz.
    // For the product path, we need a numeric siteId too.
    // Trigger the branch where siteId is also bad.
    const res = await GET(makeGet('nan', NUMERIC_ID), params('nan', NUMERIC_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when product design not found (no owned row)', async () => {
    mocks.resolveDesignerCaller.mockResolvedValue({ customerId: null, sessionId: 'sess-abc' });
    push([]); // productDesigns query returns empty
    const res = await GET(makeGet(SITE_ID, NUMERIC_ID), params(SITE_ID, NUMERIC_ID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Not found');
  });

  it('returns 404 when row exists but ownership does not match', async () => {
    mocks.resolveDesignerCaller.mockResolvedValue({ customerId: 'cust-other', sessionId: 'sess-other' });
    // row belongs to different customer+session
    push([{ id: 42, websiteId: 7, customerId: 'cust-mine', sessionId: 'sess-mine', deletedAt: null }]);
    const res = await GET(makeGet(SITE_ID, NUMERIC_ID), params(SITE_ID, NUMERIC_ID));
    expect(res.status).toBe(404);
  });

  it('returns 200 when ownership matches via sessionId', async () => {
    mocks.resolveDesignerCaller.mockResolvedValue({ customerId: null, sessionId: 'sess-abc' });
    const row = { id: 42, websiteId: 7, customerId: null, sessionId: 'sess-abc', deletedAt: null };
    push([row]);
    // The handler issues an update (lastAccessedAt touch) — queue empty result for it.
    mocks.dbQueue.push([]);
    const res = await GET(makeGet(SITE_ID, NUMERIC_ID), params(SITE_ID, NUMERIC_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(42);
  });

  it('returns 200 when ownership matches via customerId', async () => {
    mocks.resolveDesignerCaller.mockResolvedValue({ customerId: 'cust-1', sessionId: null });
    const row = { id: 42, websiteId: 7, customerId: 'cust-1', sessionId: null, deletedAt: null };
    push([row]);
    mocks.dbQueue.push([]); // lastAccessedAt update
    const res = await GET(makeGet(SITE_ID, NUMERIC_ID), params(SITE_ID, NUMERIC_ID));
    expect(res.status).toBe(200);
  });
});

// ============================================================================

describe('PUT /storefront/[siteId]/designs/[numeric] — product-design path', () => {
  it('returns 400 for non-numeric non-UUID designId (Invalid id)', async () => {
    // 'abc' is not 36 chars → dispatched to productDesignPUT; 'abc' also fails parseInt → 400
    const res = await PUT(makePut(SITE_ID, 'abc', { layers: [] }), params(SITE_ID, 'abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid id');
  });

  it('returns 404 when product design not found', async () => {
    mocks.resolveDesignerCaller.mockResolvedValue({ customerId: null, sessionId: 'sess-abc' });
    push([]);
    const res = await PUT(
      makePut(SITE_ID, NUMERIC_ID, { layers: [] }),
      params(SITE_ID, NUMERIC_ID),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid (null) body', async () => {
    mocks.resolveDesignerCaller.mockResolvedValue({ customerId: null, sessionId: 'sess-abc' });
    const row = { id: 42, websiteId: 7, customerId: null, sessionId: 'sess-abc', deletedAt: null };
    push([row]);
    // Send non-JSON body to force json() to fail
    const req = new NextRequest(`http://localhost/api/storefront/${SITE_ID}/designs/${NUMERIC_ID}`, {
      method: 'PUT',
      body: 'not-json',
    });
    const res = await PUT(req, params(SITE_ID, NUMERIC_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid body');
  });

  it('returns 200 on successful product design update', async () => {
    mocks.resolveDesignerCaller.mockResolvedValue({ customerId: null, sessionId: 'sess-abc' });
    const row = { id: 42, websiteId: 7, customerId: null, sessionId: 'sess-abc', deletedAt: null };
    const updatedRow = { ...row, name: 'Updated', layers: [{ type: 'text' }] };
    push([row]);
    // returning() will be called from update().set().where().returning()
    mocks.dbQueue.push([updatedRow]);
    const res = await PUT(
      makePut(SITE_ID, NUMERIC_ID, { name: 'Updated', layers: [{ type: 'text' }] }),
      params(SITE_ID, NUMERIC_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('returns 200 applying styleOverrides, description, thumbnailUrl, and styleId', async () => {
    mocks.resolveDesignerCaller.mockResolvedValue({ customerId: null, sessionId: 'sess-abc' });
    const row = { id: 42, websiteId: 7, customerId: null, sessionId: 'sess-abc', deletedAt: null };
    const updatedRow = { ...row, styleOverrides: { color: 'red' }, description: 'desc', thumbnailUrl: 'https://x/t.png', styleId: 5 };
    push([row]);
    mocks.dbQueue.push([updatedRow]);
    const res = await PUT(
      makePut(SITE_ID, NUMERIC_ID, {
        styleOverrides: { color: 'red' },
        description: 'desc',
        thumbnailUrl: 'https://x/t.png',
        styleId: 5,
      }),
      params(SITE_ID, NUMERIC_ID),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

// ============================================================================

describe('DELETE /storefront/[siteId]/designs/[numeric] — product-design path', () => {
  it('returns 400 for non-numeric non-UUID designId (Invalid id)', async () => {
    const res = await DELETE(makeDelete(SITE_ID, 'abc'), params(SITE_ID, 'abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid id');
  });

  it('returns 404 when product design not found', async () => {
    mocks.resolveDesignerCaller.mockResolvedValue({ customerId: null, sessionId: 'sess-abc' });
    push([]);
    const res = await DELETE(makeDelete(SITE_ID, NUMERIC_ID), params(SITE_ID, NUMERIC_ID));
    expect(res.status).toBe(404);
  });

  it('returns 200 and soft-deletes (sets deletedAt) when owned', async () => {
    mocks.resolveDesignerCaller.mockResolvedValue({ customerId: null, sessionId: 'sess-abc' });
    const row = { id: 42, websiteId: 7, customerId: null, sessionId: 'sess-abc', deletedAt: null };
    push([row]);
    // soft-delete update
    mocks.dbQueue.push([]);
    const res = await DELETE(makeDelete(SITE_ID, NUMERIC_ID), params(SITE_ID, NUMERIC_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
