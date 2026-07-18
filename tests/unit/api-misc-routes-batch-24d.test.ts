// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 24d):
 *   - app/api/portal/automations/parse/route.ts        (POST)
 *   - app/api/portal/automations/logs/route.ts         (GET)
 *   - app/api/portal/chat/inbox-stream/route.ts        (GET — SSE)
 *   - app/api/portal/agency/white-label/route.ts       (POST)
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
const getPortalRoleMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  getPortalRole: (...args: unknown[]) => getPortalRoleMock(...args),
}));

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (...args: unknown[]) => isAuthErrorMock(...args),
}));

const hasCreditsMock = vi.fn();
const deductCreditsMock = vi.fn();
vi.mock('@/lib/ai-credits', () => ({
  hasCredits: (...args: unknown[]) => hasCreditsMock(...args),
  deductCredits: (...args: unknown[]) => deductCreditsMock(...args),
}));

const parseAutomationDescriptionMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  parseAutomationDescription: (...args: unknown[]) =>
    parseAutomationDescriptionMock(...args),
}));

const checkAiPlanGateMock = vi.fn();
vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => checkAiPlanGateMock(...args),
}));

// Entitlements — default to all-enabled so white-label tier gate passes.
// Individual tests can override via getClientEntitlementsMock.mockResolvedValueOnce.
const getClientEntitlementsMock = vi.fn();
vi.mock('@/lib/billing/entitlements', () => ({
  getClientEntitlements: (...args: unknown[]) => getClientEntitlementsMock(...args),
}));

