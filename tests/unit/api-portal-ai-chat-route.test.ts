// @vitest-environment node
/**
 * Unit tests for POST /api/portal/ai/chat.
 *
 * The route wires together: auth, portal authorization (service gate),
 * portal-client resolution, AI plan gate, BYOK key resolver, credit ledger,
 * audit recorder, the Anthropic SDK (must NEVER touch the network),
 * agentic tool loop (PORTAL_TOOLS + executePortalTool), and a small set of
 * Drizzle reads/writes against aiConversations + aiMessages.
 *
 * Everything is mocked — we drive the route through return values and an
 * in-memory DB shape (just the tables it reads/writes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock collaborators (declared BEFORE the route import — Vitest hoists vi.mock)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (result: unknown) => isAuthErrorMock(result),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const hasCreditsMock = vi.fn();
const deductCreditsMock = vi.fn();
const getBalanceMock = vi.fn();
vi.mock('@/lib/ai-credits', () => ({
  hasCredits: (...args: unknown[]) => hasCreditsMock(...args),
  deductCredits: (...args: unknown[]) => deductCreditsMock(...args),
  getBalance: (...args: unknown[]) => getBalanceMock(...args),
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

const executePortalToolMock = vi.fn();
vi.mock('@/lib/ai/portal-tools', () => ({
  PORTAL_TOOLS: [{ name: 'list_projects', description: 'List projects', input_schema: { type: 'object', properties: {} } }],
  executePortalTool: (...args: unknown[]) => executePortalToolMock(...args),
}));

// Classifier — bypass Anthropic so it doesn't consume messagesCreateMock slots
const classifyPortalRequestMock = vi.fn();
vi.mock('@/lib/ai/portal-tools/classifier', () => ({
  classifyPortalRequest: (...args: unknown[]) => classifyPortalRequestMock(...args),
  classifyPortalComplexity: (...args: unknown[]) => classifyPortalRequestMock(...args),
}));

// withSpan / startSpan — just execute the callback
vi.mock('@/lib/ai/tracer', () => ({
  withSpan: async (_name: unknown, _attrs: unknown, fn: () => unknown) => fn(),
  startSpan: () => ({ end: () => {} }),
}));

// toolsForDomains / domainsOfToolCalls — passthrough stubs
vi.mock('@/lib/ai/portal-tools/domains', () => ({
  toolsForDomains: (_domains: unknown, tools: unknown) => tools,
  domainsOfToolCalls: () => [],
  PORTAL_DOMAINS: [],
}));

// ---- Anthropic SDK — never let it touch the network ----

const messagesCreateMock = vi.fn();
const anthropicCtorSpy = vi.fn();
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    public messages: { create: typeof messagesCreateMock };
    constructor(opts: { apiKey: string }) {
      anthropicCtorSpy(opts);
      this.messages = { create: messagesCreateMock };
    }
  }
  return { default: Anthropic };
});

// ---- schema — wrap so column refs round-trip through our DB mock ----

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
    aiConversations: wrap('aiConversations'),
    aiMessages: wrap('aiMessages'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: (..._args: unknown[]) => ({ __sql: true }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- in-memory DB shape — only the tables this route reads/writes ----

interface MockState {
  aiConversations: Array<Record<string, unknown>>;
  aiMessages: Array<Record<string, unknown>>;
}

const state: MockState = {
  aiConversations: [],
  aiMessages: [],
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

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
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
      orderBy(_arg: unknown) {
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
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = { ...v, id: nextId(), createdAt: new Date(), updatedAt: new Date() };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
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
            for (const r of rows) {
              for (const [k, v] of Object.entries(patch)) {
                // Skip sql`...` token expressions — only set scalar values
                if (v && typeof v === 'object' && '__sql' in (v as Record<string, unknown>)) continue;
                r[k] = v;
              }
            }
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
      select() {
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
// Module under test (dynamic import AFTER mocks)
// ---------------------------------------------------------------------------

const { POST } = await import('@/app/api/portal/ai/chat/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://x/api/portal/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Standard "end_turn" Anthropic response with a single text block. */
function textResponse(text: string, opts: { input?: number; output?: number } = {}) {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    usage: { input_tokens: opts.input ?? 100, output_tokens: opts.output ?? 200 },
  };
}

