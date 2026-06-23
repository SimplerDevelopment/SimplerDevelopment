// @vitest-environment node
/**
 * Unit tests for four API routes (batch 27d):
 *   - app/api/health/route.ts                          (GET)
 *   - app/api/mcp/route.ts                             (GET, POST, DELETE)
 *   - app/api/media/proxy/[...path]/route.ts           (GET)
 *   - app/api/media/route.ts                           (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

// drizzle-orm — operator helpers used by the media route + a passthrough
// sql tagged template the health route hands to db.execute().
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  like: (a: unknown, b: unknown) => ({ op: 'like', a, b }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ op: 'raw', s }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// Schema — Proxy-wrapped table sentinels so `media.clientId`, `media.filename`,
// etc. all resolve to inspectable column objects without needing the real schema.
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
  return new Proxy({
    media: wrap('media'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------
// Two consumers:
//   * health route uses `db.execute(sql\`SELECT 1\`)` — we control success/fail.
//   * media route uses select().from().where().orderBy().limit().offset()
//     and a parallel select({count}).from().where() for the count row.
// ---------------------------------------------------------------------------

const executeMock = vi.fn();
let selectQueue: Array<Array<Record<string, unknown>>> = [];

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materialized: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!materialized) materialized = Promise.resolve(selectQueue.shift() ?? []);
      return materialized;
    };
    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'where', 'orderBy', 'leftJoin', 'innerJoin', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.limit = () => {
      const inner: Record<string, unknown> = {};
      inner.offset = () => ({
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          materialize().then(onF, onR),
      });
      inner.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        materialize().then(onF, onR);
      return inner;
    };
    chain.offset = () => ({
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        materialize().then(onF, onR),
    });
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      execute: (...args: unknown[]) => executeMock(...args),
    },
  };
});

// ---------------------------------------------------------------------------
// Auth + portal-client mocks (media route)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// ---------------------------------------------------------------------------
// S3 + next/cache mocks (media proxy route)
// ---------------------------------------------------------------------------

// unstable_cache → identity wrapper so each call hits the inner fn we mocked.
vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
}));

const s3SendMock = vi.fn();
vi.mock('@/lib/s3/client', () => ({
  getS3Client: () => ({ send: s3SendMock }),
  getBucketName: () => 'test-bucket',
}));

// GetObjectCommand — capture the args so we can assert key/bucket plumbing.
const getObjectCommandCalls: Array<Record<string, unknown>> = [];
vi.mock('@aws-sdk/client-s3', () => ({
  GetObjectCommand: class {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
      getObjectCommandCalls.push(input);
    }
  },
}));

// ---------------------------------------------------------------------------
// MCP route mocks
// ---------------------------------------------------------------------------

const resolvePortalMock = vi.fn();
vi.mock('@/lib/mcp-auth', () => ({
  resolvePortalFromRequest: (...args: unknown[]) => resolvePortalMock(...args),
}));

const originFromRequestMock = vi.fn((req: Request) => new URL(req.url).origin);
vi.mock('@/lib/oauth/server', () => ({
  originFromRequest: (req: Request) => originFromRequestMock(req),
}));

const serverConnectMock = vi.fn().mockResolvedValue(undefined);
const serverCloseMock = vi.fn().mockResolvedValue(undefined);
const buildMcpServerMock = vi.fn(() => ({
  connect: serverConnectMock,
  close: serverCloseMock,
}));
vi.mock('@/lib/mcp/server', () => ({
  buildMcpServer: (...args: unknown[]) => buildMcpServerMock(...args),
}));

// Transport — capture init opts and reply with whatever the test wants.
const transportHandleMock = vi.fn();
let transportInitOptions: unknown = null;
vi.mock('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js', () => ({
  WebStandardStreamableHTTPServerTransport: class {
    constructor(opts: unknown) {
      transportInitOptions = opts;
    }
    handleRequest(req: Request) {
      return transportHandleMock(req);
    }
  },
}));

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------

const healthRoute = await import('@/app/api/health/route');
const mcpRoute = await import('@/app/api/mcp/route');
const mediaProxyRoute = await import('@/app/api/media/proxy/[...path]/route');
const mediaRoute = await import('@/app/api/media/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

async function asyncIterFromChunks(chunks: Uint8Array[]): Promise<AsyncIterable<Uint8Array>> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    },
  };
}

beforeEach(() => {
  selectQueue = [];
  executeMock.mockReset();
  authMock.mockReset();
  getPortalClientMock.mockReset();
  s3SendMock.mockReset();
  getObjectCommandCalls.length = 0;
  resolvePortalMock.mockReset();
  originFromRequestMock.mockClear();
  serverConnectMock.mockClear();
  serverCloseMock.mockClear();
  buildMcpServerMock.mockClear();
  transportHandleMock.mockReset();
  transportInitOptions = null;
});

// ===========================================================================
// /api/health
// ===========================================================================

describe('/api/health', () => {
  describe('GET', () => {
    it('returns 200 + ok=true when the db round-trip succeeds', async () => {
      executeMock.mockResolvedValueOnce([{ '?column?': 1 }]);
      const res = await healthRoute.GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.db).toBe('up');
      // ISO timestamp present
      expect(typeof body.time).toBe('string');
      expect(() => new Date(body.time)).not.toThrow();
      // Should NOT leak uptime/internal state.
      expect(body).not.toHaveProperty('uptimeMs');
    });

    it('returns 503 + ok=false when the db query throws', async () => {
      executeMock.mockRejectedValueOnce(new Error('connection refused'));
      const res = await healthRoute.GET();
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.db).toBe('down');
      expect(typeof body.time).toBe('string');
    });

    it('passes a tagged sql template to db.execute', async () => {
      executeMock.mockResolvedValueOnce([]);
      await healthRoute.GET();
      expect(executeMock).toHaveBeenCalledTimes(1);
      const arg = executeMock.mock.calls[0][0] as { op?: string; strings?: string[] };
      expect(arg.op).toBe('sql');
      // The template's text should be `SELECT 1`.
      expect(arg.strings?.join('')).toMatch(/SELECT 1/);
    });
  });
});

// ===========================================================================
// /api/mcp
// ===========================================================================

describe('/api/mcp', () => {
  describe('GET', () => {
    it('returns 405 with Allow: POST, DELETE (stateless mode skips SSE)', async () => {
      const res = await mcpRoute.GET();
      expect(res.status).toBe(405);
      expect(res.headers.get('Allow')).toBe('POST, DELETE');
    });
  });

  describe('POST', () => {
    it('returns 401 with RFC 9728 challenge when no portal context resolves', async () => {
      resolvePortalMock.mockResolvedValueOnce(null);
      const req = makeReq('https://app.example.com/api/mcp', { method: 'POST' });
      const res = await mcpRoute.POST(req);
      expect(res.status).toBe(401);
      const challenge = res.headers.get('WWW-Authenticate');
      // RFC 9728 format: no realm, just resource_metadata + scope
      expect(challenge).toContain(
        'resource_metadata="https://app.example.com/.well-known/oauth-protected-resource"',
      );
      expect(challenge).toContain('scope=');
      expect(res.headers.get('Content-Type')).toBe('application/json');
      const body = await res.json();
      expect(body.jsonrpc).toBe('2.0');
      expect(body.error.code).toBe(-32001);
      expect(body.error.message).toBe('Unauthorized');
      // Should not have built a server when unauthorized.
      expect(buildMcpServerMock).not.toHaveBeenCalled();
    });

    it('builds the server + transport and proxies the response when authorized', async () => {
      const ctx = { clientId: 1, scopes: ['mcp:tools'] };
      resolvePortalMock.mockResolvedValueOnce(ctx);
      const handled = new Response('mcp-body', { status: 200 });
      transportHandleMock.mockResolvedValueOnce(handled);
      const req = makeReq('https://app.example.com/api/mcp', { method: 'POST' });
      const res = await mcpRoute.POST(req);
      expect(res).toBe(handled);
      expect(buildMcpServerMock).toHaveBeenCalledWith(ctx);
      expect(serverConnectMock).toHaveBeenCalledTimes(1);
      // Stateless: sessionIdGenerator undefined; enableJsonResponse true.
      expect(transportInitOptions).toMatchObject({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      // Cleanup is fire-and-forget; assert it was invoked.
      expect(serverCloseMock).toHaveBeenCalledTimes(1);
    });

    it('still closes the server when transport.handleRequest rejects', async () => {
      resolvePortalMock.mockResolvedValueOnce({ clientId: 2 });
      transportHandleMock.mockRejectedValueOnce(new Error('boom'));
      const req = makeReq('https://x/api/mcp', { method: 'POST' });
      await expect(mcpRoute.POST(req)).rejects.toThrow('boom');
      expect(serverCloseMock).toHaveBeenCalledTimes(1);
    });

    it('swallows close() rejections so a failed cleanup never surfaces', async () => {
      resolvePortalMock.mockResolvedValueOnce({ clientId: 3 });
      transportHandleMock.mockResolvedValueOnce(new Response('ok', { status: 200 }));
      serverCloseMock.mockRejectedValueOnce(new Error('close failed'));
      const req = makeReq('https://x/api/mcp', { method: 'POST' });
      const res = await mcpRoute.POST(req);
      expect(res.status).toBe(200);
      // Give the fire-and-forget catch a tick to run.
      await new Promise(r => setTimeout(r, 0));
      expect(serverCloseMock).toHaveBeenCalled();
    });
  });

  describe('DELETE', () => {
    it('returns 401 unauthorized when no portal context resolves', async () => {
      resolvePortalMock.mockResolvedValueOnce(null);
      const req = makeReq('https://app.example.com/api/mcp', { method: 'DELETE' });
      const res = await mcpRoute.DELETE(req);
      expect(res.status).toBe(401);
    });

    it('proxies the transport response on success', async () => {
      resolvePortalMock.mockResolvedValueOnce({ clientId: 9 });
      const handled = new Response(null, { status: 202 });
      transportHandleMock.mockResolvedValueOnce(handled);
      const req = makeReq('https://x/api/mcp', { method: 'DELETE' });
      const res = await mcpRoute.DELETE(req);
      expect(res).toBe(handled);
    });
  });
});

// ===========================================================================
// /api/media/proxy/[...path]
// ===========================================================================

describe('/api/media/proxy/[...path]', () => {
  describe('GET', () => {
    it('returns 404 when S3 has no Body', async () => {
      s3SendMock.mockResolvedValueOnce({ Body: undefined });
      const res = await mediaProxyRoute.GET(makeReq('http://x') as never, {
        params: Promise.resolve({ path: ['missing', 'file.png'] }),
      });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/not found/i);
      // Key was joined from the path segments.
      expect(getObjectCommandCalls[0].Key).toBe('missing/file.png');
      expect(getObjectCommandCalls[0].Bucket).toBe('test-bucket');
    });

    it('returns the file inline with the original content type for safe MIME', async () => {
      const data = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]); // PNG-ish bytes
      s3SendMock.mockResolvedValueOnce({
        Body: await asyncIterFromChunks([data]),
        ContentType: 'image/png',
      });
      const res = await mediaProxyRoute.GET(makeReq('http://x') as never, {
        params: Promise.resolve({ path: ['uuid', 'image.png'] }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/png');
      expect(res.headers.get('Content-Length')).toBe(String(data.length));
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(res.headers.get('Cache-Control')).toContain('immutable');
      // No content-disposition when inline.
      expect(res.headers.get('Content-Disposition')).toBeNull();
      const buf = new Uint8Array(await res.arrayBuffer());
      expect(buf.length).toBe(data.length);
      expect(buf[0]).toBe(0x89);
    });

    it('serves text/html inline with CSP sandbox (html-embed block support)', async () => {
      const data = new TextEncoder().encode('<script>alert(1)</script>');
      s3SendMock.mockResolvedValueOnce({
        Body: await asyncIterFromChunks([data]),
        ContentType: 'text/html',
      });
      const res = await mediaProxyRoute.GET(makeReq('http://x') as never, {
        params: Promise.resolve({ path: ['evil', 'index.html'] }),
      });
      expect(res.status).toBe(200);
      // text/html is served inline (for html-embed iframes) with charset and CSP sandbox,
      // NOT forced to application/octet-stream.
      expect(res.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
      // No Content-Disposition: attachment — must render inline in the iframe.
      expect(res.headers.get('Content-Disposition')).toBeNull();
      // CSP sandbox must be present to restrict script execution on direct navigation.
      const csp = res.headers.get('Content-Security-Policy');
      expect(csp).toContain('sandbox');
    });

    it('falls back to application/octet-stream when S3 returns no ContentType', async () => {
      s3SendMock.mockResolvedValueOnce({
        Body: await asyncIterFromChunks([new Uint8Array([1])]),
        ContentType: undefined,
      });
      const res = await mediaProxyRoute.GET(makeReq('http://x') as never, {
        params: Promise.resolve({ path: ['file.bin'] }),
      });
      expect(res.status).toBe(200);
      // Default -> not inline-safe -> attachment.
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');
    });

    it('handles content-type parameters like charset (matches base type)', async () => {
      const data = new Uint8Array([1, 2]);
      s3SendMock.mockResolvedValueOnce({
        Body: await asyncIterFromChunks([data]),
        ContentType: 'image/jpeg; charset=binary',
      });
      const res = await mediaProxyRoute.GET(makeReq('http://x') as never, {
        params: Promise.resolve({ path: ['photo.jpg'] }),
      });
      expect(res.status).toBe(200);
      // Original Content-Type preserved when allowed inline.
      expect(res.headers.get('Content-Type')).toBe('image/jpeg; charset=binary');
      expect(res.headers.get('Content-Disposition')).toBeNull();
    });

    it('returns 500 when the S3 send throws', async () => {
      s3SendMock.mockRejectedValueOnce(new Error('NoSuchBucket'));
      // Suppress the expected console.error from the catch.
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const res = await mediaProxyRoute.GET(makeReq('http://x') as never, {
        params: Promise.resolve({ path: ['boom.png'] }),
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/Failed to load media/);
      spy.mockRestore();
    });

    it('uses "download" filename when key has no segments after the slash', async () => {
      const data = new Uint8Array([1]);
      s3SendMock.mockResolvedValueOnce({
        Body: await asyncIterFromChunks([data]),
        ContentType: 'application/zip',
      });
      // Empty array still joins to '' so .split('/').pop() yields '' -> falls back to 'download'.
      const res = await mediaProxyRoute.GET(makeReq('http://x') as never, {
        params: Promise.resolve({ path: [''] }),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Disposition')).toContain('filename="download"');
    });
  });
});

// ===========================================================================
// /api/media (list)
// ===========================================================================

describe('/api/media', () => {
  const validSession = { user: { id: '42', name: 'Alice' } };

  describe('GET', () => {
    it('returns 401 when there is no session', async () => {
      authMock.mockResolvedValueOnce(null);
      const res = await mediaRoute.GET(
        makeReq('http://x/api/media') as never,
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error).toMatch(/Unauthorized/);
    });

    it('returns 401 when session has no user id', async () => {
      authMock.mockResolvedValueOnce({ user: {} });
      const res = await mediaRoute.GET(makeReq('http://x/api/media') as never);
      expect(res.status).toBe(401);
    });

    it('returns 403 when the user has no portal client', async () => {
      authMock.mockResolvedValueOnce(validSession);
      getPortalClientMock.mockResolvedValueOnce(null);
      const res = await mediaRoute.GET(makeReq('http://x/api/media') as never);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toMatch(/No portal client found/);
    });

    it('returns rows with default pagination when no query params are provided', async () => {
      authMock.mockResolvedValueOnce(validSession);
      getPortalClientMock.mockResolvedValueOnce({ id: 7 });
      // 1) select rows
      selectQueue.push([
        { id: 1, filename: 'a.png', clientId: 7 },
        { id: 2, filename: 'b.png', clientId: 7 },
      ]);
      // 2) select count
      selectQueue.push([{ count: 2 }]);
      const res = await mediaRoute.GET(makeReq('http://x/api/media') as never);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 2 });
      expect(getPortalClientMock).toHaveBeenCalledWith(42);
    });

    it('parses limit/offset from query params', async () => {
      authMock.mockResolvedValueOnce(validSession);
      getPortalClientMock.mockResolvedValueOnce({ id: 7 });
      selectQueue.push([]);
      selectQueue.push([{ count: 0 }]);
      const res = await mediaRoute.GET(
        makeReq('http://x/api/media?limit=5&offset=10') as never,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.pagination).toEqual({ limit: 5, offset: 10, total: 0 });
    });

    it('supports search filter (filename/alt/caption)', async () => {
      authMock.mockResolvedValueOnce(validSession);
      getPortalClientMock.mockResolvedValueOnce({ id: 7 });
      selectQueue.push([{ id: 3, filename: 'hero.png' }]);
      selectQueue.push([{ count: 1 }]);
      const res = await mediaRoute.GET(
        makeReq('http://x/api/media?search=hero') as never,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);
      expect(body.pagination.total).toBe(1);
    });

    it('supports mimeType filter (skips when value is "all")', async () => {
      authMock.mockResolvedValueOnce(validSession);
      getPortalClientMock.mockResolvedValueOnce({ id: 7 });
      selectQueue.push([{ id: 1, mimeType: 'image/png' }]);
      selectQueue.push([{ count: 1 }]);
      const res = await mediaRoute.GET(
        makeReq('http://x/api/media?mimeType=image') as never,
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveLength(1);

      // 'all' should be ignored.
      authMock.mockResolvedValueOnce(validSession);
      getPortalClientMock.mockResolvedValueOnce({ id: 7 });
      selectQueue.push([{ id: 2 }]);
      selectQueue.push([{ count: 1 }]);
      const res2 = await mediaRoute.GET(
        makeReq('http://x/api/media?mimeType=all') as never,
      );
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.success).toBe(true);
    });

    it('returns 500 when auth() itself throws', async () => {
      authMock.mockRejectedValueOnce(new Error('auth blew up'));
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const res = await mediaRoute.GET(makeReq('http://x/api/media') as never);
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toMatch(/Failed to fetch media/);
      spy.mockRestore();
    });
  });
});
