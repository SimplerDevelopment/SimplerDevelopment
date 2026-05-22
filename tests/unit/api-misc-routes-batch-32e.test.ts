// @vitest-environment node
/**
 * Batch 32e — unit tests for 4 portal route.ts files.
 *
 * Routes covered:
 *  - app/api/portal/suggested-project-requests/route.ts   (POST)
 *  - app/api/portal/suggested-projects/route.ts           (GET)
 *  - app/api/portal/surveys/[id]/export/route.ts          (GET — CSV)
 *  - app/api/portal/surveys/[id]/responses/route.ts       (GET — JSON)
 *
 * Strategy: heavy mocking — db.select() / selectDistinct() share one
 * queue of result rows; chain methods return a thenable that
 * materializes on `await` (or via terminal .limit / .orderBy). db.insert
 * is mocked to capture writes and emit the next queued return rows.
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

const authorizePortalMock = vi.fn();
const isAuthErrorMock = vi.fn();
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: (...args: unknown[]) => authorizePortalMock(...args),
  isAuthError: (...args: unknown[]) => isAuthErrorMock(...args),
}));

// surveys/response-filters — keep parseResponseFilters real (pure URL parsing)
// but stub buildResponseWhere to an inert SQL marker so it threads through
// the chain without exploding.
vi.mock('@/lib/surveys/response-filters', () => ({
  parseResponseFilters: (url: URL) => {
    const sp = url.searchParams;
    return {
      from: sp.get('from'),
      to: sp.get('to'),
      source: sp.get('source'),
      q: sp.get('q'),
    };
  },
  buildResponseWhere: (surveyId: number, f: unknown) => ({
    __where: true,
    surveyId,
    f,
  }),
}));

// drizzle-orm operators — inert objects
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
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

// schema — proxy tables. We expose any column requested as a marker so
// orderBy(suggestedProjects.order, suggestedProjects.createdAt) etc. won't blow up.
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
    suggestedProjects: wrap('suggestedProjects'),
    suggestedProjectRequests: wrap('suggestedProjectRequests'),
    surveys: wrap('surveys'),
    surveyResponses: wrap('surveyResponses'),
    // SurveyFieldDef is a type — exported as undefined value.
    SurveyFieldDef: undefined,
  };
});

// ---------------------------------------------------------------------------
// db mock: select-queue (shared with selectDistinct) + write capture
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: Record<string, unknown> | Record<string, unknown>[];
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
      selectDistinct() {
        return buildSelect();
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

const suggestedProjectRequestsRoute = await import(
  '@/app/api/portal/suggested-project-requests/route'
);
const suggestedProjectsRoute = await import('@/app/api/portal/suggested-projects/route');
const surveyExportRoute = await import('@/app/api/portal/surveys/[id]/export/route');
const surveyResponsesRoute = await import('@/app/api/portal/surveys/[id]/responses/route');

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
  authMock.mockReset();
  getPortalClientMock.mockReset();
  authorizePortalMock.mockReset();
  isAuthErrorMock.mockReset();
  // Default isAuthError uses the runtime guard: returns true when the value
  // has a `response` property.
  isAuthErrorMock.mockImplementation((v: unknown) => {
    return Boolean(v && typeof v === 'object' && 'response' in (v as object));
  });
});

// ===========================================================================
// POST /api/portal/suggested-project-requests
// ===========================================================================

describe('POST /api/portal/suggested-project-requests', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await suggestedProjectRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/suggested-project-requests', 'POST', {
        suggestedProjectId: 1,
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user.id (client resolves to null)', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await suggestedProjectRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/suggested-project-requests', 'POST', {
        suggestedProjectId: 1,
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when suggestedProjectId is missing', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const res = await suggestedProjectRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/suggested-project-requests', 'POST', {}),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.message).toBe('suggestedProjectId is required');
  });

  it('returns 404 when project does not exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // project lookup empty
    const res = await suggestedProjectRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/suggested-project-requests', 'POST', {
        suggestedProjectId: 99,
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Project not available');
  });

  it('returns 404 when project is inactive', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 99, active: false }]); // project not active
    const res = await suggestedProjectRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/suggested-project-requests', 'POST', {
        suggestedProjectId: 99,
      }),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Project not available');
  });

  it('creates a request with default null answers/message', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 99, active: true }]); // project found + active
    insertReturnQueue.push([
      {
        id: 1001,
        suggestedProjectId: 99,
        clientId: 5,
        status: 'pending',
        answers: null,
        message: null,
      },
    ]);
    const res = await suggestedProjectRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/suggested-project-requests', 'POST', {
        suggestedProjectId: 99,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1001);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('suggestedProjectRequests');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.suggestedProjectId).toBe(99);
    expect(inserted.clientId).toBe(5);
    expect(inserted.status).toBe('pending');
    expect(inserted.answers).toBeNull();
    expect(inserted.message).toBeNull();
  });

  it('passes answers + message through when provided', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 99, active: true }]);
    insertReturnQueue.push([{ id: 1002 }]);
    const res = await suggestedProjectRequestsRoute.POST(
      makeJsonReq('http://x/api/portal/suggested-project-requests', 'POST', {
        suggestedProjectId: 99,
        answers: { goal: 'launch', budget: 5000 },
        message: 'Please follow up',
      }),
    );
    expect(res.status).toBe(200);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.answers).toEqual({ goal: 'launch', budget: 5000 });
    expect(inserted.message).toBe('Please follow up');
  });
});

// ===========================================================================
// GET /api/portal/suggested-projects
// ===========================================================================

describe('GET /api/portal/suggested-projects', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await suggestedProjectsRoute.GET();
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await suggestedProjectsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await suggestedProjectsRoute.GET();
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns active suggestions visible to the client', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([
      { id: 1, active: true, clientId: null, order: 0, title: 'Global' },
      { id: 2, active: true, clientId: 5, order: 1, title: 'Client-specific' },
    ]);
    const res = await suggestedProjectsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].id).toBe(1);
    expect(body.data[1].id).toBe(2);
  });

  it('returns an empty list when no suggestions exist', async () => {
    authMock.mockResolvedValue(SESSION);
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // empty result
    const res = await suggestedProjectsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
  });
});

// ===========================================================================
// GET /api/portal/surveys/[id]/export
// ===========================================================================

describe('GET /api/portal/surveys/[id]/export', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await surveyExportRoute.GET(
      makeReq('http://x/api/portal/surveys/1/export'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns the authorize error response when portal auth fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const errResponse = new Response('forbidden', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: errResponse });
    const res = await surveyExportRoute.GET(
      makeReq('http://x/api/portal/surveys/1/export'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res).toBe(errResponse);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await surveyExportRoute.GET(
      makeReq('http://x/api/portal/surveys/1/export'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when survey is not owned by the client', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // survey ownership lookup → none
    const res = await surveyExportRoute.GET(
      makeReq('http://x/api/portal/surveys/1/export'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Survey not found');
  });

  it('emits CSV with structured headers + escaped values + custom keys', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue({ id: 5 });
    const fields = [
      { id: 'f1', label: 'Name', type: 'text' },
      { id: 'h1', label: 'Section', type: 'heading' }, // excluded
      { id: 'f2', label: 'Likes, commas', type: 'text' },
    ];
    selectQueue.push([
      {
        id: 1,
        clientId: 5,
        title: 'My Survey!',
        fields,
      },
    ]);
    selectQueue.push([
      {
        id: 10,
        createdAt: new Date('2026-01-02T03:04:05.000Z'),
        formName: 'main',
        respondentEmail: 'a@b.com',
        respondentName: 'Ada',
        source: 'link',
        answers: {
          f1: 'Ada',
          f2: 'cats, dogs',
          custom1: 'extra-A',
          // Spreadsheet formula injection should be neutralized.
          custom2: '=cmd|/c calc',
        },
      },
      {
        id: 11,
        createdAt: new Date('2026-01-03T00:00:00.000Z'),
        formName: null,
        respondentEmail: null,
        respondentName: null,
        source: null,
        answers: {
          f1: ['multi', 'value'],
          f2: { complex: true },
          custom1: 'extra-B',
        },
      },
    ]);

    const res = await surveyExportRoute.GET(
      makeReq('http://x/api/portal/surveys/1/export'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/csv/);
    expect(res.headers.get('content-disposition')).toContain(
      'My_Survey__responses.csv',
    );
    const text = await res.text();
    const lines = text.split('\n');
    expect(lines).toHaveLength(3); // header + 2 rows
    // Header includes structured field labels (no heading) + custom keys.
    // "Likes, commas" must be wrapped in quotes because it contains a comma.
    expect(lines[0]).toBe('#,Date,Form,Email,Name,Source,Name,"Likes, commas",custom1,custom2');
    // First row: index 1, ISO date, defaults are kept, formula-injection neutralized.
    expect(lines[1]).toBe(
      '1,2026-01-02T03:04:05.000Z,main,a@b.com,Ada,link,Ada,"cats, dogs",extra-A,\'=cmd|/c calc',
    );
    // Second row: empty string fallbacks; array → semicolon-joined; object → JSON.
    expect(lines[2]).toBe(
      '2,2026-01-03T00:00:00.000Z,main,,,link,multi; value,"{""complex"":true}",extra-B,',
    );
  });

  it('handles surveys with no fields gracefully', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, title: 'Empty', fields: null }]);
    selectQueue.push([]); // no responses
    const res = await surveyExportRoute.GET(
      makeReq('http://x/api/portal/surveys/1/export'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('#,Date,Form,Email,Name,Source');
  });
});

// ===========================================================================
// GET /api/portal/surveys/[id]/responses
// ===========================================================================

describe('GET /api/portal/surveys/[id]/responses', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await surveyResponsesRoute.GET(
      makeReq('http://x/api/portal/surveys/1/responses'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(401);
    expect((await res.json()).message).toBe('Unauthorized');
  });

  it('returns the authorize error response when portal auth fails', async () => {
    authMock.mockResolvedValue(SESSION);
    const errResponse = new Response('nope', { status: 403 });
    authorizePortalMock.mockResolvedValue({ response: errResponse });
    const res = await surveyResponsesRoute.GET(
      makeReq('http://x/api/portal/surveys/1/responses'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res).toBe(errResponse);
  });

  it('returns 404 when client cannot be resolved', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue(null);
    const res = await surveyResponsesRoute.GET(
      makeReq('http://x/api/portal/surveys/1/responses'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('returns 404 when survey is not owned by the client', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([]); // survey ownership lookup empty
    const res = await surveyResponsesRoute.GET(
      makeReq('http://x/api/portal/surveys/1/responses'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Survey not found');
  });

  it('returns responses + stats + filters + sourcesPresent', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue({ id: 5 });
    // 1) survey ownership
    selectQueue.push([{ id: 1, clientId: 5, title: 'Survey' }]);
    // 2) responses
    selectQueue.push([
      { id: 10, source: 'link', completedAt: new Date(), respondentEmail: 'a@b.com' },
      { id: 11, source: 'email', completedAt: null, respondentEmail: null },
    ]);
    // 3) stats aggregate
    selectQueue.push([{ total: 2, completed: 1, withEmail: 1 }]);
    // 4) sourcesPresent (selectDistinct)
    selectQueue.push([{ source: 'link' }, { source: 'email' }, { source: null }]);

    const res = await surveyResponsesRoute.GET(
      makeReq('http://x/api/portal/surveys/1/responses?from=2026-01-01&source=link'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.responses).toHaveLength(2);
    expect(body.data.stats).toEqual({ total: 2, completed: 1, withEmail: 1 });
    expect(body.data.filters).toEqual({
      from: '2026-01-01',
      to: null,
      source: 'link',
      q: null,
    });
    // null-source entries are dropped from sourcesPresent
    expect(body.data.sourcesPresent).toEqual(['link', 'email']);
  });

  it('coalesces missing stats row to zeros', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, title: 'Survey' }]);
    selectQueue.push([]); // no responses
    selectQueue.push([]); // no stats row at all
    selectQueue.push([]); // no sources
    const res = await surveyResponsesRoute.GET(
      makeReq('http://x/api/portal/surveys/1/responses'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stats).toEqual({ total: 0, completed: 0, withEmail: 0 });
    expect(body.data.responses).toEqual([]);
    expect(body.data.sourcesPresent).toEqual([]);
  });

  it('coalesces missing stats *values* to zero', async () => {
    authMock.mockResolvedValue(SESSION);
    authorizePortalMock.mockResolvedValue({ client: { id: 5 }, userId: 7, role: 'owner' });
    getPortalClientMock.mockResolvedValue({ id: 5 });
    selectQueue.push([{ id: 1, clientId: 5, title: 'Survey' }]);
    selectQueue.push([]);
    selectQueue.push([{ total: undefined, completed: undefined, withEmail: undefined }]);
    selectQueue.push([]);
    const res = await surveyResponsesRoute.GET(
      makeReq('http://x/api/portal/surveys/1/responses'),
      { params: Promise.resolve({ id: '1' }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.stats).toEqual({ total: 0, completed: 0, withEmail: 0 });
  });
});
