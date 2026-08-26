// @vitest-environment node
/**
 * Unit tests for app/api/portal/projects/dashboard/route.ts (GET) and, by
 * extension, the underlying service (lib/projects/dashboard-aggregate.ts).
 *
 * Strategy: mirrors tests/unit/api-portal-projects-generate-survey-route.test.ts
 * — `db.select()` does REAL predicate evaluation (eq/inArray) over small
 * in-memory tables rather than an unconditional queue, because a queue that
 * ignores `.where()` can't prove the service's tenant-scoped queries
 * (`eq(projects.clientId, clientId)`, then every downstream table scoped via
 * `inArray(..., projectIds/cardIds)`) actually filter by tenant — which is
 * the property the REQUIRED negative check exists to guarantee. The 200 test
 * seeds rows for TWO clients and asserts client B's rows never appear in
 * client A's response — that's the tenancy assertion, exercised through the
 * real route + real service, no service-level mocking needed since this
 * route has no branch (like the survey-generate route's 404) that the route
 * itself can't naturally produce.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assertMockUsed } from '../helpers/assertMockUsed';

// ---- mocks (must be declared BEFORE importing the route) ----

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

// drizzle-orm operators used by lib/projects/dashboard-aggregate.ts — build an
// inspectable predicate tree so the fake db below can actually filter by it.
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  inArray: (a: unknown, b: unknown[]) => ({ op: 'inArray', a, b }),
}));

// schema proxy — column access returns { __col, __table } so predicates can
// be evaluated against plain row objects by column name.
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
    kanbanColumns: wrap('kanbanColumns'),
    kanbanCards: wrap('kanbanCards'),
    kanbanCardDependencies: wrap('kanbanCardDependencies'),
    kanbanCardActivities: wrap('kanbanCardActivities'),
    kanbanCardAssignees: wrap('kanbanCardAssignees'),
    sprints: wrap('sprints'),
    users: wrap('users'),
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
type Pred =
  | { op: 'eq'; a: { __col: string }; b: unknown }
  | { op: 'inArray'; a: { __col: string }; b: unknown[] };

function evalPred(row: Row, pred: Pred | undefined): boolean {
  if (!pred) return true;
  if (pred.op === 'eq') return row[pred.a.__col] === pred.b;
  if (pred.op === 'inArray') return Array.isArray(pred.b) && pred.b.includes(row[pred.a.__col]);
  return true;
}

let dbData: {
  projects: Row[];
  kanbanColumns: Row[];
  kanbanCards: Row[];
  kanbanCardDependencies: Row[];
  kanbanCardActivities: Row[];
  kanbanCardAssignees: Row[];
  sprints: Row[];
  users: Row[];
} = {
  projects: [], kanbanColumns: [], kanbanCards: [], kanbanCardDependencies: [],
  kanbanCardActivities: [], kanbanCardAssignees: [], sprints: [], users: [],
};

function buildSelect() {
  let table: string | undefined;
  let filter: Pred | undefined;

  function materialize(): Row[] {
    const rows = (dbData[table as keyof typeof dbData] as Row[] | undefined) ?? [];
    return rows.filter((r) => evalPred(r, filter));
  }

  const api = {
    from(t: { __table: string }) {
      table = t.__table;
      return api;
    },
    where(f: Pred) {
      filter = f;
      return {
        then: (onF: (v: Row[]) => unknown, onR?: (e: unknown) => unknown) => Promise.resolve(materialize()).then(onF, onR),
      };
    },
    // Deliberately awaitable even with no .where() — an unscoped
    // `db.select(...).from(table)` is exactly what a dropped tenant filter
    // looks like, and the negative check below needs the fake db to still
    // resolve (with every row, unfiltered) rather than hang.
    then(onF: (v: Row[]) => unknown, onR?: (e: unknown) => unknown) {
      return Promise.resolve(materialize()).then(onF, onR);
    },
  };
  return api;
}

vi.mock('@/lib/db', () => ({
  db: { select: () => buildSelect() },
}));

// ---- module under test (imported AFTER mocks) ----

const { GET } = await import('@/app/api/portal/projects/dashboard/route');

// ---- helpers / fixtures ----

async function makeRequest(url: string) {
  const { NextRequest } = await import('next/server');
  return new NextRequest(url);
}

const CLIENT_SESSION = { user: { id: '7', role: 'client' } };

const CLIENT_A_ID = 33;
const CLIENT_B_ID = 99;
const CLIENT_A_ROW = { id: CLIENT_A_ID, company: 'Acme' };

const NOW_ISO_DAY = '2026-08-25';

beforeEach(() => {
  dbData = {
    projects: [], kanbanColumns: [], kanbanCards: [], kanbanCardDependencies: [],
    kanbanCardActivities: [], kanbanCardAssignees: [], sprints: [], users: [],
  };
  authMock.mockReset();
  getPortalClientMock.mockReset();
});

describe('GET /api/portal/projects/dashboard', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET(await makeRequest('http://x/api/portal/projects/dashboard'));
    expect(res.status).toBe(401);
    assertMockUsed(authMock, 'auth');
  });

  it('returns 404 when the caller has no portal client', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(null);
    const res = await GET(await makeRequest('http://x/api/portal/projects/dashboard'));
    expect(res.status).toBe(404);
  });

  it('returns 400 for a non-numeric staleAfterDays', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_A_ROW);
    const res = await GET(await makeRequest('http://x/api/portal/projects/dashboard?staleAfterDays=abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 400 for an out-of-range limit', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_A_ROW);
    const res = await GET(await makeRequest('http://x/api/portal/projects/dashboard?limit=0'));
    expect(res.status).toBe(400);
  });

  it('returns 400 for a limit above the 200 cap', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_A_ROW);
    const res = await GET(await makeRequest('http://x/api/portal/projects/dashboard?limit=201'));
    expect(res.status).toBe(400);
  });

  it('returns the {success,data} envelope with every dashboard section present', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_A_ROW);
    dbData.projects = [{ id: 1, name: 'Alpha', clientId: CLIENT_A_ID, dueDate: null }];
    dbData.kanbanColumns = [{ id: 1, projectId: 1, name: 'To Do', isDone: false, wipLimit: null }];
    dbData.kanbanCards = [{ id: 1, projectId: 1, columnId: 1, title: 'Card 1', dueDate: null, storyPoints: null, sprintId: null, workflowState: 'todo', updatedAt: new Date(`${NOW_ISO_DAY}T00:00:00.000Z`) }];

    const res = await GET(await makeRequest('http://x/api/portal/projects/dashboard'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('attention');
    expect(body.data).toHaveProperty('health');
    expect(body.data).toHaveProperty('activity');
    expect(body.data).toHaveProperty('workload');
    expect(body.data).toHaveProperty('milestones');
    expect(body.data.attention).toHaveProperty('blocked');
    expect(body.data.attention).toHaveProperty('overdue');
    expect(body.data.attention).toHaveProperty('dueThisWeek');
    expect(body.data.attention).toHaveProperty('wipBreaches');
    expect(body.data.attention).toHaveProperty('stale');
    expect(body.data.attention).toHaveProperty('validating');
    expect(body.data.health).toEqual([
      expect.objectContaining({ projectId: 1, name: 'Alpha', totalCards: 1 }),
    ]);
    assertMockUsed(authMock, 'auth');
  });

  // -------------------------------------------------------------------------
  // TENANCY (the required negative check — see below)
  // -------------------------------------------------------------------------
  it('rows seeded for another client never appear in any list', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    getPortalClientMock.mockResolvedValue(CLIENT_A_ROW);

    const now = new Date(`${NOW_ISO_DAY}T12:00:00.000Z`);
    const overdue = new Date('2026-08-01T00:00:00.000Z');

    dbData.projects = [
      { id: 1, name: 'Alpha (client A)', clientId: CLIENT_A_ID, dueDate: null },
      { id: 2, name: 'Bravo (client B)', clientId: CLIENT_B_ID, dueDate: null },
    ];
    dbData.kanbanColumns = [
      { id: 1, projectId: 1, name: 'To Do', isDone: false, wipLimit: 1 },
      { id: 2, projectId: 2, name: 'To Do', isDone: false, wipLimit: 1 },
    ];
    dbData.kanbanCards = [
      // Client A: one overdue, one stale, two in a WIP-1 column (breach), one Validating.
      { id: 1, projectId: 1, columnId: 1, title: 'A overdue', dueDate: overdue, storyPoints: null, sprintId: null, workflowState: 'todo', updatedAt: now },
      { id: 2, projectId: 1, columnId: 1, title: 'A wip-2', dueDate: null, storyPoints: null, sprintId: null, workflowState: 'todo', updatedAt: now },
      // Client B: same shapes, to prove they never leak into client A's response.
      { id: 10, projectId: 2, columnId: 2, title: 'B overdue', dueDate: overdue, storyPoints: null, sprintId: null, workflowState: 'todo', updatedAt: now },
      { id: 11, projectId: 2, columnId: 2, title: 'B wip-2', dueDate: null, storyPoints: null, sprintId: null, workflowState: 'todo', updatedAt: now },
    ];
    dbData.kanbanCardAssignees = [
      { cardId: 1, userId: 100 }, // client A
      { cardId: 10, userId: 200 }, // client B
    ];
    dbData.users = [
      { id: 100, name: 'Alice (A)' },
      { id: 200, name: 'Bob (B)' },
    ];
    dbData.kanbanCardActivities = [
      { id: 1, cardId: 1, type: 'created', actorId: 100, createdAt: now },
      { id: 2, cardId: 10, type: 'created', actorId: 200, createdAt: now },
    ];

    const res = await GET(await makeRequest('http://x/api/portal/projects/dashboard'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const data = body.data;

    // Positive: client A's data is present.
    expect(data.attention.overdue.map((c: { cardId: number }) => c.cardId)).toEqual([1]);
    expect(data.attention.wipBreaches).toEqual([
      expect.objectContaining({ projectId: 1, columnId: 1, wipLimit: 1, count: 2 }),
    ]);
    expect(data.health.map((h: { projectId: number }) => h.projectId)).toEqual([1]);
    expect(data.workload.map((w: { userId: number }) => w.userId)).toEqual([100]);
    expect(data.activity.map((a: { cardId: number }) => a.cardId)).toEqual([1]);

    // Negative: nothing from client B (project 2 / cards 10,11 / user 200) leaks in.
    const allProjectIds = new Set<number>([
      ...data.health.map((h: { projectId: number }) => h.projectId),
      ...Object.values(data.attention).flatMap((bucket) =>
        Array.isArray(bucket) ? bucket.map((x: { projectId?: number }) => x.projectId).filter((v): v is number => v != null) : [],
      ),
      ...data.activity.map((a: { projectId: number }) => a.projectId),
    ]);
    expect(allProjectIds.has(2)).toBe(false);
    const allCardIds = new Set<number>([
      ...Object.values(data.attention).flatMap((bucket) =>
        Array.isArray(bucket) ? bucket.map((x: { cardId?: number }) => x.cardId).filter((v): v is number => v != null) : [],
      ),
      ...data.activity.map((a: { cardId: number }) => a.cardId),
    ]);
    expect(allCardIds.has(10)).toBe(false);
    expect(allCardIds.has(11)).toBe(false);
    expect(data.workload.some((w: { userId: number }) => w.userId === 200)).toBe(false);
  });
});
