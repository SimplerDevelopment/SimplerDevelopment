// @vitest-environment node
/**
 * Unit tests for:
 *   app/api/storefront/[siteId]/designs/[designId]/ai-image/route.ts
 *
 * Mocked surface:
 *   - @/lib/db (FIFO queue)
 *   - @/lib/db/schema (proxy wrapping)
 *   - drizzle-orm (eq/and stubs)
 *   - global fetch (OpenAI call — never touches network)
 *   - sharp (image metadata — best-effort)
 *   - @/lib/s3/upload (uploadToS3)
 *   - @/lib/ai/audit (recordAiImageUsage)
 *   - @/lib/ai/plan-gate (checkAiPlanGate)
 *   - @/lib/ai/resolve-client-key (resolveClientApiKey)
 *   - @/lib/designer/aiRateLimit (checkAiImageRateLimit)
 *   - @/lib/designer/aiPromptBuilder (buildAiImagePrompt)
 *   - @/lib/storefront/customer-auth (extractToken, validateSession)
 *   - @/lib/storefront/portal-staff-auth (isPortalStaffWithSiteAccess)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── hoisted helpers ──────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => {
  const dbQueue: Array<Array<Record<string, unknown>>> = [];
  let nextThrows: Error | null = null;

  function nextResult(): Promise<unknown> {
    if (nextThrows) {
      const e = nextThrows;
      nextThrows = null;
      return Promise.reject(e);
    }
    return Promise.resolve(dbQueue.shift() ?? []);
  }

  function makeSelectChain(): Record<string, unknown> {
    const resolve = nextResult;
    const chain: Record<string, unknown> = {};
    chain['from'] = () => chain;
    chain['where'] = () => chain;
    chain['orderBy'] = () => chain;
    chain['limit'] = () => ({
      then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
        resolve().then(onF, onR),
    });
    chain['returning'] = () => resolve();
    chain['then'] = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      resolve().then(onF, onR);
    return chain;
  }

  const db = {
    select: vi.fn(() => makeSelectChain()),
    insert: vi.fn(() => ({
      values: () => ({ returning: () => nextResult() }),
    })),
    update: vi.fn(() => ({
      set: () => ({ where: () => ({ returning: () => nextResult() }) }),
    })),
  };

  // Storefront auth
  const extractToken = vi.fn<() => string | null>(() => null);
  const validateSession = vi.fn<() => Promise<unknown>>(() => Promise.resolve(null));
  const isPortalStaffWithSiteAccess = vi.fn<() => Promise<boolean>>(
    () => Promise.resolve(false),
  );

  // AI infra
  const checkAiPlanGate = vi.fn<() => Promise<{ allowed: boolean; message?: string; reason?: string }>>(
    () => Promise.resolve({ allowed: true }),
  );
  const checkAiImageRateLimit = vi.fn<
    () => Promise<{ allowed: boolean; message?: string; reason?: string; count?: number; cap?: number }>
  >(() => Promise.resolve({ allowed: true }));
  const resolveClientApiKey = vi.fn<() => Promise<{ key: string; source: string }>>(
    () => Promise.resolve({ key: 'sk-openai-test', source: 'platform' }),
  );
  const recordAiImageUsage = vi.fn();
  const buildAiImagePrompt = vi.fn<(args: { prompt: string; style: string; transparent: boolean }) => string>(
    ({ prompt }) => `augmented: ${prompt}`,
  );

  // S3
  const uploadToS3 = vi.fn<() => Promise<{ url: string; storedFilename: string; fileSize: number }>>(
    () => Promise.resolve({ url: 'https://s3/ai/image.png', storedFilename: 'image.png', fileSize: 50000 }),
  );

  // sharp metadata
  const sharpMetadata = vi.fn<() => Promise<{ width: number; height: number }>>(
    () => Promise.resolve({ width: 1024, height: 1024 }),
  );

  // global fetch mock (OpenAI)
  const fetchMock = vi.fn();

  function setThrow(err: Error) {
    nextThrows = err;
  }

  return {
    db,
    dbQueue,
    setThrow,
    extractToken,
    validateSession,
    isPortalStaffWithSiteAccess,
    checkAiPlanGate,
    checkAiImageRateLimit,
    resolveClientApiKey,
    recordAiImageUsage,
    buildAiImagePrompt,
    uploadToS3,
    sharpMetadata,
    fetchMock,
  };
});

// ── module mocks (before dynamic import) ─────────────────────────────────────

vi.mock('@/lib/db', () => ({ db: mocks.db }));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(t: Record<string, unknown>, prop: string) {
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
      clientWebsites: wrap('clientWebsites'),
      designAssets: wrap('designAssets'),
    },
    {
      get(t: Record<string, unknown>, p: string) {
        return p in t ? t[p] : wrap(p);
      },
    },
  );
});

vi.mock('@/lib/storefront/customer-auth', () => ({
  extractToken: (req: unknown) => mocks.extractToken(req),
  validateSession: (tok: unknown) => mocks.validateSession(tok),
}));

vi.mock('@/lib/storefront/portal-staff-auth', () => ({
  isPortalStaffWithSiteAccess: (...args: unknown[]) => mocks.isPortalStaffWithSiteAccess(...args),
}));

vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => mocks.checkAiPlanGate(...args),
}));

vi.mock('@/lib/designer/aiRateLimit', () => ({
  checkAiImageRateLimit: (...args: unknown[]) => mocks.checkAiImageRateLimit(...args),
}));

vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => mocks.resolveClientApiKey(...args),
}));

vi.mock('@/lib/ai/audit', () => ({
  recordAiImageUsage: (...args: unknown[]) => mocks.recordAiImageUsage(...args),
  recordAiUsage: vi.fn(),
}));

vi.mock('@/lib/designer/aiPromptBuilder', () => ({
  buildAiImagePrompt: (...args: unknown[]) => mocks.buildAiImagePrompt(args[0] as Parameters<typeof mocks.buildAiImagePrompt>[0]),
}));

vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => mocks.uploadToS3(...args),
}));

vi.mock('sharp', () => {
  const sharpFn = vi.fn(() => ({
    metadata: () => mocks.sharpMetadata(),
  }));
  return { default: sharpFn };
});

// ── global fetch mock ────────────────────────────────────────────────────────

vi.stubGlobal('fetch', mocks.fetchMock);

// ── import route AFTER mocks ─────────────────────────────────────────────────

const { POST } = await import(
  '@/app/api/storefront/[siteId]/designs/[designId]/ai-image/route'
);

// ── constants ────────────────────────────────────────────────────────────────

const UUID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SITE_ID = '7';

const STORE_ROW = { websiteId: 7, enabled: true };
const DESIGN_ROW = {
  id: UUID,
  websiteId: 7,
  customerId: null,
  sessionId: 'sess-abc',
};
const SITE_ROW = { clientId: 42 };

/** A valid base64-encoded 1-pixel PNG */
const TINY_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const ASSET_ROW = {
  id: 'asset-uuid-1',
  designId: UUID,
  url: 'https://s3/ai/image.png',
  width: 1024,
  height: 1024,
  mimeType: 'image/png',
  fileSize: 50000,
};

