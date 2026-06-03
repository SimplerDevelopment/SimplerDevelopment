// @vitest-environment node
/**
 * Unit tests for four small API routes (batch 25c):
 *   - app/api/admin/portal/tickets/route.ts             (GET, PATCH)
 *   - app/api/admin/portal/subscriptions/route.ts       (GET, POST)
 *   - app/api/admin/portal/suggested-projects/route.ts  (GET, POST)
 *   - app/api/admin/portal/projects/route.ts            (GET, POST)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Shared mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  or: (...args: unknown[]) => ({ op: 'or', args }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  gte: (a: unknown, b: unknown) => ({ op: 'gte', a, b }),
  lte: (a: unknown, b: unknown) => ({ op: 'lte', a, b }),
  count: () => ({ op: 'count' }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    op: 'sql',
    strings: Array.from(strings),
    values,
  }),
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
    supportTickets: wrap('supportTickets'),
    clientServices: wrap('clientServices'),
    services: wrap('services'),
    suggestedProjects: wrap('suggestedProjects'),
    projects: wrap('projects'),
    kanbanColumns: wrap('kanbanColumns'),
    clients: wrap('clients'),
    users: wrap('users'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock: select queue + insert/update with returning
// ---------------------------------------------------------------------------

interface InsertCall {
  table: string;
  values: unknown;
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
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftNext());
      return materializedPromise;
    };

    const chain: Record<string, unknown> = {};
    const passthrough = () => chain;
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'groupBy']) {
      chain[m] = passthrough;
    }
    chain.orderBy = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
        limit() {
          return {
            then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
              return materializedPromise!.then(onF, onR);
            },
          };
        },
      };
    };
    chain.limit = () => {
      materialize();
      return {
        then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
          return materializedPromise!.then(onF, onR);
        },
      };
    };
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(v: Record<string, unknown> | Record<string, unknown>[]) {
        insertCalls.push({ table: table.__table, values: v });
        const rows = insertReturnQueue.shift() ?? [];
        const cloned = () => rows.map((r) => ({ ...r }));
        return {
          returning(_proj?: unknown) {
            return Promise.resolve(cloned());
          },
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(cloned()).then(onF, onR);
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
              returning(_proj?: unknown) {
                // Return the queued insertReturnQueue row (reused as the update echo).
                const rows = insertReturnQueue.shift() ?? [];
                return Promise.resolve(rows.map((r) => ({ ...r })));
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

// ---- modules under test ----
const ticketsRoute = await import('@/app/api/admin/portal/tickets/route');
const subscriptionsRoute = await import('@/app/api/admin/portal/subscriptions/route');
const suggestedProjectsRoute = await import('@/app/api/admin/portal/suggested-projects/route');
const projectsRoute = await import('@/app/api/admin/portal/projects/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

const ADMIN_SESSION = { user: { id: '1', name: 'Admin', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '2', name: 'Emp', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '3', name: 'Cli', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  insertReturnQueue = [];
  insertCalls.length = 0;
  updateCalls.length = 0;
  authMock.mockReset();
});

// =====================================================================
// /api/admin/portal/tickets
// =====================================================================
describe('GET /api/admin/portal/tickets', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await ticketsRoute.GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await ticketsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 200 with ticket list for admin', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        number: 'T-001',
        subject: 'Login issue',
        status: 'open',
        priority: 'high',
        category: 'bug',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-02T00:00:00Z'),
        company: 'Acme',
        clientName: 'Alice',
      },
    ]);
    const res = await ticketsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].number).toBe('T-001');
  });

  it('returns 200 with empty data for employee when none found', async () => {
    authMock.mockResolvedValueOnce(EMPLOYEE_SESSION);
    selectQueue.push([]);
    const res = await ticketsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});

describe('PATCH /api/admin/portal/tickets', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await ticketsRoute.PATCH(
      makeReq('http://x/api/admin/portal/tickets', {
        method: 'PATCH',
        body: JSON.stringify({ id: 1, status: 'open' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await ticketsRoute.PATCH(
      makeReq('http://x/api/admin/portal/tickets', {
        method: 'PATCH',
        body: JSON.stringify({ id: 1, status: 'open' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('updates status, assignedTo, priority and sets resolvedAt when status=resolved', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    insertReturnQueue.push([
      { id: 7, status: 'resolved', assignedTo: 4, priority: 'low' },
    ]);
    const res = await ticketsRoute.PATCH(
      makeReq('http://x/api/admin/portal/tickets', {
        method: 'PATCH',
        body: JSON.stringify({ id: 7, status: 'resolved', assignedTo: 4, priority: 'low' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].table).toBe('supportTickets');
    const patch = updateCalls[0].patch as Record<string, unknown>;
    expect(patch.status).toBe('resolved');
    expect(patch.assignedTo).toBe(4);
    expect(patch.priority).toBe('low');
    expect(patch.resolvedAt).toBeInstanceOf(Date);
    expect(patch.updatedAt).toBeInstanceOf(Date);
    const body = await res.json();
    expect(body.data.id).toBe(7);
  });

  it('omits resolvedAt when status is not resolved and allows unsetting assignedTo with null', async () => {
    authMock.mockResolvedValueOnce(EMPLOYEE_SESSION);
    insertReturnQueue.push([{ id: 8, status: 'open', assignedTo: null }]);
    const res = await ticketsRoute.PATCH(
      makeReq('http://x/api/admin/portal/tickets', {
        method: 'PATCH',
        body: JSON.stringify({ id: 8, status: 'open', assignedTo: null }),
      }),
    );
    expect(res.status).toBe(200);
    expect(updateCalls).toHaveLength(1);
    const patch = updateCalls[0].patch as Record<string, unknown>;
    expect(patch.status).toBe('open');
    expect(patch).not.toHaveProperty('resolvedAt');
    expect(patch.assignedTo).toBeNull();
    expect(patch).not.toHaveProperty('priority');
  });
});

// =====================================================================
// /api/admin/portal/subscriptions
// =====================================================================
describe('GET /api/admin/portal/subscriptions', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await subscriptionsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await subscriptionsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns subscription list for admin', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 10,
        clientName: 'Alice',
        company: 'Acme',
        serviceName: 'Hosting',
        serviceCategory: 'infra',
        price: 99,
        billingCycle: 'monthly',
        status: 'active',
        renewalDate: new Date('2026-06-01T00:00:00Z'),
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const res = await subscriptionsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].serviceName).toBe('Hosting');
  });
});

describe('POST /api/admin/portal/subscriptions', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await subscriptionsRoute.POST(
      makeReq('http://x/api/admin/portal/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ clientId: 1, serviceId: 2 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await subscriptionsRoute.POST(
      makeReq('http://x/api/admin/portal/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ clientId: 1, serviceId: 2 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when clientId missing', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    const res = await subscriptionsRoute.POST(
      makeReq('http://x/api/admin/portal/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ serviceId: 2 }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/required/i);
  });

  it('returns 400 when serviceId missing', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    const res = await subscriptionsRoute.POST(
      makeReq('http://x/api/admin/portal/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ clientId: 1 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('inserts and returns 201 on success', async () => {
    authMock.mockResolvedValueOnce(EMPLOYEE_SESSION);
    insertReturnQueue.push([{ id: 55, clientId: 1, serviceId: 2, status: 'active' }]);
    const res = await subscriptionsRoute.POST(
      makeReq('http://x/api/admin/portal/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ clientId: 1, serviceId: 2 }),
      }),
    );
    expect(res.status).toBe(201);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('clientServices');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.clientId).toBe(1);
    expect(inserted.serviceId).toBe(2);
    expect(inserted.status).toBe('active');
    const body = await res.json();
    expect(body.data.id).toBe(55);
  });
});

// =====================================================================
// /api/admin/portal/suggested-projects
// =====================================================================
describe('GET /api/admin/portal/suggested-projects', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await suggestedProjectsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await suggestedProjectsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns list of suggested projects for admin', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        title: 'Redesign site',
        description: 'Marketing redesign',
        category: 'design',
        estimatedPrice: 5000,
        estimatedTimeline: '4 weeks',
        features: ['hero', 'cta'],
        icon: 'palette',
        active: true,
        clientId: null,
        order: 0,
        createdAt: new Date('2026-02-01T00:00:00Z'),
        clientCompany: null,
        clientName: null,
      },
    ]);
    const res = await suggestedProjectsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].title).toBe('Redesign site');
  });
});

describe('POST /api/admin/portal/suggested-projects', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await suggestedProjectsRoute.POST(
      makeReq('http://x/api/admin/portal/suggested-projects', {
        method: 'POST',
        body: JSON.stringify({ title: 'X' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await suggestedProjectsRoute.POST(
      makeReq('http://x/api/admin/portal/suggested-projects', {
        method: 'POST',
        body: JSON.stringify({ title: 'X' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when title missing', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    const res = await suggestedProjectsRoute.POST(
      makeReq('http://x/api/admin/portal/suggested-projects', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/title/i);
  });

  it('inserts with defaults when only title provided', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    insertReturnQueue.push([{ id: 9, title: 'Quick Idea' }]);
    const res = await suggestedProjectsRoute.POST(
      makeReq('http://x/api/admin/portal/suggested-projects', {
        method: 'POST',
        body: JSON.stringify({ title: 'Quick Idea' }),
      }),
    );
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].table).toBe('suggestedProjects');
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.title).toBe('Quick Idea');
    expect(inserted.description).toBeNull();
    expect(inserted.category).toBe('development');
    expect(inserted.estimatedPrice).toBeNull();
    expect(inserted.features).toEqual([]);
    expect(inserted.icon).toBe('rocket_launch');
    expect(inserted.active).toBe(true);
    expect(inserted.clientId).toBeNull();
    expect(inserted.order).toBe(0);
    expect(inserted.surveyFields).toEqual([]);
    expect(inserted.createdBy).toBe(1);
    const body = await res.json();
    expect(body.data.id).toBe(9);
  });

  it('passes through all provided fields, including createdBy from session', async () => {
    authMock.mockResolvedValueOnce(EMPLOYEE_SESSION);
    insertReturnQueue.push([{ id: 11 }]);
    const res = await suggestedProjectsRoute.POST(
      makeReq('http://x/api/admin/portal/suggested-projects', {
        method: 'POST',
        body: JSON.stringify({
          title: 'Big project',
          description: 'desc',
          category: 'design',
          estimatedPrice: 9000,
          estimatedTimeline: '8 weeks',
          features: ['a', 'b'],
          icon: 'star',
          active: false,
          clientId: 42,
          order: 3,
          surveyFields: [{ key: 'budget' }],
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(insertCalls).toHaveLength(1);
    const inserted = insertCalls[0].values as Record<string, unknown>;
    expect(inserted.description).toBe('desc');
    expect(inserted.category).toBe('design');
    expect(inserted.estimatedPrice).toBe(9000);
    expect(inserted.estimatedTimeline).toBe('8 weeks');
    expect(inserted.features).toEqual(['a', 'b']);
    expect(inserted.icon).toBe('star');
    expect(inserted.active).toBe(false);
    expect(inserted.clientId).toBe(42);
    expect(inserted.order).toBe(3);
    expect(inserted.surveyFields).toEqual([{ key: 'budget' }]);
    expect(inserted.createdBy).toBe(2);
  });
});

// =====================================================================
// /api/admin/portal/projects
// =====================================================================
describe('GET /api/admin/portal/projects', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await projectsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await projectsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns projects list for admin', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 30,
        name: 'Website launch',
        description: 'phase 1',
        status: 'active',
        startDate: new Date('2026-03-01T00:00:00Z'),
        dueDate: new Date('2026-04-01T00:00:00Z'),
        createdAt: new Date('2026-02-01T00:00:00Z'),
        clientId: 1,
        company: 'Acme',
        clientName: 'Alice',
      },
    ]);
    const res = await projectsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe('Website launch');
  });
});

describe('POST /api/admin/portal/projects', () => {
  it('returns 401 when no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await projectsRoute.POST(
      makeReq('http://x/api/admin/portal/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'X', clientId: 1 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for client role', async () => {
    authMock.mockResolvedValueOnce(CLIENT_SESSION);
    const res = await projectsRoute.POST(
      makeReq('http://x/api/admin/portal/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'X', clientId: 1 }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 400 when name missing', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    const res = await projectsRoute.POST(
      makeReq('http://x/api/admin/portal/projects', {
        method: 'POST',
        body: JSON.stringify({ clientId: 1 }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/required/i);
  });

  it('returns 400 when clientId missing', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    const res = await projectsRoute.POST(
      makeReq('http://x/api/admin/portal/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Website' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('inserts project + creates 4 default kanban columns', async () => {
    authMock.mockResolvedValueOnce(ADMIN_SESSION);
    insertReturnQueue.push([{ id: 77, name: 'Website', clientId: 5 }]);
    // 4 kanban column inserts return empty
    insertReturnQueue.push([]);
    insertReturnQueue.push([]);
    insertReturnQueue.push([]);
    insertReturnQueue.push([]);
    const res = await projectsRoute.POST(
      makeReq('http://x/api/admin/portal/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'Website', clientId: 5 }),
      }),
    );
    expect(res.status).toBe(200);
    // 1 project insert + 4 kanban column inserts
    expect(insertCalls).toHaveLength(5);
    expect(insertCalls[0].table).toBe('projects');
    const projectInsert = insertCalls[0].values as Record<string, unknown>;
    expect(projectInsert.name).toBe('Website');
    expect(projectInsert.clientId).toBe(5);
    expect(projectInsert.status).toBe('active');
    expect(projectInsert.description).toBeNull();
    expect(projectInsert.startDate).toBeNull();
    expect(projectInsert.dueDate).toBeNull();
    expect(projectInsert.createdBy).toBe(1);

    const kanbanInserts = insertCalls.slice(1);
    expect(kanbanInserts.every((c) => c.table === 'kanbanColumns')).toBe(true);
    const kanbanNames = kanbanInserts.map(
      (c) => (c.values as Record<string, unknown>).name as string,
    );
    expect(kanbanNames).toEqual(['To Do', 'In Progress', 'Review', 'Done']);
    const kanbanProjects = kanbanInserts.map(
      (c) => (c.values as Record<string, unknown>).projectId as number,
    );
    expect(kanbanProjects.every((id) => id === 77)).toBe(true);
    const kanbanOrders = kanbanInserts.map(
      (c) => (c.values as Record<string, unknown>).order as number,
    );
    expect(kanbanOrders).toEqual([0, 1, 2, 3]);

    const body = await res.json();
    expect(body.data.id).toBe(77);
  });

  it('parses startDate and dueDate into Date instances and applies provided status', async () => {
    authMock.mockResolvedValueOnce(EMPLOYEE_SESSION);
    insertReturnQueue.push([{ id: 78 }]);
    insertReturnQueue.push([]);
    insertReturnQueue.push([]);
    insertReturnQueue.push([]);
    insertReturnQueue.push([]);
    const res = await projectsRoute.POST(
      makeReq('http://x/api/admin/portal/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Phase 2',
          clientId: 9,
          description: 'phase 2 desc',
          status: 'paused',
          startDate: '2026-05-01T00:00:00Z',
          dueDate: '2026-07-01T00:00:00Z',
        }),
      }),
    );
    expect(res.status).toBe(200);
    const projectInsert = insertCalls[0].values as Record<string, unknown>;
    expect(projectInsert.description).toBe('phase 2 desc');
    expect(projectInsert.status).toBe('paused');
    expect(projectInsert.startDate).toBeInstanceOf(Date);
    expect(projectInsert.dueDate).toBeInstanceOf(Date);
    expect((projectInsert.startDate as Date).toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect((projectInsert.dueDate as Date).toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(projectInsert.createdBy).toBe(2);
  });
});
