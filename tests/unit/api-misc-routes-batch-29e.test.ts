// @vitest-environment node
/**
 * Unit tests for four portal API routes (batch 29e):
 *   - app/api/portal/chat/conversations/[id]/messages/route.ts        (POST)
 *   - app/api/portal/chat/widgets/[id]/route.ts                       (GET, PATCH, DELETE)
 *   - app/api/portal/cms/websites/[siteId]/branding/generate/route.ts (POST)
 *   - app/api/portal/cms/websites/[siteId]/categories/route.ts        (GET, POST)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks (declared before importing route modules)
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
const resolveClientSiteMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
  resolveClientSite: (...args: unknown[]) => resolveClientSiteMock(...args),
}));

const publishMessageMock = vi.fn();
vi.mock('@/lib/chat/realtime', () => ({
  publishMessage: (...args: unknown[]) => publishMessageMock(...args),
}));

const resolveClientApiKeyMock = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => resolveClientApiKeyMock(...args),
}));

const checkAiPlanGateMock = vi.fn();
vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => checkAiPlanGateMock(...args),
}));

const recordAiUsageMock = vi.fn();
vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: (...args: unknown[]) => recordAiUsageMock(...args),
}));

// Anthropic SDK — never let it touch the network
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

// drizzle-orm — operators reduce to plain object descriptors.
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
}));

// schema — proxy tables so `table.col` and `eq(table.col, x)` are inert.
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect' || prop === '$inferInsert') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    chatConversations: wrap('chatConversations'),
    chatMessages: wrap('chatMessages'),
    chatWidgets: wrap('chatWidgets'),
    users: wrap('users'),
    categories: wrap('categories'),
  };
});

// ---- db mock with queues + capture for writes ----

interface DeleteCall {
  table: string;
  filter: unknown;
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}
interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: DeleteCall[] = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];

function shiftNextSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) {
        materializedPromise = Promise.resolve(shiftNextSelect());
      }
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const rows = updateReturnQueue.shift() ?? [];
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: rows });
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
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
        deleteCalls.push({ table: table.__table, filter });
        return Promise.resolve(undefined);
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        return {
          onConflictDoNothing() {
            return Promise.resolve(undefined);
          },
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---- modules under test (loaded AFTER mocks) ----

const messagesRoute = await import('@/app/api/portal/chat/conversations/[id]/messages/route');
const widgetRoute = await import('@/app/api/portal/chat/widgets/[id]/route');
const brandingGenerateRoute = await import(
  '@/app/api/portal/cms/websites/[siteId]/branding/generate/route'
);
const categoriesRoute = await import('@/app/api/portal/cms/websites/[siteId]/categories/route');

// ---- helpers ----

function makeIdParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function makeSiteParams(siteId: string) {
  return { params: Promise.resolve({ siteId }) };
}

function makeJsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeBareRequest(url: string, method = 'GET'): Request {
  return new Request(url, { method });
}

const SESSION = { user: { id: '7', role: 'admin', name: 'Alice' } };

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  insertReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  resolveClientSiteMock.mockReset();
  publishMessageMock.mockReset().mockResolvedValue(undefined);
  resolveClientApiKeyMock.mockReset();
  checkAiPlanGateMock.mockReset();
  recordAiUsageMock.mockReset();
  messagesCreateMock.mockReset();
  anthropicCtorSpy.mockReset();
});

// ===========================================================================
// chat/conversations/[id]/messages/route.ts — POST
// ===========================================================================

describe('POST /api/portal/chat/conversations/[id]/messages', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await messagesRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/conversations/1/messages', 'POST', { body: 'hi' }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await messagesRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/conversations/1/messages', 'POST', { body: 'hi' }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when conversation does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // conversation lookup
    const res = await messagesRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/conversations/1/messages', 'POST', { body: 'hi' }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Conversation not found');
  });

  it('returns 409 when conversation status is closed', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'closed' }]);
    const res = await messagesRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/conversations/1/messages', 'POST', { body: 'hi' }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).message).toBe('Conversation is closed');
  });

  it('returns 400 when message body is empty', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open', assignedUserId: null }]);
    const res = await messagesRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/conversations/1/messages', 'POST', { body: '   ' }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/required/i);
  });

  it('returns 400 when JSON body is invalid', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open', assignedUserId: null }]);
    const req = new Request('http://x/api/portal/chat/conversations/1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-valid-json',
    });
    const res = await messagesRoute.POST(req, makeIdParams('1'));
    expect(res.status).toBe(400);
  });

  it('returns 413 when message body exceeds the MAX_BODY limit', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open', assignedUserId: null }]);
    const long = 'x'.repeat(8001);
    const res = await messagesRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/conversations/1/messages', 'POST', { body: long }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).message).toMatch(/too long/i);
  });

  it('inserts message, auto-claims open conversation, and publishes realtime', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open', assignedUserId: null }]);
    selectQueue.push([{ name: 'Alice' }]); // author lookup
    insertReturnQueue.push([
      {
        id: 99,
        conversationId: 1,
        clientId: 33,
        authorKind: 'agent',
        authorName: 'Alice',
        body: 'hello there',
        occurredAt: new Date('2024-01-01T00:00:00Z'),
      },
    ]);

    const res = await messagesRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/conversations/1/messages', 'POST', {
        body: 'hello there',
      }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(99);
    expect(insertCalls.some((c) => c.table === 'chatMessages')).toBe(true);
    const claimUpdate = updateCalls.find((u) => u.table === 'chatConversations');
    expect(claimUpdate).toBeDefined();
    expect(claimUpdate!.patch).toMatchObject({ status: 'assigned', assignedUserId: 7 });
    expect(publishMessageMock).toHaveBeenCalledTimes(1);
    expect(publishMessageMock.mock.calls[0][0]).toBe(1);
    expect(publishMessageMock.mock.calls[0][1]).toBe(33);
  });

  it('does not re-claim a conversation that is already assigned', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'assigned', assignedUserId: 99 }]);
    selectQueue.push([{ name: 'Alice' }]);
    insertReturnQueue.push([{ id: 99, body: 'hi', authorName: 'Alice', occurredAt: new Date() }]);

    const res = await messagesRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/conversations/1/messages', 'POST', { body: 'hi' }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(200);
    const update = updateCalls.find((u) => u.table === 'chatConversations');
    expect(update).toBeDefined();
    // No status / assignedUserId in patch when already claimed
    expect(update!.patch.status).toBeUndefined();
    expect(update!.patch.assignedUserId).toBeUndefined();
    // But lastMessageAt and updatedAt are still set
    expect(update!.patch.lastMessageAt).toBeInstanceOf(Date);
    expect(update!.patch.updatedAt).toBeInstanceOf(Date);
  });

  it('falls back to authorName "Agent" when users lookup returns nothing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open', assignedUserId: null }]);
    selectQueue.push([]); // no user row
    insertReturnQueue.push([{ id: 42, body: 'hi', authorName: 'Agent', occurredAt: new Date() }]);

    const res = await messagesRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/conversations/1/messages', 'POST', { body: 'hi' }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(200);
    const insert = insertCalls.find((c) => c.table === 'chatMessages')!;
    expect((insert.values as Record<string, unknown>).authorName).toBe('Agent');
  });

  it('swallows publishMessage rejection without failing the response', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, status: 'open', assignedUserId: null }]);
    selectQueue.push([{ name: 'Alice' }]);
    insertReturnQueue.push([{ id: 1, body: 'hi', authorName: 'Alice', occurredAt: new Date() }]);
    publishMessageMock.mockRejectedValue(new Error('publish down'));

    const res = await messagesRoute.POST(
      makeJsonRequest('http://x/api/portal/chat/conversations/1/messages', 'POST', { body: 'hi' }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(200);
  });
});

// ===========================================================================
// chat/widgets/[id]/route.ts — GET, PATCH, DELETE
// ===========================================================================

describe('GET /api/portal/chat/widgets/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await widgetRoute.GET(makeBareRequest('http://x/api/portal/chat/widgets/1'), makeIdParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await widgetRoute.GET(makeBareRequest('http://x/api/portal/chat/widgets/1'), makeIdParams('1'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when widget not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // widget lookup empty
    const res = await widgetRoute.GET(makeBareRequest('http://x/api/portal/chat/widgets/1'), makeIdParams('1'));
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Widget not found');
  });

  it('returns the widget when found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, enabled: true, primaryColor: '#000' }]);
    const res = await widgetRoute.GET(makeBareRequest('http://x/api/portal/chat/widgets/1'), makeIdParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
  });
});

describe('PATCH /api/portal/chat/widgets/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await widgetRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/widgets/1', 'PATCH', { enabled: false }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when widget not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // widget lookup empty
    const res = await widgetRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/widgets/1', 'PATCH', { enabled: false }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('applies known fields and ignores unknown ones', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // widget lookup
    updateReturnQueue.push([{ id: 1, enabled: false, greetingMessage: 'Hi', position: 'left' }]);
    const res = await widgetRoute.PATCH(
      makeJsonRequest('http://x/api/portal/chat/widgets/1', 'PATCH', {
        enabled: false,
        greetingMessage: 'Hi',
        position: 'left',
        primaryColor: '#abcdef',
        awayMessage: null,
        someUnknownField: 'ignored',
      }),
      makeIdParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    const upd = updateCalls.find((u) => u.table === 'chatWidgets')!;
    expect(upd.patch).toMatchObject({
      enabled: false,
      greetingMessage: 'Hi',
      position: 'left',
      primaryColor: '#abcdef',
      awayMessage: null,
    });
    expect(upd.patch.updatedAt).toBeInstanceOf(Date);
    expect((upd.patch as Record<string, unknown>).someUnknownField).toBeUndefined();
  });

  it('handles invalid JSON body gracefully (treated as {})', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturnQueue.push([{ id: 1 }]);
    const req = new Request('http://x/api/portal/chat/widgets/1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await widgetRoute.PATCH(req, makeIdParams('1'));
    expect(res.status).toBe(200);
    const upd = updateCalls.find((u) => u.table === 'chatWidgets')!;
    // only updatedAt is set
    expect(Object.keys(upd.patch)).toEqual(['updatedAt']);
  });
});

describe('DELETE /api/portal/chat/widgets/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await widgetRoute.DELETE(
      makeBareRequest('http://x/api/portal/chat/widgets/1', 'DELETE'),
      makeIdParams('1'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when widget not found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await widgetRoute.DELETE(
      makeBareRequest('http://x/api/portal/chat/widgets/1', 'DELETE'),
      makeIdParams('1'),
    );
    expect(res.status).toBe(404);
  });

  it('deletes the widget when found', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    const res = await widgetRoute.DELETE(
      makeBareRequest('http://x/api/portal/chat/widgets/1', 'DELETE'),
      makeIdParams('1'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(deleteCalls.some((d) => d.table === 'chatWidgets')).toBe(true);
  });
});

// ===========================================================================
// cms/websites/[siteId]/branding/generate/route.ts — POST
// ===========================================================================

describe('POST /api/portal/cms/websites/[siteId]/branding/generate', () => {
  const validDescription = 'A modern, energetic SaaS platform for marketing teams';

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await brandingGenerateRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/branding/generate', 'POST', {
        description: validDescription,
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when siteId is not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    const res = await brandingGenerateRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/abc/branding/generate', 'POST', {
        description: validDescription,
      }),
      makeSiteParams('abc'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/invalid siteid/i);
  });

  it('returns 404 when site not found for this user', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await brandingGenerateRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/branding/generate', 'POST', {
        description: validDescription,
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when description is too short', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    const res = await brandingGenerateRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/branding/generate', 'POST', {
        description: 'short',
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/at least 10 characters/i);
  });

  it('returns 400 when description is missing entirely', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    const res = await brandingGenerateRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/branding/generate', 'POST', {}),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 402 when plan gate denies the request', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    checkAiPlanGateMock.mockResolvedValue({
      allowed: false,
      message: 'Upgrade your plan',
      reason: 'no_plan',
    });
    const res = await brandingGenerateRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/branding/generate', 'POST', {
        description: validDescription,
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.message).toBe('Upgrade your plan');
    expect(body.reason).toBe('no_plan');
  });

  it('returns 500 when Anthropic response contains no JSON', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    resolveClientApiKeyMock.mockResolvedValue({ key: 'sk-test', source: 'client' });
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: 'no json here at all' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    const res = await brandingGenerateRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/branding/generate', 'POST', {
        description: validDescription,
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toMatch(/failed to generate valid branding/i);
  });

  it('returns 500 with generic message when Anthropic call throws', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    resolveClientApiKeyMock.mockResolvedValue({ key: 'sk-test', source: 'client' });
    messagesCreateMock.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await brandingGenerateRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/branding/generate', 'POST', {
        description: validDescription,
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).message).toMatch(/please try again/i);
  });

  it('returns generated brand JSON and records usage on success', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    resolveClientApiKeyMock.mockResolvedValue({ key: 'sk-test', source: 'client' });
    const generated = {
      primaryColor: '#112233',
      secondaryColor: '#445566',
      accentColor: '#778899',
      backgroundColor: '#ffffff',
      textColor: '#000000',
      headingFont: 'Inter',
      bodyFont: 'Inter',
      tone: 'modern & energetic',
    };
    messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: `Here is the brand:\n\`\`\`json\n${JSON.stringify(generated)}\n\`\`\``,
        },
      ],
      usage: { input_tokens: 100, output_tokens: 200 },
    });
    const res = await brandingGenerateRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/branding/generate', 'POST', {
        description: validDescription,
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.primaryColor).toBe('#112233');
    expect(body.data.tone).toBe('modern & energetic');
    expect(anthropicCtorSpy).toHaveBeenCalledWith({ apiKey: 'sk-test' });
    expect(recordAiUsageMock).toHaveBeenCalledWith({
      clientId: 33,
      source: 'client',
      tokens: 300,
    });
  });

  it('handles response with empty text content as no JSON match', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    checkAiPlanGateMock.mockResolvedValue({ allowed: true });
    resolveClientApiKeyMock.mockResolvedValue({ key: 'sk-test', source: 'client' });
    messagesCreateMock.mockResolvedValue({
      content: [{ type: 'tool_use', text: 'never read' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const res = await brandingGenerateRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/branding/generate', 'POST', {
        description: validDescription,
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(500);
  });
});

// ===========================================================================
// cms/websites/[siteId]/categories/route.ts — GET, POST
// ===========================================================================

describe('GET /api/portal/cms/websites/[siteId]/categories', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await categoriesRoute.GET(
      makeBareRequest('http://x/api/portal/cms/websites/5/categories'),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site not found', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await categoriesRoute.GET(
      makeBareRequest('http://x/api/portal/cms/websites/5/categories'),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns categories list for the site', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([
      { id: 1, name: 'News', slug: 'news', websiteId: 5 },
      { id: 2, name: 'Updates', slug: 'updates', websiteId: 5 },
    ]);
    const res = await categoriesRoute.GET(
      makeBareRequest('http://x/api/portal/cms/websites/5/categories'),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].name).toBe('News');
  });
});

describe('POST /api/portal/cms/websites/[siteId]/categories', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await categoriesRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/categories', 'POST', {
        name: 'News',
        slug: 'news',
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when site not found', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue(null);
    const res = await categoriesRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/categories', 'POST', {
        name: 'News',
        slug: 'news',
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    const res = await categoriesRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/categories', 'POST', { slug: 'news' }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/name and slug are required/i);
  });

  it('returns 400 when slug is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    const res = await categoriesRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/categories', 'POST', { name: 'News' }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when name is only whitespace', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    const res = await categoriesRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/categories', 'POST', {
        name: '   ',
        slug: 'news',
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when slug already exists on this site', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([{ id: 7 }]); // existing
    const res = await categoriesRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/categories', 'POST', {
        name: 'News',
        slug: 'news',
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/already exists/i);
  });

  it('creates category with optional fields nulled when omitted', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([]); // slug unique
    insertReturnQueue.push([
      { id: 11, name: 'News', slug: 'news', description: null, color: null, websiteId: 5 },
    ]);
    const res = await categoriesRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/categories', 'POST', {
        name: 'News',
        slug: 'news',
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(11);
    const insert = insertCalls.find((c) => c.table === 'categories')!;
    expect(insert.values).toMatchObject({
      name: 'News',
      slug: 'news',
      description: null,
      color: null,
      websiteId: 5,
    });
  });

  it('creates category with description and color trimmed', async () => {
    authMock.mockResolvedValue(SESSION);
    resolveClientSiteMock.mockResolvedValue({ id: 5, clientId: 33 });
    selectQueue.push([]); // slug unique
    insertReturnQueue.push([{ id: 12 }]);
    const res = await categoriesRoute.POST(
      makeJsonRequest('http://x/api/portal/cms/websites/5/categories', 'POST', {
        name: '  News  ',
        slug: '  news  ',
        description: '  Latest items  ',
        color: '  #ff0000  ',
      }),
      makeSiteParams('5'),
    );
    expect(res.status).toBe(201);
    const insert = insertCalls.find((c) => c.table === 'categories')!;
    expect(insert.values).toMatchObject({
      name: 'News',
      slug: 'news',
      description: 'Latest items',
      color: '#ff0000',
      websiteId: 5,
    });
  });
});
