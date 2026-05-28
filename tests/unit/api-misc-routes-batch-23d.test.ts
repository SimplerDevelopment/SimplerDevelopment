// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 23d):
 *   - app/api/portal/brain/tasks/[id]/route.ts   (GET, PUT, DELETE)
 *   - app/api/portal/email/templates/route.ts    (GET, POST)
 *   - app/api/portal/automations/route.ts        (GET, POST)
 *   - app/api/portal/surveys/route.ts            (GET, POST)
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
  return {
    emailTemplates: wrap('emailTemplates'),
    automationRules: wrap('automationRules'),
    surveys: wrap('surveys'),
  };
});

// brain entitlement + brain/tasks lib
const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
}));

const getTaskMock = vi.fn();
const updateTaskMock = vi.fn();
const deleteTaskLibMock = vi.fn();
vi.mock('@/lib/brain/tasks', () => ({
  getTask: (...args: unknown[]) => getTaskMock(...args),
  updateTask: (...args: unknown[]) => updateTaskMock(...args),
  deleteTask: (...args: unknown[]) => deleteTaskLibMock(...args),
}));

// email render
const renderBlocksToEmailHtmlMock = vi.fn();
vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: (...args: unknown[]) => renderBlocksToEmailHtmlMock(...args),
}));

// automation event-bus
const emitEventMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

// ---------------------------------------------------------------------------
// DB mock
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown>;
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];

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

  function buildInsert(table: { __table: string }) {
    return {
      values(values: Record<string, unknown>) {
        const rows = insertReturnQueue.shift() ?? [];
        const cloned = rows.map((r) => ({ ...r }));
        insertCalls.push({ table: table.__table, values, returnedRows: cloned });
        return {
          returning() {
            return Promise.resolve(cloned);
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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---- modules under test ----
const brainTasksIdRoute = await import('@/app/api/portal/brain/tasks/[id]/route');
const emailTemplatesRoute = await import('@/app/api/portal/email/templates/route');
const automationsRoute = await import('@/app/api/portal/automations/route');
const surveysRoute = await import('@/app/api/portal/surveys/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const SESSION = { user: { id: '7', name: 'Bob' } };
const OK_AUTH = { client: { id: 33 }, userId: 7 };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  isAuthErrorMock.mockClear();
  requireBrainEntitlementMock.mockReset();
  getTaskMock.mockReset();
  updateTaskMock.mockReset();
  deleteTaskLibMock.mockReset();
  renderBlocksToEmailHtmlMock.mockReset();
  emitEventMock.mockReset();
});

// ===========================================================================
// portal/brain/tasks/[id]
// ===========================================================================

describe('GET /api/portal/brain/tasks/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    const denied = new Response('no', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: denied });
    const res = await brainTasksIdRoute.GET(makeReq('http://x'), paramsFor('1'));
    expect(res).toBe(denied);
  });

  it('returns 400 for non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    const res = await brainTasksIdRoute.GET(makeReq('http://x'), paramsFor('abc'));
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid task id');
  });

  it('returns 404 when task not found', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    getTaskMock.mockResolvedValue(null);
    const res = await brainTasksIdRoute.GET(makeReq('http://x'), paramsFor('5'));
    expect(res.status).toBe(404);
  });

  it('returns the task on success', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    getTaskMock.mockResolvedValue({ id: 5, title: 'T' });
    const res = await brainTasksIdRoute.GET(makeReq('http://x'), paramsFor('5'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { id: 5, title: 'T' } });
    expect(getTaskMock).toHaveBeenCalledWith(33, 5);
  });
});

