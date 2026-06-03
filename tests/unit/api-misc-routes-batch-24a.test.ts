// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 24a):
 *   - app/api/portal/services/route.ts              (GET)
 *   - app/api/portal/services/nav/route.ts          (GET)
 *   - app/api/portal/automations/parse/route.ts     (POST)
 *   - app/api/portal/automations/logs/route.ts      (GET)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
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
const isAuthErrorMock = vi.fn((r: unknown) => !!(r as { response?: unknown })?.response);
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) => isAuthErrorMock(r),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
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
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    services: wrap('services'),
    clientServices: wrap('clientServices'),
    automationLogs: wrap('automationLogs'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// AI credit / gate / parser mocks
const hasCreditsMock = vi.fn();
const deductCreditsMock = vi.fn();
vi.mock('@/lib/ai-credits', () => ({
  hasCredits: (...args: unknown[]) => hasCreditsMock(...args),
  deductCredits: (...args: unknown[]) => deductCreditsMock(...args),
}));

const checkAiPlanGateMock = vi.fn();
vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => checkAiPlanGateMock(...args),
}));

const parseAutomationDescriptionMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  parseAutomationDescription: (...args: unknown[]) => parseAutomationDescriptionMock(...args),
}));

// ---------------------------------------------------------------------------
// DB mock — chainable select() that resolves on terminal call
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
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

  return {
    db: {
      select() {
        return buildSelect();
      },
    },
  };
});

// ---- modules under test ----
const servicesRoute = await import('@/app/api/portal/services/route');
const servicesNavRoute = await import('@/app/api/portal/services/nav/route');
const automationsParseRoute = await import('@/app/api/portal/automations/parse/route');
const automationsLogsRoute = await import('@/app/api/portal/automations/logs/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7', name: 'Bob' } };
const OK_AUTH = { client: { id: 33 }, userId: 7 };

beforeEach(() => {
  selectQueue = [];
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  isAuthErrorMock.mockClear();
  hasCreditsMock.mockReset();
  deductCreditsMock.mockReset();
  checkAiPlanGateMock.mockReset();
  parseAutomationDescriptionMock.mockReset();
});

// ===========================================================================
// portal/services
// ===========================================================================

describe('GET /api/portal/services', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await servicesRoute.GET();
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await servicesRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns the list of active services on success', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([
      { id: 1, name: 'CMS', category: 'cms', active: true },
      { id: 2, name: 'Email', category: 'email', active: true },
    ]);
    const res = await servicesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('CMS');
  });

  it('returns an empty list when no services are active', async () => {
    authMock.mockResolvedValue(SESSION);
    selectQueue.push([]);
    const res = await servicesRoute.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: [] });
  });
});

// ===========================================================================
// portal/services/nav
// ===========================================================================

describe('GET /api/portal/services/nav', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await servicesNavRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns an empty list when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await servicesNavRoute.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: [] });
  });

  it('maps known categories to their icons and paths and marks subscribed services', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    // First select: allServices
    selectQueue.push([
      { id: 1, name: 'CMS', category: 'cms' },
      { id: 2, name: 'Email', category: 'email' },
      { id: 3, name: 'Booking', category: 'booking' },
      { id: 4, name: 'AI', category: 'ai' },
      { id: 5, name: 'Hosting', category: 'hosting' }, // hidden
      { id: 6, name: 'Custom', category: 'misc' },     // unknown category
    ]);
    // Second select: myServices
    selectQueue.push([
      { serviceId: 1, status: 'active' },
      { serviceId: 2, status: 'cancelled' },
    ]);

    const res = await servicesNavRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // hosting filtered out
    expect(body.data.find((s: { id: number }) => s.id === 5)).toBeUndefined();
    // CMS — known mapping + subscribed
    const cms = body.data.find((s: { id: number }) => s.id === 1);
    expect(cms).toEqual({
      id: 1,
      name: 'CMS',
      category: 'cms',
      icon: 'language',
      href: '/portal/websites',
      subscribed: true,
    });
    // Email — known icon, status not active so not subscribed
    const email = body.data.find((s: { id: number }) => s.id === 2);
    expect(email.icon).toBe('email');
    expect(email.subscribed).toBe(false);
    // AI — known icon, fallback href
    const ai = body.data.find((s: { id: number }) => s.id === 4);
    expect(ai.icon).toBe('smart_toy');
    expect(ai.href).toBe('/portal/services/4/request');
    // Unknown category gets the catch-all icon and fallback href
    const misc = body.data.find((s: { id: number }) => s.id === 6);
    expect(misc.icon).toBe('category');
    expect(misc.href).toBe('/portal/services/6/request');
  });
});

