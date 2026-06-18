// @vitest-environment node
/**
 * Unit tests for four portal branding routes (batch 28f):
 *
 *  1. POST /api/portal/branding/generate-block-copy
 *  2. POST /api/portal/branding/generate-messaging
 *  3. POST /api/portal/branding/generate-theme
 *  4. GET/PUT /api/portal/branding/messaging
 *
 * All AI calls are mocked through the Anthropic SDK shim — no real network
 * requests are made. The DB is also fully mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock collaborators (declared BEFORE the route imports — Vitest hoists vi.mock)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const getBrandMessagingMock = vi.fn();
vi.mock('@/lib/branding', () => ({
  getBrandMessaging: (...args: unknown[]) => getBrandMessagingMock(...args),
}));

const buildBlockCopySystemPromptMock = vi.fn();
const buildBlockCopyUserPromptMock = vi.fn();
vi.mock('@/lib/branding/copy-prompt', () => ({
  buildBlockCopySystemPrompt: (...args: unknown[]) =>
    buildBlockCopySystemPromptMock(...args),
  buildBlockCopyUserPrompt: (...args: unknown[]) =>
    buildBlockCopyUserPromptMock(...args),
}));

const resolveClientApiKeyMock = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => resolveClientApiKeyMock(...args),
}));

const recordAiUsageMock = vi.fn();
vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: (...args: unknown[]) => recordAiUsageMock(...args),
}));

const checkAiPlanGateMock = vi.fn();
vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => checkAiPlanGateMock(...args),
}));

// ---- AI seam — mock complete() so no real SDK or network calls happen ----
const completeMock = vi.fn();
vi.mock('@/lib/ai/llm', () => ({
  complete: (...args: unknown[]) => completeMock(...args),
  completeObject: vi.fn(),
  streamComplete: vi.fn(),
}));

// ---- schema mock ----
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
    brandingMessaging: wrap('brandingMessaging'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- in-memory DB shape for the messaging route ----
interface MockState {
  brandingMessaging: Array<Record<string, unknown>>;
  _idCounter: number;
}
const state: MockState = {
  brandingMessaging: [],
  _idCounter: 5000,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[
    name
  ] ?? [];
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
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'isNull': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === null || row[col.__col] === undefined;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      limit(n: number) {
        limit = n;
        return runQuery();
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };
    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) =>
        evalPredicate(filter, r),
      );
      let out = rows.map((r) => ({ ...r }));
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(row: Record<string, unknown>) {
        const inserted = { id: ++state._idCounter, ...row };
        tableArray(table.__table).push(inserted);
        return {
          returning() {
            return Promise.resolve([{ ...inserted }]);
          },
          then(
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) {
            return Promise.resolve([{ ...inserted }]).then(
              onFulfilled,
              onRejected,
            );
          },
        };
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = tableArray(table.__table).filter((r) =>
              evalPredicate(filter, r),
            );
            for (const r of rows) Object.assign(r, patch);
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(
                onFulfilled: (v: unknown) => unknown,
                onRejected?: (e: unknown) => unknown,
              ) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(
                  onFulfilled,
                  onRejected,
                );
              },
            };
          },
        };
      },
    };
  }

  return {
    db: {
      select(_proj?: unknown) {
        return {
          from(table: { __table: string }) {
            return buildSelect().from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
      update(table: { __table: string }) {
        return buildUpdate(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Modules under test
// ---------------------------------------------------------------------------

const generateBlockCopyMod = await import(
  '@/app/api/portal/branding/generate-block-copy/route'
);
const generateMessagingMod = await import(
  '@/app/api/portal/branding/generate-messaging/route'
);
const generateThemeMod = await import(
  '@/app/api/portal/branding/generate-theme/route'
);
const messagingMod = await import('@/app/api/portal/branding/messaging/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonReq(
  url: string,
  body: Record<string, unknown>,
  method = 'POST',
): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBareReq(url: string, method = 'GET'): Request {
  return new Request(url, { method });
}

function aiResp(text: string) {
  return {
    text,
    usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
  };
}

beforeEach(() => {
  state.brandingMessaging.length = 0;
  state._idCounter = 5000;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  getBrandMessagingMock.mockReset();
  buildBlockCopySystemPromptMock.mockReset().mockReturnValue('SYSTEM');
  buildBlockCopyUserPromptMock.mockReset().mockReturnValue('USER');
  resolveClientApiKeyMock
    .mockReset()
    .mockResolvedValue({ source: 'platform', key: 'sk-test' });
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
  checkAiPlanGateMock.mockReset().mockResolvedValue({ allowed: true });
  completeMock.mockReset();

  // sane defaults
  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
  getBrandMessagingMock.mockResolvedValue({ tagline: 'Go far' });
});

// ===========================================================================
// generate-block-copy
// ===========================================================================

describe('POST /api/portal/branding/generate-block-copy', () => {
  const url = 'http://x/api/portal/branding/generate-block-copy';

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when the user has no id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when getPortalClient returns null', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 400 when blockType is missing', async () => {
    const res = await generateBlockCopyMod.POST(makeJsonReq(url, {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('blockType is required');
  });

  it('returns 400 when blockType is not a string', async () => {
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 123 }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 402 when the AI plan gate denies the request', async () => {
    checkAiPlanGateMock.mockResolvedValueOnce({
      allowed: false,
      message: 'Upgrade plan',
      reason: 'limit',
    });
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: 'Upgrade plan',
      reason: 'limit',
    });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('returns 200 with parsed JSON on the happy path', async () => {
    completeMock.mockResolvedValueOnce(
      aiResp('{"headline":"Hello","sub":"World"}'),
    );
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero', context: 'home' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { headline: 'Hello', sub: 'World' },
    });
  });

  it('resolves the client API key before calling complete', async () => {
    resolveClientApiKeyMock.mockResolvedValueOnce({
      source: 'byok',
      key: 'sk-byok-abc',
    });
    completeMock.mockResolvedValueOnce(aiResp('{"headline":"hi"}'));
    await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(resolveClientApiKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, provider: 'anthropic' }),
    );
    expect(completeMock).toHaveBeenCalled();
  });

  it('forwards profileId and variants into getBrandMessaging + user prompt', async () => {
    completeMock.mockResolvedValueOnce(aiResp('{"variants":[]}'));
    await generateBlockCopyMod.POST(
      makeJsonReq(url, {
        blockType: 'hero',
        profileId: 42,
        variants: 3,
        context: 'about',
      }),
    );
    expect(getBrandMessagingMock).toHaveBeenCalledWith(10, 42);
    expect(buildBlockCopyUserPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        blockType: 'hero',
        context: 'about',
        variants: 3,
      }),
      expect.anything(),
    );
  });

  it('defaults variants to 1 when not a number and profileId to null', async () => {
    completeMock.mockResolvedValueOnce(aiResp('{"x":1}'));
    await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero', profileId: 'nope', variants: 'x' }),
    );
    expect(getBrandMessagingMock).toHaveBeenCalledWith(10, null);
    expect(buildBlockCopyUserPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({ variants: 1 }),
      expect.anything(),
    );
  });

  it('records AI usage with combined input+output tokens', async () => {
    completeMock.mockResolvedValueOnce({
      text: '{"a":1}',
      usage: { inputTokens: 7, outputTokens: 13, totalTokens: 20 },
    });
    await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 10,
        source: 'platform',
        tokens: 20,
      }),
    );
  });

  it('strips ```json fences before parsing', async () => {
    completeMock.mockResolvedValueOnce(
      aiResp('```json\n{"headline":"Hi"}\n```'),
    );
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ headline: 'Hi' });
  });

  it('returns 502 when the model returns non-JSON', async () => {
    completeMock.mockResolvedValueOnce(aiResp('totally not json'));
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.message).toBe('Model returned non-JSON');
    expect(body.raw).toBe('totally not json');
  });

  it('parses valid JSON text returned by the seam', async () => {
    completeMock.mockResolvedValueOnce({
      text: '{"ok":true}',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    });
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ ok: true });
  });

  it('handles missing usage object — tokens default to 0', async () => {
    completeMock.mockResolvedValueOnce({
      text: '{"ok":true}',
      usage: undefined,
    });
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(res.status).toBe(200);
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ tokens: 0 }),
    );
  });

  it('returns 500 with the error message when Anthropic rejects', async () => {
    completeMock.mockRejectedValueOnce(new Error('boom'));
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('boom');
  });

  it('returns 500 with generic message when a non-Error is thrown', async () => {
    completeMock.mockRejectedValueOnce('oh no');
    const res = await generateBlockCopyMod.POST(
      makeJsonReq(url, { blockType: 'hero' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Generation failed');
  });
});

// ===========================================================================
// generate-messaging
// ===========================================================================

describe('POST /api/portal/branding/generate-messaging', () => {
  const url = 'http://x/api/portal/branding/generate-messaging';

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await generateMessagingMod.POST(
      makeJsonReq(url, { description: 'acme' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when the user has no id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await generateMessagingMod.POST(
      makeJsonReq(url, { description: 'acme' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when getPortalClient returns null', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await generateMessagingMod.POST(
      makeJsonReq(url, { description: 'acme' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when description is missing', async () => {
    const res = await generateMessagingMod.POST(makeJsonReq(url, {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Description is required');
  });

  it('returns 400 when description is whitespace only', async () => {
    const res = await generateMessagingMod.POST(
      makeJsonReq(url, { description: '   ' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 402 when the AI plan gate denies the request', async () => {
    checkAiPlanGateMock.mockResolvedValueOnce({
      allowed: false,
      message: 'Quota exceeded',
      reason: 'quota',
    });
    const res = await generateMessagingMod.POST(
      makeJsonReq(url, { description: 'acme' }),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: 'Quota exceeded',
      reason: 'quota',
    });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('returns 200 with parsed messaging JSON on the happy path', async () => {
    completeMock.mockResolvedValueOnce(
      aiResp('{"companyName":"Acme","tagline":"We make stuff"}'),
    );
    const res = await generateMessagingMod.POST(
      makeJsonReq(url, { description: 'A widget maker' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      companyName: 'Acme',
      tagline: 'We make stuff',
    });
  });

  it('resolves the client API key before calling complete', async () => {
    resolveClientApiKeyMock.mockResolvedValueOnce({
      source: 'byok',
      key: 'sk-msg-key',
    });
    completeMock.mockResolvedValueOnce(aiResp('{"companyName":"x"}'));
    await generateMessagingMod.POST(
      makeJsonReq(url, { description: 'acme' }),
    );
    expect(resolveClientApiKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, provider: 'anthropic' }),
    );
    expect(completeMock).toHaveBeenCalled();
  });

  it('strips ```json fences before parsing', async () => {
    completeMock.mockResolvedValueOnce(
      aiResp('```json\n{"companyName":"Acme"}\n```'),
    );
    const res = await generateMessagingMod.POST(
      makeJsonReq(url, { description: 'acme' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ companyName: 'Acme' });
  });

  it('records AI usage with combined tokens', async () => {
    completeMock.mockResolvedValueOnce({
      text: '{"companyName":"x"}',
      usage: { inputTokens: 4, outputTokens: 6, totalTokens: 10 },
    });
    await generateMessagingMod.POST(
      makeJsonReq(url, { description: 'acme' }),
    );
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, tokens: 10 }),
    );
  });

  it('returns 500 when the model returns non-JSON', async () => {
    completeMock.mockResolvedValueOnce(aiResp('not parseable'));
    const res = await generateMessagingMod.POST(
      makeJsonReq(url, { description: 'acme' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Failed to generate messaging');
  });

  it('returns 500 when Anthropic rejects', async () => {
    completeMock.mockRejectedValueOnce(new Error('network'));
    const res = await generateMessagingMod.POST(
      makeJsonReq(url, { description: 'acme' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Failed to generate messaging');
  });
});

// ===========================================================================
// generate-theme
// ===========================================================================

describe('POST /api/portal/branding/generate-theme', () => {
  const url = 'http://x/api/portal/branding/generate-theme';

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await generateThemeMod.POST(
      makeJsonReq(url, { description: 'a brand' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when the user has no id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await generateThemeMod.POST(
      makeJsonReq(url, { description: 'a brand' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when getPortalClient returns null', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await generateThemeMod.POST(
      makeJsonReq(url, { description: 'a brand' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when description is missing', async () => {
    const res = await generateThemeMod.POST(makeJsonReq(url, {}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Description is required');
  });

  it('returns 400 when description is whitespace only', async () => {
    const res = await generateThemeMod.POST(
      makeJsonReq(url, { description: '  \t  ' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 402 when the AI plan gate denies the request', async () => {
    checkAiPlanGateMock.mockResolvedValueOnce({
      allowed: false,
      message: 'Plan locked',
      reason: 'plan',
    });
    const res = await generateThemeMod.POST(
      makeJsonReq(url, { description: 'a brand' }),
    );
    expect(res.status).toBe(402);
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('returns 200 with parsed theme JSON on the happy path', async () => {
    completeMock.mockResolvedValueOnce(
      aiResp('{"primaryColor":"#112233","headingFont":"Inter"}'),
    );
    const res = await generateThemeMod.POST(
      makeJsonReq(url, { description: 'modern minimal' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      primaryColor: '#112233',
      headingFont: 'Inter',
    });
  });

  it('resolves the client API key before calling complete', async () => {
    resolveClientApiKeyMock.mockResolvedValueOnce({
      source: 'byok',
      key: 'sk-theme',
    });
    completeMock.mockResolvedValueOnce(aiResp('{"primaryColor":"#000"}'));
    await generateThemeMod.POST(
      makeJsonReq(url, { description: 'modern minimal' }),
    );
    expect(resolveClientApiKeyMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, provider: 'anthropic' }),
    );
    expect(completeMock).toHaveBeenCalled();
  });

  it('records AI usage with combined tokens (called BEFORE parsing in this route)', async () => {
    completeMock.mockResolvedValueOnce({
      text: '{"primaryColor":"#000"}',
      usage: { inputTokens: 9, outputTokens: 21, totalTokens: 30 },
    });
    await generateThemeMod.POST(
      makeJsonReq(url, { description: 'modern minimal' }),
    );
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, tokens: 30 }),
    );
  });

  it('strips ```json fences before parsing', async () => {
    completeMock.mockResolvedValueOnce(
      aiResp('```json\n{"primaryColor":"#abc"}\n```'),
    );
    const res = await generateThemeMod.POST(
      makeJsonReq(url, { description: 'a brand' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ primaryColor: '#abc' });
  });

  it('returns 500 when the model returns non-JSON', async () => {
    completeMock.mockResolvedValueOnce(aiResp('nonsense'));
    const res = await generateThemeMod.POST(
      makeJsonReq(url, { description: 'a brand' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Failed to generate theme');
  });

  it('returns 500 when Anthropic rejects', async () => {
    completeMock.mockRejectedValueOnce(new Error('down'));
    const res = await generateThemeMod.POST(
      makeJsonReq(url, { description: 'a brand' }),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('Failed to generate theme');
  });
});

// ===========================================================================
// messaging — GET + PUT
// ===========================================================================

describe('GET /api/portal/branding/messaging', () => {
  const baseUrl = 'http://x/api/portal/branding/messaging';

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await messagingMod.GET(makeBareReq(baseUrl));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when user has no id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await messagingMod.GET(makeBareReq(baseUrl));
    expect(res.status).toBe(401);
  });

  it('returns 404 when getPortalClient returns null', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await messagingMod.GET(makeBareReq(baseUrl));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns null data when no row exists (no profileId)', async () => {
    const res = await messagingMod.GET(makeBareReq(baseUrl));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: null });
  });

  it('returns the existing row matching client + null brandingProfileId', async () => {
    state.brandingMessaging.push({
      id: 1,
      clientId: 10,
      brandingProfileId: null,
      companyName: 'Acme',
      tagline: 'The default one',
    });
    state.brandingMessaging.push({
      id: 2,
      clientId: 10,
      brandingProfileId: 50,
      companyName: 'Other',
      tagline: 'profile-scoped',
    });
    const res = await messagingMod.GET(makeBareReq(baseUrl));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      id: 1,
      companyName: 'Acme',
      tagline: 'The default one',
    });
  });

  it('returns row matching a specific profileId via ?profileId=', async () => {
    state.brandingMessaging.push({
      id: 1,
      clientId: 10,
      brandingProfileId: null,
      companyName: 'Default',
    });
    state.brandingMessaging.push({
      id: 7,
      clientId: 10,
      brandingProfileId: 42,
      companyName: 'Scoped',
    });
    const res = await messagingMod.GET(
      makeBareReq(`${baseUrl}?profileId=42`),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ id: 7, companyName: 'Scoped' });
  });

  it('does not leak other clients data', async () => {
    state.brandingMessaging.push({
      id: 99,
      clientId: 999,
      brandingProfileId: null,
      companyName: 'NotMine',
    });
    const res = await messagingMod.GET(makeBareReq(baseUrl));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeNull();
  });
});

describe('PUT /api/portal/branding/messaging', () => {
  const baseUrl = 'http://x/api/portal/branding/messaging';

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await messagingMod.PUT(
      makeJsonReq(baseUrl, { tagline: 'hi' }, 'PUT'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when user has no id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await messagingMod.PUT(
      makeJsonReq(baseUrl, { tagline: 'hi' }, 'PUT'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when getPortalClient returns null', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await messagingMod.PUT(
      makeJsonReq(baseUrl, { tagline: 'hi' }, 'PUT'),
    );
    expect(res.status).toBe(404);
  });

  it('inserts a new row when none exists (default brandingProfileId=null)', async () => {
    const res = await messagingMod.PUT(
      makeJsonReq(
        baseUrl,
        {
          companyName: 'Acme',
          tagline: 'Build it',
          missionStatement: 'Empower devs',
          keyDifferentiators: ['fast', 'safe'],
        },
        'PUT',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      clientId: 10,
      brandingProfileId: null,
      companyName: 'Acme',
      tagline: 'Build it',
      missionStatement: 'Empower devs',
      keyDifferentiators: ['fast', 'safe'],
    });
    expect(state.brandingMessaging).toHaveLength(1);
  });

  it('inserts a new row scoped to a brandingProfileId', async () => {
    const res = await messagingMod.PUT(
      makeJsonReq(
        baseUrl,
        { brandingProfileId: 77, companyName: 'ScopedCo' },
        'PUT',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      clientId: 10,
      brandingProfileId: 77,
      companyName: 'ScopedCo',
    });
  });

  it('updates an existing row instead of inserting a new one', async () => {
    state.brandingMessaging.push({
      id: 33,
      clientId: 10,
      brandingProfileId: null,
      companyName: 'OldName',
      tagline: 'old tag',
    });

    const res = await messagingMod.PUT(
      makeJsonReq(
        baseUrl,
        { companyName: 'NewName', tagline: 'new tag' },
        'PUT',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      id: 33,
      companyName: 'NewName',
      tagline: 'new tag',
    });
    expect(state.brandingMessaging).toHaveLength(1);
    expect(state.brandingMessaging[0].companyName).toBe('NewName');
  });

  it('updates the row scoped to a specific profileId without touching other profiles', async () => {
    state.brandingMessaging.push({
      id: 1,
      clientId: 10,
      brandingProfileId: null,
      companyName: 'Default',
    });
    state.brandingMessaging.push({
      id: 2,
      clientId: 10,
      brandingProfileId: 50,
      companyName: 'ScopedOld',
    });

    const res = await messagingMod.PUT(
      makeJsonReq(
        baseUrl,
        { brandingProfileId: 50, companyName: 'ScopedNew' },
        'PUT',
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({ id: 2, companyName: 'ScopedNew' });

    const def = state.brandingMessaging.find((r) => r.id === 1);
    expect(def?.companyName).toBe('Default');
  });

  it('null-coerces all optional fields when omitted', async () => {
    const res = await messagingMod.PUT(makeJsonReq(baseUrl, {}, 'PUT'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      clientId: 10,
      brandingProfileId: null,
      companyName: null,
      tagline: null,
      missionStatement: null,
      visionStatement: null,
      valueProposition: null,
      toneOfVoice: null,
      brandPersonality: null,
      writingStyle: null,
      elevatorPitch: null,
      boilerplate: null,
      keyDifferentiators: null,
      targetAudience: null,
      industry: null,
      yearFounded: null,
      companySize: null,
      headquarters: null,
      websiteUrl: null,
      socialProof: null,
      keyClients: null,
      certifications: null,
      additionalContext: null,
      toneAxes: null,
      voiceSamples: null,
    });
  });

  it('passes through richer fields (toneAxes, voiceSamples)', async () => {
    const toneAxes = { formal: 7, technical: 5 };
    const voiceSamples = ['Sample A', 'Sample B'];
    const res = await messagingMod.PUT(
      makeJsonReq(baseUrl, { toneAxes, voiceSamples }, 'PUT'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.toneAxes).toEqual(toneAxes);
    expect(body.data.voiceSamples).toEqual(voiceSamples);
  });
});