/** A response that triggers a tool call with the given id + name + input. */
function toolUseResponse(
  id: string,
  name: string,
  input: Record<string, unknown>,
  opts: { input_tokens?: number; output_tokens?: number } = {},
) {
  return {
    content: [
      { type: 'tool_use', id, name, input },
    ],
    stop_reason: 'tool_use',
    usage: {
      input_tokens: opts.input_tokens ?? 50,
      output_tokens: opts.output_tokens ?? 50,
    },
  };
}

beforeEach(() => {
  state.aiConversations.length = 0;
  state.aiMessages.length = 0;
  idCounter = 1000;

  authMock.mockReset();
  authorizePortalMock.mockReset().mockResolvedValue({ ok: true });
  isAuthErrorMock.mockReset().mockReturnValue(false);
  getPortalClientMock.mockReset();
  hasCreditsMock.mockReset().mockResolvedValue(true);
  deductCreditsMock.mockReset().mockResolvedValue({ newBalance: 4242 });
  getBalanceMock.mockReset().mockResolvedValue({ balance: 0 });
  resolveClientApiKeyMock.mockReset().mockResolvedValue({ source: 'platform', key: 'sk-test' });
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
  checkAiPlanGateMock.mockReset().mockResolvedValue({ allowed: true });
  executePortalToolMock.mockReset();
  classifyPortalRequestMock.mockReset().mockResolvedValue({
    complexity: 'simple',
    domains: [],
    reasoning: 'test default',
    inputTokens: 0,
    outputTokens: 0,
  });
  messagesCreateMock.mockReset();
  anthropicCtorSpy.mockReset();

  // sane defaults
  authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
});

// ---------------------------------------------------------------------------
// Auth + early-exit branches
// ---------------------------------------------------------------------------

describe('POST /api/portal/ai/chat — auth + early exits', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(401);
  });

  it('returns the authorizePortal error response when service gate fails', async () => {
    const gateRes = new Response(JSON.stringify({ success: false, message: 'no ai' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
    authorizePortalMock.mockResolvedValueOnce({ response: gateRes });
    isAuthErrorMock.mockReturnValueOnce(true);
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(403);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('returns 403 for staff users (role=admin)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'admin' } });
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/Staff/);
  });

  it('returns 403 for staff users (role=employee)', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '7', role: 'employee' } });
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(403);
  });

  it('returns 404 when the portal client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 400 when the message is missing', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('message is required');
  });

  it('returns 400 when the message is whitespace-only', async () => {
    const res = await POST(makeRequest({ message: '   ' }));
    expect(res.status).toBe(400);
  });

  it('returns 402 when the AI plan gate denies the request', async () => {
    checkAiPlanGateMock.mockResolvedValueOnce({
      allowed: false,
      message: 'Upgrade required',
      reason: 'plan_lock',
    });
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      message: 'Upgrade required',
      reason: 'plan_lock',
    });
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('returns 402 with a default message when plan-gate denies without a message', async () => {
    checkAiPlanGateMock.mockResolvedValueOnce({ allowed: false, reason: 'plan_lock' });
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.message).toMatch(/AI access is not available/);
  });

  it('returns 402 with creditsRemaining when on platform key + no credits', async () => {
    hasCreditsMock.mockResolvedValueOnce(false);
    getBalanceMock.mockResolvedValueOnce({ balance: 123 });
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.creditsRemaining).toBe(123);
    expect(body.message).toMatch(/Insufficient AI credits/);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it('skips credit check entirely when source=byok', async () => {
    resolveClientApiKeyMock.mockResolvedValueOnce({ source: 'byok', key: 'sk-byok' });
    messagesCreateMock.mockResolvedValueOnce(textResponse('hello there'));
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(200);
    expect(hasCreditsMock).not.toHaveBeenCalled();
    expect(deductCreditsMock).not.toHaveBeenCalled();
    expect(anthropicCtorSpy).toHaveBeenCalledWith({ apiKey: 'sk-byok' });
  });
});

