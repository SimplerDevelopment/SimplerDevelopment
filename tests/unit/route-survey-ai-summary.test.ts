// @vitest-environment node
/**
 * Unit tests for `app/api/portal/surveys/[id]/ai-summary/route.ts` (AI-01 / AI-02).
 *
 * Same mock-DB pattern as `cron-failing-automations-notify.test.ts`: stub
 * `@/lib/db`, `@/lib/auth`, `@/lib/portal-client`, and the AI helpers at the
 * module boundary so the route can be imported in isolation. We focus on the
 * branches the security audit cares about most:
 *
 *   - 401 on missing session for every verb.
 *   - 404 on cross-tenant survey id (session valid but survey.clientId !=
 *     session client) — this is the tenant-scoping invariant.
 *   - 400 on non-numeric id.
 *   - GET fast-paths: no cached row → { data: null }; stale row → stale=true.
 *   - POST `fresh` short-circuit (409 unless ?force=1).
 *   - POST plan-gate refusal (402).
 *   - POST no-responses (400).
 *   - POST happy path → upsert + recordAiUsage fire-and-forget.
 *   - DELETE happy path → delete called.
 *
 * The pure summary generator (`lib/surveys/ai-summary.ts`) makes a real
 * Anthropic call and is intentionally NOT covered here — it lives behind a
 * module-level mock just like recordAiUsage and checkAiPlanGate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stable mock instances. `vi.mock` is hoisted, so these must be re-bound
// inside the factory closures to avoid TDZ ReferenceErrors on the first
// import. We use mutable refs so each test can rewire return values.
const authMock = vi.fn();
const getPortalClientMock = vi.fn();
const generateSurveySummaryMock = vi.fn();
const resolveClientApiKeyMock = vi.fn();
const recordAiUsageMock = vi.fn();
const checkAiPlanGateMock = vi.fn();

// DB shape: chainable select + insert + delete. Each chain ultimately
// resolves to an array of rows (or just undefined for delete .where()).
// Calls are recorded on these spies so tests can assert the route fired
// the upsert / delete it should have.
const insertValuesOnConflictMock = vi.fn().mockResolvedValue(undefined);
const insertValuesMock = vi.fn(() => ({ onConflictDoUpdate: insertValuesOnConflictMock }));
const insertMock = vi.fn(() => ({ values: insertValuesMock }));
const deleteWhereMock = vi.fn().mockResolvedValue(undefined);
const deleteMock = vi.fn(() => ({ where: deleteWhereMock }));

// Three different shape responses are queued in test order — survey lookup,
// existing summary lookup, responses lookup, etc. We use a simple FIFO of
// resolved rows.
let selectQueue: unknown[][] = [];
function takeNext(): unknown[] {
  const next = selectQueue.shift();
  if (!next) return [];
  return next;
}
// Each chain (.from().where().limit() | .from().where()) eventually
// terminates either via `await` of the final promise OR via .limit() which
// itself awaits. We model the chain as a thenable so it resolves to the
// next queued row-set regardless of how deep the chain is.
function chainable(): unknown {
  const obj: Record<string, unknown> = {};
  const then = (resolve: (rows: unknown[]) => void) => resolve(takeNext());
  obj.from = () => chainable();
  obj.where = () => chainable();
  obj.limit = () => chainable();
  obj.orderBy = () => chainable();
  obj.then = then;
  return obj;
}

vi.mock('@/lib/auth', () => ({ auth: (...args: unknown[]) => authMock(...args) }));
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => chainable(),
    insert: insertMock,
    delete: deleteMock,
  },
}));
// drizzle helpers — the route imports `and`, `eq`. They build SQL fragments
// only; returning plain objects is safe since we never execute them.
vi.mock('drizzle-orm', async () => {
  const actual = await vi.importActual<typeof import('drizzle-orm')>('drizzle-orm');
  return {
    ...actual,
    and: (...args: unknown[]) => ({ _and: args }),
    eq: (a: unknown, b: unknown) => ({ _eq: [a, b] }),
  };
});
// schema is referenced only as opaque table tokens — the route never
// introspects fields off these (just passes them to `db.select().from()`).
vi.mock('@/lib/db/schema', () => ({
  surveys: { __t: 'surveys' },
  surveyResponses: { __t: 'survey_responses' },
  surveyAiSummaries: { __t: 'survey_ai_summaries', surveyId: { __c: 'survey_id' } },
}));
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => resolveClientApiKeyMock(...args),
}));
vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: (...args: unknown[]) => recordAiUsageMock(...args),
}));
vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: (...args: unknown[]) => checkAiPlanGateMock(...args),
}));
vi.mock('@/lib/surveys/ai-summary', () => ({
  generateSurveySummary: (...args: unknown[]) => generateSurveySummaryMock(...args),
}));

async function loadRoute() {
  return import('@/app/api/portal/surveys/[id]/ai-summary/route');
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  // Healthy defaults — tests override per case.
  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 42 });
  checkAiPlanGateMock.mockResolvedValue({ allowed: true });
  resolveClientApiKeyMock.mockResolvedValue({ key: 'sk-test', source: 'platform' });
  recordAiUsageMock.mockResolvedValue(undefined);
});

describe('GET /api/portal/surveys/[id]/ai-summary', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x/api/portal/surveys/1/ai-summary'), makeParams('1'));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('returns 400 for a non-numeric survey id', async () => {
    // session ok, but parseId('abc') → null → 400 before any DB call.
    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x'), makeParams('abc'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when the survey belongs to a different client (cross-tenant)', async () => {
    // First select() — survey lookup scoped to (id, clientId) — returns no row.
    // This is the security-critical case: a valid session for client 42
    // attempting to read survey 999 owned by client 7 must not leak.
    selectQueue.push([]);
    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x'), makeParams('999'));
    expect(res.status).toBe(404);
  });

  it('returns { data: null } when no cached summary row exists', async () => {
    // survey row found, then summary lookup returns empty.
    selectQueue.push([{ id: 1, clientId: 42, responseCount: 3, fields: [] }]);
    selectQueue.push([]);
    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x'), makeParams('1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: unknown };
    expect(json.success).toBe(true);
    expect(json.data).toBeNull();
  });

  it('flags the summary as stale when responseCountAtGeneration < survey.responseCount', async () => {
    selectQueue.push([{ id: 1, clientId: 42, responseCount: 10, fields: [] }]);
    selectQueue.push([
      {
        summary: 'cached',
        sentiment: 'positive',
        themes: ['a'],
        perQuestion: [],
        generatedAt: new Date(),
        responseCountAtGeneration: 5,
      },
    ]);
    const { GET } = await loadRoute();
    const res = await GET(new Request('http://x'), makeParams('1'));
    const json = (await res.json()) as { data: { stale: boolean; currentResponseCount: number } };
    expect(json.data.stale).toBe(true);
    expect(json.data.currentResponseCount).toBe(10);
  });
});

describe('POST /api/portal/surveys/[id]/ai-summary', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const { POST } = await loadRoute();
    const res = await POST(new Request('http://x', { method: 'POST' }), makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when survey belongs to a different client (cross-tenant)', async () => {
    selectQueue.push([]); // survey lookup empty
    const { POST } = await loadRoute();
    const res = await POST(new Request('http://x', { method: 'POST' }), makeParams('1'));
    expect(res.status).toBe(404);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('returns 409 reason=fresh when a cached row covers the current response count and force is not set', async () => {
    selectQueue.push([{ id: 1, clientId: 42, responseCount: 5, fields: [] }]);
    // existing summary already covers all 5 responses
    selectQueue.push([{ responseCountAtGeneration: 5 }]);
    const { POST } = await loadRoute();
    const res = await POST(new Request('http://x', { method: 'POST' }), makeParams('1'));
    expect(res.status).toBe(409);
    const json = (await res.json()) as { reason: string };
    expect(json.reason).toBe('fresh');
    expect(generateSurveySummaryMock).not.toHaveBeenCalled();
  });

  it('returns 402 when the plan gate refuses the request', async () => {
    selectQueue.push([{ id: 1, clientId: 42, responseCount: 5, fields: [] }]);
    // force=1 bypasses the freshness check, so the existing-summary row
    // is allowed to be present; we then hit the plan gate.
    selectQueue.push([]);
    checkAiPlanGateMock.mockResolvedValueOnce({
      allowed: false,
      reason: 'over_budget',
      message: 'AI budget exhausted',
    });
    const { POST } = await loadRoute();
    const res = await POST(
      new Request('http://x/api/portal/surveys/1/ai-summary?force=1', { method: 'POST' }),
      makeParams('1'),
    );
    expect(res.status).toBe(402);
    const json = (await res.json()) as { reason: string };
    expect(json.reason).toBe('over_budget');
  });

  it('returns 400 when no responses exist yet', async () => {
    selectQueue.push([{ id: 1, clientId: 42, responseCount: 0, fields: [] }]);
    selectQueue.push([]); // no existing summary
    selectQueue.push([]); // no responses
    const { POST } = await loadRoute();
    const res = await POST(new Request('http://x', { method: 'POST' }), makeParams('1'));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { message: string };
    expect(json.message).toMatch(/no responses/i);
  });

  it('upserts, records usage, and returns the generated summary on success', async () => {
    selectQueue.push([{ id: 1, clientId: 42, responseCount: 3, fields: [] }]);
    selectQueue.push([]); // no existing summary
    selectQueue.push([{ answers: { q1: 'great product' } }, { answers: { q1: 'love it' } }]);

    generateSurveySummaryMock.mockResolvedValueOnce({
      summary: 'Respondents like the product.',
      sentiment: 'positive',
      themes: ['quality', 'usability'],
      perQuestion: [{ fieldId: 'q1', summary: 'Praise.' }],
      tokensUsed: 1234,
    });

    const { POST } = await loadRoute();
    const res = await POST(new Request('http://x', { method: 'POST' }), makeParams('1'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { summary: string; stale: boolean } };
    expect(json.success).toBe(true);
    expect(json.data.summary).toBe('Respondents like the product.');
    expect(json.data.stale).toBe(false);

    // The upsert path: insert(...).values(...).onConflictDoUpdate({ ... }).
    expect(insertMock).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledTimes(1);
    expect(insertValuesOnConflictMock).toHaveBeenCalledTimes(1);

    // recordAiUsage is fire-and-forgot via `void`, but the call must still
    // have been made synchronously by the time we resolve.
    expect(recordAiUsageMock).toHaveBeenCalledTimes(1);
    const usageArg = recordAiUsageMock.mock.calls[0]![0] as {
      clientId: number;
      source: string;
      tokens: number;
    };
    expect(usageArg).toMatchObject({ clientId: 42, source: 'platform', tokens: 1234 });
  });
});

describe('DELETE /api/portal/surveys/[id]/ai-summary', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const { DELETE } = await loadRoute();
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), makeParams('1'));
    expect(res.status).toBe(401);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('returns 404 when survey belongs to a different client (cross-tenant)', async () => {
    selectQueue.push([]); // survey lookup empty
    const { DELETE } = await loadRoute();
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), makeParams('1'));
    expect(res.status).toBe(404);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('calls db.delete on the matching row on success', async () => {
    selectQueue.push([{ id: 1, clientId: 42, responseCount: 0, fields: [] }]);
    const { DELETE } = await loadRoute();
    const res = await DELETE(new Request('http://x', { method: 'DELETE' }), makeParams('1'));
    expect(res.status).toBe(200);
    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });
});