describe('PUT /api/portal/brain/tasks/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    const denied = new Response('no', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: denied });
    const res = await brainTasksIdRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: '{}' }),
      paramsFor('1'),
    );
    expect(res).toBe(denied);
  });

  it('returns 400 for non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    const res = await brainTasksIdRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: '{}' }),
      paramsFor('not-a-number'),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is not an object', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    const res = await brainTasksIdRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: 'not-json' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid body');
  });

  it('returns 404 when updateTask returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    updateTaskMock.mockResolvedValue(null);
    const res = await brainTasksIdRoute.PUT(
      makeReq('http://x', { method: 'PUT', body: JSON.stringify({ title: 'X' }) }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('forwards sanitized patch fields and returns the updated task', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    updateTaskMock.mockResolvedValue({ id: 5, title: 'New' });
    const longTitle = 'A'.repeat(700);
    const res = await brainTasksIdRoute.PUT(
      makeReq('http://x', {
        method: 'PUT',
        body: JSON.stringify({
          title: longTitle,
          description: 'd',
          ownerId: 9,
          status: 'in_progress',
          priority: 'high',
          dueDate: '2026-01-01T00:00:00.000Z',
          blockedReason: 'because',
          needsReview: true,
          bogus: 'ignored',
        }),
      }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(5);
    const patch = updateTaskMock.mock.calls[0][2];
    expect((patch.title as string).length).toBe(500);
    expect(patch.description).toBe('d');
    expect(patch.ownerId).toBe(9);
    expect(patch.status).toBe('in_progress');
    expect(patch.priority).toBe('high');
    expect(patch.dueDate).toBeInstanceOf(Date);
    expect(patch.blockedReason).toBe('because');
    expect(patch.needsReview).toBe(true);
    expect(updateTaskMock.mock.calls[0][3]).toBe(7);
  });

  it('passes through nulls for nullable fields and skips invalid enums', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    updateTaskMock.mockResolvedValue({ id: 5 });
    await brainTasksIdRoute.PUT(
      makeReq('http://x', {
        method: 'PUT',
        body: JSON.stringify({
          description: null,
          ownerId: null,
          dueDate: null,
          blockedReason: null,
          status: 'no-such-status',
          priority: 'no-such-priority',
        }),
      }),
      paramsFor('5'),
    );
    const patch = updateTaskMock.mock.calls[0][2];
    expect(patch.description).toBeNull();
    expect(patch.ownerId).toBeNull();
    expect(patch.dueDate).toBeNull();
    expect(patch.blockedReason).toBeNull();
    expect(patch.status).toBeUndefined();
    expect(patch.priority).toBeUndefined();
  });
});

describe('DELETE /api/portal/brain/tasks/[id]', () => {
  it('returns the entitlement response when not entitled', async () => {
    const denied = new Response('no', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: denied });
    const res = await brainTasksIdRoute.DELETE(makeReq('http://x'), paramsFor('1'));
    expect(res).toBe(denied);
  });

  it('returns 400 for non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    const res = await brainTasksIdRoute.DELETE(makeReq('http://x'), paramsFor('NaN'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when deleteTask returns false', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    deleteTaskLibMock.mockResolvedValue(false);
    const res = await brainTasksIdRoute.DELETE(makeReq('http://x'), paramsFor('5'));
    expect(res.status).toBe(404);
  });

  it('returns success when deleteTask returns true', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    deleteTaskLibMock.mockResolvedValue(true);
    const res = await brainTasksIdRoute.DELETE(makeReq('http://x'), paramsFor('5'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteTaskLibMock).toHaveBeenCalledWith(33, 5, 7);
  });
});

// ===========================================================================
// portal/email/templates
// ===========================================================================

describe('GET /api/portal/email/templates', () => {
  it('returns the authorize error response when authorization fails', async () => {
    const denied = new Response('nope', { status: 402 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await emailTemplatesRoute.GET();
    expect(res).toBe(denied);
  });

  it('returns 401 when there is no session', async () => {
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    authMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the list of templates on success', async () => {
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, name: 'Welcome' }]);
    const res = await emailTemplatesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [{ id: 1, name: 'Welcome' }] });
  });
});

describe('POST /api/portal/email/templates', () => {
  it('returns the authorize error response when authorization fails', async () => {
    const denied = new Response('nope', { status: 402 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await emailTemplatesRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
    );
    expect(res).toBe(denied);
  });

  it('returns 401 when there is no session', async () => {
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    authMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name or content is missing', async () => {
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await emailTemplatesRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ name: '  ', htmlContent: '' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain('required');
  });

  it('creates a template using htmlContent directly', async () => {
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    insertReturnQueue.push([{ id: 11, name: 'Welcome' }]);
    const res = await emailTemplatesRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({
          name: '  Welcome  ',
          description: '  hello  ',
          category: 'welcome',
          subject: '  hi  ',
          htmlContent: '<p>hello</p>',
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].table).toBe('emailTemplates');
    expect(insertCalls[0].values.name).toBe('Welcome');
    expect(insertCalls[0].values.description).toBe('hello');
    expect(insertCalls[0].values.category).toBe('welcome');
    expect(insertCalls[0].values.subject).toBe('hi');
    expect(insertCalls[0].values.htmlContent).toBe('<p>hello</p>');
    expect(insertCalls[0].values.clientId).toBe(33);
    expect(insertCalls[0].values.createdBy).toBe(7);
    expect(renderBlocksToEmailHtmlMock).not.toHaveBeenCalled();
  });

  it('renders blockContent.blocks via renderBlocksToEmailHtml', async () => {
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    renderBlocksToEmailHtmlMock.mockReturnValue('<div>rendered</div>');
    insertReturnQueue.push([{ id: 12 }]);
    const blocks = [{ type: 'text', content: 'hi' }];
    const res = await emailTemplatesRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Block Template',
          htmlContent: '<p>ignored</p>',
          blockContent: { blocks },
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect(renderBlocksToEmailHtmlMock).toHaveBeenCalledWith(blocks);
    expect(insertCalls[0].values.htmlContent).toBe('<div>rendered</div>');
    expect(insertCalls[0].values.category).toBe('custom');
    expect(insertCalls[0].values.description).toBeNull();
  });
});

// ===========================================================================
// portal/automations
// ===========================================================================

describe('GET /api/portal/automations', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await automationsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns the authorize error response when authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('nope', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await automationsRoute.GET();
    expect(res).toBe(denied);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await automationsRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the list of automation rules', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, name: 'rule' }]);
    const res = await automationsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, rules: [{ id: 1, name: 'rule' }] });
  });
});

