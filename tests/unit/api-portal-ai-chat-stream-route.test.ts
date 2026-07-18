// @vitest-environment node
/**
 * Unit tests for POST /api/portal/ai/chat/stream
 *
 * Mocks:
 *  - @/lib/db (chainable in-memory builder)
 *  - @/lib/mcp-auth (resolvePortalFromRequest)
 *  - @/lib/ai-credits (hasCredits, deductCredits, getBalance)
 *  - @/lib/ai/resolve-client-key
 *  - @/lib/ai/audit
 *  - @/lib/ai/plan-gate
 *  - @anthropic-ai/sdk (messages.stream iterator)
 *
 * The route returns a ReadableStream SSE response. Each test drains the
 * stream to a string and parses the SSE frames.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ===========================================================================
// drizzle-orm stubs
// ===========================================================================

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  asc: (col: unknown) => ({ op: 'asc', col }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...vals: unknown[]) => ({ op: 'sql', strings, vals }),
    { raw: (s: string) => s },
  ),
}));

// ===========================================================================
// DB schema stub
// ===========================================================================

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
  return new Proxy(
    {
      aiConversations: wrap('aiConversations'),
      aiMessages: wrap('aiMessages'),
    },
    {
      has: (t, p) =>
        p in t ||
        !(
          p === 'then' ||
          p === '__esModule' ||
          p === 'default' ||
          typeof p !== 'string'
        ),
      get: (t, p) =>
        p in t
          ? t[p as keyof typeof t]
          : p === 'then' ||
              p === '__esModule' ||
              p === 'default' ||
              typeof p !== 'string'
            ? undefined
            : wrap(p as string),
    },
  );
});

// ===========================================================================
// In-memory DB
// ===========================================================================

interface DbState {
  aiConversations: Array<Record<string, unknown>>;
  aiMessages: Array<Record<string, unknown>>;
}

const dbState: DbState = { aiConversations: [], aiMessages: [] };
let dbIdCounter = 100;

function tableArray(name: string): Array<Record<string, unknown>> {
  return (dbState as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter || typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown };
  if (f.op === 'eq') {
    const col = f.a as { __col?: string } | undefined;
    if (!col?.__col) return true;
    return row[col.__col] === f.b;
  }
  return true;
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let activeTable = '';
    let filter: unknown = null;
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
        return runQuery(n);
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return runQuery(null).then(onFulfilled, onRejected);
      },
    };

    function runQuery(limit: number | null): Promise<Array<Record<string, unknown>>> {
      let rows = tableArray(activeTable)
        .map((r) => ({ ...r }))
        .filter((r) => evalPredicate(filter, r));
      if (limit !== null) rows = rows.slice(0, limit);
      return Promise.resolve(rows);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = { ...v, id: v.id ?? dbIdCounter++, createdAt: new Date() };
          tableArray(table.__table).push(row);
          return row;
        });
        return {
          returning(_proj?: unknown) {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) {
            return Promise.resolve(inserted.map((r) => ({ ...r }))).then(
              onFulfilled,
              onRejected,
            );
          },
        };
      },
    };
  }

  function buildUpdate(_table: { __table: string }) {
    let setValues: Record<string, unknown> = {};
    let filter: unknown = null;
    const chain: Record<string, unknown> = {
      set(vals: Record<string, unknown>) {
        setValues = vals;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return run();
      },
    };
    function run(): Promise<Record<string, unknown>[]> {
      const rows = tableArray(_table.__table);
      for (const r of rows) {
        if (evalPredicate(filter, r)) Object.assign(r, setValues);
      }
      return Promise.resolve([]);
    }
    return chain;
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

// ===========================================================================
// Auth mock (resolvePortalFromRequest)
// ===========================================================================

const resolvePortalMock = vi.fn();
vi.mock('@/lib/mcp-auth', () => ({
  resolvePortalFromRequest: (...args: unknown[]) => resolvePortalMock(...args),
}));

// ===========================================================================
// AI credits mocks
// ===========================================================================

const hasCreditsM = vi.fn();
const deductCreditsM = vi.fn();
const getBalanceM = vi.fn();

vi.mock('@/lib/ai-credits', () => ({
  hasCredits: (...args: unknown[]) => hasCreditsM(...args),
  deductCredits: (...args: unknown[]) => deductCreditsM(...args),
  getBalance: (...args: unknown[]) => getBalanceM(...args),
}));

// ===========================================================================
// resolve-client-key mock
// ===========================================================================

const resolveKeyM = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => resolveKeyM(...args),
}));

// ===========================================================================
// audit mock
// ===========================================================================

vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: vi.fn(),
}));

// ===========================================================================
// plan-gate mock
// ===========================================================================

const planGateMock = vi.fn();
vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => planGateMock(...args),
}));

// ===========================================================================
// Anthropic SDK mock
// ===========================================================================

// We build a fake async-iterable SDK stream so the route's `for await`
// loop processes canned events without a real network connection.

function makeSdkStream(events: unknown[]) {
  return {
    [Symbol.asyncIterator]() {
      let idx = 0;
      return {
        async next() {
          if (idx >= events.length) return { value: undefined, done: true };
          return { value: events[idx++], done: false };
        },
      };
    },
  };
}

const anthropicStreamM = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      messages: any;
      constructor() {
        this.messages = {
          stream: (...args: unknown[]) => anthropicStreamM(...args),
        };
      }
    },
  };
});

// ===========================================================================
// Module under test (dynamic import after all mocks are declared)
// ===========================================================================

const { POST } = await import('@/app/api/portal/ai/chat/stream/route');

// ===========================================================================
// Helpers
// ===========================================================================

function makeReq(body: unknown): Request {
  return new Request('http://x/api/portal/ai/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRawReq(raw: string): Request {
  return new Request('http://x/api/portal/ai/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw,
  });
}

function defaultCtx() {
  return {
    userId: 7,
    client: { id: 42 },
  };
}

function happyStreamEvents() {
  return [
    {
      type: 'message_start',
      message: { usage: { input_tokens: 10, output_tokens: 1 } },
    },
    {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'Hello' },
    },
    {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: ' world' },
    },
    {
      type: 'message_delta',
      usage: { output_tokens: 5 },
    },
  ];
}

/** Drain a ReadableStream<Uint8Array> to a string. */
async function drainStream(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  return result;
}