const subscribeChannelMock = vi.fn();
const inboxChannelMock = vi.fn();
vi.mock('@/lib/chat/realtime', () => ({
  subscribeChannel: (...args: unknown[]) => subscribeChannelMock(...args),
  inboxChannel: (...args: unknown[]) => inboxChannelMock(...args),
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
    clients: wrap('clients'),
    automationLogs: wrap('automation_logs'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock: select() returns a thenable chain that materializes from
// selectQueue; update().set().where() resolves after collecting set() values
// into updateCalls.
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: Array<{ setValues: Record<string, unknown>; whereArg: unknown }> = [];

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
    const terminalChain = () => {
      materialize();
      const term: Record<string, unknown> = {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        limit: () => term,
        offset: () => term,
      };
      return term;
    };
    chain.limit = terminalChain;
    chain.offset = terminalChain;
    chain.orderBy = terminalChain;
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate() {
    let stagedValues: Record<string, unknown> = {};
    const chain = {
      set(v: Record<string, unknown>) {
        stagedValues = v;
        return chain;
      },
      where(arg: unknown) {
        updateCalls.push({ setValues: stagedValues, whereArg: arg });
        return Promise.resolve();
      },
    };
    return chain;
  }

  return {
    db: {
      select() {
        return buildSelect();
      },
      update() {
        return buildUpdate();
      },
    },
  };
});

// ---- modules under test ----
const automationsParseRoute = await import('@/app/api/portal/automations/parse/route');
const automationsLogsRoute = await import('@/app/api/portal/automations/logs/route');
const chatInboxStreamRoute = await import('@/app/api/portal/chat/inbox-stream/route');
const whiteLabelRoute = await import('@/app/api/portal/agency/white-label/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7', name: 'Bob' } };

beforeEach(() => {
  selectQueue = [];
  updateCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  getPortalRoleMock.mockReset();
  authorizePortalMock.mockReset();
  isAuthErrorMock.mockReset();
  hasCreditsMock.mockReset();
  deductCreditsMock.mockReset();
  parseAutomationDescriptionMock.mockReset();
  checkAiPlanGateMock.mockReset();
  getClientEntitlementsMock.mockReset();
  // Default: Scale-tier client — all entitlements enabled so the white-label
  // tier gate passes unless a specific test overrides it.
  getClientEntitlementsMock.mockResolvedValue({ byokEligible: true });
  subscribeChannelMock.mockReset();
  inboxChannelMock.mockReset();

  // Sensible defaults for isAuthError so the route layer treats successful
  // authorize results as non-errors.
  isAuthErrorMock.mockImplementation((r: unknown) =>
    Boolean(r && typeof r === 'object' && 'response' in (r as object)),
  );
});

// ===========================================================================
// POST /api/portal/automations/parse
// ===========================================================================

describe('POST /api/portal/automations/parse', () => {
  function req(body: unknown) {
    return makeReq('http://x/api/portal/automations/parse', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await automationsParseRoute.POST(req({ description: 'when X do Y' }));
    expect(res.status).toBe(401);
  });

  it('forwards the authorize error response when authorizePortal fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const failResponse = new Response(
      JSON.stringify({ success: false, message: 'forbidden' }),
      { status: 403, headers: { 'content-type': 'application/json' } },
    );
    authorizePortalMock.mockResolvedValue({ response: failResponse });
    const res = await automationsParseRoute.POST(req({ description: 'when X' }));
    expect(res.status).toBe(403);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 1 }, userId: 7, role: 'admin' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await automationsParseRoute.POST(req({ description: 'when X' }));
    expect(res.status).toBe(404);
  });

  it('returns 402 when AI plan gate denies', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 1 }, userId: 7, role: 'admin' });
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({
      allowed: false,
      message: 'Upgrade your plan',
      reason: 'plan',
    });
    const res = await automationsParseRoute.POST(req({ description: 'when X' }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.reason).toBe('plan');
  });

  it('returns 400 when description is missing or not a string', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 1 }, userId: 7, role: 'admin' });
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    const res = await automationsParseRoute.POST(req({ description: 123 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/description/);
  });

  it('returns 402 when platform source is used but credits are insufficient', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 1 }, userId: 7, role: 'admin' });
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    parseAutomationDescriptionMock.mockResolvedValue({
      parsed: { trigger: 'x', actions: [] },
      inputTokens: 10,
      outputTokens: 5,
      source: 'platform',
    });
    hasCreditsMock.mockResolvedValue(false);
    const res = await automationsParseRoute.POST(req({ description: 'do a thing' }));
    expect(res.status).toBe(402);
    expect((await res.json()).error).toMatch(/Insufficient AI credits/);
    expect(deductCreditsMock).not.toHaveBeenCalled();
  });

  it('returns 200 + deducts credits on platform-source success', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 1 }, userId: 7, role: 'admin' });
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    parseAutomationDescriptionMock.mockResolvedValue({
      parsed: { trigger: 't', actions: [{ tool: 'a' }] },
      inputTokens: 10,
      outputTokens: 7,
      source: 'platform',
    });
    hasCreditsMock.mockResolvedValue(true);
    const res = await automationsParseRoute.POST(req({ description: 'when a contact subscribes' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tokensUsed).toBe(17);
    expect(body.keySource).toBe('platform');
    expect(deductCreditsMock).toHaveBeenCalledTimes(1);
    expect(deductCreditsMock.mock.calls[0][0]).toBe(33);
    expect(deductCreditsMock.mock.calls[0][1]).toBe(17);
  });

  it('skips credit checks when source is BYOK', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 1 }, userId: 7, role: 'admin' });
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    parseAutomationDescriptionMock.mockResolvedValue({
      parsed: { trigger: 't' },
      inputTokens: 100,
      outputTokens: 200,
      source: 'byok',
    });
    const res = await automationsParseRoute.POST(req({ description: 'a thing' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.keySource).toBe('byok');
    expect(hasCreditsMock).not.toHaveBeenCalled();
    expect(deductCreditsMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the parser throws', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 1 }, userId: 7, role: 'admin' });
    getPortalClientMock.mockResolvedValue({ id: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    parseAutomationDescriptionMock.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await automationsParseRoute.POST(req({ description: 'thing' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/Failed to parse automation/);
    errSpy.mockRestore();
  });
});

// ===========================================================================
// GET /api/portal/automations/logs
// ===========================================================================

describe('GET /api/portal/automations/logs', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await automationsLogsRoute.GET(makeReq('http://x/api/portal/automations/logs'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await automationsLogsRoute.GET(makeReq('http://x/api/portal/automations/logs'));
    expect(res.status).toBe(404);
  });

  it('returns scoped logs without a ruleId filter', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      { id: 1, ruleId: 9, status: 'success', clientId: 33 },
      { id: 2, ruleId: 10, status: 'failed', clientId: 33 },
    ]);
    const res = await automationsLogsRoute.GET(
      makeReq('http://x/api/portal/automations/logs'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.logs).toHaveLength(2);
    expect(body.logs[0].ruleId).toBe(9);
  });

  it('returns scoped logs when a numeric ruleId is provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 5, ruleId: 99, status: 'success', clientId: 33 }]);
    const res = await automationsLogsRoute.GET(
      makeReq('http://x/api/portal/automations/logs?ruleId=99'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logs).toEqual([
      { id: 5, ruleId: 99, status: 'success', clientId: 33 },
    ]);
  });

  it('returns an empty list when no logs match', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await automationsLogsRoute.GET(
      makeReq('http://x/api/portal/automations/logs?ruleId=4242'),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).logs).toEqual([]);
  });
});

// ===========================================================================
// GET /api/portal/chat/inbox-stream (SSE)
// ===========================================================================