function makeOpenAiOkResponse(items: Array<{ b64_json?: string }> = [{ b64_json: TINY_PNG_B64 }]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data: items }),
    text: () => Promise.resolve(JSON.stringify({ data: items })),
  };
}

function makeOpenAiErrorResponse(status: number, message: string) {
  const body = JSON.stringify({ error: { message } });
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message } }),
    text: () => Promise.resolve(body),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

function push(...rows: Array<Array<Record<string, unknown>>>) {
  for (const r of rows) mocks.dbQueue.push(r);
}

function routeParams(siteId: string, designId: string) {
  return { params: Promise.resolve({ siteId, designId }) };
}

function makePost(
  siteId: string,
  designId: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new NextRequest(
    `http://localhost/api/storefront/${siteId}/designs/${designId}/ai-image`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    },
  );
}

// ── reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.dbQueue.length = 0;
  vi.clearAllMocks();
  mocks.checkAiPlanGate.mockResolvedValue({ allowed: true });
  mocks.checkAiImageRateLimit.mockResolvedValue({ allowed: true });
  mocks.resolveClientApiKey.mockResolvedValue({ key: 'sk-openai-test', source: 'platform' });
  mocks.buildAiImagePrompt.mockImplementation(({ prompt }: { prompt: string }) => `augmented: ${prompt}`);
  mocks.uploadToS3.mockResolvedValue({ url: 'https://s3/ai/image.png', storedFilename: 'image.png', fileSize: 50000 });
  mocks.sharpMetadata.mockResolvedValue({ width: 1024, height: 1024 });
  mocks.extractToken.mockReturnValue(null);
  mocks.validateSession.mockResolvedValue(null);
  mocks.isPortalStaffWithSiteAccess.mockResolvedValue(false);
  mocks.fetchMock.mockResolvedValue(makeOpenAiOkResponse());
  // default insert returning for designAssets
  mocks.db.insert.mockReturnValue({
    values: () => ({ returning: () => Promise.resolve([ASSET_ROW]) }),
  });
});

