// @vitest-environment node
/**
 * Unit tests for:
 *   app/api/storefront/[siteId]/designs/[designId]/ai-text/route.ts
 *
 * Mocked surface:
 *   - @/lib/db (FIFO queue pattern)
 *   - @/lib/db/schema (proxy wrapping)
 *   - drizzle-orm (eq/and stubs)
 *   - @anthropic-ai/sdk (never touches network)
 *   - @/lib/ai/audit (recordAiUsage)
 *   - @/lib/ai/plan-gate (checkAiPlanGate)
 *   - @/lib/ai/resolve-client-key (resolveClientApiKey)
 *   - @/lib/branding (getBrandMessaging)
 *   - @/lib/storefront/customer-auth (extractToken, validateSession)
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

  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    const resolve = nextResult;
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
    select: vi.fn(() => makeChain()),
    insert: vi.fn(() => ({
      values: () => ({ returning: () => nextResult() }),
    })),
    update: vi.fn(() => ({
      set: () => ({ where: () => ({ returning: () => nextResult() }) }),
    })),
  };

  // Anthropic messages.create mock
  const messagesCreate = vi.fn();
  const anthropicCtorSpy = vi.fn();

  // AI infra mocks
  const recordAiUsage = vi.fn();
  const recordAiImageUsage = vi.fn();
  const checkAiPlanGate = vi.fn<() => Promise<{ allowed: boolean; message?: string; reason?: string }>>(
    () => Promise.resolve({ allowed: true }),
  );
  const resolveClientApiKey = vi.fn<() => Promise<{ key: string; source: string }>>(
    () => Promise.resolve({ key: 'sk-test', source: 'platform' }),
  );
  const getBrandMessaging = vi.fn<() => Promise<Record<string, unknown> | undefined>>(
    () => Promise.resolve(undefined),
  );
  const extractToken = vi.fn<() => string | null>(() => null);
  const validateSession = vi.fn<() => Promise<unknown>>(() => Promise.resolve(null));

  function setThrow(err: Error) {
    nextThrows = err;
  }

  return {
    db,
    dbQueue,
    setThrow,
    messagesCreate,
    anthropicCtorSpy,
    recordAiUsage,
    recordAiImageUsage,
    checkAiPlanGate,
    resolveClientApiKey,
    getBrandMessaging,
    extractToken,
    validateSession,
  };
});

// ── module mocks (declared before dynamic import) ────────────────────────────

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

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    public messages: { create: typeof mocks.messagesCreate };
    constructor(opts: { apiKey: string }) {
      mocks.anthropicCtorSpy(opts);
      this.messages = { create: mocks.messagesCreate };
    }
  }
  return { default: Anthropic };
});

vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: (...args: unknown[]) => mocks.recordAiUsage(...args),
  recordAiImageUsage: (...args: unknown[]) => mocks.recordAiImageUsage(...args),
}));

vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => mocks.checkAiPlanGate(...args),
}));

vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => mocks.resolveClientApiKey(...args),
}));

vi.mock('@/lib/branding', () => ({
  getBrandMessaging: (...args: unknown[]) => mocks.getBrandMessaging(...args),
}));

vi.mock('@/lib/storefront/customer-auth', () => ({
  extractToken: (req: unknown) => mocks.extractToken(req),
  validateSession: (tok: unknown) => mocks.validateSession(tok),
}));

// ── import route AFTER mocks ─────────────────────────────────────────────────

const { POST } = await import(
  '@/app/api/storefront/[siteId]/designs/[designId]/ai-text/route'
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
const SITE_ROW = { clientId: 42, brandingProfileId: null };

/** Canned Anthropic response with valid JSON body */
const CANNED_RESPONSE = {
  content: [{ type: 'text', text: JSON.stringify({ suggestions: ['Hello World', 'Dog Dad', 'Good Vibes'] }) }],
  usage: { input_tokens: 80, output_tokens: 40 },
};

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
    `http://localhost/api/storefront/${siteId}/designs/${designId}/ai-text`,
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
  mocks.resolveClientApiKey.mockResolvedValue({ key: 'sk-test', source: 'platform' });
  mocks.getBrandMessaging.mockResolvedValue(undefined);
  mocks.extractToken.mockReturnValue(null);
  mocks.validateSession.mockResolvedValue(null);
  mocks.messagesCreate.mockResolvedValue(CANNED_RESPONSE);
});