/** Parse all `data: <json>` frames from an SSE string. */
function parseSseFrames(raw: string): unknown[] {
  return raw
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice('data: '.length)));
}

// ===========================================================================
// Shared resets
// ===========================================================================

beforeEach(() => {
  dbState.aiConversations.length = 0;
  dbState.aiMessages.length = 0;
  dbIdCounter = 100;

  resolvePortalMock.mockReset();
  hasCreditsM.mockReset();
  deductCreditsM.mockReset();
  getBalanceM.mockReset();
  resolveKeyM.mockReset();
  planGateMock.mockReset();
  anthropicStreamM.mockReset();

  // Sensible defaults
  resolvePortalMock.mockResolvedValue(defaultCtx());
  planGateMock.mockResolvedValue({ allowed: true });
  resolveKeyM.mockResolvedValue({ key: 'sk-test', source: 'platform' });
  hasCreditsM.mockResolvedValue(true);
  deductCreditsM.mockResolvedValue({ newBalance: 900 });
  getBalanceM.mockResolvedValue({ balance: 900 });
  anthropicStreamM.mockReturnValue(makeSdkStream(happyStreamEvents()));

  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// ===========================================================================
// Auth
// ===========================================================================

describe('POST /api/portal/ai/chat/stream — auth', () => {
  it('returns 401 when resolvePortalFromRequest returns null', async () => {
    resolvePortalMock.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

// ===========================================================================
// Validation
// ===========================================================================

describe('POST /api/portal/ai/chat/stream — validation', () => {
  it('returns 400 on malformed JSON body', async () => {
    const res = await POST(makeRawReq('not json'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Invalid JSON/i);
  });

  it('returns 400 when messages is missing', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('messages[] required');
  });

  it('returns 400 when messages is an empty array', async () => {
    const res = await POST(makeReq({ messages: [] }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when last message is not a user turn', async () => {
    const res = await POST(
      makeReq({ messages: [{ role: 'assistant', content: 'hi' }] }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/user turn/i);
  });

  it('returns 400 when last user message is empty', async () => {
    const res = await POST(makeReq({ messages: [{ role: 'user', content: '   ' }] }));
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// Plan gate
// ===========================================================================

describe('POST /api/portal/ai/chat/stream — plan gate', () => {
  it('returns 402 when plan gate denies access', async () => {
    planGateMock.mockResolvedValueOnce({
      allowed: false,
      message: 'Upgrade required',
    });
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hello' }] }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.message).toBe('Upgrade required');
  });

  it('uses fallback message when plan gate provides none', async () => {
    planGateMock.mockResolvedValueOnce({ allowed: false });
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hello' }] }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.message).toBeTruthy();
  });
});

// ===========================================================================
// Credits
// ===========================================================================

describe('POST /api/portal/ai/chat/stream — credits', () => {
  it('returns 402 when platform-keyed and no credits', async () => {
    hasCreditsM.mockResolvedValueOnce(false);
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hello' }] }));
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.message).toMatch(/credits/i);
  });

  it('skips credit check for BYOK clients', async () => {
    resolveKeyM.mockResolvedValueOnce({ key: 'sk-byok', source: 'byok' });
    anthropicStreamM.mockReturnValue(makeSdkStream(happyStreamEvents()));
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(res.status).toBe(200);
    expect(hasCreditsM).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// Conversation lookup
// ===========================================================================

describe('POST /api/portal/ai/chat/stream — conversation lookup', () => {
  it('returns 404 when supplied conversationId does not exist', async () => {
    const res = await POST(
      makeReq({ conversationId: 9999, messages: [{ role: 'user', content: 'hi' }] }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/not found/i);
  });

  it('returns 404 when conversationId belongs to a different client', async () => {
    dbState.aiConversations.push({ id: 1, clientId: 999 }); // wrong client
    const res = await POST(
      makeReq({ conversationId: 1, messages: [{ role: 'user', content: 'hi' }] }),
    );
    expect(res.status).toBe(404);
  });

  it('creates a new conversation when none supplied', async () => {
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hello' }] }));
    expect(res.status).toBe(200);
    expect(dbState.aiConversations).toHaveLength(1);
    expect(dbState.aiConversations[0]?.title).toBe('hello');
  });
});

// ===========================================================================
// Happy path — SSE stream content
// ===========================================================================

describe('POST /api/portal/ai/chat/stream — happy path', () => {
  it('returns 200 with text/event-stream content-type', async () => {
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hello' }] }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
  });

  it('emits token frames and a final done frame', async () => {
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hello' }] }));
    const raw = await drainStream(res);
    const frames = parseSseFrames(raw) as Array<{ type: string; text?: string }>;

    const tokenFrames = frames.filter((f) => f.type === 'token');
    const doneFrames = frames.filter((f) => f.type === 'done');

    expect(tokenFrames.length).toBeGreaterThan(0);
    expect(doneFrames).toHaveLength(1);
    // All text from token frames should concatenate to the assistant output.
    const combined = tokenFrames.map((f) => f.text ?? '').join('');
    expect(combined).toBe('Hello world');
  });

  it('done frame contains conversationId and tokensUsed', async () => {
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hello' }] }));
    const raw = await drainStream(res);
    const frames = parseSseFrames(raw) as Array<{
      type: string;
      conversationId?: number;
      tokensUsed?: number;
    }>;
    const done = frames.find((f) => f.type === 'done');
    expect(done?.conversationId).toBeTypeOf('number');
    expect(done?.tokensUsed).toBeTypeOf('number');
  });

  it('persists the user message and the assistant message to aiMessages', async () => {
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'test msg' }] }));
    await drainStream(res);

    const userMsg = dbState.aiMessages.find((m) => m.role === 'user');
    const assistantMsg = dbState.aiMessages.find((m) => m.role === 'assistant');
    expect(userMsg?.content).toBe('test msg');
    expect(assistantMsg?.content).toBe('Hello world');
  });

  it('deducts credits after stream completes (platform key)', async () => {
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hello' }] }));
    await drainStream(res);
    expect(deductCreditsM).toHaveBeenCalledTimes(1);
    const [clientId] = deductCreditsM.mock.calls[0] as [number];
    expect(clientId).toBe(42);
  });

  it('does not deduct credits for BYOK key', async () => {
    resolveKeyM.mockResolvedValueOnce({ key: 'sk-byok', source: 'byok' });
    anthropicStreamM.mockReturnValue(makeSdkStream(happyStreamEvents()));
    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hi' }] }));
    await drainStream(res);
    expect(deductCreditsM).not.toHaveBeenCalled();
  });

  it('uses supplied conversationId when it belongs to the client', async () => {
    dbState.aiConversations.push({ id: 55, clientId: 42, title: 'existing' });
    const res = await POST(
      makeReq({ conversationId: 55, messages: [{ role: 'user', content: 'follow up' }] }),
    );
    expect(res.status).toBe(200);
    await drainStream(res);
    // No second conversation row created
    expect(dbState.aiConversations).toHaveLength(1);
  });

  it('includes history messages from DB in the inference call', async () => {
    dbState.aiConversations.push({ id: 60, clientId: 42 });
    dbState.aiMessages.push({
      conversationId: 60,
      role: 'user',
      content: 'prior',
      createdAt: new Date(),
    });

    await POST(
      makeReq({ conversationId: 60, messages: [{ role: 'user', content: 'new turn' }] }),
    );

    expect(anthropicStreamM).toHaveBeenCalledTimes(1);
    const callArg = anthropicStreamM.mock.calls[0]![0] as {
      messages: Array<{ role: string; content: string }>;
    };
    // history + new turn
    expect(callArg.messages).toHaveLength(2);
    expect(callArg.messages[0]!.content).toBe('prior');
    expect(callArg.messages[1]!.content).toBe('new turn');
  });
});

// ===========================================================================
// Error path — SDK stream throws
// ===========================================================================

describe('POST /api/portal/ai/chat/stream — stream error', () => {
  it('emits an error frame then a done frame when the SDK stream throws', async () => {
    anthropicStreamM.mockReturnValue({
      [Symbol.asyncIterator]() {
        return {
          async next() {
            throw new Error('anthropic_down');
          },
        };
      },
    });

    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hello' }] }));
    expect(res.status).toBe(200); // still 200 — errors go through SSE
    const raw = await drainStream(res);
    const frames = parseSseFrames(raw) as Array<{
      type: string;
      message?: string;
    }>;

    const errFrame = frames.find((f) => f.type === 'error');
    const doneFrame = frames.find((f) => f.type === 'done');
    expect(errFrame?.message).toBe('anthropic_down');
    expect(doneFrame).toBeDefined();
  });

  it('falls back to getBalance when deductCredits throws', async () => {
    deductCreditsM.mockRejectedValueOnce(new Error('billing_unavailable'));
    getBalanceM.mockResolvedValueOnce({ balance: 500 });

    const res = await POST(makeReq({ messages: [{ role: 'user', content: 'hello' }] }));
    await drainStream(res);
    expect(getBalanceM).toHaveBeenCalledTimes(1);
  });
});
