// @vitest-environment node
/**
 * Unit tests for four admin portal API routes (batch 26h):
 *   - app/api/admin/portal/invoices/route.ts                     (GET, POST)
 *   - app/api/admin/portal/projects/[id]/route.ts                (GET, PATCH, POST)
 *   - app/api/admin/portal/service-requests/[id]/route.ts        (PATCH)
 *   - app/api/admin/portal/service-requests/route.ts             (GET)
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
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  count: () => ({ op: 'count' }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      op: 'sql',
      strings: Array.from(strings),
      values,
    }),
    {
      raw: (s: string) => ({ op: 'raw', s }),
    },
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
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
    invoices: wrap('invoices'),
    invoiceItems: wrap('invoiceItems'),
    clients: wrap('clients'),
    users: wrap('users'),
    projects: wrap('projects'),
    kanbanColumns: wrap('kanbanColumns'),
    kanbanCards: wrap('kanbanCards'),
    kanbanCardAssignees: wrap('kanbanCardAssignees'),
    kanbanCardWatchers: wrap('kanbanCardWatchers'),
    serviceRequests: wrap('serviceRequests'),
    services: wrap('services'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

// ---------------------------------------------------------------------------
// DB mock — select / insert / update chains, all thenable
// ---------------------------------------------------------------------------

let selectQueue: Array<Array<Record<string, unknown>>> = [];
let insertQueue: Array<Array<Record<string, unknown>>> = [];
let updateQueue: Array<Array<Record<string, unknown>>> = [];

const insertCalls: Array<{ table: string; values: unknown }> = [];
const updateSetCalls: Array<{ table: string; values: Record<string, unknown>; where: unknown }> =
  [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}
function shiftInsert(): Array<Record<string, unknown>> {
  return insertQueue.shift() ?? [];
}
function shiftUpdate(): Array<Record<string, unknown>> {
  return updateQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let materializedPromise: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = (): Promise<Array<Record<string, unknown>>> => {
      if (!materializedPromise) materializedPromise = Promise.resolve(shiftSelect());
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

  function buildInsert(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    return {
      values(values: unknown) {
        insertCalls.push({ table: tableName, values });
        let materialized: Array<Record<string, unknown>> | null = null;
        const getRows = () => {
          if (materialized === null) materialized = shiftInsert();
          return materialized;
        };
        const inner: Record<string, unknown> = {};
        inner.onConflictDoNothing = () => Promise.resolve(getRows());
        inner.onConflictDoUpdate = () => Promise.resolve(getRows());
        inner.returning = () => Promise.resolve(getRows());
        inner.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve(getRows()).then(onF, onR);
        return inner;
      },
    };
  }

  function buildUpdate(table: { __table?: string } | undefined) {
    const tableName = (table && table.__table) || 'unknown';
    let pendingValues: Record<string, unknown> = {};
    return {
      set(values: Record<string, unknown>) {
        pendingValues = values;
        return {
          where(w: unknown) {
            updateSetCalls.push({ table: tableName, values: pendingValues, where: w });
            const rows = shiftUpdate();
            const ret = {
              returning: () => Promise.resolve(rows),
              then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
                Promise.resolve(rows).then(onF, onR),
            };
            return ret;
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
      insert(table: { __table?: string } | undefined) {
        return buildInsert(table);
      },
      update(table: { __table?: string } | undefined) {
        return buildUpdate(table);
      },
    },
  };
});

// ---- modules under test ----
const invoicesRoute = await import('@/app/api/admin/portal/invoices/route');
const projectByIdRoute = await import('@/app/api/admin/portal/projects/[id]/route');
const serviceRequestByIdRoute = await import(
  '@/app/api/admin/portal/service-requests/[id]/route'
);
const serviceRequestsRoute = await import('@/app/api/admin/portal/service-requests/route');

// ---- helpers ----
function makeReq(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

function makeJsonReq(url: string, body: unknown, method = 'POST'): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const ADMIN_SESSION = { user: { id: '7', name: 'Adam', role: 'admin' } };
const EMPLOYEE_SESSION = { user: { id: '8', name: 'Eve', role: 'employee' } };
const CLIENT_SESSION = { user: { id: '9', name: 'Carl', role: 'client' } };

beforeEach(() => {
  selectQueue = [];
  insertQueue = [];
  updateQueue = [];
  insertCalls.length = 0;
  updateSetCalls.length = 0;
  authMock.mockReset();
});

// ===========================================================================
// admin/portal/invoices
// ===========================================================================

describe('/api/admin/portal/invoices', () => {
  describe('GET', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await invoicesRoute.GET();
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.message).toMatch(/Unauthorized/);
    });

    it('returns 401 when session has no user id', async () => {
      authMock.mockResolvedValue({ user: {} });
      const res = await invoicesRoute.GET();
      expect(res.status).toBe(401);
    });

    it('returns 401 for non-staff role (client)', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      const res = await invoicesRoute.GET();
      expect(res.status).toBe(401);
    });

    it('returns rows for admin role', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([
        { id: 1, number: 'INV-2026-0001', status: 'draft', total: 100 },
        { id: 2, number: 'INV-2026-0002', status: 'paid', total: 200 },
      ]);
      const res = await invoicesRoute.GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(2);
      expect(body.data[0].number).toBe('INV-2026-0001');
    });

    it('returns rows for employee role', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      selectQueue.push([]);
      const res = await invoicesRoute.GET();
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toEqual([]);
    });
  });

  describe('POST', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await invoicesRoute.POST(
        makeJsonReq('http://x/api/admin/portal/invoices', {
          clientId: 1,
          items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
        }),
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 when clientId missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await invoicesRoute.POST(
        makeJsonReq('http://x/api/admin/portal/invoices', {
          items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
        }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/clientId and items are required/);
    });

    it('returns 400 when items empty', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await invoicesRoute.POST(
        makeJsonReq('http://x/api/admin/portal/invoices', { clientId: 1, items: [] }),
      );
      expect(res.status).toBe(400);
    });

    it('creates an invoice with computed totals and line items', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      // 1) select count
      selectQueue.push([{ count: 5 }]);
      // 2) insert invoice -> returning
      insertQueue.push([
        {
          id: 99,
          number: `INV-${new Date().getFullYear()}-0006`,
          subtotal: 30,
          tax: 5,
          total: 35,
        },
      ]);
      // 3) insert each line item -> returning (two items)
      insertQueue.push([{ id: 1001, invoiceId: 99, description: 'A', total: 10 }]);
      insertQueue.push([{ id: 1002, invoiceId: 99, description: 'B', total: 20 }]);

      const res = await invoicesRoute.POST(
        makeJsonReq('http://x/api/admin/portal/invoices', {
          clientId: 42,
          projectId: 7,
          dueDate: '2026-06-01',
          notes: 'thanks',
          tax: 5,
          status: 'sent',
          items: [
            { description: 'A', quantity: 1, unitPrice: 10 },
            { description: 'B', quantity: 2, unitPrice: 10, serviceId: 3 },
          ],
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.invoice.id).toBe(99);
      expect(body.data.items).toHaveLength(2);
      expect(body.data.items[0].id).toBe(1001);
      // verify invoice insert call shape
      const invoiceInsert = insertCalls.find(c => c.table === 'invoices');
      expect(invoiceInsert).toBeDefined();
      const v = invoiceInsert!.values as Record<string, unknown>;
      expect(v.clientId).toBe(42);
      expect(v.projectId).toBe(7);
      expect(v.subtotal).toBe(30);
      expect(v.tax).toBe(5);
      expect(v.total).toBe(35);
      expect(v.status).toBe('sent');
      expect(v.notes).toBe('thanks');
      expect(v.createdBy).toBe(7);
      expect(v.number).toMatch(/^INV-\d{4}-0006$/);
      // verify item inserts
      const itemInserts = insertCalls.filter(c => c.table === 'invoiceItems');
      expect(itemInserts).toHaveLength(2);
    });

    it('defaults projectId/notes/status/dueDate/tax when omitted', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      // select count returns empty (count 0)
      selectQueue.push([]);
      insertQueue.push([{ id: 1, number: 'INV-X-0001' }]);
      insertQueue.push([{ id: 2 }]);

      const res = await invoicesRoute.POST(
        makeJsonReq('http://x/api/admin/portal/invoices', {
          clientId: 11,
          items: [{ description: 'svc', quantity: 1, unitPrice: 50 }],
        }),
      );
      expect(res.status).toBe(200);
      const invoiceInsert = insertCalls.find(c => c.table === 'invoices')!;
      const v = invoiceInsert.values as Record<string, unknown>;
      expect(v.projectId).toBeNull();
      expect(v.notes).toBeNull();
      expect(v.status).toBe('draft');
      expect(v.dueDate).toBeNull();
      expect(v.tax).toBe(0);
      expect(v.subtotal).toBe(50);
      expect(v.total).toBe(50);
      // line-item defaults: serviceId null when omitted
      const itemInsert = insertCalls.find(c => c.table === 'invoiceItems')!;
      const iv = itemInsert.values as Record<string, unknown>;
      expect(iv.serviceId).toBeNull();
      expect(iv.total).toBe(50);
    });

    it('builds invoice number INV-YYYY-0001 when no previous invoices exist', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([{ count: 0 }]);
      insertQueue.push([{ id: 1 }]);
      insertQueue.push([{ id: 2 }]);
      await invoicesRoute.POST(
        makeJsonReq('http://x/api/admin/portal/invoices', {
          clientId: 1,
          items: [{ description: 'x', quantity: 1, unitPrice: 10 }],
        }),
      );
      const invoiceInsert = insertCalls.find(c => c.table === 'invoices')!;
      const v = invoiceInsert.values as Record<string, unknown>;
      const year = new Date().getFullYear();
      expect(v.number).toBe(`INV-${year}-0001`);
    });
  });
});

// ===========================================================================
// admin/portal/projects/[id]
// ===========================================================================

describe('/api/admin/portal/projects/[id]', () => {
  const params = Promise.resolve({ id: '42' });

  describe('GET', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await projectByIdRoute.GET(makeReq('http://x'), { params });
      expect(res.status).toBe(401);
    });

    it('returns 401 for non-staff role', async () => {
      authMock.mockResolvedValue(CLIENT_SESSION);
      const res = await projectByIdRoute.GET(makeReq('http://x'), { params });
      expect(res.status).toBe(401);
    });

    it('returns 404 when project missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]); // project lookup
      const res = await projectByIdRoute.GET(makeReq('http://x'), { params });
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.message).toMatch(/Not found/);
    });

    it('returns project with columns and cards', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([{ id: 42, name: 'Apollo' }]); // project lookup
      selectQueue.push([
        { id: 1, projectId: 42, name: 'Todo', order: 0 },
        { id: 2, projectId: 42, name: 'Done', order: 1 },
      ]); // columns
      selectQueue.push([
        { id: 100, projectId: 42, columnId: 1, title: 'A', order: 0 },
      ]); // cards
      const res = await projectByIdRoute.GET(makeReq('http://x'), { params });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.project.id).toBe(42);
      expect(body.data.columns).toHaveLength(2);
      expect(body.data.cards).toHaveLength(1);
    });
  });

  describe('PATCH', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await projectByIdRoute.PATCH(
        makeJsonReq('http://x', { name: 'New' }, 'PATCH'),
        { params },
      );
      expect(res.status).toBe(401);
    });

    it('updates project fields and returns row', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      updateQueue.push([
        { id: 42, name: 'New Name', status: 'active' },
      ]);
      const res = await projectByIdRoute.PATCH(
        makeJsonReq(
          'http://x',
          {
            name: 'New Name',
            description: 'desc',
            status: 'active',
            startDate: '2026-01-01',
            dueDate: '2026-12-31',
          },
          'PATCH',
        ),
        { params },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(42);
      expect(updateSetCalls).toHaveLength(1);
      const call = updateSetCalls[0];
      expect(call.table).toBe('projects');
      expect(call.values.name).toBe('New Name');
      expect(call.values.startDate).toBeInstanceOf(Date);
      expect(call.values.dueDate).toBeInstanceOf(Date);
      expect(call.values.updatedAt).toBeInstanceOf(Date);
    });

    it('leaves startDate/dueDate undefined when not provided', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      updateQueue.push([{ id: 42 }]);
      await projectByIdRoute.PATCH(
        makeJsonReq('http://x', { name: 'X' }, 'PATCH'),
        { params },
      );
      const call = updateSetCalls[0];
      expect(call.values.startDate).toBeUndefined();
      expect(call.values.dueDate).toBeUndefined();
    });
  });

  describe('POST (create card)', () => {
    it('returns 401 without a session', async () => {
      authMock.mockResolvedValue(null);
      const res = await projectByIdRoute.POST(
        makeJsonReq('http://x', { columnId: 1, title: 'T' }),
        { params },
      );
      expect(res.status).toBe(401);
    });

    it('returns 400 when columnId missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await projectByIdRoute.POST(
        makeJsonReq('http://x', { title: 'T' }),
        { params },
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/columnId and title required/);
    });

    it('returns 400 when title missing', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      const res = await projectByIdRoute.POST(
        makeJsonReq('http://x', { columnId: 3 }),
        { params },
      );
      expect(res.status).toBe(400);
    });

    it('creates a card with computed order and no assignee', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      // select existing cards in the column (2 rows -> next order = 2)
      selectQueue.push([{ id: 1 }, { id: 2 }]);
      // insert kanban card -> returning
      insertQueue.push([{ id: 555, columnId: 3, projectId: 42, title: 'New', order: 2 }]);
      const res = await projectByIdRoute.POST(
        makeJsonReq('http://x', {
          columnId: 3,
          title: 'New',
          description: 'desc',
          priority: 'high',
          dueDate: '2026-12-31',
        }),
        { params },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(555);
      const cardInsert = insertCalls.find(c => c.table === 'kanbanCards')!;
      const v = cardInsert.values as Record<string, unknown>;
      expect(v.title).toBe('New');
      expect(v.description).toBe('desc');
      expect(v.priority).toBe('high');
      expect(v.projectId).toBe(42);
      expect(v.columnId).toBe(3);
      expect(v.order).toBe(2);
      expect(v.dueDate).toBeInstanceOf(Date);
      // no assignee inserts
      expect(insertCalls.find(c => c.table === 'kanbanCardAssignees')).toBeUndefined();
      expect(insertCalls.find(c => c.table === 'kanbanCardWatchers')).toBeUndefined();
    });

    it('applies defaults (priority=medium, description=null, dueDate=null) and adds assignee+watcher', async () => {
      authMock.mockResolvedValue(EMPLOYEE_SESSION);
      selectQueue.push([]); // no existing cards
      insertQueue.push([{ id: 600, columnId: 3, projectId: 42, title: 'T', order: 0 }]);
      insertQueue.push([]); // assignee insert
      insertQueue.push([]); // watcher insert
      const res = await projectByIdRoute.POST(
        makeJsonReq('http://x', {
          columnId: 3,
          title: 'T',
          assignedTo: 99,
        }),
        { params },
      );
      expect(res.status).toBe(200);
      const cardInsert = insertCalls.find(c => c.table === 'kanbanCards')!;
      const v = cardInsert.values as Record<string, unknown>;
      expect(v.priority).toBe('medium');
      expect(v.description).toBeNull();
      expect(v.dueDate).toBeNull();
      expect(v.order).toBe(0);

      const assigneeInsert = insertCalls.find(c => c.table === 'kanbanCardAssignees')!;
      expect((assigneeInsert.values as Record<string, unknown>).userId).toBe(99);
      expect((assigneeInsert.values as Record<string, unknown>).cardId).toBe(600);
      const watcherInsert = insertCalls.find(c => c.table === 'kanbanCardWatchers')!;
      expect((watcherInsert.values as Record<string, unknown>).userId).toBe(99);
    });

    it('does not insert assignee when assignedTo is not a number', async () => {
      authMock.mockResolvedValue(ADMIN_SESSION);
      selectQueue.push([]);
      insertQueue.push([{ id: 1 }]);
      const res = await projectByIdRoute.POST(
        makeJsonReq('http://x', { columnId: 3, title: 'T', assignedTo: 'nope' }),
        { params },
      );
      expect(res.status).toBe(200);
      expect(insertCalls.find(c => c.table === 'kanbanCardAssignees')).toBeUndefined();
    });
  });
});

// ===========================================================================
// admin/portal/service-requests/[id]
// ===========================================================================

describe('PATCH /api/admin/portal/service-requests/[id]', () => {
  const params = Promise.resolve({ id: '17' });

  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await serviceRequestByIdRoute.PATCH(
      makeJsonReq('http://x', { status: 'approved' }, 'PATCH'),
      { params },
    );
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-staff role', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await serviceRequestByIdRoute.PATCH(
      makeJsonReq('http://x', { status: 'approved' }, 'PATCH'),
      { params },
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when update returns no rows', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateQueue.push([]); // update returning -> no row
    const res = await serviceRequestByIdRoute.PATCH(
      makeJsonReq('http://x', { status: 'approved' }, 'PATCH'),
      { params },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toMatch(/Not found/);
  });

  it('updates status and adminNotes, then returns enriched row', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateQueue.push([{ id: 17 }]);
    selectQueue.push([
      {
        id: 17,
        status: 'approved',
        adminNotes: 'looks good',
        serviceId: 3,
        serviceName: 'Audit',
        clientId: 4,
        clientCompany: 'Acme',
        clientUserName: 'Bob',
      },
    ]);
    const res = await serviceRequestByIdRoute.PATCH(
      makeJsonReq('http://x', { status: 'approved', adminNotes: 'looks good' }, 'PATCH'),
      { params },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(17);
    expect(body.data.serviceName).toBe('Audit');
    expect(body.data.clientCompany).toBe('Acme');
    expect(updateSetCalls).toHaveLength(1);
    const call = updateSetCalls[0];
    expect(call.table).toBe('serviceRequests');
    expect(call.values.status).toBe('approved');
    expect(call.values.adminNotes).toBe('looks good');
    expect(call.values.updatedAt).toBeInstanceOf(Date);
  });

  it('ignores unknown body fields (only status/adminNotes flow through)', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    updateQueue.push([{ id: 17 }]);
    selectQueue.push([{ id: 17 }]);
    await serviceRequestByIdRoute.PATCH(
      makeJsonReq('http://x', { foo: 'bar', randomField: 1 }, 'PATCH'),
      { params },
    );
    const call = updateSetCalls[0];
    expect(call.values.status).toBeUndefined();
    expect(call.values.adminNotes).toBeUndefined();
    expect(call.values.foo).toBeUndefined();
    // updatedAt is always set
    expect(call.values.updatedAt).toBeInstanceOf(Date);
  });

  it('allows partial body (status only)', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    updateQueue.push([{ id: 17 }]);
    selectQueue.push([{ id: 17, status: 'rejected' }]);
    const res = await serviceRequestByIdRoute.PATCH(
      makeJsonReq('http://x', { status: 'rejected' }, 'PATCH'),
      { params },
    );
    expect(res.status).toBe(200);
    const call = updateSetCalls[0];
    expect(call.values.status).toBe('rejected');
    expect(call.values.adminNotes).toBeUndefined();
  });
});

// ===========================================================================
// admin/portal/service-requests (GET list)
// ===========================================================================

describe('GET /api/admin/portal/service-requests', () => {
  it('returns 401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await serviceRequestsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValue({ user: {} });
    const res = await serviceRequestsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns 401 for non-staff role', async () => {
    authMock.mockResolvedValue(CLIENT_SESSION);
    const res = await serviceRequestsRoute.GET();
    expect(res.status).toBe(401);
  });

  it('returns enriched rows for admin', async () => {
    authMock.mockResolvedValue(ADMIN_SESSION);
    selectQueue.push([
      {
        id: 1,
        status: 'open',
        serviceName: 'SEO',
        clientCompany: 'Acme',
        clientUserName: 'Bob',
      },
      {
        id: 2,
        status: 'closed',
        serviceName: 'Branding',
        clientCompany: 'Beta',
        clientUserName: 'Sue',
      },
    ]);
    const res = await serviceRequestsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].serviceName).toBe('SEO');
    expect(body.data[1].clientCompany).toBe('Beta');
  });

  it('returns empty list when none exist', async () => {
    authMock.mockResolvedValue(EMPLOYEE_SESSION);
    selectQueue.push([]);
    const res = await serviceRequestsRoute.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });
});
