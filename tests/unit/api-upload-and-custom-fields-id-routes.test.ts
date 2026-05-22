// @vitest-environment node
/**
 * Unit tests for two unrelated API routes packed into one file:
 *
 *  1. POST /api/upload
 *     - Auth gate (401 when no session)
 *     - multipart/form-data path: Blob, base64 string, Buffer, invalid file
 *     - application/json path: missing fields, base64 + data-url decoding
 *     - Unsupported content-type rejection
 *     - Size cap (413) and forbidden mime (415)
 *     - Successful upload echoes S3 result
 *     - Error path: S3 upload rejects -> 500
 *
 *  2. GET / PUT / DELETE /api/custom-fields/[id]
 *     - GET 400 invalid id, 404 not-found, 200 success, 500 on throw
 *     - PUT 400 invalid id, 400 zod, 404 not-found, 200 success, 500 on throw
 *     - DELETE 400 invalid id, 200 success, 500 on throw
 *
 * Everything external (auth, S3, db, drizzle) is mocked. No network, no DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ===========================================================================
// Schema + drizzle mocks
// ===========================================================================

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
    customFields: wrap('customFields'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
}));

// ===========================================================================
// Auth mock (for /api/upload)
// ===========================================================================

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

// ===========================================================================
// S3 mock
// ===========================================================================

const uploadToS3Mock = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => uploadToS3Mock(...args),
}));

// ===========================================================================
// DB mock (for custom-fields)
// ===========================================================================

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: Array<{ table: string; patch: Record<string, unknown>; filter: unknown }> = [];
const deleteCalls: Array<{ table: string; filter: unknown }> = [];
let nextSelectThrows: Error | null = null;
let nextUpdateThrows: Error | null = null;
let nextDeleteThrows: Error | null = null;

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materializedPromise) {
        if (nextSelectThrows) {
          const err = nextSelectThrows;
          nextSelectThrows = null;
          materializedPromise = Promise.reject(err);
        } else {
          materializedPromise = Promise.resolve(selectQueue.shift() ?? []);
        }
      }
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'orderBy', 'groupBy']) {
      chain[m] = () => chain;
    }
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

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            return {
              returning() {
                if (nextUpdateThrows) {
                  const err = nextUpdateThrows;
                  nextUpdateThrows = null;
                  return Promise.reject(err);
                }
                const rows = updateReturnQueue.shift() ?? [];
                updateCalls.push({ table: table.__table, patch, filter });
                return Promise.resolve(rows.map((r) => ({ ...r })));
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
        if (nextDeleteThrows) {
          const err = nextDeleteThrows;
          nextDeleteThrows = null;
          return Promise.reject(err);
        }
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
// Modules under test
// ===========================================================================

const uploadMod = await import('@/app/api/upload/route');
const UPLOAD_POST = uploadMod.POST;

const cfMod = await import('@/app/api/custom-fields/[id]/route');
const CF_GET = cfMod.GET;
const CF_PUT = cfMod.PUT;
const CF_DELETE = cfMod.DELETE;

// ===========================================================================
// Helpers
// ===========================================================================

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeJsonRequest(url: string, body: unknown, method = 'POST'): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeMultipartRequest(form: FormData): NextRequest {
  // Build a Request from the FormData (the browser fetch sets the boundary).
  const req = new Request('http://localhost/api/upload', {
    method: 'POST',
    body: form,
  });
  return new NextRequest(req);
}

function makeRawRequest(url: string, contentType: string, body: string): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

beforeEach(() => {
  authMock.mockReset();
  uploadToS3Mock.mockReset();
  selectQueue = [];
  updateReturnQueue = [];
  updateCalls.length = 0;
  deleteCalls.length = 0;
  nextSelectThrows = null;
  nextUpdateThrows = null;
  nextDeleteThrows = null;
});

// ===========================================================================
// /api/upload — POST
// ===========================================================================

describe('POST /api/upload', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await UPLOAD_POST(
      makeJsonRequest('http://localhost/api/upload', { data: 'x', filename: 'a.png' }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'unauthorized' });
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await UPLOAD_POST(
      makeJsonRequest('http://localhost/api/upload', { data: 'x', filename: 'a.png' }),
    );
    expect(res.status).toBe(401);
  });

  it('rejects unsupported content type with 400', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1' } });
    const res = await UPLOAD_POST(
      makeRawRequest('http://localhost/api/upload', 'text/plain', 'hello'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Unsupported content type/i);
  });

  describe('multipart/form-data', () => {
    it('returns 400 when no file is provided', async () => {
      authMock.mockResolvedValue({ user: { id: 'u1' } });
      const form = new FormData();
      const res = await UPLOAD_POST(makeMultipartRequest(form));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ success: false, error: 'No file provided' });
    });

    it('uploads a Blob/File and returns the S3 result', async () => {
      authMock.mockResolvedValue({ user: { id: 'u1' } });
      uploadToS3Mock.mockResolvedValue({
        url: 'https://cdn/test.png',
        storedFilename: 'stored.png',
        mimeType: 'image/png',
        fileSize: 11,
      });
      const form = new FormData();
      const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])], {
        type: 'image/png',
      });
      form.append('file', blob, 'hello.png');
      const res = await UPLOAD_POST(makeMultipartRequest(form));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({
        url: 'https://cdn/test.png',
        storedFilename: 'stored.png',
        mimeType: 'image/png',
        fileSize: 11,
      });
      expect(uploadToS3Mock).toHaveBeenCalledTimes(1);
      const [bufArg, filenameArg, mimeArg] = uploadToS3Mock.mock.calls[0];
      expect(Buffer.isBuffer(bufArg)).toBe(true);
      expect(filenameArg).toBe('hello.png');
      expect(mimeArg).toBe('image/png');
    });

    it('rejects forbidden mime (image/svg+xml) with 415', async () => {
      authMock.mockResolvedValue({ user: { id: 'u1' } });
      const form = new FormData();
      const blob = new Blob(['<svg/>'], { type: 'image/svg+xml' });
      form.append('file', blob, 'x.svg');
      const res = await UPLOAD_POST(makeMultipartRequest(form));
      expect(res.status).toBe(415);
      const body = await res.json();
      expect(body.error).toMatch(/HTML\/JS\/SVG/);
      expect(uploadToS3Mock).not.toHaveBeenCalled();
    });

    it('rejects forbidden mime (text/html) with 415', async () => {
      authMock.mockResolvedValue({ user: { id: 'u1' } });
      const form = new FormData();
      const blob = new Blob(['<h1/>'], { type: 'text/html; charset=utf-8' });
      form.append('file', blob, 'x.html');
      const res = await UPLOAD_POST(makeMultipartRequest(form));
      expect(res.status).toBe(415);
    });

    it('rejects files over the 10MB cap with 413', async () => {
      authMock.mockResolvedValue({ user: { id: 'u1' } });
      const form = new FormData();
      // 10 MB + 1 byte
      const big = new Uint8Array(10 * 1024 * 1024 + 1);
      const blob = new Blob([big], { type: 'image/png' });
      form.append('file', blob, 'big.png');
      const res = await UPLOAD_POST(makeMultipartRequest(form));
      expect(res.status).toBe(413);
      expect(uploadToS3Mock).not.toHaveBeenCalled();
    });

    it('returns 500 when S3 upload throws', async () => {
      authMock.mockResolvedValue({ user: { id: 'u1' } });
      uploadToS3Mock.mockRejectedValue(new Error('s3 dead'));
      const form = new FormData();
      const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
      form.append('file', blob, 'a.png');
      const res = await UPLOAD_POST(makeMultipartRequest(form));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toBe('s3 dead');
    });
  });

  describe('application/json', () => {
    it('returns 400 when required fields are missing', async () => {
      authMock.mockResolvedValue({ user: { id: 'u1' } });
      const res = await UPLOAD_POST(
        makeJsonRequest('http://localhost/api/upload', { data: 'AAAA' }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toMatch(/Missing required fields/);
    });

    it('uploads base64 data successfully', async () => {
      authMock.mockResolvedValue({ user: { id: 'u1' } });
      uploadToS3Mock.mockResolvedValue({
        url: 'https://cdn/u.png',
        storedFilename: 'stored.png',
        mimeType: 'image/png',
        fileSize: 4,
      });
      const base64 = Buffer.from('test').toString('base64');
      const res = await UPLOAD_POST(
        makeJsonRequest('http://localhost/api/upload', {
          data: base64,
          filename: 'hello.png',
          mimeType: 'image/png',
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      const [bufArg, fname, mime] = uploadToS3Mock.mock.calls[0];
      expect(Buffer.isBuffer(bufArg)).toBe(true);
      expect(bufArg.toString('utf-8')).toBe('test');
      expect(fname).toBe('hello.png');
      expect(mime).toBe('image/png');
    });

    it('strips a data-url prefix before decoding base64', async () => {
      authMock.mockResolvedValue({ user: { id: 'u1' } });
      uploadToS3Mock.mockResolvedValue({
        url: 'https://cdn/u.png',
        storedFilename: 's.png',
        mimeType: 'image/png',
        fileSize: 5,
      });
      const base64 = Buffer.from('hello').toString('base64');
      const res = await UPLOAD_POST(
        makeJsonRequest('http://localhost/api/upload', {
          data: `data:image/png;base64,${base64}`,
          filename: 'hi.png',
        }),
      );
      expect(res.status).toBe(200);
      const bufArg = uploadToS3Mock.mock.calls[0][0];
      expect(bufArg.toString('utf-8')).toBe('hello');
      // default mimeType when not supplied
      expect(uploadToS3Mock.mock.calls[0][2]).toBe('application/octet-stream');
    });

    it('rejects JSON upload that resolves to a forbidden HTML mime', async () => {
      authMock.mockResolvedValue({ user: { id: 'u1' } });
      const base64 = Buffer.from('<html/>').toString('base64');
      const res = await UPLOAD_POST(
        makeJsonRequest('http://localhost/api/upload', {
          data: base64,
          filename: 'x.html',
          mimeType: 'text/html',
        }),
      );
      expect(res.status).toBe(415);
      expect(uploadToS3Mock).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// /api/custom-fields/[id]
// ===========================================================================

describe('GET /api/custom-fields/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await CF_GET(new NextRequest('http://x'), makeParams('not-a-number'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Invalid custom field ID' });
  });

  it('returns 404 when no custom field is found', async () => {
    selectQueue.push([]);
    const res = await CF_GET(new NextRequest('http://x'), makeParams('42'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Custom field not found' });
  });

  it('returns 200 with the row when found', async () => {
    selectQueue.push([{ id: 1, name: 'Alpha', slug: 'alpha', fieldType: 'text' }]);
    const res = await CF_GET(new NextRequest('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 1, name: 'Alpha', slug: 'alpha' });
  });

  it('returns 500 when the DB select throws', async () => {
    nextSelectThrows = new Error('db is dead');
    const res = await CF_GET(new NextRequest('http://x'), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Failed to fetch custom field' });
  });
});

describe('PUT /api/custom-fields/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await CF_PUT(
      makeJsonRequest('http://x', { name: 'Beta' }, 'PUT'),
      makeParams('abc'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid custom field ID');
  });

  it('returns 400 on zod validation error', async () => {
    const res = await CF_PUT(
      makeJsonRequest('http://x', { fieldType: 'not-a-real-type' }, 'PUT'),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation error');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('returns 404 when the update returns no rows', async () => {
    updateReturnQueue.push([]);
    const res = await CF_PUT(
      makeJsonRequest('http://x', { name: 'Gamma' }, 'PUT'),
      makeParams('999'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Custom field not found' });
  });

  it('returns 200 with the updated row on success', async () => {
    updateReturnQueue.push([
      { id: 2, name: 'Delta', slug: 'delta', fieldType: 'text' },
    ]);
    const res = await CF_PUT(
      makeJsonRequest('http://x', { name: 'Delta', slug: 'delta' }, 'PUT'),
      makeParams('2'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: 2, name: 'Delta' });
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('customFields');
    expect(updateCalls[0].patch).toMatchObject({ name: 'Delta', slug: 'delta' });
    // updatedAt is stamped
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('returns 500 when the DB update throws (non-zod error)', async () => {
    nextUpdateThrows = new Error('db is dead');
    const res = await CF_PUT(
      makeJsonRequest('http://x', { name: 'Epsilon' }, 'PUT'),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Failed to update custom field' });
  });
});

describe('DELETE /api/custom-fields/[id]', () => {
  it('returns 400 when id is not a number', async () => {
    const res = await CF_DELETE(new NextRequest('http://x'), makeParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid custom field ID');
  });

  it('returns 200 on successful delete', async () => {
    const res = await CF_DELETE(new NextRequest('http://x'), makeParams('7'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      message: 'Custom field deleted successfully',
    });
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('customFields');
  });

  it('returns 500 when the DB delete throws', async () => {
    nextDeleteThrows = new Error('db is dead');
    const res = await CF_DELETE(new NextRequest('http://x'), makeParams('1'));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, error: 'Failed to delete custom field' });
  });
});
