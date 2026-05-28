// @vitest-environment node
/**
 * Batch 34e — unit tests for 4 misc route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/workflows/route.ts                   (GET, POST)
 *  - app/api/portal/workflows/templates/route.ts         (GET)
 *  - app/api/post-types/route.ts                         (GET, POST)
 *  - app/api/posts/[id]/custom-fields/route.ts           (GET, PUT)
 *
 * Strategy: heavy mocking — db.select() returns a thenable + chain that
 * materializes from a queue of rows; db.insert / db.update capture writes
 * and surface a configurable `returning()` result. auth(), portal-auth,
 * portal-client, and workflows/templates helpers are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const authorizePortalMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (r: unknown) =>
    typeof r === 'object' && r !== null && 'response' in (r as Record<string, unknown>),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const findTemplateMock = vi.fn();
vi.mock('@/lib/workflows/templates', () => ({
  // Default templates array — overridden per-test if needed.
  WORKFLOW_TEMPLATES: [
    {
      id: 'tpl-a',
      icon: 'icon_a',
      name: 'Template A',
      description: 'first template',
      trigger: { kind: 'contact.created' },
      graph: { nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [] },
    },
    {
      id: 'tpl-b',
      icon: 'icon_b',
      name: 'Template B',
      description: 'second template',
      trigger: { kind: 'schedule', cron: '0 9 * * *' },
      graph: { nodes: [{ id: 'n1' }], edges: [] },
    },
  ],
  findTemplate: (...args: unknown[]) => findTemplateMock(...args),
}));

// drizzle-orm operators — inert objects.
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings,
      values,
    }),
    {
      raw: (s: string) => ({ op: 'sql.raw', s }),
    },
  ),
}));

// schema — proxy tables.
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          if (prop === '$inferSelect') return undefined;
          if (prop === 'then') return undefined;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return {
    workflows: wrap('workflows'),
    postTypes: wrap('postTypes'),
    postCustomFieldValues: wrap('postCustomFieldValues'),
    customFields: wrap('customFields'),
  };
});

// ---------------------------------------------------------------------------
// db mock: select-queue + insert/update capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];

function shiftNext(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;

    const materialize = () => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of [
      'from',
      'leftJoin',
      'innerJoin',
      'where',
      'orderBy',
      'groupBy',
      'limit',
      'offset',
    ]) {
      chain[m] = passthrough;
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => {
      return materialize().then(onF, onR);
    };
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
          then(onF: (val: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
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
            updateCalls.push({ table: table.__table, patch, filter });
            return {
              returning() {
                return Promise.resolve([]);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
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
        return buildSelect();
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
// Routes under test (imported AFTER all mocks)
// ---------------------------------------------------------------------------

const workflowsRoute = await import('@/app/api/portal/workflows/route');
const workflowTemplatesRoute = await import('@/app/api/portal/workflows/templates/route');
const postTypesRoute = await import('@/app/api/post-types/route');
const customFieldsRoute = await import('@/app/api/posts/[id]/custom-fields/route');

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeJsonReq(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const SESSION = { user: { id: '7' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  authMock.mockReset();
  authorizePortalMock.mockReset();
  getPortalClientMock.mockReset();
  findTemplateMock.mockReset();
});

// ===========================================================================
// GET /api/portal/workflows
// ===========================================================================

describe('GET /api/portal/workflows', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await workflowsRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await workflowsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns the authorizePortal error response when not authorized', async () => {
    authMock.mockResolvedValue(SESSION);
    const forbidden = new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
    authorizePortalMock.mockResolvedValue({ response: forbidden });

    const res = await workflowsRoute.GET();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue(null);

    const res = await workflowsRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Client not found');
  });

  it('returns workflow rows scoped to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    const rows = [
      { id: 1, clientId: 42, name: 'WF 1', status: 'draft' },
      { id: 2, clientId: 42, name: 'WF 2', status: 'active' },
    ];
    selectQueue.push(rows);

    const res = await workflowsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(rows);
    expect(getPortalClientMock).toHaveBeenCalledWith(7);
    expect(authorizePortalMock).toHaveBeenCalledWith({ action: 'read' });
  });

  it('returns empty list when no workflows exist', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    selectQueue.push([]);

    const res = await workflowsRoute.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/workflows
// ===========================================================================

describe('POST /api/portal/workflows', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await workflowsRoute.POST(makeJsonReq('http://x/wf', 'POST', {}));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('returns the authorizePortal error response when write not allowed', async () => {
    authMock.mockResolvedValue(SESSION);
    const forbidden = new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
    authorizePortalMock.mockResolvedValue({ response: forbidden });

    const res = await workflowsRoute.POST(makeJsonReq('http://x/wf', 'POST', {}));
    expect(res.status).toBe(403);
    expect(authorizePortalMock).toHaveBeenCalledWith({ action: 'write' });
  });

  it('returns 404 when client not found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue(null);

    const res = await workflowsRoute.POST(makeJsonReq('http://x/wf', 'POST', {}));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Client not found');
  });

  it('creates blank workflow with defaults when no body fields supplied', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    const newRow = { id: 99, clientId: 42, name: 'Untitled workflow' };
    insertReturnQueue.push([newRow]);

    const res = await workflowsRoute.POST(makeJsonReq('http://x/wf', 'POST', {}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(newRow);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('workflows');
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.name).toBe('Untitled workflow');
    expect(values.description).toBeNull();
    expect(values.clientId).toBe(42);
    expect(values.createdBy).toBe(7);
    expect(values.status).toBe('draft');
    expect(values.trigger).toEqual({ kind: 'contact.created' });
    const graph = values.graph as { nodes: Array<{ id: string }> ; edges: unknown[] };
    expect(graph.edges).toEqual([]);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].id).toBe('trigger');
  });

  it('honors name and description from body when no templateId', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    insertReturnQueue.push([{ id: 1 }]);

    await workflowsRoute.POST(
      makeJsonReq('http://x/wf', 'POST', {
        name: '  My WF  ',
        description: '  notes  ',
      }),
    );
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.name).toBe('My WF');
    expect(values.description).toBe('notes');
  });

  it('returns 404 when templateId not found', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    findTemplateMock.mockReturnValue(undefined);

    const res = await workflowsRoute.POST(
      makeJsonReq('http://x/wf', 'POST', { templateId: 'nope' }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Template not found');
    expect(insertCalls).toHaveLength(0);
  });

  it('clones template name/description/trigger/graph when templateId resolves', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });

    const tplGraph = {
      nodes: [{ id: 'trigger', data: { x: 1 } }],
      edges: [{ id: 'e1' }],
    };
    const tpl = {
      id: 'tpl-a',
      icon: 'i',
      name: 'TPL name',
      description: 'TPL desc',
      trigger: { kind: 'schedule', cron: '* * * * *' },
      graph: tplGraph,
    };
    findTemplateMock.mockReturnValue(tpl);
    insertReturnQueue.push([{ id: 5 }]);

    const res = await workflowsRoute.POST(
      makeJsonReq('http://x/wf', 'POST', { templateId: 'tpl-a' }),
    );
    expect(res.status).toBe(200);

    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.name).toBe('TPL name');
    expect(values.description).toBe('TPL desc');
    expect(values.trigger).toEqual({ kind: 'schedule', cron: '* * * * *' });

    // Deep cloned — must equal but NOT be the same reference.
    expect(values.graph).toEqual(tplGraph);
    expect(values.graph).not.toBe(tplGraph);
    expect((values.graph as { nodes: unknown[] }).nodes).not.toBe(tplGraph.nodes);
  });

  it('overrides template name/description when explicit body values present', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });

    findTemplateMock.mockReturnValue({
      id: 'tpl-a',
      icon: 'i',
      name: 'TPL name',
      description: 'TPL desc',
      trigger: { kind: 'contact.created' },
      graph: { nodes: [], edges: [] },
    });
    insertReturnQueue.push([{ id: 5 }]);

    await workflowsRoute.POST(
      makeJsonReq('http://x/wf', 'POST', {
        templateId: 'tpl-a',
        name: 'Custom Name',
        description: 'Custom desc',
      }),
    );
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.name).toBe('Custom Name');
    expect(values.description).toBe('Custom desc');
  });

  it('defaults to "Untitled workflow" when body has only whitespace name and no template', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    insertReturnQueue.push([{ id: 1 }]);

    await workflowsRoute.POST(makeJsonReq('http://x/wf', 'POST', { name: '   ' }));
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.name).toBe('Untitled workflow');
    expect(values.description).toBeNull();
  });

  it('handles invalid JSON body gracefully (defaults to blank workflow)', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });
    getPortalClientMock.mockResolvedValue({ id: 42 });
    insertReturnQueue.push([{ id: 1 }]);

    const req = new Request('http://x/wf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    });
    const res = await workflowsRoute.POST(req);
    expect(res.status).toBe(200);
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.name).toBe('Untitled workflow');
  });
});

// ===========================================================================
// GET /api/portal/workflows/templates
// ===========================================================================

describe('GET /api/portal/workflows/templates', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await workflowTemplatesRoute.GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Unauthorized');
  });

  it('returns 401 when session lacks user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await workflowTemplatesRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns the authorizePortal error response when not authorized', async () => {
    authMock.mockResolvedValue(SESSION);
    const forbidden = new Response(JSON.stringify({ success: false, error: 'Forbidden' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
    authorizePortalMock.mockResolvedValue({ response: forbidden });
    const res = await workflowTemplatesRoute.GET();
    expect(res.status).toBe(403);
    expect(authorizePortalMock).toHaveBeenCalledWith({ action: 'read' });
  });

  it('returns slim template payload (id, icon, name, description, triggerKind, nodeCount)', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ ok: true });

    const res = await workflowTemplatesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([
      {
        id: 'tpl-a',
        icon: 'icon_a',
        name: 'Template A',
        description: 'first template',
        triggerKind: 'contact.created',
        nodeCount: 2,
      },
      {
        id: 'tpl-b',
        icon: 'icon_b',
        name: 'Template B',
        description: 'second template',
        triggerKind: 'schedule',
        nodeCount: 1,
      },
    ]);
  });
});

// ===========================================================================
// GET /api/post-types
// ===========================================================================

describe('GET /api/post-types', () => {
  it('returns 200 with all post types', async () => {
    const rows = [
      { id: 1, name: 'Blog', slug: 'blog', active: true },
      { id: 2, name: 'Page', slug: 'page', active: true },
    ];
    selectQueue.push(rows);

    const res = await postTypesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(rows);
  });

  it('returns empty list when no post types exist', async () => {
    selectQueue.push([]);
    const res = await postTypesRoute.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it('returns 500 when db.select throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Override db.select for this test only by clearing the queue and
    // throwing via the materialized thenable. Easier: replace selectQueue
    // shifter result with a Proxy that throws on await.
    // Simpler: monkey-patch by pushing a queue entry whose getter throws.
    // We'll instead temporarily replace global selectQueue with a getter
    // that throws via a one-off override.
    // -> Simpler: push an entry, then monkey-patch shiftNext via the
    //    queue using a thrown-promise trick — but easiest is to leverage
    //    that an empty queue resolves to []. To force the catch path we
    //    rebind selectQueue to a value whose shift returns nothing AND
    //    additionally throw on serialization. Use a Proxy.
    const original = Array.prototype.shift;
    let called = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (selectQueue as any).shift = function () {
      called++;
      throw new Error('db boom');
    };

    const res = await postTypesRoute.GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to fetch post types');
    expect(called).toBeGreaterThan(0);
    // restore
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (selectQueue as any).shift = original;
    errSpy.mockRestore();
  });
});

// ===========================================================================
// POST /api/post-types
// ===========================================================================

describe('POST /api/post-types', () => {
  it('returns 400 on missing required fields', async () => {
    const res = await postTypesRoute.POST(makeJsonReq('http://x/pt', 'POST', {}) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Validation error');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('returns 400 when name is empty string', async () => {
    const res = await postTypesRoute.POST(
      makeJsonReq('http://x/pt', 'POST', { name: '', slug: 'blog' }) as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation error');
  });

  it('returns 400 when slug is missing', async () => {
    const res = await postTypesRoute.POST(
      makeJsonReq('http://x/pt', 'POST', { name: 'Blog' }) as never,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation error');
  });

  it('creates a new post type and returns 201 with the row', async () => {
    const newRow = {
      id: 7,
      name: 'Blog',
      slug: 'blog',
      icon: 'article',
      active: true,
      description: undefined,
    };
    insertReturnQueue.push([newRow]);

    const res = await postTypesRoute.POST(
      makeJsonReq('http://x/pt', 'POST', { name: 'Blog', slug: 'blog' }) as never,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(newRow);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('postTypes');
    expect(insertCalls[0].values).toMatchObject({
      name: 'Blog',
      slug: 'blog',
      icon: 'article', // default
      active: true, // default
    });
  });

  it('passes through explicit icon, active, and description', async () => {
    insertReturnQueue.push([{ id: 1 }]);

    const res = await postTypesRoute.POST(
      makeJsonReq('http://x/pt', 'POST', {
        name: 'Recipe',
        slug: 'recipe',
        icon: 'restaurant',
        active: false,
        description: 'tasty stuff',
      }) as never,
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].values).toMatchObject({
      name: 'Recipe',
      slug: 'recipe',
      icon: 'restaurant',
      active: false,
      description: 'tasty stuff',
    });
  });

  it('returns 500 when db.insert.values throws (non-Zod)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Force the insert path to throw by pushing a getter into the queue
    // that explodes once the route reaches db.insert.
    // Simpler — make insertReturnQueue.shift throw.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const original = (insertReturnQueue as any).shift;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (insertReturnQueue as any).shift = function () {
      throw new Error('insert boom');
    };

    const res = await postTypesRoute.POST(
      makeJsonReq('http://x/pt', 'POST', { name: 'Blog', slug: 'blog' }) as never,
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to create post type');

    // restore
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (insertReturnQueue as any).shift = original;
    errSpy.mockRestore();
  });
});

// ===========================================================================
// GET /api/posts/[id]/custom-fields
// ===========================================================================

describe('GET /api/posts/[id]/custom-fields', () => {
  it('returns 400 when post id is not numeric', async () => {
    const res = await customFieldsRoute.GET(makeReq('http://x/cf') as never, {
      params: Promise.resolve({ id: 'abc' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid post ID');
  });

  it('returns custom field values for the post', async () => {
    const rows = [
      {
        id: 1,
        postId: 50,
        customFieldId: 11,
        value: 'hello',
        slug: 'subtitle',
        name: 'Subtitle',
        fieldType: 'text',
      },
      {
        id: 2,
        postId: 50,
        customFieldId: 12,
        value: '42',
        slug: 'rank',
        name: 'Rank',
        fieldType: 'number',
      },
    ];
    selectQueue.push(rows);

    const res = await customFieldsRoute.GET(makeReq('http://x/cf') as never, {
      params: Promise.resolve({ id: '50' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual(rows);
  });

  it('returns empty array when no custom field values exist', async () => {
    selectQueue.push([]);
    const res = await customFieldsRoute.GET(makeReq('http://x/cf') as never, {
      params: Promise.resolve({ id: '50' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });

  it('returns 500 when db.select throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const original = (selectQueue as any).shift;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (selectQueue as any).shift = function () {
      throw new Error('select boom');
    };
    const res = await customFieldsRoute.GET(makeReq('http://x/cf') as never, {
      params: Promise.resolve({ id: '50' }),
    });
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to fetch custom field values');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (selectQueue as any).shift = original;
    errSpy.mockRestore();
  });
});

// ===========================================================================
// PUT /api/posts/[id]/custom-fields
// ===========================================================================

describe('PUT /api/posts/[id]/custom-fields', () => {
  it('returns 400 when post id is not numeric', async () => {
    const res = await customFieldsRoute.PUT(
      makeJsonReq('http://x/cf', 'PUT', { customFieldId: 1, value: 'v' }) as never,
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid post ID');
  });

  it('returns 400 on schema validation failure (missing customFieldId)', async () => {
    const res = await customFieldsRoute.PUT(
      makeJsonReq('http://x/cf', 'PUT', { value: 'v' }) as never,
      { params: Promise.resolve({ id: '50' }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Validation error');
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it('returns 400 when customFieldId is non-positive', async () => {
    const res = await customFieldsRoute.PUT(
      makeJsonReq('http://x/cf', 'PUT', { customFieldId: 0, value: 'v' }) as never,
      { params: Promise.resolve({ id: '50' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Validation error');
  });

  it('updates an existing row when one exists', async () => {
    // existing row lookup returns one match
    selectQueue.push([{ id: 999 }]);

    const res = await customFieldsRoute.PUT(
      makeJsonReq('http://x/cf', 'PUT', { customFieldId: 11, value: 'updated' }) as never,
      { params: Promise.resolve({ id: '50' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('postCustomFieldValues');
    expect(updateCalls[0].patch.value).toBe('updated');
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
    expect(insertCalls).toHaveLength(0);
  });

  it('inserts a new row when none exists', async () => {
    selectQueue.push([]); // no existing row
    insertReturnQueue.push([{ id: 1 }]);

    const res = await customFieldsRoute.PUT(
      makeJsonReq('http://x/cf', 'PUT', { customFieldId: 11, value: 'new' }) as never,
      { params: Promise.resolve({ id: '50' }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('postCustomFieldValues');
    expect(insertCalls[0].values).toEqual({
      postId: 50,
      customFieldId: 11,
      value: 'new',
    });
    expect(updateCalls).toHaveLength(0);
  });

  it('returns 500 when db.select throws (non-Zod)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const original = (selectQueue as any).shift;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (selectQueue as any).shift = function () {
      throw new Error('lookup boom');
    };
    const res = await customFieldsRoute.PUT(
      makeJsonReq('http://x/cf', 'PUT', { customFieldId: 11, value: 'v' }) as never,
      { params: Promise.resolve({ id: '50' }) },
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Failed to save custom field value');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (selectQueue as any).shift = original;
    errSpy.mockRestore();
  });
});
