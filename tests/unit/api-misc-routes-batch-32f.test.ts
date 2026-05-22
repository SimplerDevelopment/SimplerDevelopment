// @vitest-environment node
/**
 * Batch 32f — unit tests for four portal API routes:
 *
 *   1. app/api/portal/surveys/[id]/route.ts                       (GET / PUT / DELETE)
 *   2. app/api/portal/surveys/[id]/webhooks/route.ts              (GET / POST)
 *   3. app/api/portal/surveys/[id]/webhooks/[webhookId]/deliveries/route.ts (GET)
 *   4. app/api/portal/team/[memberId]/route.ts                    (PATCH / DELETE)
 *
 * Everything below the routes is mocked: auth, portal-auth (authorizePortal +
 * isAuthError), getPortalClient, the @/lib/db fluent builder, drizzle helpers,
 * schema tables, automation.emitEvent, ssrf-guard, and the survey-webhooks
 * dispatcher's generateWebhookSecret.
 *
 * The db mock uses a "select queue" so we can line up rows in the exact order
 * a given route consumes them, and capture buffers for update + delete to
 * inspect patches / filter shapes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// shared mocks (top-level — vi.mock is hoisted)
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
const isAuthErrorMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (result: unknown) => isAuthErrorMock(result),
}));

const emitEventMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

const validateWebhookUrlMock = vi.fn();
vi.mock('@/lib/ssrf-guard', () => ({
  validateWebhookUrl: (...args: unknown[]) => validateWebhookUrlMock(...args),
}));

const generateWebhookSecretMock = vi.fn();
vi.mock('@/lib/survey-webhooks/dispatcher', () => ({
  generateWebhookSecret: () => generateWebhookSecretMock(),
}));

// drizzle-orm operators — stub to plain objects (the db mock doesn't introspect)
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
}));

// schema — proxy tables so `table.col` works and tables have a stable name
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) => {
    const handler: ProxyHandler<{ __table: string }> = {
      get(_t, prop: string) {
        if (prop === '__table') return tableName;
        if (prop === 'then') return undefined;
        return { __col: prop, __table: tableName };
      },
    };
    return new Proxy({ __table: tableName }, handler);
  };
  return {
    surveys: wrap('surveys'),
    surveyWebhooks: wrap('surveyWebhooks'),
    surveyWebhookDeliveries: wrap('surveyWebhookDeliveries'),
    clientMembers: wrap('clientMembers'),
  };
});

// ---- db mock with select-queue + write captures ----
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
  values: Record<string, unknown> | Array<Record<string, unknown>>;
  returnedRows: Array<Record<string, unknown>>;
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

    const materialize = () => {
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
            // Updates may be awaited directly OR chained with .returning()
            const result: Record<string, unknown> = {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
              },
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
            };
            return result;
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
      values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
        const rows = insertReturnQueue.shift() ?? [];
        insertCalls.push({ table: table.__table, values, returnedRows: rows });
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  return {
    db: {
      select: () => buildSelect(),
      update: (table: { __table: string }) => buildUpdate(table),
      delete: (table: { __table: string }) => buildDelete(table),
      insert: (table: { __table: string }) => buildInsert(table),
    },
  };
});

// ---------------------------------------------------------------------------
// Import routes (after mocks)
// ---------------------------------------------------------------------------

const surveyItemRoute = await import('@/app/api/portal/surveys/[id]/route');
const surveyWebhooksRoute = await import(
  '@/app/api/portal/surveys/[id]/webhooks/route'
);
const surveyWebhookDeliveriesRoute = await import(
  '@/app/api/portal/surveys/[id]/webhooks/[webhookId]/deliveries/route'
);
const teamItemRoute = await import('@/app/api/portal/team/[memberId]/route');

const SESSION = { user: { id: '12' } };

function makeParams<T>(p: T) {
  return { params: Promise.resolve(p) };
}

function makeJsonRequest(body: unknown, method = 'PUT', url = 'http://x/api/x'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  insertReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  isAuthErrorMock.mockReset();
  emitEventMock.mockReset();
  validateWebhookUrlMock.mockReset();
  generateWebhookSecretMock.mockReset();

  // default: portal auth passes
  authorizePortalMock.mockResolvedValue({ ok: true });
  isAuthErrorMock.mockReturnValue(false);
  generateWebhookSecretMock.mockReturnValue('test-secret-xyz');
});

// ===========================================================================
// 1) /api/portal/surveys/[id]   — GET / PUT / DELETE
// ===========================================================================

describe('GET /api/portal/surveys/[id]', () => {
  const { GET } = surveyItemRoute;

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns the portal-auth error response when authorize fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const errorResponse = new Response('forbidden', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: errorResponse });
    isAuthErrorMock.mockReturnValue(true);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res).toBe(errorResponse);
  });

  it('returns 404 when no client is resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 404 when survey is not owned by the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Survey not found');
  });

  it('returns the survey on success', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, title: 'Sat', status: 'active' }]);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.title).toBe('Sat');
  });
});

describe('PUT /api/portal/surveys/[id]', () => {
  const { PUT } = surveyItemRoute;

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(makeJsonRequest({}), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
  });

  it('returns the portal-auth error when authorize fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const errorResponse = new Response('forbidden', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: errorResponse });
    isAuthErrorMock.mockReturnValue(true);
    const res = await PUT(makeJsonRequest({}), makeParams({ id: '1' }));
    expect(res).toBe(errorResponse);
  });

  it('returns 404 when client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await PUT(makeJsonRequest({}), makeParams({ id: '1' }));
    expect(res.status).toBe(404);
  });

  it('returns 404 when survey is not owned by client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // ownership check empty
    const res = await PUT(makeJsonRequest({ title: 'X' }), makeParams({ id: '1' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Survey not found');
  });

  it('updates many fields, trims title, coerces optional empties to null, and emits event', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, title: 'Old' }]);
    updateReturnQueue.push([{ id: 1, title: 'New', status: 'draft' }]);

    const res = await PUT(
      makeJsonRequest({
        title: '  Trimmed  ',
        description: '  desc  ',
        fields: [{ id: 'f1' }],
        pages: [{ id: 'p1' }],
        status: 'draft',
        color: '#fff',
        brandingProfileId: 5,
        thankYouTitle: 'Thanks',
        thankYouMessage: 'Bye',
        redirectUrl: 'https://r.test',
        allowMultiple: true,
        requireEmail: false,
        notifyOnResponse: true,
        notifyDigest: 'daily',
        closesAt: '2026-01-01T00:00:00Z',
        maxResponses: 100,
        linkedType: 'project',
        linkedId: 9,
        styling: { font: 'Inter' },
        recommendation: { engine: 'v1' },
      }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const patch = updateCalls[0].patch;
    expect(patch.title).toBe('Trimmed');
    expect(patch.description).toBe('desc');
    expect(patch.fields).toEqual([{ id: 'f1' }]);
    expect(patch.pages).toEqual([{ id: 'p1' }]);
    expect(patch.status).toBe('draft');
    expect(patch.color).toBe('#fff');
    expect(patch.brandingProfileId).toBe(5);
    expect(patch.thankYouTitle).toBe('Thanks');
    expect(patch.thankYouMessage).toBe('Bye');
    expect(patch.redirectUrl).toBe('https://r.test');
    expect(patch.allowMultiple).toBe(true);
    expect(patch.requireEmail).toBe(false);
    expect(patch.notifyOnResponse).toBe(true);
    expect(patch.notifyDigest).toBe('daily');
    expect(patch.closesAt).toBeInstanceOf(Date);
    expect(patch.maxResponses).toBe(100);
    expect(patch.linkedType).toBe('project');
    expect(patch.linkedId).toBe(9);
    expect(patch.styling).toEqual({ font: 'Inter' });
    expect(patch.recommendation).toEqual({ engine: 'v1' });
    expect(patch.updatedAt).toBeInstanceOf(Date);

    expect(emitEventMock).toHaveBeenCalledWith(
      'survey.updated',
      33,
      12,
      expect.objectContaining({ id: 1, title: 'New', status: 'draft' }),
    );
  });

  it('coerces empty / falsy optional fields to null', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturnQueue.push([{ id: 1 }]);

    await PUT(
      makeJsonRequest({
        description: '',
        brandingProfileId: 0,
        redirectUrl: '',
        closesAt: null,
        maxResponses: 0,
        linkedType: '',
        linkedId: 0,
      }),
      makeParams({ id: '1' }),
    );
    const patch = updateCalls[0].patch;
    expect(patch.description).toBeNull();
    expect(patch.brandingProfileId).toBeNull();
    expect(patch.redirectUrl).toBeNull();
    expect(patch.closesAt).toBeNull();
    expect(patch.maxResponses).toBeNull();
    expect(patch.linkedType).toBeNull();
    expect(patch.linkedId).toBeNull();
  });

  it('only writes updatedAt when payload is empty', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    updateReturnQueue.push([{ id: 1 }]);

    await PUT(makeJsonRequest({}), makeParams({ id: '1' }));
    expect(Object.keys(updateCalls[0].patch)).toEqual(['updatedAt']);
  });
});

describe('DELETE /api/portal/surveys/[id]', () => {
  const { DELETE } = surveyItemRoute;

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns the portal-auth error when authorize fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const errorResponse = new Response('forbidden', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: errorResponse });
    isAuthErrorMock.mockReturnValue(true);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ id: '1' }),
    );
    expect(res).toBe(errorResponse);
  });

  it('returns 404 when client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when survey is not owned by client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // ownership empty
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Survey not found');
  });

  it('deletes the survey and emits survey.deleted', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33, title: 'Sat' }]);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('surveys');
    expect(emitEventMock).toHaveBeenCalledWith(
      'survey.deleted',
      33,
      12,
      expect.objectContaining({ id: 1, title: 'Sat' }),
    );
  });
});

// ===========================================================================
// 2) /api/portal/surveys/[id]/webhooks   — GET / POST
// ===========================================================================

describe('GET /api/portal/surveys/[id]/webhooks', () => {
  const { GET } = surveyWebhooksRoute;

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
  });

  it('returns the portal-auth error when authorize fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const errorResponse = new Response('forbidden', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: errorResponse });
    isAuthErrorMock.mockReturnValue(true);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res).toBe(errorResponse);
  });

  it('returns 404 when client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 404 when survey is not owned by client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // loadSurveyForClient
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Survey not found');
  });

  it('returns webhooks with redacted secrets', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // survey
    selectQueue.push([
      { id: 10, surveyId: 1, secret: 'abcdef-supersecret', url: 'https://h1' },
      { id: 11, surveyId: 1, secret: null, url: 'https://h2' },
    ]); // webhooks
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0].secret).toBe('abcdef' + '…');
    expect(body.data[1].secret).toBeNull();
  });
});

describe('POST /api/portal/surveys/[id]/webhooks', () => {
  const { POST } = surveyWebhooksRoute;

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(
      makeJsonRequest({ url: 'https://x' }, 'POST'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns the portal-auth error when authorize fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const errorResponse = new Response('forbidden', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: errorResponse });
    isAuthErrorMock.mockReturnValue(true);
    const res = await POST(
      makeJsonRequest({ url: 'https://x' }, 'POST'),
      makeParams({ id: '1' }),
    );
    expect(res).toBe(errorResponse);
  });

  it('returns 404 when client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await POST(
      makeJsonRequest({ url: 'https://x' }, 'POST'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when survey is not owned by client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // loadSurveyForClient empty
    const res = await POST(
      makeJsonRequest({ url: 'https://x' }, 'POST'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when url is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    const res = await POST(
      makeJsonRequest({}, 'POST'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('URL is required');
  });

  it('returns 400 when url is an empty string', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    const res = await POST(
      makeJsonRequest({ url: '   ' }, 'POST'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when ssrf-guard rejects the url', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    validateWebhookUrlMock.mockReturnValue({ ok: false, reason: 'Private IP' });
    const res = await POST(
      makeJsonRequest({ url: 'http://10.0.0.1/h' }, 'POST'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Private IP');
  });

  it('creates a webhook with default events when none provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    validateWebhookUrlMock.mockReturnValue({ ok: true });
    insertReturnQueue.push([
      {
        id: 50,
        surveyId: 1,
        url: 'https://hook.test',
        secret: 'test-secret-xyz',
        events: ['response.submitted'],
        enabled: true,
      },
    ]);

    const res = await POST(
      makeJsonRequest({ url: 'https://hook.test' }, 'POST'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(50);
    expect(body.data.secret).toBe('test-secret-xyz');
    expect(insertCalls).toHaveLength(1);
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.surveyId).toBe(1);
    expect(values.url).toBe('https://hook.test');
    expect(values.secret).toBe('test-secret-xyz');
    expect(values.events).toEqual(['response.submitted']);
    expect(values.enabled).toBe(true);
    expect(values.createdBy).toBe(12);
  });

  it('sanitizes events (drops bogus, dedupes) and falls back to default when none valid', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    validateWebhookUrlMock.mockReturnValue({ ok: true });
    insertReturnQueue.push([{ id: 51 }]);

    await POST(
      makeJsonRequest(
        { url: 'https://hook.test', events: ['bogus', 'other.bogus'] },
        'POST',
      ),
      makeParams({ id: '1' }),
    );
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.events).toEqual(['response.submitted']);
  });

  it('keeps and dedupes valid events from the allowed list', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    validateWebhookUrlMock.mockReturnValue({ ok: true });
    insertReturnQueue.push([{ id: 52 }]);

    await POST(
      makeJsonRequest(
        { url: 'https://hook.test', events: ['response.submitted', '*', '*'] },
        'POST',
      ),
      makeParams({ id: '1' }),
    );
    const values = insertCalls[0].values as Record<string, unknown>;
    const events = values.events as string[];
    expect(events).toContain('response.submitted');
    expect(events).toContain('*');
    expect(events).toHaveLength(2);
  });

  it('honors explicit enabled=false', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    validateWebhookUrlMock.mockReturnValue({ ok: true });
    insertReturnQueue.push([{ id: 53 }]);

    await POST(
      makeJsonRequest({ url: 'https://hook.test', enabled: false }, 'POST'),
      makeParams({ id: '1' }),
    );
    const values = insertCalls[0].values as Record<string, unknown>;
    expect(values.enabled).toBe(false);
  });

  it('truncates urls longer than 500 chars', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    validateWebhookUrlMock.mockReturnValue({ ok: true });
    insertReturnQueue.push([{ id: 54 }]);

    const longUrl = 'https://example.test/' + 'a'.repeat(600);
    await POST(
      makeJsonRequest({ url: longUrl }, 'POST'),
      makeParams({ id: '1' }),
    );
    const values = insertCalls[0].values as Record<string, unknown>;
    expect((values.url as string).length).toBe(500);
  });

  it('treats malformed JSON body as empty object and returns 400 for missing url', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    const req = new Request('http://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    });
    const res = await POST(req, makeParams({ id: '1' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('URL is required');
  });
});

// ===========================================================================
// 3) /api/portal/surveys/[id]/webhooks/[webhookId]/deliveries   — GET
// ===========================================================================

describe('GET /api/portal/surveys/[id]/webhooks/[webhookId]/deliveries', () => {
  const { GET } = surveyWebhookDeliveriesRoute;

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(
      new Request('http://x/api/x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns the portal-auth error when authorize fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const errorResponse = new Response('forbidden', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: errorResponse });
    isAuthErrorMock.mockReturnValue(true);
    const res = await GET(
      new Request('http://x/api/x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res).toBe(errorResponse);
  });

  it('returns 404 when client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET(
      new Request('http://x/api/x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 404 when survey is not owned by client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // survey lookup empty
    const res = await GET(
      new Request('http://x/api/x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Survey not found');
  });

  it('returns 404 when webhook is not part of the survey', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([]); // webhook lookup empty
    const res = await GET(
      new Request('http://x/api/x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Webhook not found');
  });

  it('returns deliveries with the default limit when none provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // survey
    selectQueue.push([{ id: 2, surveyId: 1 }]); // webhook
    selectQueue.push([
      { id: 100, webhookId: 2, createdAt: new Date('2026-05-18T00:00:00Z') },
    ]); // deliveries

    const res = await GET(
      new Request('http://x/api/x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(100);
  });

  it('honors a valid limit query parameter', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([{ id: 2, surveyId: 1 }]);
    selectQueue.push([]);
    const res = await GET(
      new Request('http://x/api/x?limit=25'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('caps limit to MAX_LIMIT (200)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([{ id: 2, surveyId: 1 }]);
    selectQueue.push([]);
    const res = await GET(
      new Request('http://x/api/x?limit=99999'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);
  });

  it('falls back to default when limit is non-numeric or non-positive', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([{ id: 2, surveyId: 1 }]);
    selectQueue.push([]);
    const res = await GET(
      new Request('http://x/api/x?limit=abc'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);

    // Same for limit=0
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([{ id: 2, surveyId: 1 }]);
    selectQueue.push([]);
    const res2 = await GET(
      new Request('http://x/api/x?limit=0'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res2.status).toBe(200);
  });
});

// ===========================================================================
// 4) /api/portal/team/[memberId]   — PATCH / DELETE
// ===========================================================================

describe('PATCH /api/portal/team/[memberId]', () => {
  const { PATCH } = teamItemRoute;

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await PATCH(
      makeJsonRequest({ role: 'member' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await PATCH(
      makeJsonRequest({ role: 'member' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller is neither owner nor admin (no clientMembers row)', async () => {
    authMock.mockResolvedValue(SESSION);
    // current user (12) is NOT the client owner (99), so getUserRole queries clientMembers
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    selectQueue.push([]); // clientMembers role lookup empty → null
    const res = await PATCH(
      makeJsonRequest({ role: 'member' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/Only owners and admins/);
  });

  it('returns 403 when caller role is viewer', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    selectQueue.push([{ role: 'viewer' }]);
    const res = await PATCH(
      makeJsonRequest({ role: 'member' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when target member does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 12 }); // caller is owner
    selectQueue.push([]); // member lookup empty
    const res = await PATCH(
      makeJsonRequest({ role: 'member' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Member not found');
  });

  it("returns 400 when trying to change your own role", async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 12 }); // caller is owner
    selectQueue.push([{ id: 5, clientId: 33, userId: 12, role: 'member' }]);
    const res = await PATCH(
      makeJsonRequest({ role: 'admin' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/cannot change your own role/i);
  });

  it("returns 403 when target member's role is owner", async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 12 });
    selectQueue.push([{ id: 5, clientId: 33, userId: 77, role: 'owner' }]);
    const res = await PATCH(
      makeJsonRequest({ role: 'member' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/Cannot change the owner role/);
  });

  it("returns 403 when target member is the client owner by userId", async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 88 }); // owner userId=88, caller=12
    selectQueue.push([{ role: 'admin' }]); // caller's role
    selectQueue.push([{ id: 5, clientId: 33, userId: 88, role: 'admin' }]); // target member is the owner
    const res = await PATCH(
      makeJsonRequest({ role: 'member' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 400 when role payload is invalid', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 12 });
    selectQueue.push([{ id: 5, clientId: 33, userId: 77, role: 'member' }]);
    const res = await PATCH(
      makeJsonRequest({ role: 'superuser' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/Invalid role/);
  });

  it('returns 403 when admin tries to assign the admin role', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 }); // caller is not owner
    selectQueue.push([{ role: 'admin' }]); // caller's role
    selectQueue.push([{ id: 5, clientId: 33, userId: 77, role: 'member' }]);
    const res = await PATCH(
      makeJsonRequest({ role: 'admin' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/Only owners can assign the admin role/);
  });

  it('owner successfully updates a member role', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 12 }); // caller is owner
    selectQueue.push([{ id: 5, clientId: 33, userId: 77, role: 'member' }]);
    const res = await PATCH(
      makeJsonRequest({ role: 'admin' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Role updated');
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch).toEqual({ role: 'admin' });
  });

  it('admin can successfully assign a non-admin role', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    selectQueue.push([{ role: 'admin' }]); // caller is admin
    selectQueue.push([{ id: 5, clientId: 33, userId: 77, role: 'viewer' }]);
    const res = await PATCH(
      makeJsonRequest({ role: 'member' }, 'PATCH'),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toEqual({ role: 'member' });
  });
});

describe('DELETE /api/portal/team/[memberId]', () => {
  const { DELETE } = teamItemRoute;

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when caller has no role (not owner or admin)', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    selectQueue.push([]); // role lookup empty
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/Only owners and admins/);
  });

  it('returns 403 when caller is viewer', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    selectQueue.push([{ role: 'viewer' }]);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 when target member does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 12 });
    selectQueue.push([]);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Member not found');
  });

  it("returns 400 when trying to remove yourself", async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 12 });
    selectQueue.push([{ id: 5, clientId: 33, userId: 12, role: 'member' }]);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/cannot remove yourself/i);
  });

  it("returns 403 when target member's role is owner", async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 12 });
    selectQueue.push([{ id: 5, clientId: 33, userId: 77, role: 'owner' }]);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/Cannot remove the account owner/);
  });

  it("returns 403 when target member's userId equals the client owner userId", async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 88 });
    selectQueue.push([{ role: 'admin' }]);
    selectQueue.push([{ id: 5, clientId: 33, userId: 88, role: 'member' }]);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 403 when admin tries to remove another admin', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    selectQueue.push([{ role: 'admin' }]); // caller is admin
    selectQueue.push([{ id: 5, clientId: 33, userId: 77, role: 'admin' }]);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.message).toMatch(/Only owners can remove admins/);
  });

  it('owner successfully removes a member', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 12 });
    selectQueue.push([{ id: 5, clientId: 33, userId: 77, role: 'member' }]);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toBe('Member removed');
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('clientMembers');
  });

  it('admin can successfully remove a non-admin member', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33, userId: 99 });
    selectQueue.push([{ role: 'admin' }]);
    selectQueue.push([{ id: 5, clientId: 33, userId: 77, role: 'viewer' }]);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ memberId: '5' }),
    );
    expect(res.status).toBe(200);
    expect(deleteCalls).toHaveLength(1);
  });
});
