// @vitest-environment node
/**
 * Unit tests for app/api/portal/projects/[id]/surveys/generate/route.ts
 * (POST), plus a direct test of the underlying tenancy-scoped service
 * (lib/projects/generate-survey-service.ts).
 *
 * Strategy: mirrors tests/unit/api-portal-projects-members-route.test.ts for
 * auth mocking, but `db.select()` here does REAL predicate evaluation over
 * small in-memory tables (using the same fake eq/and shape) rather than an
 * unconditional queue — a queue that ignores `.where()` entirely can't prove
 * the service's tenant-scoped project lookup (`and(eq(id), eq(clientId))`)
 * actually filters by clientId, which is the property PUX-033 step 2 exists
 * to guarantee. `@/lib/mcp/approval-links` is mocked outright (pure minting
 * side-effect, exercised elsewhere) so this file doesn't also need to model
 * mcp_approval_links.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertMockUsed } from '../helpers/assertMockUsed';

// ---- mocks (must be declared BEFORE importing the route/service) ----

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const createApprovalLinkMock = vi.fn();
vi.mock('@/lib/mcp/approval-links', () => ({
  createApprovalLink: (...args: unknown[]) => createApprovalLinkMock(...args),
  approvalEnvelope: (link: { approvalUrl: string; previewUrl: string; approvalToken: string; expiresAt: Date | null } | null) =>
    link
      ? {
          url: link.approvalUrl,
          previewUrl: link.previewUrl,
          token: link.approvalToken,
          status: 'pending',
          expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
        }
      : null,
}));

// drizzle-orm operators — eq/and build an inspectable predicate tree (needed
// so the fake db below can actually filter by it; a passthrough like the
// members-route test uses would make the tenancy negative-check meaningless).
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
}));

// schema proxy — column access returns { __col, __table } so eq() predicates
// can be evaluated against a plain row object by column name.
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
  const tables = {
    projects: wrap('projects'),
    kanbanCards: wrap('kanbanCards'),
    kanbanColumns: wrap('kanbanColumns'),
    surveys: wrap('surveys'),
    projectArtifacts: wrap('projectArtifacts'),
    kanbanCardArtifacts: wrap('kanbanCardArtifacts'),
    clients: wrap('clients'),
  };
  return new Proxy(tables, {
    has: (t, p) => p in t || typeof p === 'string',
    get: (t, p) =>
      p in t
        ? t[p as keyof typeof t]
        : p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'
          ? undefined
          : wrap(p as string),
  });
});

// ---- fake db ----

type Row = Record<string, unknown>;
type Pred = { op: 'eq'; a: { __col: string }; b: unknown } | { op: 'and'; args: Pred[] };

function evalPred(row: Row, pred: Pred | undefined): boolean {
  if (!pred) return true;
  if (pred.op === 'eq') return row[pred.a.__col] === pred.b;
  if (pred.op === 'and') return pred.args.every((p) => evalPred(row, p));
  return true;
}

let dbData: {
  projects: Row[];
  clients: Row[];
  // Pre-joined view standing in for kanbanCards INNER JOIN kanbanColumns —
  // already shaped exactly like the service's select projection.
  kanbanCardsView: Row[];
} = { projects: [], clients: [], kanbanCardsView: [] };

interface InsertCall {
  table: string;
  values: unknown;
}
let insertReturnQueue: Array<Row[]> = [];
const insertCalls: InsertCall[] = [];

function buildSelect() {
  let table: string | undefined;
  let joinedCards = false;
  let filter: Pred | undefined;

  function materialize(): Row[] {
    const rows = joinedCards ? dbData.kanbanCardsView : (dbData[table as keyof typeof dbData] as Row[] | undefined) ?? [];
    return rows.filter((r) => evalPred(r, filter));
  }

  function chainable() {
    return {
      limit(n: number) {
        const rows = materialize().slice(0, n);
        return { then: (onF: (v: Row[]) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(rows).then(onF, onR) };
      },
      then(onF: (v: Row[]) => unknown, onR?: (e: unknown) => unknown) {
        return Promise.resolve(materialize()).then(onF, onR);
      },
    };
  }

  const api = {
    from(t: { __table: string }) {
      table = t.__table;
      return api;
    },
    innerJoin(t: { __table: string }) {
      if (table === 'kanbanCards' && t.__table === 'kanbanColumns') joinedCards = true;
      return api;
    },
    where(f: Pred) {
      filter = f;
      return chainable();
    },
  };
  return api;
}

function buildInsert(table: { __table: string }) {
  return {
    values(v: unknown) {
      const rows = insertReturnQueue.shift() ?? [];
      insertCalls.push({ table: table.__table, values: v });
      const cloned = rows.map((r) => ({ ...r }));
      return {
        returning() {
          return Promise.resolve(cloned);
        },
        then(onF: (v: Row[]) => unknown, onR?: (e: unknown) => unknown) {
          return Promise.resolve(cloned).then(onF, onR);
        },
      };
    },
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => buildSelect(),
    insert: (table: { __table: string }) => buildInsert(table),
  },
}));

// Passthrough-by-default wrapper around the real service, so most tests
// exercise the actual implementation (against the fake db above) while one
// test can override it for exactly one call — that's what lets the ROUTE
// test suite honestly cover "service said not_found -> route returns 404"
// without the route itself being able to naturally produce that mismatch
// (see the describe block below for why).
type GenerateFn = typeof import('@/lib/projects/generate-survey-service').generateProjectSurvey;
let serviceOverrideOnce: GenerateFn | null = null;
vi.mock('@/lib/projects/generate-survey-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/projects/generate-survey-service')>();
  return {
    ...actual,
    generateProjectSurvey: ((args: Parameters<GenerateFn>[0]) => {
      if (serviceOverrideOnce) {
        const fn = serviceOverrideOnce;
        serviceOverrideOnce = null;
        return fn(args);
      }
      return actual.generateProjectSurvey(args);
    }) as GenerateFn,
  };
});

// ---- module under test (imported AFTER mocks) ----

const { POST } = await import('@/app/api/portal/projects/[id]/surveys/generate/route');
const { generateProjectSurvey } = await import('@/lib/projects/generate-survey-service');

// ---- helpers / fixtures ----

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function makeRequest(body: unknown): Request {
  return new Request('http://x/api/portal/projects/1/surveys/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const CLIENT_SESSION = { user: { id: '7', role: 'client' } };
const STAFF_SESSION = { user: { id: '1', role: 'admin' } };

const TEST_CLIENT_ID = 33;
const OTHER_CLIENT_ID = 99;
const PROJECT_ID = 1;

const PROJECT_ROW = { id: PROJECT_ID, name: 'Retro Project', description: 'desc', dueDate: null, clientId: TEST_CLIENT_ID };
const CLIENT_ROW = { id: TEST_CLIENT_ID, company: 'Acme' };

const APPROVAL_LINK = {
  approvalLinkId: 1,
  approvalToken: 'tok123',
  approvalUrl: 'https://simplerdevelopment.com/approve/tok123',
  previewUrl: 'https://simplerdevelopment.com/approve/tok123',
  expiresAt: null,
};

beforeEach(() => {
  dbData = { projects: [PROJECT_ROW], clients: [CLIENT_ROW], kanbanCardsView: [] };
  insertReturnQueue = [];
  insertCalls.length = 0;
  authMock.mockReset();
  getPortalClientMock.mockReset();
  createApprovalLinkMock.mockReset();
  createApprovalLinkMock.mockResolvedValue(APPROVAL_LINK);
  serviceOverrideOnce = null;
});

// ---------------------------------------------------------------------------
// POST /api/portal/projects/[id]/surveys/generate
// ---------------------------------------------------------------------------

describe('POST /api/portal/projects/[id]/surveys/generate', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ preset: 'retro' }), makeParams('1'));
    expect(res.status).toBe(401);
    assertMockUsed(authMock, 'auth');
  });

  it('returns 400 for an invalid preset', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_ROW);
    const res = await POST(makeRequest({ preset: 'not_a_real_preset' }), makeParams('1'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 404 when the project belongs to a different client (tenancy)', async () => {
    // The route (mirroring the sibling artifacts route) always derives
    // clientId straight from the project row it just read, so it can never
    // itself hand the service a mismatched clientId — a non-staff caller
    // whose own client differs gets 403 from the route's OWN check before
    // the service ever runs (see the artifacts route this mirrors), and
    // staff derive clientId from the same row the service would look up.
    // What this test proves is the other half of the contract: when the
    // service reports `not_found` (because, from any call site, the project
    // didn't belong to that clientId), the route maps it to 404 — not a 200,
    // not a leak. The service's OWN tenant-scoped lookup that produces that
    // not_found is proven directly below (`generateProjectSurvey tenancy`),
    // which is also where the required negative check was run.
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_ROW);
    serviceOverrideOnce = async () => ({ ok: false, reason: 'not_found' });
    const res = await POST(makeRequest({ preset: 'retro' }), makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 200 with the envelope shape and one surveys insert + one artifact insert for retro', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_ROW);
    insertReturnQueue.push([{ id: 501, clientId: TEST_CLIENT_ID, title: 'Retro — Retro Project', slug: 'retro-retro-project-abc', status: 'draft' }]);
    insertReturnQueue.push([{ id: 900, projectId: PROJECT_ID, artifactType: 'survey', artifactId: 501, displayTitle: 'Retro — Retro Project', pinned: false, createdBy: 7 }]);

    const res = await POST(makeRequest({ preset: 'retro' }), makeParams('1'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.survey).toEqual({ id: 501, slug: 'retro-retro-project-abc', title: 'Retro — Retro Project', status: 'draft' });
    expect(body.data.approvalUrl).toBe(APPROVAL_LINK.approvalUrl);
    expect(body.data.publicPath).toBe('/s/retro-retro-project-abc');
    expect(body.data.artifactId).toBe(900);
    expect(body.data.reviewedCardIds).toEqual([]);

    expect(insertCalls).toHaveLength(2);
    expect(insertCalls[0].table).toBe('surveys');
    expect((insertCalls[0].values as Record<string, unknown>).clientId).toBe(TEST_CLIENT_ID);
    expect(insertCalls[1].table).toBe('projectArtifacts');
    expect((insertCalls[1].values as Record<string, unknown>).artifactType).toBe('survey');

    // Synthetic PortalMcpContext shape — see generate-survey-service.ts header comment.
    expect(createApprovalLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'survey',
        entityId: 501,
        ctx: expect.objectContaining({ client: CLIENT_ROW, userId: 7, keyId: null, credentialKind: null, requireCmsApproval: false }),
      }),
    );
    assertMockUsed(authMock, 'auth');
  });

  it('qa_review on a project with two Validating cards yields reviewedCardIds of length 2', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_ROW);
    dbData.kanbanCardsView = [
      { id: 10, title: 'Card A', columnName: 'Validating', isDone: false, workflowState: 'in_review', projectId: PROJECT_ID },
      { id: 11, title: 'Card B', columnName: 'Approved', isDone: false, workflowState: 'in_review', projectId: PROJECT_ID },
      { id: 12, title: 'Card C (done, not reviewable)', columnName: 'Done', isDone: true, workflowState: 'done', projectId: PROJECT_ID },
    ];
    insertReturnQueue.push([{ id: 502, clientId: TEST_CLIENT_ID, title: 'QA review — Retro Project', slug: 'qa-review-retro-project-abc', status: 'draft' }]);
    insertReturnQueue.push([{ id: 901, projectId: PROJECT_ID, artifactType: 'survey', artifactId: 502, displayTitle: 'QA review — Retro Project', pinned: false, createdBy: 7 }]);
    insertReturnQueue.push([]); // kanbanCardArtifacts bulk insert — return value unused

    const res = await POST(makeRequest({ preset: 'qa_review' }), makeParams('1'));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.reviewedCardIds).toEqual([10, 11]);

    expect(insertCalls).toHaveLength(3);
    expect(insertCalls[2].table).toBe('kanbanCardArtifacts');
    expect(insertCalls[2].values).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// generateProjectSurvey — tenancy (service layer, exercised directly)
//
// The route always derives `clientId` from the project row it just read
// (matching the sibling artifacts route's auth pattern), so it can never
// itself hand the service a mismatched clientId — see the "different
// client" route test above. That makes this direct call the one that
// actually proves the service's OWN tenant-scoped lookup
// (`and(eq(projects.id, projectId), eq(projects.clientId, clientId))`) is
// what stands between a caller and another tenant's project.
// ---------------------------------------------------------------------------

describe('generateProjectSurvey tenancy', () => {
  it('returns { ok: false, reason: "not_found" } when the project belongs to a different client', async () => {
    // dbData.projects[0].clientId === TEST_CLIENT_ID (33); ask on behalf of
    // OTHER_CLIENT_ID (99) instead.
    const result = await generateProjectSurvey({
      clientId: OTHER_CLIENT_ID,
      projectId: PROJECT_ID,
      preset: 'retro',
      createdByUserId: 7,
    });
    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('finds the project when clientId matches (sanity — same setup, correct tenant)', async () => {
    insertReturnQueue.push([{ id: 503, clientId: TEST_CLIENT_ID, title: 'Retro — Retro Project', slug: 'retro-x', status: 'draft' }]);
    insertReturnQueue.push([{ id: 902, projectId: PROJECT_ID, artifactType: 'survey', artifactId: 503, displayTitle: 'Retro — Retro Project', pinned: false, createdBy: 7 }]);
    const result = await generateProjectSurvey({
      clientId: TEST_CLIENT_ID,
      projectId: PROJECT_ID,
      preset: 'retro',
      createdByUserId: 7,
    });
    expect(result.ok).toBe(true);
  });
});