describe('POST /api/portal/automations', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await automationsRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns the authorize error response when authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('nope', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await automationsRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
    );
    expect(res).toBe(denied);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await automationsRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({}) }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name/trigger/actions missing', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await automationsRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ name: 'r', trigger: 't' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('required');
  });

  it('inserts a new automation rule with defaults', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    insertReturnQueue.push([{ id: 9, name: 'rule' }]);
    const res = await automationsRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({
          name: 'rule',
          trigger: 'deal.created',
          actions: [{ type: 'notify' }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(insertCalls[0].table).toBe('automationRules');
    expect(insertCalls[0].values.conditions).toEqual([]);
    expect(insertCalls[0].values.source).toBe('manual');
    expect(insertCalls[0].values.productScope).toBeNull();
    expect(insertCalls[0].values.clientId).toBe(33);
    expect(insertCalls[0].values.createdBy).toBe(7);
  });

  it('passes through provided conditions, source, and productScope', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    insertReturnQueue.push([{ id: 10 }]);
    await automationsRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({
          name: 'rule',
          description: 'desc',
          trigger: 'x',
          conditions: [{ field: 'a' }],
          actions: [{ type: 'send' }],
          source: 'nlp',
          productScope: 'crm',
        }),
      }),
    );
    expect(insertCalls[0].values.conditions).toEqual([{ field: 'a' }]);
    expect(insertCalls[0].values.source).toBe('nlp');
    expect(insertCalls[0].values.productScope).toBe('crm');
    expect(insertCalls[0].values.description).toBe('desc');
  });
});

// ===========================================================================
// portal/surveys
// ===========================================================================

describe('GET /api/portal/surveys', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await surveysRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns the authorize error response when authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('nope', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await surveysRoute.GET();
    expect(res).toBe(denied);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await surveysRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the list of surveys on success', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, title: 'NPS' }]);
    const res = await surveysRoute.GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: [{ id: 1, title: 'NPS' }] });
  });
});

describe('POST /api/portal/surveys', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await surveysRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns the authorize error response when authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('nope', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await surveysRoute.POST(
      makeReq('http://x', { method: 'POST', body: '{}' }),
    );
    expect(res).toBe(denied);
  });

  it('returns 404 when portal client missing', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue(null);
    const res = await surveysRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ title: 'T' }) }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when title is missing or blank', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await surveysRoute.POST(
      makeReq('http://x', { method: 'POST', body: JSON.stringify({ title: '   ' }) }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toContain('Title');
  });

  it('inserts a survey with a slugified title and emits an event', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    insertReturnQueue.push([{ id: 4, title: 'Hello World', slug: 'hello-world-abc' }]);
    const res = await surveysRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({
          title: '  Hello World!  ',
          description: '  desc  ',
          fields: [{ key: 'q1' }],
          linkedType: 'deal',
          linkedId: 99,
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].table).toBe('surveys');
    expect(insertCalls[0].values.title).toBe('Hello World!');
    expect(typeof insertCalls[0].values.slug).toBe('string');
    expect((insertCalls[0].values.slug as string).startsWith('hello-world-')).toBe(true);
    expect(insertCalls[0].values.description).toBe('desc');
    expect(insertCalls[0].values.fields).toEqual([{ key: 'q1' }]);
    expect(insertCalls[0].values.linkedType).toBe('deal');
    expect(insertCalls[0].values.linkedId).toBe(99);
    expect(insertCalls[0].values.clientId).toBe(33);
    expect(insertCalls[0].values.createdBy).toBe(7);
    expect(emitEventMock).toHaveBeenCalledWith(
      'survey.created',
      33,
      7,
      expect.objectContaining({ id: 4, title: 'Hello World', slug: 'hello-world-abc' }),
    );
  });

  it('falls back to empty defaults for optional fields', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue(OK_AUTH);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    insertReturnQueue.push([{ id: 5, title: 'Bare', slug: 'bare-abc' }]);
    await surveysRoute.POST(
      makeReq('http://x', {
        method: 'POST',
        body: JSON.stringify({ title: 'Bare' }),
      }),
    );
    expect(insertCalls[0].values.description).toBeNull();
    expect(insertCalls[0].values.fields).toEqual([]);
    expect(insertCalls[0].values.linkedType).toBeNull();
    expect(insertCalls[0].values.linkedId).toBeNull();
  });
});
