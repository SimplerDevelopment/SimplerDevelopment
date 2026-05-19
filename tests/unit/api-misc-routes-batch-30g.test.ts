// @vitest-environment node
/**
 * Batch 30g — unit tests for 4 portal CRM route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/crm/pipelines/[id]/stages/[stageId]/route.ts (DELETE)
 *  - app/api/portal/crm/pipelines/[id]/stages/route.ts           (PUT bulk update/create)
 *  - app/api/portal/crm/proposal-templates/[id]/route.ts         (PUT, DELETE)
 *  - app/api/portal/crm/proposal-templates/route.ts              (GET, POST)
 *
 * Strategy: heavy mocking — db.select() is a queue of result rows; chain
 * methods return a thenable that materializes on `await` (or terminal
 * .limit / .orderBy / .offset). db.insert/update/delete are mocked to capture
 * writes and emit the next queued return rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks — declared before any route is imported.
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
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

// schema — proxy tables
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
    crmPipelines: wrap('crmPipelines'),
    crmPipelineStages: wrap('crmPipelineStages'),
    crmDeals: wrap('crmDeals'),
    crmProposalTemplates: wrap('crmProposalTemplates'),
  };
});

// ---------------------------------------------------------------------------
// db mock: select-queue + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
}
interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}
interface DeleteCall {
  table: string;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertReturnQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
const insertCalls: InsertCall[] = [];
const updateCalls: UpdateCall[] = [];
const deleteCalls: DeleteCall[] = [];

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
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'groupBy', 'limit', 'offset']) {
      chain[m] = passthrough;
    }
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
            const cloned = rows.map((r) => ({ ...r }));
            updateCalls.push({ table: table.__table, patch, filter, returnedRows: cloned });
            return {
              returning() {
                return Promise.resolve(cloned);
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(cloned).then(onF, onR);
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
        const rows = deleteReturnQueue.shift() ?? [];
        const cloned = rows.map((r) => ({ ...r }));
        deleteCalls.push({ table: table.__table, filter, returnedRows: cloned });
        return {
          returning() {
            return Promise.resolve(cloned);
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned).then(onF, onR);
          },
        };
      },
    };
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
            return Promise.resolve(rows.map((r) => ({ ...r }))).then(onF, onR);
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

// ---------------------------------------------------------------------------
// Routes under test (imported AFTER all mocks).
// ---------------------------------------------------------------------------

const stageIdRoute = await import(
  '@/app/api/portal/crm/pipelines/[id]/stages/[stageId]/route'
);
const stagesRoute = await import(
  '@/app/api/portal/crm/pipelines/[id]/stages/route'
);
const proposalTemplateIdRoute = await import(
  '@/app/api/portal/crm/proposal-templates/[id]/route'
);
const proposalTemplatesRoute = await import(
  '@/app/api/portal/crm/proposal-templates/route'
);

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
  updateReturnQueue = [];
  deleteReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  deleteCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
});

// ===========================================================================
// DELETE /api/portal/crm/pipelines/[id]/stages/[stageId]
// ===========================================================================

describe('DELETE /api/portal/crm/pipelines/[id]/stages/[stageId]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await stageIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/pipelines/1/stages/2', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', stageId: '2' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await stageIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/pipelines/1/stages/2', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', stageId: '2' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 when id or stageId is not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await stageIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/pipelines/abc/stages/2', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'abc', stageId: '2' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid ID');
  });

  it('returns 400 when stageId is not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await stageIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/pipelines/1/stages/zzz', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', stageId: 'zzz' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when pipeline not found (or not owned)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // pipeline lookup empty
    const res = await stageIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/pipelines/1/stages/2', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', stageId: '2' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Pipeline not found');
  });

  it('returns 409 when deals exist in the stage', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // pipeline exists
    selectQueue.push([{ count: 3 }]); // 3 deals
    const res = await stageIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/pipelines/1/stages/2', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', stageId: '2' }) },
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toMatch(/3 deal/);
    expect(deleteCalls).toHaveLength(0);
  });

  it('returns 404 when stage row was not deleted', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // pipeline
    selectQueue.push([{ count: 0 }]); // no deals
    // deleteReturnQueue empty → returning() yields []
    const res = await stageIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/pipelines/1/stages/2', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', stageId: '2' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Stage not found');
  });

  it('deletes the stage and returns the deleted row on success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // pipeline
    selectQueue.push([{ count: 0 }]); // no deals
    deleteReturnQueue.push([{ id: 2, pipelineId: 1, name: 'Removed' }]);
    const res = await stageIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/pipelines/1/stages/2', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '1', stageId: '2' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(2);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('crmPipelineStages');
  });
});

// ===========================================================================
// PUT /api/portal/crm/pipelines/[id]/stages
// ===========================================================================

describe('PUT /api/portal/crm/pipelines/[id]/stages', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await stagesRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/pipelines/1/stages', 'PUT', { stages: [] }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await stagesRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/pipelines/1/stages', 'PUT', { stages: [] }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 when pipeline id is not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await stagesRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/pipelines/foo/stages', 'PUT', { stages: [] }),
      { params: Promise.resolve({ id: 'foo' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid ID');
  });

  it('returns 404 when pipeline not found (or not owned)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // pipeline lookup empty
    const res = await stagesRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/pipelines/1/stages', 'PUT', { stages: [] }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Pipeline not found');
  });

  it('returns 400 when stages array is missing or not an array', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // pipeline exists
    const res = await stagesRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/pipelines/1/stages', 'PUT', { stages: 'nope' }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/stages array/i);
  });

  it('updates existing stages and inserts new stages in one PUT', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // pipeline exists

    // stage with id → updated; stage without id → inserted
    updateReturnQueue.push([
      { id: 10, name: 'New name', color: '#aaa', sortOrder: 0, probability: 25 },
    ]);
    insertReturnQueue.push([
      { id: 20, name: 'Brand new', color: '#6366f1', sortOrder: 1, probability: null },
    ]);

    const res = await stagesRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/pipelines/1/stages', 'PUT', {
        stages: [
          { id: 10, name: 'New name', color: '#aaa', sortOrder: 0, probability: 25 },
          { name: 'Brand new', sortOrder: 1 },
        ],
      }),
      { params: Promise.resolve({ id: '1' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('crmPipelineStages');
    expect(updateCalls[0].patch).toMatchObject({
      name: 'New name',
      color: '#aaa',
      sortOrder: 0,
      probability: 25,
    });
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('crmPipelineStages');
    const insertedVals = insertCalls[0].values as Record<string, unknown>;
    expect(insertedVals.name).toBe('Brand new');
    expect(insertedVals.color).toBe('#6366f1'); // default
    expect(insertedVals.probability).toBeNull();
    expect(insertedVals.pipelineId).toBe(1);
  });

  it('skips updated stages whose update returned no row but still pushes new inserts', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]); // pipeline

    // update returns empty → not pushed
    updateReturnQueue.push([]);
    insertReturnQueue.push([{ id: 21, name: 'Fresh' }]);

    const res = await stagesRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/pipelines/1/stages', 'PUT', {
        stages: [
          { id: 999, name: 'Stale id', sortOrder: 0 },
          { name: 'Fresh', sortOrder: 1 },
        ],
      }),
      { params: Promise.resolve({ id: '1' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1); // only the inserted one
    expect(body.data[0].id).toBe(21);
  });

  it('accepts an empty stages array and returns success with no rows changed', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1 }]);

    const res = await stagesRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/pipelines/1/stages', 'PUT', { stages: [] }),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(updateCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });
});

// ===========================================================================
// PUT /api/portal/crm/proposal-templates/[id]
// ===========================================================================

describe('PUT /api/portal/crm/proposal-templates/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await proposalTemplateIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/proposal-templates/9', 'PUT', { name: 'x' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await proposalTemplateIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/proposal-templates/9', 'PUT', { name: 'x' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 400 when template id is not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await proposalTemplateIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/proposal-templates/foo', 'PUT', { name: 'x' }),
      { params: Promise.resolve({ id: 'foo' }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid ID');
  });

  it('returns 404 when template not found (or not owned)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // existing lookup empty
    const res = await proposalTemplateIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/proposal-templates/9', 'PUT', { name: 'x' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Template not found');
  });

  it('updates only the provided fields, trimming strings and nulling empties', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9 }]); // existing exists
    updateReturnQueue.push([
      { id: 9, name: 'Trimmed', description: null, accentColor: '#abc', footerText: null },
    ]);

    const res = await proposalTemplateIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/proposal-templates/9', 'PUT', {
        name: '  Trimmed  ',
        description: '   ',
        sections: [{ title: 'S' }],
        lineItems: [{ qty: 1 }],
        fees: [{ amount: 10 }],
        accentColor: '#abc',
        footerText: '',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(9);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('crmProposalTemplates');
    const patch = updateCalls[0].patch;
    expect(patch.name).toBe('Trimmed');
    expect(patch.description).toBeNull(); // trimmed to '' → null
    expect(patch.sections).toEqual([{ title: 'S' }]);
    expect(patch.lineItems).toEqual([{ qty: 1 }]);
    expect(patch.fees).toEqual([{ amount: 10 }]);
    expect(patch.accentColor).toBe('#abc');
    expect(patch.footerText).toBeNull();
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('omits unspecified fields from the patch entirely', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9 }]);
    updateReturnQueue.push([{ id: 9 }]);

    const res = await proposalTemplateIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/proposal-templates/9', 'PUT', {}),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const patch = updateCalls[0].patch;
    // Only updatedAt should be set
    expect(Object.keys(patch).sort()).toEqual(['updatedAt']);
    expect(patch.updatedAt).toBeInstanceOf(Date);
  });

  it('keeps non-empty description and footerText after trim', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 9 }]);
    updateReturnQueue.push([{ id: 9 }]);

    const res = await proposalTemplateIdRoute.PUT(
      makeJsonReq('http://x/api/portal/crm/proposal-templates/9', 'PUT', {
        description: '  hello  ',
        footerText: '  cta  ',
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const patch = updateCalls[0].patch;
    expect(patch.description).toBe('hello');
    expect(patch.footerText).toBe('cta');
  });
});

// ===========================================================================
// DELETE /api/portal/crm/proposal-templates/[id]
// ===========================================================================

describe('DELETE /api/portal/crm/proposal-templates/[id]', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await proposalTemplateIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/proposal-templates/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await proposalTemplateIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/proposal-templates/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when template id is not numeric', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await proposalTemplateIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/proposal-templates/abc', { method: 'DELETE' }),
      { params: Promise.resolve({ id: 'abc' }) },
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when no row was deleted', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // deleteReturnQueue empty → returning() yields []
    const res = await proposalTemplateIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/proposal-templates/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Template not found');
  });

  it('deletes and reports success when a row is removed', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    deleteReturnQueue.push([{ id: 9, name: 'Bye' }]);
    const res = await proposalTemplateIdRoute.DELETE(
      makeReq('http://x/api/portal/crm/proposal-templates/9', { method: 'DELETE' }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(9);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('crmProposalTemplates');
  });
});

// ===========================================================================
// GET /api/portal/crm/proposal-templates
// ===========================================================================

describe('GET /api/portal/crm/proposal-templates', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await proposalTemplatesRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await proposalTemplatesRoute.GET();
    expect(res.status).toBe(404);
  });

  it('returns templates ordered by updatedAt desc', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, name: 'Newer', clientId: 5 },
      { id: 2, name: 'Older', clientId: 5 },
    ]);
    const res = await proposalTemplatesRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe(1);
  });

  it('returns empty data array when none exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]);
    const res = await proposalTemplatesRoute.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual([]);
  });
});

// ===========================================================================
// POST /api/portal/crm/proposal-templates
// ===========================================================================

describe('POST /api/portal/crm/proposal-templates', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await proposalTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposal-templates', 'POST', { name: 'x' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when portal client lookup fails', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await proposalTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposal-templates', 'POST', { name: 'x' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing or whitespace only', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await proposalTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposal-templates', 'POST', { name: '   ' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/required/i);
  });

  it('returns 400 when body is missing name entirely', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await proposalTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposal-templates', 'POST', {}),
    );
    expect(res.status).toBe(400);
  });

  it('creates a template with defaults when only name is provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    insertReturnQueue.push([
      {
        id: 100,
        clientId: 5,
        name: 'My Template',
        description: null,
        sections: [],
        lineItems: [],
        fees: [],
        accentColor: '#2563eb',
        footerText: null,
      },
    ]);

    const res = await proposalTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposal-templates', 'POST', {
        name: '  My Template  ',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(100);
    expect(insertCalls).toHaveLength(1);
    const vals = insertCalls[0].values as Record<string, unknown>;
    expect(vals.clientId).toBe(5);
    expect(vals.name).toBe('My Template');
    expect(vals.description).toBeNull();
    expect(vals.sections).toEqual([]);
    expect(vals.lineItems).toEqual([]);
    expect(vals.fees).toEqual([]);
    expect(vals.accentColor).toBe('#2563eb');
    expect(vals.footerText).toBeNull();
  });

  it('creates a template with all fields provided (and trims strings)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    insertReturnQueue.push([{ id: 101, name: 'Full' }]);

    const res = await proposalTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposal-templates', 'POST', {
        name: '  Full  ',
        description: '  great template  ',
        sections: [{ title: 'Intro' }],
        lineItems: [{ qty: 2 }],
        fees: [{ amount: 5 }],
        accentColor: '#000000',
        footerText: '  hello  ',
      }),
    );
    expect(res.status).toBe(201);
    const vals = insertCalls[0].values as Record<string, unknown>;
    expect(vals.name).toBe('Full');
    expect(vals.description).toBe('great template');
    expect(vals.sections).toEqual([{ title: 'Intro' }]);
    expect(vals.lineItems).toEqual([{ qty: 2 }]);
    expect(vals.fees).toEqual([{ amount: 5 }]);
    expect(vals.accentColor).toBe('#000000');
    expect(vals.footerText).toBe('hello');
  });

  it('nulls empty footerText after trim', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    insertReturnQueue.push([{ id: 102, name: 'X' }]);

    const res = await proposalTemplatesRoute.POST(
      makeJsonReq('http://x/api/portal/crm/proposal-templates', 'POST', {
        name: 'X',
        description: '   ',
        footerText: '   ',
      }),
    );
    expect(res.status).toBe(201);
    const vals = insertCalls[0].values as Record<string, unknown>;
    expect(vals.description).toBeNull();
    expect(vals.footerText).toBeNull();
  });
});
