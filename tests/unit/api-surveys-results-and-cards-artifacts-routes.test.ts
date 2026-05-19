// @vitest-environment node
/**
 * Unit tests for two API routes (combined to maximize coverage in one shot):
 *
 *   1. app/api/surveys/[slug]/results/route.ts  (GET)
 *      Aggregates survey responses into per-question breakdowns. No auth.
 *
 *   2. app/api/portal/cards/[id]/artifacts/route.ts  (GET / POST / PUT / DELETE)
 *      Manages kanban card artifact links. Requires session; staff/employee
 *      bypass tenant check, others must own the project's client.
 *
 * Strategy: each describe block sets up its own db / auth mocks. The select()
 * chain is mocked with a queue-driven thenable so we can line up rows in the
 * order the route consumes them. Writes (insert/update/delete) are mocked to
 * capture payloads and return queued rows.
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

// drizzle-orm — stub operators to plain objects (we don't introspect them)
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
        if (prop === 'then') return undefined; // not thenable
        return { __col: prop, __table: tableName };
      },
    };
    return new Proxy({ __table: tableName }, handler);
  };
  return {
    surveys: wrap('surveys'),
    surveyResponses: wrap('surveyResponses'),
    kanbanCards: wrap('kanbanCards'),
    kanbanCardArtifacts: wrap('kanbanCardArtifacts'),
    projects: wrap('projects'),
    clientWebsites: wrap('clientWebsites'),
    emailCampaigns: wrap('emailCampaigns'),
    pitchDecks: wrap('pitchDecks'),
    crmProposals: wrap('crmProposals'),
    bookingPages: wrap('bookingPages'),
  };
});

// ---- db mock with select-queue + capture for writes ----
interface DeleteCall {
  table: string;
  filter: unknown;
  returnedRows: Array<Record<string, unknown>>;
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
  returnedRows: Array<Record<string, unknown>>;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let updateReturnQueue: Array<Array<Record<string, unknown>>> = [];
let deleteReturnQueue: Array<Array<Record<string, unknown>>> = [];
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
        const rows = deleteReturnQueue.shift() ?? [];
        deleteCalls.push({ table: table.__table, filter, returnedRows: rows });
        return {
          returning() {
            return Promise.resolve(rows.map((r) => ({ ...r })));
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        const rows = insertReturnQueue.shift() ?? [];
        insertCalls.push({ table: table.__table, values: v, returnedRows: rows });
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

const surveyResultsRoute = await import('@/app/api/surveys/[slug]/results/route');
const cardsArtifactsRoute = await import('@/app/api/portal/cards/[id]/artifacts/route');

const STAFF_SESSION = { user: { id: '7', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '8', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '12', role: 'client' } };

function makeParams<T>(p: T) {
  return { params: Promise.resolve(p) };
}

function makeJsonRequest(body: unknown, method = 'POST'): Request {
  return new Request('http://x/api/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  selectQueue = [];
  updateReturnQueue = [];
  deleteReturnQueue = [];
  insertReturnQueue = [];
  deleteCalls.length = 0;
  updateCalls.length = 0;
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
});

// ===========================================================================
// 1) Survey results route
// ===========================================================================

describe('GET /api/surveys/[slug]/results', () => {
  const { GET } = surveyResultsRoute;

  it('returns 404 when the survey is not found', async () => {
    selectQueue.push([]); // survey lookup empty
    const res = await GET(new Request('http://x'), makeParams({ slug: 'missing' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Survey not found' });
  });

  it('aggregates option counts for select / radio / checkbox fields', async () => {
    const survey = {
      id: 1,
      title: 'Test Survey',
      description: 'desc',
      slug: 's1',
      fields: [
        { id: 'q1', label: 'Pick one', type: 'select', options: ['A', 'B', 'C'] },
        { id: 'q2', label: 'Pick many', type: 'checkbox', options: ['X', 'Y'] },
        { id: 'q3', label: 'Skip heading', type: 'heading', options: [] },
      ],
    };
    const responses = [
      { answers: { q1: 'A', q2: ['X', 'Y'] } },
      { answers: { q1: 'A', q2: ['X'] } },
      { answers: { q1: 'B', q2: [] } }, // empty array still counts toward q2 answerCount
      { answers: { q1: '', q2: null } }, // empty/null skipped
      { answers: { q1: 'C', q2: 'X' } }, // non-array value branch on checkbox-ish
    ];
    selectQueue.push([survey]); // survey lookup
    selectQueue.push(responses); // responses
    const res = await GET(new Request('http://x'), makeParams({ slug: 's1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.surveyTitle).toBe('Test Survey');
    expect(body.data.totalResponses).toBe(5);
    expect(body.data.questions).toHaveLength(2); // heading skipped

    const q1 = body.data.questions[0];
    expect(q1.fieldId).toBe('q1');
    expect(q1.optionCounts).toEqual({ A: 2, B: 1, C: 1 });
    expect(q1.answerCount).toBe(4); // one empty string skipped

    const q2 = body.data.questions[1];
    // X counted thrice (twice from arrays + once direct), Y once
    expect(q2.optionCounts).toEqual({ X: 3, Y: 1 });
  });

  it('computes numeric stats for rating / slider / number fields and skips NaN', async () => {
    const survey = {
      id: 2,
      title: 'Numbers',
      description: null,
      slug: 's2',
      fields: [
        { id: 'r', label: 'Rate', type: 'rating', options: [] },
        { id: 'n', label: 'Empty', type: 'number', options: [] },
      ],
    };
    const responses = [
      { answers: { r: 3, n: '' } }, // empty string skipped
      { answers: { r: 5, n: null } }, // null skipped
      { answers: { r: 'not-a-num', n: undefined } }, // NaN skipped
      { answers: { r: '4', n: 7 } },
    ];
    selectQueue.push([survey]);
    selectQueue.push(responses);
    const res = await GET(new Request('http://x'), makeParams({ slug: 's2' }));
    const body = await res.json();
    const r = body.data.questions.find((q: { fieldId: string }) => q.fieldId === 'r');
    expect(r.numericStats).toMatchObject({ min: 3, max: 5, count: 3 });
    expect(r.numericStats.average).toBeCloseTo(4); // (3 + 5 + 4) / 3 = 4
    expect(r.answerCount).toBe(3);
    const n = body.data.questions.find((q: { fieldId: string }) => q.fieldId === 'n');
    // n has only one valid numeric (7) — numericStats present
    expect(n.numericStats).toMatchObject({ min: 7, max: 7, count: 1 });
  });

  it('returns no numericStats when all numeric answers are missing', async () => {
    const survey = {
      id: 3,
      title: 'AllMissing',
      description: null,
      slug: 's3',
      fields: [{ id: 'r', label: 'Rate', type: 'rating', options: [] }],
    };
    selectQueue.push([survey]);
    selectQueue.push([{ answers: { r: null } }, { answers: { r: '' } }]);
    const res = await GET(new Request('http://x'), makeParams({ slug: 's3' }));
    const body = await res.json();
    expect(body.data.questions[0].numericStats).toBeUndefined();
    expect(body.data.questions[0].answerCount).toBe(0);
  });

  it('captures text samples up to 20 and trims whitespace', async () => {
    const survey = {
      id: 4,
      title: 'Text',
      description: null,
      slug: 's4',
      fields: [{ id: 't', label: 'Tell us', type: 'textarea', options: [] }],
    };
    // 25 valid + a couple of skipped/empty entries
    const responses: Array<{ answers: Record<string, unknown> }> = [];
    for (let i = 0; i < 25; i++) {
      responses.push({ answers: { t: `  hello ${i}  ` } });
    }
    responses.push({ answers: { t: '   ' } }); // whitespace-only skipped
    responses.push({ answers: { t: null } }); // null skipped
    responses.push({ answers: { t: 42 } }); // non-string skipped
    selectQueue.push([survey]);
    selectQueue.push(responses);
    const res = await GET(new Request('http://x'), makeParams({ slug: 's4' }));
    const body = await res.json();
    const q = body.data.questions[0];
    expect(q.textSamples).toHaveLength(20);
    expect(q.textSamples[0]).toBe('hello 0'); // trimmed
    expect(q.answerCount).toBe(25);
  });

  it('counts toggle Yes/No values', async () => {
    const survey = {
      id: 5,
      title: 'Toggle',
      description: null,
      slug: 's5',
      fields: [{ id: 'g', label: 'OK?', type: 'toggle', options: [] }],
    };
    const responses = [
      { answers: { g: true } },
      { answers: { g: true } },
      { answers: { g: false } },
      { answers: { g: null } }, // skipped
    ];
    selectQueue.push([survey]);
    selectQueue.push(responses);
    const res = await GET(new Request('http://x'), makeParams({ slug: 's5' }));
    const body = await res.json();
    expect(body.data.questions[0].optionCounts).toEqual({ Yes: 2, No: 1 });
    expect(body.data.questions[0].answerCount).toBe(3);
  });

  it('captures date samples like text', async () => {
    const survey = {
      id: 6,
      title: 'Dates',
      description: null,
      slug: 's6',
      fields: [{ id: 'd', label: 'When', type: 'date', options: [] }],
    };
    const responses = [
      { answers: { d: '2026-05-01' } },
      { answers: { d: '2026-05-02' } },
      { answers: { d: '' } }, // skipped
      { answers: { d: null } }, // skipped
    ];
    selectQueue.push([survey]);
    selectQueue.push(responses);
    const res = await GET(new Request('http://x'), makeParams({ slug: 's6' }));
    const body = await res.json();
    expect(body.data.questions[0].textSamples).toEqual(['2026-05-01', '2026-05-02']);
    expect(body.data.questions[0].answerCount).toBe(2);
  });

  it('handles a survey with no fields and no responses', async () => {
    const survey = { id: 7, title: 'Empty', description: null, slug: 's7', fields: null };
    selectQueue.push([survey]);
    selectQueue.push([]);
    const res = await GET(new Request('http://x'), makeParams({ slug: 's7' }));
    const body = await res.json();
    expect(body.data.totalResponses).toBe(0);
    expect(body.data.questions).toEqual([]);
  });
});

// ===========================================================================
// 2) Portal cards artifacts route
// ===========================================================================

describe('GET /api/portal/cards/[id]/artifacts', () => {
  const { GET } = cardsArtifactsRoute;

  it('returns 400 when the id is not numeric', async () => {
    const res = await GET(new Request('http://x'), makeParams({ id: 'abc' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 401 when no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when card is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([]); // card lookup empty
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Card not found');
  });

  it('returns 404 when project is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([]); // project
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Project not found');
  });

  it('returns 403 for a client when their portal client does not match project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 99 }]);
    getPortalClientMock.mockResolvedValue({ id: 33 }); // mismatch
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for a client when getPortalClient returns null', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 99 }]);
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(403);
  });

  it('returns artifacts for staff (skips tenant check)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33 }]); // project
    selectQueue.push([
      { id: 11, cardId: 1, artifactType: 'website', artifactId: 100, displayTitle: 'Site', pinned: true },
    ]); // artifact list
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].artifactType).toBe('website');
    // getPortalClient never called for staff
    expect(getPortalClientMock).not.toHaveBeenCalled();
  });

  it('returns artifacts for employees (also skips tenant check)', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    selectQueue.push([]);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(200);
    expect(getPortalClientMock).not.toHaveBeenCalled();
  });

  it('returns artifacts for a matching client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    selectQueue.push([]);
    const res = await GET(new Request('http://x'), makeParams({ id: '1' }));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/portal/cards/[id]/artifacts', () => {
  const { POST } = cardsArtifactsRoute;

  it('returns 400 on non-numeric id', async () => {
    const res = await POST(makeJsonRequest({}), makeParams({ id: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeJsonRequest({}), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when artifactType is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    const res = await POST(makeJsonRequest({ artifactId: 9 }), makeParams({ id: '1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when artifactType is unknown', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    const res = await POST(
      makeJsonRequest({ artifactType: 'bogus', artifactId: 9 }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when source artifact does not belong to the client', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33 }]); // project
    selectQueue.push([]); // artifact source lookup empty
    const res = await POST(
      makeJsonRequest({ artifactType: 'website', artifactId: 99 }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Artifact not found');
  });

  it('inserts a new artifact and returns 201 with the source title', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]); // card
    selectQueue.push([{ id: 5, clientId: 33 }]); // project
    selectQueue.push([{ title: 'Cool Site' }]); // source lookup
    insertReturnQueue.push([
      { id: 100, cardId: 1, artifactType: 'website', artifactId: 9, displayTitle: 'Cool Site', pinned: true, createdBy: 7 },
    ]);
    const res = await POST(
      makeJsonRequest({ artifactType: 'website', artifactId: 9, pinned: true }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.displayTitle).toBe('Cool Site');
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('kanbanCardArtifacts');
    expect(insertCalls[0].values).toMatchObject({
      cardId: 1,
      artifactType: 'website',
      artifactId: 9,
      displayTitle: 'Cool Site',
      pinned: true,
      createdBy: 7,
    });
  });

  it('falls back to body.displayTitle when source title is missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    selectQueue.push([{ title: null }]); // source has no title
    insertReturnQueue.push([{ id: 101, displayTitle: 'Body Title' }]);
    const res = await POST(
      makeJsonRequest({
        artifactType: 'project',
        artifactId: 42,
        displayTitle: 'Body Title',
      }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].values).toMatchObject({ displayTitle: 'Body Title', pinned: false });
  });

  it('defaults the display title to "Untitled" when both source and body lack one', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    selectQueue.push([{ title: '' }]);
    insertReturnQueue.push([{ id: 102, displayTitle: 'Untitled' }]);
    const res = await POST(
      makeJsonRequest({ artifactType: 'survey', artifactId: 7 }),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls[0].values).toMatchObject({ displayTitle: 'Untitled' });
  });
});

describe('PUT /api/portal/cards/[id]/artifacts', () => {
  const { PUT } = cardsArtifactsRoute;

  it('returns 400 on non-numeric id', async () => {
    const res = await PUT(makeJsonRequest({}, 'PUT'), makeParams({ id: 'x' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await PUT(makeJsonRequest({}, 'PUT'), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
  });

  it('returns 400 when required fields are missing', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    const res = await PUT(makeJsonRequest({}, 'PUT'), makeParams({ id: '1' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when pinned is undefined', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    const res = await PUT(
      makeJsonRequest({ artifactDbId: 100 }, 'PUT'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 404 when the update affects no rows', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    updateReturnQueue.push([]); // no rows affected
    const res = await PUT(
      makeJsonRequest({ artifactDbId: 100, pinned: true }, 'PUT'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(404);
  });

  it('updates pinned and returns the row', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    updateReturnQueue.push([{ id: 100, pinned: true }]);
    const res = await PUT(
      makeJsonRequest({ artifactDbId: 100, pinned: true }, 'PUT'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pinned).toBe(true);
    expect(updateCalls[0].patch).toEqual({ pinned: true });
  });

  it('accepts pinned=false (falsy but defined)', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    updateReturnQueue.push([{ id: 100, pinned: false }]);
    const res = await PUT(
      makeJsonRequest({ artifactDbId: 100, pinned: false }, 'PUT'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0].patch).toEqual({ pinned: false });
  });
});

describe('DELETE /api/portal/cards/[id]/artifacts', () => {
  const { DELETE } = cardsArtifactsRoute;

  it('returns 400 on non-numeric id', async () => {
    const res = await DELETE(makeJsonRequest({}, 'DELETE'), makeParams({ id: 'x' }));
    expect(res.status).toBe(400);
  });

  it('returns 401 when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    const res = await DELETE(makeJsonRequest({}, 'DELETE'), makeParams({ id: '1' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when no artifact matched the delete', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    deleteReturnQueue.push([]); // delete returned nothing
    const res = await DELETE(
      makeJsonRequest({ artifactDbId: 100 }, 'DELETE'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(404);
  });

  it('deletes an artifact and returns it', async () => {
    authMock.mockResolvedValue(STAFF_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    deleteReturnQueue.push([{ id: 100, cardId: 1 }]);
    const res = await DELETE(
      makeJsonRequest({ artifactDbId: 100 }, 'DELETE'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(100);
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0].table).toBe('kanbanCardArtifacts');
  });

  it('permits client roles when their portal client matches the project', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    selectQueue.push([{ id: 1, projectId: 5 }]);
    selectQueue.push([{ id: 5, clientId: 33 }]);
    getPortalClientMock.mockResolvedValue({ id: 33 });
    deleteReturnQueue.push([{ id: 100 }]);
    const res = await DELETE(
      makeJsonRequest({ artifactDbId: 100 }, 'DELETE'),
      makeParams({ id: '1' }),
    );
    expect(res.status).toBe(200);
  });
});