// ---------------------------------------------------------------------------
// Happy path — single-turn conversation
// ---------------------------------------------------------------------------

describe('POST /api/portal/ai/chat — happy path (new conversation)', () => {
  it('returns 200 with reply, creates conversation, persists user + assistant messages', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      textResponse('Hello! How can I help?', { input: 30, output: 70 }),
    );

    const res = await POST(makeRequest({ message: 'Hi there' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.reply).toBe('Hello! How can I help?');
    expect(body.data.tokensUsed).toBe(100);
    expect(body.data.keySource).toBe('platform');
    expect(body.data.toolCalls).toEqual([]);
    expect(typeof body.data.conversationId).toBe('number');

    // Conversation row created with auto-derived title (≤80 chars of first message)
    expect(state.aiConversations).toHaveLength(1);
    expect(state.aiConversations[0].clientId).toBe(10);
    expect(state.aiConversations[0].title).toBe('Hi there');

    // user + assistant rows persisted
    expect(state.aiMessages).toHaveLength(2);
    const [user, assistant] = state.aiMessages;
    expect(user.role).toBe('user');
    expect(user.content).toBe('Hi there');
    expect(assistant.role).toBe('assistant');
    expect(assistant.content).toBe('Hello! How can I help?');
    expect(assistant.inputTokens).toBe(30);
    expect(assistant.outputTokens).toBe(70);
    expect(assistant.toolCalls).toBeNull();
  });

  it('truncates the auto-title to 80 chars', async () => {
    messagesCreateMock.mockResolvedValueOnce(textResponse('ok'));
    const longMsg = 'a'.repeat(200);
    await POST(makeRequest({ message: longMsg }));
    expect((state.aiConversations[0].title as string).length).toBe(80);
  });

  it('deducts platform credits using the total token count', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      textResponse('reply', { input: 111, output: 222 }),
    );
    const res = await POST(makeRequest({ message: 'hi' }));
    const body = await res.json();
    expect(deductCreditsMock).toHaveBeenCalledWith(
      10,
      333,
      'ai',
      expect.any(String),
      expect.stringContaining('Chat conversation'),
    );
    expect(body.data.creditsRemaining).toBe(4242);
  });

  it('records AI usage with the right source + token total', async () => {
    messagesCreateMock.mockResolvedValueOnce(
      textResponse('reply', { input: 5, output: 7 }),
    );
    await POST(makeRequest({ message: 'hi' }));
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 10, source: 'platform', tokens: 12 }),
    );
  });

  it('does NOT deduct credits on BYOK and returns null creditsRemaining', async () => {
    resolveClientApiKeyMock.mockResolvedValueOnce({ source: 'byok', key: 'sk-byok' });
    messagesCreateMock.mockResolvedValueOnce(textResponse('reply'));
    const res = await POST(makeRequest({ message: 'hi' }));
    const body = await res.json();
    expect(body.data.creditsRemaining).toBeNull();
    expect(deductCreditsMock).not.toHaveBeenCalled();
    expect(recordAiUsageMock).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'byok' }),
    );
  });
});

// ---------------------------------------------------------------------------
// Existing-conversation branches
// ---------------------------------------------------------------------------

