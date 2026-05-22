// @vitest-environment node
/**
 * Unit tests for two API routes (combined to maximize coverage in one shot):
 *
 *   1. app/api/portal/surveys/[id]/webhooks/[webhookId]/route.ts  (GET / PUT / DELETE)
 *      Per-survey webhook item. Auth + portal-auth + tenant scope via surveys.
 *
 *   2. app/api/portal/settings/webhooks/route.ts  (GET)
 *      Unified webhook console reading from project + survey webhook tables.
 *
 * Strategy: each describe block sets up its own db / auth mocks. The select()
 * chain is mocked with a queue-driven thenable so we can line up rows in the
 * order the route consumes them. Writes (update/delete) are mocked to capture
 * payloads and return queued rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// shared mocks (top-level because vi.mock is hoisted)
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

const validateWebhookUrlMock = vi.fn();
vi.mock('@/lib/ssrf-guard', () => ({
  validateWebhookUrl: (...args: unknown[]) => validateWebhookUrlMock(...args),
}));

// drizzle-orm — stub operators to plain objects (we don't introspect them)
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
}));

// schema — proxy tables so `table.col` works and tables have a stable name
vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) => {
    const handler: ProxyHandler<{ __table: string }> = {
      get(_t, prop: string) {
        if (prop === '__table') return tableName;
        if (prop === 'then') return undefined; // not thenable
        return { __col: prop, __table: tableName };
      },
    };
    return new Proxy({ __table: tableName }, handler);
  };
  return {
    surveys: wrap('surveys'),
    surveyWebhooks: wrap('surveyWebhooks'),
    projects: wrap('projects'),
    projectWebhooks: wrap('projectWebhooks'),
  };
});

// ---- db mock with select-queue + capture for writes ----
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

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
const deleteCalls: DeleteCall[] = [];
const updateCalls: UpdateCall[] = [];

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
            return {
              returning() {
                return Promise.resolve(rows.map((r) => ({ ...r })));
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

  return {
    db: {
      select: () => buildSelect(),
      update: (table: { __table: string }) => buildUpdate(table),
      delete: (table: { __table: string }) => buildDelete(table),
    },
  };
});

// ---------------------------------------------------------------------------
// Import routes (after mocks)
// ---------------------------------------------------------------------------

const surveyWebhookItemRoute = await import(
  '@/app/api/portal/surveys/[id]/webhooks/[webhookId]/route'
);
const settingsWebhooksRoute = await import('@/app/api/portal/settings/webhooks/route');

const CLIENT_SESSION = { user: { id: '12' } };

function makeParams<T>(p: T) {
  return { params: Promise.resolve(p) };
}

function makeJsonRequest(body: unknown, method = 'PUT'): Request {
  return new Request('http://x/api/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  isAuthErrorMock.mockReset();
  validateWebhookUrlMock.mockReset();
  // default: portal auth passes through
  authorizePortalMock.mockResolvedValue({ ok: true });
  isAuthErrorMock.mockReturnValue(false);
});

// ===========================================================================
// 1) Per-survey webhook item route
// ===========================================================================

describe('GET /api/portal/surveys/[id]/webhooks/[webhookId]', () => {
  const { GET } = surveyWebhookItemRoute;

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(
      new Request('http://x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toBe('Unauthorized');
  });

  it('returns the portal-auth error response when authorize fails', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const errorResponse = new Response('forbidden', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: errorResponse });
    isAuthErrorMock.mockReturnValue(true);
    const res = await GET(
      new Request('http://x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res).toBe(errorResponse);
  });

  it('returns 404 when no client is found for the user', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET(
      new Request('http://x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 404 when survey is not owned by client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // survey lookup empty
    const res = await GET(
      new Request('http://x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Webhook not found');
  });

  it('returns 404 when webhook does not belong to the survey', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // survey
    selectQueue.push([]); // webhook lookup empty
    const res = await GET(
      new Request('http://x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns the webhook with the secret redacted', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // survey
    selectQueue.push([
      { id: 2, surveyId: 1, secret: 'abcdef-supersecret-rest', url: 'https://example.com/h' },
    ]); // webhook
    const res = await GET(
      new Request('http://x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.secret).toBe('abcdef' + '…');
  });

  it('passes through null secret without redaction', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // survey
    selectQueue.push([{ id: 2, surveyId: 1, secret: null, url: 'https://x.test/h' }]); // webhook
    const res = await GET(
      new Request('http://x'),
      makeParams({ id: '1', webhookId: '2' }),
    );
    const body = await res.json();
    expect(body.data.secret).toBeNull();
  });
});

describe('PUT /api/portal/surveys/[id]/webhooks/[webhookId]', () => {
  const { PUT } = surveyWebhookItemRoute;

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(
      makeJsonRequest({}),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns the portal-auth error when authorize fails', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const errorResponse = new Response('forbidden', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: errorResponse });
    isAuthErrorMock.mockReturnValue(true);
    const res = await PUT(
      makeJsonRequest({}),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res).toBe(errorResponse);
  });

  it('returns 404 when client lookup is null', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await PUT(
      makeJsonRequest({}),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when webhook is not found', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // survey not found
    const res = await PUT(
      makeJsonRequest({}),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when the new url fails ssrf validation', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // survey
    selectQueue.push([{ id: 2, surveyId: 1, secret: null, url: 'https://ok.test' }]); // webhook
    validateWebhookUrlMock.mockReturnValue({ ok: false, reason: 'Private IP not allowed' });
    const res = await PUT(
      makeJsonRequest({ url: 'http://10.0.0.1/h' }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Private IP not allowed');
  });

  it('updates url after passing ssrf validation and truncates to 500 chars', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([{ id: 2, surveyId: 1, secret: null, url: 'https://ok.test' }]);
    validateWebhookUrlMock.mockReturnValue({ ok: true });
    const longUrl = 'https://example.test/' + 'a'.repeat(600);
    updateReturnQueue.push([
      { id: 2, surveyId: 1, secret: null, url: longUrl.slice(0, 500), enabled: true },
    ]);
    const res = await PUT(
      makeJsonRequest({ url: longUrl }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect((updateCalls[0].patch.url as string).length).toBe(500);
    expect(updateCalls[0].patch.updatedAt).toBeInstanceOf(Date);
  });

  it('sanitizes events: filters invalid + dedupes, falls back to default when none valid', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([{ id: 2, surveyId: 1, secret: null, url: 'https://ok.test' }]);
    updateReturnQueue.push([{ id: 2, surveyId: 1, secret: null, events: ['response.submitted'] }]);
    const res = await PUT(
      makeJsonRequest({ events: ['bogus', 'another.bogus'] }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.events).toEqual(['response.submitted']);
  });

  it('dedupes valid events from the allowed list', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([{ id: 2, surveyId: 1, secret: null, url: 'https://ok.test' }]);
    updateReturnQueue.push([{ id: 2, surveyId: 1, secret: null }]);
    const res = await PUT(
      makeJsonRequest({ events: ['response.submitted', 'response.submitted', '*'] }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);
    const events = updateCalls[0].patch.events as string[];
    expect(events).toContain('response.submitted');
    expect(events).toContain('*');
    expect(events).toHaveLength(2);
  });

  it('does not set events when payload events is not an array', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([{ id: 2, surveyId: 1, secret: null }]);
    updateReturnQueue.push([{ id: 2 }]);
    const res = await PUT(
      makeJsonRequest({ events: 'not-an-array' }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch.events).toBeUndefined();
  });

  it('resets failureCount when re-enabling', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([{ id: 2, surveyId: 1, secret: null }]);
    updateReturnQueue.push([{ id: 2, enabled: true, failureCount: 0 }]);
    const res = await PUT(
      makeJsonRequest({ enabled: true }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toMatchObject({ enabled: true, failureCount: 0 });
  });

  it('disables without resetting failureCount', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([{ id: 2, surveyId: 1, secret: null }]);
    updateReturnQueue.push([{ id: 2, enabled: false }]);
    const res = await PUT(
      makeJsonRequest({ enabled: false }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toMatchObject({ enabled: false });
    expect(updateCalls[0].patch.failureCount).toBeUndefined();
  });

  it('handles malformed JSON body gracefully (treated as empty object)', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]);
    selectQueue.push([{ id: 2, surveyId: 1, secret: null }]);
    updateReturnQueue.push([{ id: 2 }]);
    const req = new Request('http://x', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{not valid json',
    });
    const res = await PUT(req, makeParams({ id: '1', webhookId: '2' }));
    expect(res.status).toBe(200);
    // Only updatedAt should be present
    expect(Object.keys(updateCalls[0].patch)).toEqual(['updatedAt']);
  });
});

describe('DELETE /api/portal/surveys/[id]/webhooks/[webhookId]', () => {
  const { DELETE } = surveyWebhookItemRoute;

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(401);
  });

  it('returns the portal-auth error when authorize fails', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const errorResponse = new Response('forbidden', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: errorResponse });
    isAuthErrorMock.mockReturnValue(true);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res).toBe(errorResponse);
  });

  it('returns 404 when client is missing', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 when webhook is not found', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // survey not found
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(404);
  });

  it('deletes the webhook when found', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([{ id: 1, clientId: 33 }]); // survey
    selectQueue.push([{ id: 2, surveyId: 1, secret: null }]); // webhook
    const res = await DELETE(
      new Request('http://x', { method: 'DELETE' }),
      makeParams({ id: '1', webhookId: '2' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('surveyWebhooks');
  });
});

// ===========================================================================
// 2) Unified settings webhooks aggregator route
// ===========================================================================

describe('GET /api/portal/settings/webhooks', () => {
  const { GET } = settingsWebhooksRoute;

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 404 when no portal client is found', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns an empty list when client has no projects and no surveys', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // project webhooks
    selectQueue.push([]); // tenantSurveys
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });

  it('skips survey webhook query entirely when client has no surveys', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    // Only 2 select calls: project webhooks + tenantSurveys
    const projectCreated = new Date('2026-01-01T00:00:00Z');
    const projectFired = new Date('2026-01-02T00:00:00Z');
    selectQueue.push([
      {
        hookId: 10,
        projectId: 5,
        projectName: 'Proj A',
        url: 'https://hook.test/a',
        secret: 'abcd1234',
        events: ['*'],
        active: true,
        lastFiredAt: projectFired,
        lastStatus: 200,
        failureCount: 0,
        createdAt: projectCreated,
      },
    ]);
    selectQueue.push([]); // no surveys
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      source: 'project',
      sourceId: 5,
      sourceLabel: 'Proj A',
      sourceHref: '/portal/projects/5/webhooks',
      id: 10,
      url: 'https://hook.test/a',
      events: ['*'],
      enabled: true,
      lastStatus: 200,
      secretLast4: '1234',
      failing: false,
    });
    expect(body.data[0].lastDeliveryAt).toBe(projectFired.toISOString());
  });

  it('flags a project webhook as failing when failureCount > 0', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        hookId: 11,
        projectId: 5,
        projectName: 'P',
        url: 'https://x',
        secret: null,
        events: null, // exercises ?? [] fallback
        active: false,
        lastFiredAt: null, // exercises null branch
        lastStatus: null,
        failureCount: 3,
        createdAt: new Date('2026-01-03T00:00:00Z'),
      },
    ]);
    selectQueue.push([]); // surveys empty
    const res = await GET();
    const body = await res.json();
    expect(body.data[0].failing).toBe(true);
    expect(body.data[0].events).toEqual([]);
    expect(body.data[0].secretLast4).toBeNull();
    expect(body.data[0].lastDeliveryAt).toBeNull();
  });

  it('flags a project webhook as failing when lastStatus >= 400', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        hookId: 12,
        projectId: 6,
        projectName: 'B',
        url: 'https://b',
        secret: 'zzzz9999',
        events: ['response.submitted'],
        active: true,
        lastFiredAt: new Date('2026-02-01T00:00:00Z'),
        lastStatus: 500,
        failureCount: 0,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
    ]);
    selectQueue.push([]);
    const res = await GET();
    const body = await res.json();
    expect(body.data[0].failing).toBe(true);
    expect(body.data[0].secretLast4).toBe('9999');
  });

  it('joins survey webhooks with their parent survey title and sorts newest first', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // no project webhooks
    selectQueue.push([
      { id: 1, title: 'Customer Sat' },
      { id: 2, title: 'NPS' },
    ]); // tenantSurveys
    selectQueue.push([
      {
        id: 20,
        surveyId: 1,
        url: 'https://h1',
        secret: 'top-secret-12ab',
        events: ['response.submitted'],
        enabled: true,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
      {
        id: 21,
        surveyId: 2,
        url: 'https://h2',
        secret: null,
        events: null, // exercises ?? [] fallback for survey rows
        enabled: false,
        createdAt: new Date('2026-04-01T00:00:00Z'),
      },
    ]); // surveyWebhooks
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    // newest first — id 21 (2026-04-01) before id 20 (2026-03-01)
    expect(body.data[0].id).toBe(21);
    expect(body.data[0].source).toBe('survey');
    expect(body.data[0].sourceLabel).toBe('NPS');
    expect(body.data[0].sourceHref).toBe('/portal/surveys/2/webhooks');
    expect(body.data[0].events).toEqual([]);
    expect(body.data[0].secretLast4).toBeNull();
    expect(body.data[0].enabled).toBe(false);
    expect(body.data[1].id).toBe(20);
    expect(body.data[1].sourceLabel).toBe('Customer Sat');
    expect(body.data[1].secretLast4).toBe('12ab');
    expect(body.data[1].lastDeliveryAt).toBeNull();
    expect(body.data[1].lastStatus).toBeNull();
    expect(body.data[1].failing).toBe(false);
  });

  it('falls back to "Survey #<id>" when title is missing from the map', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]); // no project webhooks
    selectQueue.push([{ id: 99, title: null }]); // tenantSurveys with null title
    selectQueue.push([
      {
        id: 30,
        surveyId: 99,
        url: 'https://h',
        secret: null,
        events: ['*'],
        enabled: true,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      },
    ]);
    const res = await GET();
    const body = await res.json();
    // null title maps to null which fails ??, so fallback to "Survey #99"
    expect(body.data[0].sourceLabel).toBe('Survey #99');
  });

  it('mixes project + survey webhooks and sorts by createdAt desc', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([
      {
        hookId: 40,
        projectId: 7,
        projectName: 'P',
        url: 'https://p',
        secret: 'aaaa1111',
        events: ['*'],
        active: true,
        lastFiredAt: null,
        lastStatus: null,
        failureCount: 0,
        createdAt: new Date('2026-02-15T00:00:00Z'),
      },
    ]);
    selectQueue.push([{ id: 8, title: 'S' }]); // tenantSurveys
    selectQueue.push([
      {
        id: 41,
        surveyId: 8,
        url: 'https://s',
        secret: 'bbbb2222',
        events: ['response.submitted'],
        enabled: true,
        createdAt: new Date('2026-06-01T00:00:00Z'),
      },
    ]);
    const res = await GET();
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    // survey row is newer
    expect(body.data[0].source).toBe('survey');
    expect(body.data[1].source).toBe('project');
  });
});