// ===========================================================================
// portal/automations/parse
// ===========================================================================

describe('POST /api/portal/automations/parse', () => {
  function makeJsonReq(body: unknown): Request {
    return makeReq('http://x', { method: 'POST', body: JSON.stringify(body) });
  }

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await automationsParseRoute.POST(makeJsonReq({ description: 'x' }));
    expect(res.status).toBe(401);
  });

  it('returns the authorize error response when authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('nope', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await automationsParseRoute.POST(makeJsonReq({ description: 'x' }));
    expect(res).toBe(denied);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await automationsParseRoute.POST(makeJsonReq({ description: 'x' }));
    expect(res.status).toBe(404);
  });

  it('returns 402 with gate message when plan gate denies', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: false, message: 'no plan', reason: 'plan' });
    const res = await automationsParseRoute.POST(makeJsonReq({ description: 'x' }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe('no plan');
    expect(body.reason).toBe('plan');
  });

  it('returns 400 when description is missing or not a string', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    const res = await automationsParseRoute.POST(makeJsonReq({ description: 123 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('description');
  });

  it('returns 402 when platform-keyed and credits are exhausted', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    parseAutomationDescriptionMock.mockResolvedValue({
      parsed: { trigger: 't' },
      inputTokens: 10,
      outputTokens: 20,
      source: 'platform',
    });
    hasCreditsMock.mockResolvedValue(false);
    const res = await automationsParseRoute.POST(makeJsonReq({ description: 'parse me' }));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toContain('Insufficient AI credits');
    expect(deductCreditsMock).not.toHaveBeenCalled();
  });

  it('deducts credits and returns parsed result for platform-keyed calls', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    parseAutomationDescriptionMock.mockResolvedValue({
      parsed: { trigger: 'deal.created', actions: [{ type: 'notify' }] },
      inputTokens: 100,
      outputTokens: 200,
      source: 'platform',
    });
    hasCreditsMock.mockResolvedValue(true);
    deductCreditsMock.mockResolvedValue(undefined);
    const res = await automationsParseRoute.POST(
      makeJsonReq({ description: 'when a deal is created notify me' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.parsed.trigger).toBe('deal.created');
    expect(body.tokensUsed).toBe(300);
    expect(body.keySource).toBe('platform');
    expect(deductCreditsMock).toHaveBeenCalledWith(
      33,
      300,
      'automation_parse',
      'nlp-parse',
      expect.stringContaining('NLP automation parse'),
    );
  });

  it('skips credit checks for BYOK calls', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    parseAutomationDescriptionMock.mockResolvedValue({
      parsed: { trigger: 'x' },
      inputTokens: 5,
      outputTokens: 5,
      source: 'byok',
    });
    const res = await automationsParseRoute.POST(makeJsonReq({ description: 'do thing' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keySource).toBe('byok');
    expect(body.tokensUsed).toBe(10);
    expect(hasCreditsMock).not.toHaveBeenCalled();
    expect(deductCreditsMock).not.toHaveBeenCalled();
  });

  it('returns 500 when parseAutomationDescription throws', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    parseAutomationDescriptionMock.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await automationsParseRoute.POST(makeJsonReq({ description: 'oops' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain('Failed to parse automation');
    errorSpy.mockRestore();
  });
});

// ===========================================================================
// portal/automations/logs
// ===========================================================================

describe('GET /api/portal/automations/logs', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await automationsLogsRoute.GET(makeReq('http://x/logs'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await automationsLogsRoute.GET(makeReq('http://x/logs'));
    expect(res.status).toBe(404);
  });

  it('returns all client logs when no ruleId is supplied', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      { id: 1, ruleId: 5, clientId: 33 },
      { id: 2, ruleId: 7, clientId: 33 },
    ]);
    const res = await automationsLogsRoute.GET(makeReq('http://x/logs'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.logs).toHaveLength(2);
    expect(body.logs[0].id).toBe(1);
  });

  it('filters by ruleId when provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 9, ruleId: 5, clientId: 33 }]);
    const res = await automationsLogsRoute.GET(makeReq('http://x/logs?ruleId=5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toEqual([{ id: 9, ruleId: 5, clientId: 33 }]);
  });

  it('ignores a non-numeric ruleId by parsing NaN (returns empty list)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    // With ruleId=abc, parseInt -> NaN, the route still passes it through
    // as an eq() condition; our mock just returns whatever is in the queue.
    selectQueue.push([]);
    const res = await automationsLogsRoute.GET(makeReq('http://x/logs?ruleId=abc'));
    expect(res.status).toBe(200);
    expect((await res.json()).logs).toEqual([]);
  });
});