describe('POST /api/portal/ai/chat — existing conversation', () => {
  it('returns 404 when the conversationId does not exist', async () => {
    messagesCreateMock.mockResolvedValueOnce(textResponse('x'));
    const res = await POST(
      makeRequest({ message: 'hi', conversationId: 9999 }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Conversation not found');
  });

  it('returns 404 when the conversation belongs to a different client', async () => {
    state.aiConversations.push({ id: 55, clientId: 999, title: 'foreign' });
    const res = await POST(
      makeRequest({ message: 'hi', conversationId: 55 }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Conversation not found');
  });

  it('uses the provided conversationId and replays prior history into the Anthropic call', async () => {
    state.aiConversations.push({ id: 77, clientId: 10, title: 'old chat' });
    state.aiMessages.push({ id: 1, conversationId: 77, role: 'user', content: 'previous q', createdAt: new Date(1) });
    state.aiMessages.push({ id: 2, conversationId: 77, role: 'assistant', content: 'previous a', createdAt: new Date(2) });
    messagesCreateMock.mockResolvedValueOnce(textResponse('new reply'));

    const res = await POST(
      makeRequest({ message: 'follow-up', conversationId: 77 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.conversationId).toBe(77);

    const call = messagesCreateMock.mock.calls[0]![0] as { messages: Array<{ role: string; content: unknown }> };
    // History (2) + new user message (1) = 3
    expect(call.messages).toHaveLength(3);
    expect(call.messages[0]).toEqual({ role: 'user', content: 'previous q' });
    expect(call.messages[1]).toEqual({ role: 'assistant', content: 'previous a' });
    expect(call.messages[2]).toEqual({ role: 'user', content: 'follow-up' });

    // No new conversation row created
    expect(state.aiConversations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Agentic tool loop
// ---------------------------------------------------------------------------

describe('POST /api/portal/ai/chat — agentic tool loop', () => {
  it('executes a tool then loops back to Anthropic for the final answer', async () => {
    executePortalToolMock.mockResolvedValueOnce({ ok: true, projects: ['Acme'] });
    messagesCreateMock
      .mockResolvedValueOnce(toolUseResponse('tu_1', 'list_projects', { foo: 'bar' }))
      .mockResolvedValueOnce(textResponse('You have 1 project: Acme.'));

    const res = await POST(makeRequest({ message: 'list my projects' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.reply).toBe('You have 1 project: Acme.');
    expect(body.data.toolCalls).toEqual([
      { name: 'list_projects', input: { foo: 'bar' } },
    ]);
    expect(executePortalToolMock).toHaveBeenCalledWith('list_projects', { foo: 'bar' }, 10, 7, { source: 'assistant' });
    expect(messagesCreateMock).toHaveBeenCalledTimes(2);

    // Assistant row stores the toolCalls JSON
    const assistant = state.aiMessages.find((m) => m.role === 'assistant');
    expect(assistant!.toolCalls).toEqual([
      { name: 'list_projects', input: { foo: 'bar' }, result: { ok: true, projects: ['Acme'] } },
    ]);
  });

  it('returns 400 with tool_call_cap_exceeded when the tool-call cap is exceeded', async () => {
    // First response contains 21 tool_use blocks → exceeds MAX_TOOL_CALLS (20)
    const manyBlocks = Array.from({ length: 21 }, (_, i) => ({
      type: 'tool_use',
      id: `tu_${i}`,
      name: 'fake_tool',
      input: {},
    }));
    messagesCreateMock.mockResolvedValueOnce({
      content: manyBlocks,
      stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const res = await POST(makeRequest({ message: 'spam' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('tool_call_cap_exceeded');
    // No DB writes happen on cap-exceeded
    expect(state.aiMessages).toHaveLength(0);
  });

  it('returns 400 with loop_cap_exceeded when the agentic loop hits the iteration cap', async () => {
    // Every iteration returns tool_use → loop never terminates → MAX_LOOPS (8) tripped.
    executePortalToolMock.mockResolvedValue({ ok: true });
    messagesCreateMock.mockResolvedValue(
      toolUseResponse('tu_x', 'fake_tool', {}, { input_tokens: 1, output_tokens: 1 }),
    );

    const res = await POST(makeRequest({ message: 'infinite' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('loop_cap_exceeded');
    expect(state.aiMessages).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Top-level catch-all
// ---------------------------------------------------------------------------

describe('POST /api/portal/ai/chat — error envelope', () => {
  it('returns 500 when an unexpected Anthropic error bubbles up', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    messagesCreateMock.mockRejectedValueOnce(new Error('boom from Anthropic'));
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Internal server error' });
    errSpy.mockRestore();
  });

  it('returns 500 when an internal helper rejects unexpectedly', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    checkAiPlanGateMock.mockRejectedValueOnce(new Error('db down'));
    const res = await POST(makeRequest({ message: 'hi' }));
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });

  it('returns 500 when req.json() throws (invalid body)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const badReq = new Request('http://x/api/portal/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not json{{',
    });
    const res = await POST(badReq);
    expect(res.status).toBe(500);
    errSpy.mockRestore();
  });
});