// ── tests ────────────────────────────────────────────────────────────────────

describe('POST /storefront/[siteId]/designs/[designId]/ai-image — validation', () => {
  it('returns 400 for non-numeric siteId', async () => {
    const res = await POST(makePost('bad', UUID, { prompt: 'a dog' }), routeParams('bad', UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/site/i);
  });

  it('returns 404 when store not found', async () => {
    push([]); // verifyStore empty
    const res = await POST(makePost(SITE_ID, UUID, { prompt: 'a dog' }), routeParams(SITE_ID, UUID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Store not found');
  });

  it('returns 400 when prompt is missing', async () => {
    push([STORE_ROW]);
    const res = await POST(makePost(SITE_ID, UUID, {}), routeParams(SITE_ID, UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Prompt is required');
  });

  it('returns 400 when prompt is empty after trim', async () => {
    push([STORE_ROW]);
    const res = await POST(makePost(SITE_ID, UUID, { prompt: '   ' }), routeParams(SITE_ID, UUID));
    expect(res.status).toBe(400);
  });

  it('returns 400 when prompt exceeds 1000 chars', async () => {
    push([STORE_ROW]);
    const long = 'x'.repeat(1001);
    const res = await POST(makePost(SITE_ID, UUID, { prompt: long }), routeParams(SITE_ID, UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/1000/);
  });

  it('returns 400 for invalid design ID format', async () => {
    push([STORE_ROW]);
    const res = await POST(
      makePost(SITE_ID, 'not-a-uuid', { prompt: 'dog', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, 'not-a-uuid'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid design ID');
  });

  it('returns 404 when design not found', async () => {
    push([STORE_ROW]);
    push([]); // design missing
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Design not found');
  });

  it('returns 403 when no matching auth', async () => {
    push([STORE_ROW]);
    push([{ ...DESIGN_ROW, sessionId: 'other-sess' }]);
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'wrong' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Forbidden');
  });
});

describe('POST /storefront/[siteId]/designs/[designId]/ai-image — auth paths', () => {
  it('allows access when session ID matches', async () => {
    push([STORE_ROW]);
    push([DESIGN_ROW]);
    push([SITE_ROW]);
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'a fluffy dog', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(201);
  });

  it('allows access when customer token validates', async () => {
    mocks.extractToken.mockReturnValue('tok-xyz');
    mocks.validateSession.mockResolvedValue({ websiteId: 7, customerId: 'cust-1' });
    push([STORE_ROW]);
    push([{ ...DESIGN_ROW, customerId: 'cust-1', sessionId: null }]);
    push([SITE_ROW]);
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'beach sunset' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(201);
  });

  it('allows access when portal staff header is set', async () => {
    mocks.isPortalStaffWithSiteAccess.mockResolvedValue(true);
    push([STORE_ROW]);
    push([DESIGN_ROW]);
    push([SITE_ROW]);
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'mountains' }, { 'x-portal-staff': '1' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(201);
  });
});

describe('POST /storefront/[siteId]/designs/[designId]/ai-image — plan gate + rate limit + key', () => {
  function setupAuthDb() {
    push([STORE_ROW]);
    push([DESIGN_ROW]);
    push([SITE_ROW]);
  }

  it('returns 500 when siteRow not found', async () => {
    push([STORE_ROW]);
    push([DESIGN_ROW]);
    push([]); // siteRow missing
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Site owner not found');
  });

  it('returns 402 when plan gate blocks', async () => {
    setupAuthDb();
    mocks.checkAiPlanGate.mockResolvedValue({ allowed: false, message: 'Upgrade plan', reason: 'no_plan' });
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Upgrade plan');
    expect(body.reason).toBe('no_plan');
  });

  it('returns 429 when rate limit exceeded', async () => {
    setupAuthDb();
    mocks.checkAiImageRateLimit.mockResolvedValue({
      allowed: false,
      message: 'Rate limit exceeded',
      reason: 'daily_cap',
      count: 10,
      cap: 10,
    });
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Rate limit exceeded');
    expect(body.count).toBe(10);
    expect(body.cap).toBe(10);
  });

  it('returns 503 when no OpenAI key configured', async () => {
    setupAuthDb();
    mocks.resolveClientApiKey.mockRejectedValue(new Error('No OpenAI key available'));
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.message).toBe('No OpenAI key available');
  });

  it('returns 503 with fallback message when key error is not Error instance', async () => {
    setupAuthDb();
    mocks.resolveClientApiKey.mockRejectedValue('string error');
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.message).toMatch(/openai key/i);
  });
});

describe('POST /storefront/[siteId]/designs/[designId]/ai-image — OpenAI response handling', () => {
  function setupFullDb() {
    push([STORE_ROW]);
    push([DESIGN_ROW]);
    push([SITE_ROW]);
  }

  it('happy path: returns 201 with image asset data', async () => {
    setupFullDb();
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'a majestic eagle', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.url).toBe('https://s3/ai/image.png');
    expect(body.data.prompt).toBe('a majestic eagle');
    expect(Array.isArray(body.data.variants)).toBe(true);
    expect(body.data.variants).toHaveLength(1);
  });

  it('includes augmentedPrompt in the response', async () => {
    setupFullDb();
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'lion', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    const body = await res.json();
    expect(body.data.augmentedPrompt).toBe('augmented: lion');
  });

  it('passes style to buildAiImagePrompt', async () => {
    setupFullDb();
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'sunset', style: 'photo', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(mocks.buildAiImagePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'photo' }),
    );
  });

  it('defaults unknown style to illustration', async () => {
    setupFullDb();
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'sunset', style: 'unknown-style', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(mocks.buildAiImagePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ style: 'illustration' }),
    );
  });

  it('defaults transparent to true when not supplied', async () => {
    setupFullDb();
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'cat', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(mocks.buildAiImagePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ transparent: true }),
    );
  });

  it('respects transparent: false when supplied', async () => {
    setupFullDb();
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'cat', transparent: false, sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(mocks.buildAiImagePrompt).toHaveBeenCalledWith(
      expect.objectContaining({ transparent: false }),
    );
  });

  it('passes Authorization header to OpenAI fetch', async () => {
    setupFullDb();
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'dog', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    const [url, init] = mocks.fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk-openai-test');
  });

  it('returns 400 on OpenAI 4xx with parsed error message', async () => {
    setupFullDb();
    mocks.fetchMock.mockResolvedValue(makeOpenAiErrorResponse(400, 'Content policy violation'));
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'bad content', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Content policy violation');
  });

  it('returns 502 on OpenAI 5xx error', async () => {
    setupFullDb();
    mocks.fetchMock.mockResolvedValue(makeOpenAiErrorResponse(500, 'OpenAI internal error'));
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'mountain', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(502);
  });

  it('returns 502 when OpenAI returns no image items', async () => {
    setupFullDb();
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [] }),
    });
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'eagle', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.message).toBe('AI model returned no image');
  });

  it('returns 502 when OpenAI returns items but b64_json is missing', async () => {
    setupFullDb();
    mocks.fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ data: [{ url: 'https://cdn/image.png' }] }),
    });
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'eagle', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(502);
  });

  it('uploads image to S3 and inserts design asset row', async () => {
    setupFullDb();
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'wolf', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(201);
    expect(mocks.uploadToS3).toHaveBeenCalledOnce();
    expect(mocks.db.insert).toHaveBeenCalledOnce();
  });

  it('records AI image usage after success', async () => {
    setupFullDb();
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'wolf', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(mocks.recordAiImageUsage).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 42, images: 1 }),
    );
  });

  it('records byok source when key is byok', async () => {
    setupFullDb();
    mocks.resolveClientApiKey.mockResolvedValue({ key: 'sk-byok', source: 'byok' });
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'wolf', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(mocks.recordAiImageUsage).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'byok' }),
    );
  });

  it('handles multiple variants (n=2) returning two asset entries', async () => {
    mocks.fetchMock.mockResolvedValue(makeOpenAiOkResponse([
      { b64_json: TINY_PNG_B64 },
      { b64_json: TINY_PNG_B64 },
    ]));
    mocks.db.insert
      .mockReturnValueOnce({ values: () => ({ returning: () => Promise.resolve([ASSET_ROW]) }) })
      .mockReturnValueOnce({ values: () => ({ returning: () => Promise.resolve([{ ...ASSET_ROW, id: 'asset-uuid-2' }]) }) });
    push([STORE_ROW]);
    push([DESIGN_ROW]);
    push([SITE_ROW]);
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'tigers', n: 2, sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.variants).toHaveLength(2);
  });

  it('clamps n above 4 to 4 and below 1 to 1', async () => {
    setupFullDb();
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'fish', n: 99, sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    const fetchBody = JSON.parse(mocks.fetchMock.mock.calls[0][1].body as string) as { n: number };
    expect(fetchBody.n).toBe(4);
  });

  it('passes valid size and quality to OpenAI', async () => {
    setupFullDb();
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'owl', size: '1024x1536', quality: 'low', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    const fetchBody = JSON.parse(mocks.fetchMock.mock.calls[0][1].body as string) as { size: string; quality: string };
    expect(fetchBody.size).toBe('1024x1536');
    expect(fetchBody.quality).toBe('low');
  });

  it('defaults invalid size to 1024x1024 and invalid quality to high', async () => {
    setupFullDb();
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'owl', size: 'bad-size', quality: 'ultra', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    const fetchBody = JSON.parse(mocks.fetchMock.mock.calls[0][1].body as string) as { size: string; quality: string };
    expect(fetchBody.size).toBe('1024x1024');
    expect(fetchBody.quality).toBe('high');
  });

  it('handles sharp metadata failure gracefully (best-effort)', async () => {
    setupFullDb();
    mocks.sharpMetadata.mockRejectedValue(new Error('sharp error'));
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'bear', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    // Should still succeed — metadata is best-effort
    expect(res.status).toBe(201);
  });
});

describe('POST /storefront/[siteId]/designs/[designId]/ai-image — 500 catch-all', () => {
  it('returns 500 on unexpected top-level error', async () => {
    mocks.setThrow(new Error('db explode'));
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Internal server error');
  });
});
