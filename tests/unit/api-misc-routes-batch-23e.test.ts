// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 23e):
 *   - app/api/portal/email/templates/route.ts        (GET, POST)
 *   - app/api/portal/tools/pitch-decks/route.ts      (GET, POST)
 *   - app/api/admin/portal/websites/route.ts         (GET, POST)
 *   - app/api/portal/brain/tasks/[id]/route.ts       (GET, PUT, DELETE)
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
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) =>
    !!(r && typeof r === 'object' && 'response' in (r as Record<string, unknown>)),
}));

const renderBlocksToEmailHtmlMock = vi.fn();
vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: (...args: unknown[]) => renderBlocksToEmailHtmlMock(...args),
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
    emailTemplates: wrap('emailTemplates'),
    pitchDecks: wrap('pitchDecks'),
    clientWebsites: wrap('clientWebsites'),
    clients: wrap('clients'),
    users: wrap('users'),
    storeSettings: wrap('storeSettings'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// brain/tasks helpers
const getTaskMock = vi.fn();
const updateTaskMock = vi.fn();
const deleteTaskMock = vi.fn();
vi.mock('@/lib/brain/tasks', () => ({
  getTask: (...args: unknown[]) => getTaskMock(...args),
  updateTask: (...args: unknown[]) => updateTaskMock(...args),
  deleteTask: (...args: unknown[]) => deleteTaskMock(...args),
  countTasks: (..._args: unknown[]) => Promise.resolve(0),
}));

const requireBrainEntitlementMock = vi.fn();
vi.mock('@/lib/brain/entitlement', () => ({
  requireBrainEntitlement: (...args: unknown[]) => requireBrainEntitlementMock(...args),
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
    const makeTerminal = () => {
      materialize();
      const term: Record<string, unknown> = {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
      // Allow further chaining after orderBy/limit (e.g. .orderBy().limit())
      term.limit = () => makeTerminal();
      term.offset = () => makeTerminal();
      term.orderBy = () => makeTerminal();
      return term;
    };
    chain.orderBy = makeTerminal;
    chain.limit = makeTerminal;
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
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---- modules under test ----
const emailTemplatesRoute = await import('@/app/api/portal/email/templates/route');
const portalPitchDecksRoute = await import('@/app/api/portal/tools/pitch-decks/route');
const adminWebsitesRoute = await import('@/app/api/admin/portal/websites/route');
const brainTasksIdRoute = await import('@/app/api/portal/brain/tasks/[id]/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}
function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

const SESSION = { user: { id: '7', name: 'Bob' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  renderBlocksToEmailHtmlMock.mockReset();
  getTaskMock.mockReset();
  updateTaskMock.mockReset();
  deleteTaskMock.mockReset();
  requireBrainEntitlementMock.mockReset();
});

// ===========================================================================
// portal/email/templates
// ===========================================================================

describe('GET /api/portal/email/templates', () => {
  it('returns the auth error response when portal authorization fails', async () => {
    const denied = new Response('no', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await emailTemplatesRoute.GET();
    expect(res).toBe(denied);
  });

  it('returns 401 when there is no session', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when there is no portal client', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the list of templates for the client', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      { id: 1, name: 'Welcome', clientId: 33 },
      { id: 2, name: 'Global', isGlobal: true },
    ]);
    const res = await emailTemplatesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
  });
});

describe('POST /api/portal/email/templates', () => {
  function makePost(body: unknown) {
    return makeReq('http://x/api/portal/email/templates', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('returns the auth error response when portal authorization fails', async () => {
    const denied = new Response('no', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await emailTemplatesRoute.POST(makePost({}));
    expect(res).toBe(denied);
  });

  it('returns 401 when there is no session', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.POST(makePost({ name: 'x', htmlContent: 'y' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when there is no portal client', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await emailTemplatesRoute.POST(makePost({ name: 'x', htmlContent: 'y' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when name or html is missing', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await emailTemplatesRoute.POST(makePost({ name: '  ', htmlContent: '' }));
    expect(res.status).toBe(400);
  });

  it('inserts a new template using htmlContent and returns 201', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    insertReturnQueue.push([{ id: 100, name: 'Welcome' }]);
    const res = await emailTemplatesRoute.POST(
      makePost({
        name: '  Welcome  ',
        description: '  hi  ',
        category: 'marketing',
        subject: '  Hello  ',
        htmlContent: '<p>Hi</p>',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(100);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('emailTemplates');
    expect(insertCalls[0].values).toMatchObject({
      clientId: 33,
      name: 'Welcome',
      description: 'hi',
      category: 'marketing',
      subject: 'Hello',
      htmlContent: '<p>Hi</p>',
      createdBy: 7,
    });
  });

  it('uses blockContent.blocks to render the html when present', async () => {
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    renderBlocksToEmailHtmlMock.mockReturnValue('<p>FROM_BLOCKS</p>');
    insertReturnQueue.push([{ id: 200 }]);
    const res = await emailTemplatesRoute.POST(
      makePost({
        name: 'Block Template',
        blockContent: { blocks: [{ type: 'paragraph' }] },
      }),
    );
    expect(res.status).toBe(201);
    expect(renderBlocksToEmailHtmlMock).toHaveBeenCalledWith([{ type: 'paragraph' }]);
    expect(insertCalls[0].values.htmlContent).toBe('<p>FROM_BLOCKS</p>');
    expect(insertCalls[0].values.category).toBe('custom');
  });
});

// ===========================================================================
// portal/tools/pitch-decks
// ===========================================================================

describe('GET /api/portal/tools/pitch-decks', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await portalPitchDecksRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns the auth error response when portal authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('no', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await portalPitchDecksRoute.GET();
    expect(res).toBe(denied);
  });

  it('returns 404 when there is no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await portalPitchDecksRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns the list of decks', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, title: 'D' }]);
    const res = await portalPitchDecksRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([{ id: 1, title: 'D' }]);
  });
});

describe('POST /api/portal/tools/pitch-decks', () => {
  function makePost(body: unknown) {
    return makeReq('http://x/api/portal/tools/pitch-decks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await portalPitchDecksRoute.POST(makePost({ title: 'D' }));
    expect(res.status).toBe(401);
  });

  it('returns the auth error response when portal authorization fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const denied = new Response('no', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: denied });
    const res = await portalPitchDecksRoute.POST(makePost({ title: 'D' }));
    expect(res).toBe(denied);
  });

  it('returns 404 when there is no portal client', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await portalPitchDecksRoute.POST(makePost({ title: 'D' }));
    expect(res.status).toBe(404);
  });

  it('returns 400 when title is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue({ id: 33 });
    const res = await portalPitchDecksRoute.POST(makePost({ title: '   ' }));
    expect(res.status).toBe(400);
  });

  it('inserts a deck with a slugified title and timestamp suffix', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 33 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue({ id: 33 });
    // The route SELECTs existing slugs before inserting. Prime an existing
    // collision so the route appends a base-36 timestamp suffix.
    selectQueue.push([{ slug: 'my-deck' }]);
    insertReturnQueue.push([{ id: 11, title: 'My Deck!' }]);
    const res = await portalPitchDecksRoute.POST(
      makePost({
        title: 'My Deck!',
        description: '  desc  ',
        sourceUrl: '  https://x ',
        brandingProfileId: 5,
      }),
    );
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('pitchDecks');
    const inserted = insertCalls[0].values;
    expect(inserted.clientId).toBe(33);
    expect(inserted.title).toBe('My Deck!');
    expect(inserted.description).toBe('desc');
    expect(inserted.sourceUrl).toBe('https://x');
    expect(inserted.brandingProfileId).toBe(5);
    expect(inserted.createdBy).toBe(7);
    expect(typeof inserted.slug).toBe('string');
    // When base slug collides, route appends a base-36 timestamp token.
    expect((inserted.slug as string).startsWith('my-deck-')).toBe(true);
  });
});

// ===========================================================================
// admin/portal/websites
// ===========================================================================

describe('GET /api/admin/portal/websites', () => {
  const adminWebsitesReq = () => new Request('http://localhost/api/admin/portal/websites');

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await adminWebsitesRoute.GET(adminWebsitesReq());
    expect(res.status).toBe(401);
  });

  it('returns 401 when user is not admin or employee', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    const res = await adminWebsitesRoute.GET(adminWebsitesReq());
    expect(res.status).toBe(401);
  });

  it('returns the joined website list for admin users', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    selectQueue.push([{ id: 1, name: 'Acme Site', clientCompany: 'Acme' }]);
    const res = await adminWebsitesRoute.GET(adminWebsitesReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data[0].clientCompany).toBe('Acme');
  });

  it('allows employee role too', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'employee' } });
    selectQueue.push([]);
    const res = await adminWebsitesRoute.GET(adminWebsitesReq());
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/portal/websites', () => {
  function makePost(body: unknown) {
    return makeReq('http://x/api/admin/portal/websites', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  it('returns 401 when not staff', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'client' } });
    const res = await adminWebsitesRoute.POST(
      makePost({ clientId: '5', name: 'Acme' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when clientId or name is missing', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    const res = await adminWebsitesRoute.POST(makePost({ name: 'Acme' }));
    expect(res.status).toBe(400);
  });

  it('inserts a new website and parses clientId as int', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'admin' } });
    insertReturnQueue.push([{ id: 50, name: 'Acme' }]);
    const res = await adminWebsitesRoute.POST(
      makePost({
        clientId: '12',
        name: 'Acme',
        domain: 'acme.com',
        description: 'Cool site',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('clientWebsites');
    expect(insertCalls[0].values).toMatchObject({
      clientId: 12,
      name: 'Acme',
      domain: 'acme.com',
      description: 'Cool site',
    });
  });

  it('coalesces missing domain and description to null', async () => {
    authMock.mockResolvedValue({ user: { id: '7', role: 'employee' } });
    insertReturnQueue.push([{ id: 51 }]);
    await adminWebsitesRoute.POST(
      makePost({ clientId: '12', name: 'Acme' }),
    );
    expect(insertCalls[0].values.domain).toBeNull();
    expect(insertCalls[0].values.description).toBeNull();
  });
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

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    const res = await brainTasksIdRoute.GET(makeReq('http://x'), paramsFor('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the task is not found', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    getTaskMock.mockResolvedValue(null);
    const res = await brainTasksIdRoute.GET(makeReq('http://x'), paramsFor('5'));
    expect(res.status).toBe(404);
  });

  it('returns the task when found', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    getTaskMock.mockResolvedValue({ id: 5, title: 'Do thing' });
    const res = await brainTasksIdRoute.GET(makeReq('http://x'), paramsFor('5'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { id: 5, title: 'Do thing' } });
    expect(getTaskMock).toHaveBeenCalledWith(33, 5);
  });
});

