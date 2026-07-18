// @vitest-environment node
/**
 * Unit tests for two portal routes:
 *
 *  1. POST /api/portal/cms/websites/[siteId]/blocks/restyle
 *     — exercises auth, siteId validation, resolveClientSite, getStyleSurface,
 *       checkAiPlanGate, resolveClientApiKey, Anthropic SDK (mocked — never
 *       hits the network), getBrandingByWebsiteId + getBrandMessaging,
 *       pickPhilosophies, prompt builders, validateStyleVariantsResponse,
 *       recordAiUsage, and the JSON-parse-with-fences cleaning logic.
 *
 *  2. GET/PUT /api/portal/websites/[siteId]/branding
 *     — exercises auth, getPortalClient, site ownership check, drizzle
 *       reads/writes against siteBranding + clientWebsites + brandingProfiles,
 *       defaults handling, and the branding-profile sync side effect.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock collaborators (declared BEFORE the route imports — Vitest hoists vi.mock)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const resolveClientSiteMock = vi.fn();
const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const getBrandingByWebsiteIdMock = vi.fn();
const getBrandMessagingMock = vi.fn();
vi.mock('@/lib/branding', () => ({
  getBrandingByWebsiteId: (...args: unknown[]) => getBrandingByWebsiteIdMock(...args),
  getBrandMessaging: (...args: unknown[]) => getBrandMessagingMock(...args),
}));

const getStyleSurfaceMock = vi.fn();
vi.mock('@/lib/ai/style-variants/style-surface', () => ({
  getStyleSurface: (...args: unknown[]) => getStyleSurfaceMock(...args),
}));

const pickPhilosophiesMock = vi.fn();
vi.mock('@/lib/ai/style-variants/philosophies', () => ({
  pickPhilosophies: (...args: unknown[]) => pickPhilosophiesMock(...args),
}));

const buildStyleVariantsSystemPromptMock = vi.fn();
const buildStyleVariantsUserPromptMock = vi.fn();
vi.mock('@/lib/ai/style-variants/prompt', () => ({
  buildStyleVariantsSystemPrompt: (...args: unknown[]) => buildStyleVariantsSystemPromptMock(...args),
  buildStyleVariantsUserPrompt: (...args: unknown[]) => buildStyleVariantsUserPromptMock(...args),
}));

const validateStyleVariantsResponseMock = vi.fn();
class StyleVariantsValidationErrorMock extends Error {
  details: unknown;
  constructor(message: string, details: unknown) {
    super(message);
    this.name = 'StyleVariantsValidationError';
    this.details = details;
  }
}
vi.mock('@/lib/ai/style-variants/validate', () => ({
  validateStyleVariantsResponse: (...args: unknown[]) => validateStyleVariantsResponseMock(...args),
  StyleVariantsValidationError: StyleVariantsValidationErrorMock,
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

// ---- AI seam — never let it touch the network ----
const completeMock = vi.fn();
vi.mock('@/lib/ai/llm', () => ({
  complete: (...args: unknown[]) => completeMock(...args),
}));

// ---- schema mock (shared across both routes) ----
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    clientWebsites: wrap('clientWebsites'),
    siteBranding: wrap('siteBranding'),
    brandingProfiles: wrap('brandingProfiles'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- in-memory DB shape for the branding route ----
interface MockState {
  siteBranding: Array<Record<string, unknown>>;
  clientWebsites: Array<Record<string, unknown>>;
  brandingProfiles: Array<Record<string, unknown>>;
  _idCounter: number;
}
const state: MockState = {
  siteBranding: [],
  clientWebsites: [],
  brandingProfiles: [],
  _idCounter: 1000,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
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
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };
    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
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
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve([{ ...inserted }]).then(onFulfilled, onRejected);
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
            const rows = tableArray(table.__table).filter((r) => evalPredicate(filter, r));
            for (const r of rows) Object.assign(r, patch);
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(onFulfilled, onRejected);
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

const restyleMod = await import(
  '@/app/api/portal/cms/websites/[siteId]/blocks/restyle/route'
);
const brandingMod = await import('@/app/api/portal/websites/[siteId]/branding/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJsonReq(url: string, body: Record<string, unknown>, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBareReq(url: string, method = 'GET'): Request {
  return new Request(url, { method });
}

function makeParams(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}

function aiResp(text: string, inputTokens = 100, outputTokens = 200) {
  return {
    text,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
  };
}

beforeEach(() => {
  // reset state
  state.siteBranding.length = 0;
  state.clientWebsites.length = 0;
  state.brandingProfiles.length = 0;
  state._idCounter = 1000;

  authMock.mockReset();
  resolveClientSiteMock.mockReset();
  getPortalClientMock.mockReset();
  getBrandingByWebsiteIdMock.mockReset();
  getBrandMessagingMock.mockReset();
  getStyleSurfaceMock.mockReset();
  pickPhilosophiesMock.mockReset();
  buildStyleVariantsSystemPromptMock.mockReset().mockReturnValue('SYSTEM');
  buildStyleVariantsUserPromptMock.mockReset().mockReturnValue('USER');
  validateStyleVariantsResponseMock.mockReset();
  resolveClientApiKeyMock.mockReset().mockResolvedValue({ source: 'platform', key: 'sk-test' });
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
  checkAiPlanGateMock.mockReset().mockResolvedValue({ allowed: true });
  completeMock.mockReset();

  // sane defaults for restyle
  authMock.mockResolvedValue({ user: { id: '7' } });
  resolveClientSiteMock.mockResolvedValue({ id: 42, clientId: 10 });
  getStyleSurfaceMock.mockReturnValue({ blockType: 'hero', keys: {} });
  getBrandingByWebsiteIdMock.mockResolvedValue({
    primaryColor: '#111',
    accentColor: '#222',
    backgroundColor: '#fff',
    textColor: '#000',
    headingFont: 'Inter',
    bodyFont: 'Inter',
    borderRadius: '8px',
  });
  getBrandMessagingMock.mockResolvedValue({ tagline: 'go' });
  pickPhilosophiesMock.mockReturnValue([
    { id: 'p1', name: 'P1' },
    { id: 'p2', name: 'P2' },
    { id: 'p3', name: 'P3' },
  ]);
  validateStyleVariantsResponseMock.mockReturnValue({
    variants: [{ id: 'v1', style: {} }],
    diagnostics: { warnings: [] },
  });
});

// ===========================================================================
// Restyle route
// ===========================================================================

describe('POST /api/portal/cms/websites/[siteId]/blocks/restyle', () => {
  const url = 'http://x/api/portal/cms/websites/1/blocks/restyle';

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when the user lacks an id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await restyleMod.POST(makeJsonReq(url, {}), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when siteId is not a number', async () => {
    const res = await restyleMod.POST(makeJsonReq(url, { block: { type: 'hero' } }), makeParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid siteId');
  });

  it('returns 404 when the site cannot be resolved for the user', async () => {
    resolveClientSiteMock.mockResolvedValueOnce(null);
    const res = await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Site not found');
  });

  it('returns 400 when block is missing', async () => {
    const res = await restyleMod.POST(makeJsonReq(url, {}), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('block is required');
  });

  it('returns 400 when block.type is not a string', async () => {
    const res = await restyleMod.POST(makeJsonReq(url, { block: { type: 42 } }), makeParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when getStyleSurface returns null (unsupported block type)', async () => {
    getStyleSurfaceMock.mockReturnValueOnce(null);
    const res = await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'mystery' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/not supported by the AI Style Picker/);
  });

  it('returns 402 when the AI plan gate denies the request', async () => {
    checkAiPlanGateMock.mockResolvedValueOnce({
      allowed: false,
      message: 'Upgrade',
      reason: 'plan',
    });
    const res = await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Upgrade', reason: 'plan' });
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('returns 200 with variants on the happy path', async () => {
    completeMock.mockResolvedValueOnce(
      aiResp(JSON.stringify({ variants: [{ id: 'v1', style: {} }] })),
    );
    const res = await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.variants).toEqual([{ id: 'v1', style: {} }]);
    expect(body.data.philosophies).toHaveLength(3);
    expect(body.data.diagnostics).toEqual({ warnings: [] });
  });

  it('resolveClientApiKey is called and seam receives the right clientId', async () => {
    resolveClientApiKeyMock.mockResolvedValueOnce({ source: 'byok', key: 'sk-byok-XYZ' });
    completeMock.mockResolvedValueOnce(aiResp('{"variants":[]}'));
    await restyleMod.POST(makeJsonReq(url, { block: { type: 'hero' } }), makeParams('1'));
    expect(resolveClientApiKeyMock).toHaveBeenCalled();
    expect(completeMock).toHaveBeenCalledWith(expect.objectContaining({ task: 'blockRestyle', clientId: 10 }));
  });

  it('forwards explicit philosophyIds into pickPhilosophies', async () => {
    completeMock.mockResolvedValueOnce(aiResp('{"variants":[]}'));
    await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' }, philosophyIds: ['a', 'b', 'c'] }),
      makeParams('1'),
    );
    expect(pickPhilosophiesMock).toHaveBeenCalledWith('hero', { explicitIds: ['a', 'b', 'c'] });
  });

  it('passes exploreOutsideBrand=true through to the user prompt and validator', async () => {
    completeMock.mockResolvedValueOnce(aiResp('{"variants":[]}'));
    await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' }, exploreOutsideBrand: true }),
      makeParams('1'),
    );
    expect(buildStyleVariantsUserPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({ exploreOutsideBrand: true }),
    );
    expect(validateStyleVariantsResponseMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      true,
    );
  });

  it('records AI usage with combined tokens', async () => {
    completeMock.mockResolvedValueOnce({
      text: '{"variants":[]}',
      usage: { inputTokens: 11, outputTokens: 22, totalTokens: 33 },
    });
    await restyleMod.POST(makeJsonReq(url, { block: { type: 'hero' } }), makeParams('1'));
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, source: 'platform', tokens: 33 }),
    );
  });

  it('strips ```json fences before parsing', async () => {
    completeMock.mockResolvedValueOnce(
      aiResp('```json\n{"variants":[]}\n```'),
    );
    const res = await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
  });

  it('returns 502 when the model returns non-JSON', async () => {
    completeMock.mockResolvedValueOnce(aiResp('total garbage not json'));
    const res = await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.message).toBe('Model returned non-JSON');
    expect(body.raw).toBe('total garbage not json');
  });

  it('returns 502 with details when validator throws StyleVariantsValidationError', async () => {
    validateStyleVariantsResponseMock.mockImplementationOnce(() => {
      throw new StyleVariantsValidationErrorMock('bad shape', { variants: 'missing' });
    });
    completeMock.mockResolvedValueOnce(aiResp('{"variants":[]}'));
    const res = await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.message).toBe('bad shape');
    expect(body.details).toEqual({ variants: 'missing' });
  });

  it('returns 500 on unexpected (non-validation) errors thrown by the validator', async () => {
    validateStyleVariantsResponseMock.mockImplementationOnce(() => {
      throw new Error('unexpected');
    });
    completeMock.mockResolvedValueOnce(aiResp('{"variants":[]}'));
    const res = await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toBe('unexpected');
  });

  it('returns 500 with generic message when seam call rejects', async () => {
    completeMock.mockRejectedValueOnce(new Error('network down'));
    const res = await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('network down');
  });

  it('returns 200 when seam call succeeds (content filtering is seam responsibility)', async () => {
    completeMock.mockResolvedValueOnce(aiResp('{"variants":[]}', 1, 1));
    const res = await restyleMod.POST(
      makeJsonReq(url, { block: { type: 'hero' } }),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// Branding route
// ===========================================================================

describe('GET /api/portal/websites/[siteId]/branding', () => {
  const url = 'http://x/api/portal/websites/1/branding';

  beforeEach(() => {
    // defaults for the branding route's verifySiteAccess
    getPortalClientMock.mockResolvedValue({ id: 10 });
    state.clientWebsites.push({ id: 1, clientId: 10, brandingProfileId: null });
  });

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await brandingMod.GET(makeBareReq(url), makeParams('1'));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when user has no id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await brandingMod.GET(makeBareReq(url), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when getPortalClient returns null', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await brandingMod.GET(makeBareReq(url), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 401 when the site does not belong to the user', async () => {
    state.clientWebsites.length = 0;
    state.clientWebsites.push({ id: 1, clientId: 999, brandingProfileId: null });
    const res = await brandingMod.GET(makeBareReq(url), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns defaults when no siteBranding row exists', async () => {
    const res = await brandingMod.GET(makeBareReq(url), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      websiteId: 1,
      primaryColor: '#2563eb',
      accentColor: '#f59e0b',
      backgroundColor: '#ffffff',
      textColor: '#111827',
      navTemplate: 'classic',
    });
  });

  it('returns the existing siteBranding row when present', async () => {
    state.siteBranding.push({
      id: 99,
      websiteId: 1,
      primaryColor: '#abcdef',
      accentColor: '#fedcba',
      logoText: 'Acme',
    });
    const res = await brandingMod.GET(makeBareReq(url), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      id: 99,
      websiteId: 1,
      primaryColor: '#abcdef',
      logoText: 'Acme',
    });
  });
});

describe('PUT /api/portal/websites/[siteId]/branding', () => {
  const url = 'http://x/api/portal/websites/1/branding';

  beforeEach(() => {
    getPortalClientMock.mockResolvedValue({ id: 10 });
    state.clientWebsites.push({ id: 1, clientId: 10, brandingProfileId: null });
  });

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await brandingMod.PUT(
      makeJsonReq(url, { primaryColor: '#000' }, 'PUT'),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 when the site does not belong to the user', async () => {
    state.clientWebsites.length = 0;
    state.clientWebsites.push({ id: 1, clientId: 999, brandingProfileId: null });
    const res = await brandingMod.PUT(
      makeJsonReq(url, { primaryColor: '#000' }, 'PUT'),
      makeParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('inserts a new siteBranding row when none exists', async () => {
    const res = await brandingMod.PUT(
      makeJsonReq(
        url,
        {
          primaryColor: '#aa11bb',
          logoText: 'BrandNew',
          headingFont: 'Lora',
        },
        'PUT',
      ),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      websiteId: 1,
      primaryColor: '#aa11bb',
      logoText: 'BrandNew',
      headingFont: 'Lora',
    });
    expect(state.siteBranding).toHaveLength(1);
  });

  it('applies defaults for unspecified fields on insert', async () => {
    const res = await brandingMod.PUT(makeJsonReq(url, {}, 'PUT'), makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      primaryColor: '#2563eb',
      secondaryColor: '#1e40af',
      accentColor: '#f59e0b',
      backgroundColor: '#ffffff',
      textColor: '#111827',
      navTemplate: 'classic',
      navPosition: 'top',
    });
  });

  it('updates an existing siteBranding row instead of inserting a new one', async () => {
    state.siteBranding.push({
      id: 55,
      websiteId: 1,
      primaryColor: '#oldold',
      logoText: 'OldName',
    });

    const res = await brandingMod.PUT(
      makeJsonReq(url, { primaryColor: '#newnew', logoText: 'NewName' }, 'PUT'),
      makeParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toMatchObject({
      id: 55,
      primaryColor: '#newnew',
      logoText: 'NewName',
    });
    expect(state.siteBranding).toHaveLength(1);
    expect(state.siteBranding[0].primaryColor).toBe('#newnew');
  });

  it('syncs the linked branding profile when one is attached to the site', async () => {
    state.clientWebsites.length = 0;
    state.clientWebsites.push({ id: 1, clientId: 10, brandingProfileId: 77 });
    state.brandingProfiles.push({
      id: 77,
      primaryColor: '#oldprof',
      logoUrl: 'old.png',
      navTemplate: 'old-tmpl',
    });

    const res = await brandingMod.PUT(
      makeJsonReq(
        url,
        {
          primaryColor: '#zz1188',
          logoUrl: 'new.png',
          logoAlt: 'alt-new',
          navTemplate: 'sleek',
          navBackground: '#abc',
          linkColor: '#111',
        },
        'PUT',
      ),
      makeParams('1'),
    );
    expect(res.status).toBe(200);

    const synced = state.brandingProfiles[0];
    expect(synced.primaryColor).toBe('#zz1188');
    expect(synced.logoUrl).toBe('new.png');
    expect(synced.logoAlt).toBe('alt-new');
    expect(synced.navTemplate).toBe('sleek');
    expect(synced.navBackground).toBe('#abc');
    expect(synced.linkColor).toBe('#111');
  });

  it('writes null when logoUrl/logoAlt are blank during branding-profile sync', async () => {
    state.clientWebsites.length = 0;
    state.clientWebsites.push({ id: 1, clientId: 10, brandingProfileId: 88 });
    state.brandingProfiles.push({
      id: 88,
      logoUrl: 'previous.png',
      logoAlt: 'prev',
    });

    await brandingMod.PUT(
      makeJsonReq(url, { logoUrl: '', logoAlt: '' }, 'PUT'),
      makeParams('1'),
    );

    expect(state.brandingProfiles[0].logoUrl).toBeNull();
    expect(state.brandingProfiles[0].logoAlt).toBeNull();
  });

  it('does NOT touch brandingProfiles when the site has no profile attached', async () => {
    // brandingProfileId is null by default in beforeEach
    state.brandingProfiles.push({ id: 999, primaryColor: '#untouched' });
    await brandingMod.PUT(
      makeJsonReq(url, { primaryColor: '#anything' }, 'PUT'),
      makeParams('1'),
    );
    expect(state.brandingProfiles[0].primaryColor).toBe('#untouched');
  });
});