describe('GET /api/portal/chat/inbox-stream', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await chatInboxStreamRoute.GET();
    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await chatInboxStreamRoute.GET();
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Client not found');
  });

  it('returns an SSE stream with hello event and content-type headers', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    inboxChannelMock.mockReturnValue('chat_inbox_42');
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    subscribeChannelMock.mockReturnValue({
      ready: Promise.resolve(),
      unsubscribe,
    });

    const res = await chatInboxStreamRoute.GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('cache-control')).toMatch(/no-cache/);
    expect(res.headers.get('connection')).toBe('keep-alive');

    // Read the first chunk — should contain the hello event with clientId.
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value!);
    expect(text).toContain('event: hello');
    expect(text).toContain('"clientId":42');

    // Cancel the stream so the cleanup hook runs and we don't leak the
    // heartbeat interval into the rest of the suite.
    await reader.cancel();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('forwards realtime payloads from subscribeChannel into the stream', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    inboxChannelMock.mockReturnValue('chat_inbox_42');

    let captured: ((p: unknown) => void) | null = null;
    subscribeChannelMock.mockImplementation(
      (_channel: string, onPayload: (p: unknown) => void) => {
        captured = onPayload;
        return {
          ready: Promise.resolve(),
          unsubscribe: vi.fn().mockResolvedValue(undefined),
        };
      },
    );

    const res = await chatInboxStreamRoute.GET();
    const reader = res.body!.getReader();
    // Drain the initial hello frame.
    await reader.read();

    // Emit a payload through the captured listener.
    expect(captured).toBeTruthy();
    captured!({ kind: 'message', conversationId: 7, body: 'hi' });

    const { value } = await reader.read();
    const text = new TextDecoder().decode(value!);
    expect(text).toContain('event: message');
    expect(text).toContain('"conversationId":7');

    await reader.cancel();
  });

  it('closes the stream when subscribe.ready rejects', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 42 });
    inboxChannelMock.mockReturnValue('chat_inbox_42');
    subscribeChannelMock.mockReturnValue({
      ready: Promise.reject(new Error('listen failed')),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    });

    const res = await chatInboxStreamRoute.GET();
    const reader = res.body!.getReader();
    // Hello first.
    await reader.read();
    // After the rejected ready microtask resolves the controller closes; the
    // next read should resolve with done.
    await new Promise((r) => setTimeout(r, 0));
    const second = await reader.read();
    expect(second.done).toBe(true);
  });
});

// ===========================================================================
// POST /api/portal/agency/white-label
// ===========================================================================

describe('POST /api/portal/agency/white-label', () => {
  function req(body: unknown) {
    return makeReq('http://x/api/portal/agency/white-label', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await whiteLabelRoute.POST(req({ enabled: false }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await whiteLabelRoute.POST(req({ enabled: false }));
    expect(res.status).toBe(404);
  });

  it('returns 403 when role is not owner or admin', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    getPortalRoleMock.mockResolvedValue('member');
    const res = await whiteLabelRoute.POST(req({ enabled: false }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/Owner or admin/);
  });

  it('returns 400 on invalid JSON body', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    getPortalRoleMock.mockResolvedValue('owner');
    const res = await whiteLabelRoute.POST(req('not-json'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid JSON/);
  });

  it('returns 400 when `enabled` is not a boolean', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    getPortalRoleMock.mockResolvedValue('admin');
    const res = await whiteLabelRoute.POST(req({ enabled: 'yes' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/boolean/);
  });

  it('returns 422 when enabling without a verified custom domain', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    getPortalRoleMock.mockResolvedValue('admin');
    selectQueue.push([{ verifiedAt: null, agencyName: 'Acme' }]);
    const res = await whiteLabelRoute.POST(req({ enabled: true }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/Verify a custom domain/);
    expect(body.hint).toMatch(/custom-domain/);
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 422 when enabling without an agencyName', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    getPortalRoleMock.mockResolvedValue('owner');
    selectQueue.push([{ verifiedAt: new Date('2026-01-01'), agencyName: null }]);
    const res = await whiteLabelRoute.POST(req({ enabled: true }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/agencyName/);
    expect(updateCalls).toHaveLength(0);
  });

  it('enables white-label when domain is verified and agencyName is set', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    getPortalRoleMock.mockResolvedValue('owner');
    selectQueue.push([
      { verifiedAt: new Date('2026-01-01'), agencyName: 'Acme Agency' },
    ]);
    const res = await whiteLabelRoute.POST(req({ enabled: true }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.whiteLabelEnabled).toBe(true);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].setValues.whiteLabelEnabled).toBe(true);
  });

  it('disables white-label without any gating checks', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    getPortalRoleMock.mockResolvedValue('admin');
    const res = await whiteLabelRoute.POST(req({ enabled: false }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.whiteLabelEnabled).toBe(false);
    // No verification SELECT should have been consumed.
    expect(selectQueue.length).toBe(0);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].setValues.whiteLabelEnabled).toBe(false);
  });
});