describe('PUT /api/portal/brain/tasks/[id]', () => {
  function makePut(body: unknown | string) {
    return makeReq('http://x', {
      method: 'PUT',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });
  }

  it('returns the entitlement response when not entitled', async () => {
    const denied = new Response('no', { status: 402 });
    requireBrainEntitlementMock.mockResolvedValue({ response: denied });
    const res = await brainTasksIdRoute.PUT(makePut({}), paramsFor('1'));
    expect(res).toBe(denied);
  });

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    const res = await brainTasksIdRoute.PUT(makePut({}), paramsFor('nope'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when body is invalid JSON', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    const res = await brainTasksIdRoute.PUT(makePut('not-json'), paramsFor('5'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when updateTask returns null', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    updateTaskMock.mockResolvedValue(null);
    const res = await brainTasksIdRoute.PUT(
      makePut({ title: 'New' }),
      paramsFor('5'),
    );
    expect(res.status).toBe(404);
  });

  it('returns the updated task with sanitized input', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    updateTaskMock.mockResolvedValue({ id: 5, title: 'New' });
    const longTitle = 'A'.repeat(600);
    const res = await brainTasksIdRoute.PUT(
      makePut({
        title: longTitle,
        description: 'desc',
        ownerId: 9,
        status: 'in_progress',
        priority: 'high',
        dueDate: '2030-01-01',
        blockedReason: 'because',
        needsReview: true,
      }),
      paramsFor('5'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(5);
    expect(updateTaskMock).toHaveBeenCalledTimes(1);
    const [clientId, taskId, patch, actorId] = updateTaskMock.mock.calls[0];
    expect(clientId).toBe(33);
    expect(taskId).toBe(5);
    expect(actorId).toBe(7);
    expect((patch.title as string).length).toBe(500);
    expect(patch.description).toBe('desc');
    expect(patch.ownerId).toBe(9);
    expect(patch.status).toBe('in_progress');
    expect(patch.priority).toBe('high');
    expect(patch.dueDate).toBeInstanceOf(Date);
    expect(patch.blockedReason).toBe('because');
    expect(patch.needsReview).toBe(true);
  });

  it('passes null through for explicit-null fields and drops invalid enum values', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    updateTaskMock.mockResolvedValue({ id: 5 });
    await brainTasksIdRoute.PUT(
      makePut({
        description: null,
        ownerId: null,
        dueDate: null,
        blockedReason: null,
        status: 'bogus',
        priority: 'extreme',
      }),
      paramsFor('5'),
    );
    const patch = updateTaskMock.mock.calls[0][2] as Record<string, unknown>;
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

  it('returns 400 for a non-numeric id', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    const res = await brainTasksIdRoute.DELETE(makeReq('http://x'), paramsFor('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when deleteTask reports not-found', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    deleteTaskMock.mockResolvedValue(false);
    const res = await brainTasksIdRoute.DELETE(makeReq('http://x'), paramsFor('5'));
    expect(res.status).toBe(404);
  });

  it('returns success on successful delete', async () => {
    requireBrainEntitlementMock.mockResolvedValue({ client: { id: 33 }, userId: 7 });
    deleteTaskMock.mockResolvedValue(true);
    const res = await brainTasksIdRoute.DELETE(makeReq('http://x'), paramsFor('5'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteTaskMock).toHaveBeenCalledWith(33, 5, 7);
  });
});