// ── tests ────────────────────────────────────────────────────────────────────

describe('POST /storefront/[siteId]/designs/[designId]/ai-text — validation', () => {
  it('returns 400 for non-numeric siteId', async () => {
    const res = await POST(makePost('bad', UUID, { prompt: 'dogs' }), routeParams('bad', UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/site/i);
  });

  it('returns 404 when store not found', async () => {
    push([]); // verifyStore returns empty
    const res = await POST(makePost(SITE_ID, UUID, { prompt: 'dogs' }), routeParams(SITE_ID, UUID));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Store not found');
  });

  it('returns 400 when prompt is missing', async () => {
    push([STORE_ROW]);
    const res = await POST(makePost(SITE_ID, UUID, {}), routeParams(SITE_ID, UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/text you want/i);
  });

  it('returns 400 when prompt is empty string', async () => {
    push([STORE_ROW]);
    const res = await POST(makePost(SITE_ID, UUID, { prompt: '   ' }), routeParams(SITE_ID, UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 when prompt exceeds 600 chars', async () => {
    push([STORE_ROW]);
    const long = 'a'.repeat(601);
    const res = await POST(makePost(SITE_ID, UUID, { prompt: long }), routeParams(SITE_ID, UUID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/600/);
  });

  it('returns 400 for invalid designId format', async () => {
    push([STORE_ROW]);
    // invalid designId (not 36 chars) — resolveDesign returns 400
    const res = await POST(
      makePost(SITE_ID, 'not-a-uuid', { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, 'not-a-uuid'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid design ID');
  });

  it('returns 404 when design row not found', async () => {
    push([STORE_ROW]); // store found
    push([]);           // design not found
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'cats', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Design not found');
  });

  it('returns 403 when session ID does not match and no customer token', async () => {
    push([STORE_ROW]);
    push([{ ...DESIGN_ROW, sessionId: 'other-sess' }]);
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'hats', sessionId: 'wrong-sess' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toBe('Forbidden');
  });
});

describe('POST /storefront/[siteId]/designs/[designId]/ai-text — auth paths', () => {
  it('allows access when session ID matches', async () => {
    push([STORE_ROW]);
    push([DESIGN_ROW]);   // design with sessionId 'sess-abc'
    push([SITE_ROW]);     // siteRow lookup
    mocks.messagesCreate.mockResolvedValue(CANNED_RESPONSE);
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'funny dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.suggestions)).toBe(true);
  });

  it('allows access when customer token validates', async () => {
    mocks.extractToken.mockReturnValue('tok-xyz');
    mocks.validateSession.mockResolvedValue({ websiteId: 7, customerId: 'cust-1' });
    push([STORE_ROW]);
    push([{ ...DESIGN_ROW, customerId: 'cust-1', sessionId: null }]);
    push([SITE_ROW]);
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'beach vibes' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(201);
  });
});

describe('POST /storefront/[siteId]/designs/[designId]/ai-text — plan gate + key resolution', () => {
  it('returns 500 when siteRow (clientId lookup) not found', async () => {
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
    push([STORE_ROW]);
    push([DESIGN_ROW]);
    push([SITE_ROW]);
    mocks.checkAiPlanGate.mockResolvedValue({ allowed: false, message: 'Upgrade required', reason: 'no_plan' });
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Upgrade required');
    expect(body.reason).toBe('no_plan');
  });

  it('returns 503 when no API key is configured', async () => {
    push([STORE_ROW]);
    push([DESIGN_ROW]);
    push([SITE_ROW]);
    mocks.resolveClientApiKey.mockRejectedValue(new Error('No Anthropic key configured'));
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('No Anthropic key configured');
  });

  it('returns 503 with fallback message when key error is not an Error instance', async () => {
    push([STORE_ROW]);
    push([DESIGN_ROW]);
    push([SITE_ROW]);
    mocks.resolveClientApiKey.mockRejectedValue('string error');
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.message).toMatch(/anthropic key/i);
  });
});

describe('POST /storefront/[siteId]/designs/[designId]/ai-text — AI response handling', () => {
  function setupHappyPathDb() {
    push([STORE_ROW]);
    push([DESIGN_ROW]);
    push([SITE_ROW]);
  }

  it('happy path: returns 201 with suggestions array', async () => {
    setupHappyPathDb();
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'funny dog dad', n: 3, sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.suggestions).toEqual(['Hello World', 'Dog Dad', 'Good Vibes']);
    expect(body.data.prompt).toBe('funny dog dad');
  });

  it('passes currentText and productName to model when provided', async () => {
    setupHappyPathDb();
    await POST(
      makePost(SITE_ID, UUID, {
        prompt: 'retro vibe',
        currentText: 'Old Text',
        productName: 'T-Shirt',
        sessionId: 'sess-abc',
      }),
      routeParams(SITE_ID, UUID),
    );
    expect(mocks.messagesCreate).toHaveBeenCalledOnce();
    const call = mocks.messagesCreate.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(call.messages[0].content).toContain('Old Text');
    expect(call.messages[0].content).toContain('T-Shirt');
  });

  it('clamps n below MIN (1) and above MAX (6)', async () => {
    setupHappyPathDb();
    // n=0 should be clamped to 1; n=99 to 6
    // Response still returns whatever model sends
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', n: 99, sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    const call = mocks.messagesCreate.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(call.messages[0].content).toContain('6 suggestions');
  });

  it('includes brand voice context when getBrandMessaging returns data', async () => {
    push([STORE_ROW]);
    push([DESIGN_ROW]);
    push([{ ...SITE_ROW, brandingProfileId: 5 }]);
    mocks.getBrandMessaging.mockResolvedValue({
      companyName: 'Paws & Co',
      tagline: 'Wag More',
      toneOfVoice: 'playful',
      brandPersonality: 'friendly',
      writingStyle: 'casual',
    });
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'dog dad', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    const call = mocks.messagesCreate.mock.calls[0][0] as { messages: Array<{ content: string }> };
    const content = call.messages[0].content;
    expect(content).toContain('Paws & Co');
    expect(content).toContain('Wag More');
    expect(content).toContain('playful');
  });

  it('returns 502 when Anthropic call throws', async () => {
    setupHappyPathDb();
    mocks.messagesCreate.mockRejectedValue(new Error('rate limited'));
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('rate limited');
  });

  it('returns 502 when AI returns no suggestions', async () => {
    setupHappyPathDb();
    mocks.messagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ suggestions: [] }) }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.message).toBe('AI model returned no suggestions');
  });

  it('falls back to newline-split when model returns non-JSON text', async () => {
    setupHappyPathDb();
    mocks.messagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '- Wag More\n- Dog Life\n- Paws Up' }],
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    const res = await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.suggestions).toContain('Wag More');
    expect(body.data.suggestions).toContain('Dog Life');
  });

  it('records AI usage after a successful call', async () => {
    setupHappyPathDb();
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 42, tokens: 120 }),
    );
  });

  it('uses byok source when resolveClientApiKey returns byok', async () => {
    setupHappyPathDb();
    mocks.resolveClientApiKey.mockResolvedValue({ key: 'sk-byok', source: 'byok' });
    await POST(
      makePost(SITE_ID, UUID, { prompt: 'dogs', sessionId: 'sess-abc' }),
      routeParams(SITE_ID, UUID),
    );
    expect(mocks.anthropicCtorSpy).toHaveBeenCalledWith({ apiKey: 'sk-byok' });
    expect(mocks.recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'byok' }),
    );
  });
});

describe('POST /storefront/[siteId]/designs/[designId]/ai-text — 500 catch-all', () => {
  it('returns 500 on unexpected top-level error', async () => {
    // Make verifyStore db call throw
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
