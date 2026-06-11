// @vitest-environment node
/**
 * Batch 30f — unit tests for four small portal CRM routes.
 *
 *   1. app/api/portal/crm/mentions/route.ts            — GET (member list)
 *   2. app/api/portal/crm/notifications/[id]/route.ts  — PATCH (mark read)
 *   3. app/api/portal/crm/notifications/route.ts       — GET + PUT
 *   4. app/api/portal/crm/pipelines/route.ts           — GET + POST
 *
 * Everything beneath the routes is mocked: auth, getPortalClient,
 * ensureDefaultPipeline, @/lib/db (select/insert/update fluent builders),
 * @/lib/db/schema column refs, and drizzle-orm helpers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: () => authMock(),
}));

const getPortalClientMock = vi.fn();
vi.mock('@/lib/portal-client', () => ({
  getPortalClient: (...args: unknown[]) => getPortalClientMock(...args),
}));

const ensureDefaultPipelineMock = vi.fn();
vi.mock('@/lib/crm/default-pipeline', () => ({
  ensureDefaultPipeline: (...args: unknown[]) => ensureDefaultPipelineMock(...args),
}));

vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return new Proxy({
    clientMembers: wrap('clientMembers'),
    users: wrap('users'),
    crmNotifications: wrap('crmNotifications'),
    crmPipelines: wrap('crmPipelines'),
    crmPipelineStages: wrap('crmPipelineStages'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  inArray: (a: unknown, b: unknown) => ({ op: 'inArray', a, b }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

// ---------------------------------------------------------------------------
// In-memory state + db fake
// ---------------------------------------------------------------------------

interface State {
  clientMembers: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  crmNotifications: Array<Record<string, unknown>>;
  crmPipelines: Array<Record<string, unknown>>;
  crmPipelineStages: Array<Record<string, unknown>>;
  nextPipelineId: number;
  nextStageId: number;
}

const state: State = {
  clientMembers: [],
  users: [],
  crmNotifications: [],
  crmPipelines: [],
  crmPipelineStages: [],
  nextPipelineId: 1,
  nextStageId: 1,
};

const updateCalls: Array<{
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}> = [];

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'clientMembers':
      return state.clientMembers;
    case 'users':
      return state.users;
    case 'crmNotifications':
      return state.crmNotifications;
    case 'crmPipelines':
      return state.crmPipelines;
    case 'crmPipelineStages':
      return state.crmPipelineStages;
    default:
      return [];
  }
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as {
    op?: string;
    a?: unknown;
    b?: unknown;
    args?: unknown[];
    __sql?: boolean;
  };
  if (f.__sql) return true;
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string; __table?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'inArray': {
      const col = f.a as { __col?: string; __table?: string } | undefined;
      const arr = (f.b as unknown[]) || [];
      if (!col?.__col) return true;
      return arr.includes(row[col.__col]);
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    const joins: Array<{ kind: 'left' | 'inner'; table: string; on: unknown }> = [];
    let limitVal: number | null = null;

    function project(
      combined: Record<string, Record<string, unknown> | undefined>,
    ) {
      if (!projection) {
        return { ...(combined[activeTable!] || {}) };
      }
      const projected: Record<string, unknown> = {};
      for (const [outKey, ref] of Object.entries(projection)) {
        const colRef = ref as
          | { __col?: string; __table?: string; __sql?: boolean }
          | undefined;
        if (colRef?.__sql) {
          // Generic sql<number>`count(*)::int` — count filtered rows.
          const rows = tableArray(activeTable!).filter((r) =>
            evalPredicate(filter, r),
          );
          projected[outKey] = rows.length;
        } else if (colRef?.__col && colRef.__table) {
          projected[outKey] = combined[colRef.__table]?.[colRef.__col] ?? null;
        } else {
          projected[outKey] = null;
        }
      }
      return projected;
    }

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);

      const rows = tableArray(activeTable).filter((r) =>
        evalPredicate(filter, r),
      );

      const joined: Array<Record<string, Record<string, unknown> | undefined>> =
        [];
      for (const r of rows) {
        const combined: Record<string, Record<string, unknown> | undefined> = {
          [activeTable]: r,
        };
        let dropped = false;
        for (const j of joins) {
          const eqClauses: Array<{
            a: { __col?: string; __table?: string };
            b: unknown;
          }> = [];
          const collectEqs = (node: unknown) => {
            const n = node as
              | { op?: string; a?: unknown; b?: unknown; args?: unknown[] }
              | undefined;
            if (!n) return;
            if (n.op === 'eq') {
              eqClauses.push({
                a: n.a as { __col?: string; __table?: string },
                b: n.b,
              });
            } else if (n.op === 'and' && Array.isArray(n.args)) {
              n.args.forEach(collectEqs);
            }
          };
          collectEqs(j.on);
          const match = tableArray(j.table).find((jr) => {
            return eqClauses.every((clause) => {
              const aRef = clause.a;
              const bRef = clause.b as
                | { __col?: string; __table?: string }
                | unknown;
              if (!aRef?.__col) return true;
              let leftVal: unknown;
              if (aRef.__table === j.table) leftVal = jr[aRef.__col];
              else leftVal = combined[aRef.__table!]?.[aRef.__col];
              let rightVal: unknown;
              const bAsRef = bRef as
                | { __col?: string; __table?: string }
                | undefined;
              if (bAsRef && typeof bAsRef === 'object' && bAsRef.__col) {
                if (bAsRef.__table === j.table) rightVal = jr[bAsRef.__col];
                else rightVal = combined[bAsRef.__table!]?.[bAsRef.__col];
              } else {
                rightVal = bRef;
              }
              return leftVal === rightVal;
            });
          });
          combined[j.table] = match;
          if (j.kind === 'inner' && !match) {
            dropped = true;
            break;
          }
        }
        if (!dropped) joined.push(combined);
      }

      let out = joined.map(project);
      if (typeof limitVal === 'number') out = out.slice(0, limitVal);
      return Promise.resolve(out);
    }

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      leftJoin(table: { __table: string }, on: unknown) {
        joins.push({ kind: 'left', table: table.__table, on });
        return chain;
      },
      innerJoin(table: { __table: string }, on: unknown) {
        joins.push({ kind: 'inner', table: table.__table, on });
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy() {
        return chain;
      },
      limit(n: number) {
        limitVal = n;
        return chain;
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };
    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(payload: unknown) {
        const arr = tableArray(table.__table);
        const list = Array.isArray(payload) ? payload : [payload];
        const inserted: Array<Record<string, unknown>> = [];
        for (const v of list) {
          const row: Record<string, unknown> = {
            ...(v as Record<string, unknown>),
          };
          if (table.__table === 'crmPipelines') {
            row.id = state.nextPipelineId++;
            row.createdAt = new Date('2026-01-01');
            row.updatedAt = new Date('2026-01-01');
          } else if (table.__table === 'crmPipelineStages') {
            row.id = state.nextStageId++;
          }
          arr.push(row);
          inserted.push(row);
        }
        const thenable = {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(
            onFulfilled: (v: unknown) => unknown,
            onRejected?: (e: unknown) => unknown,
          ) {
            return Promise.resolve(inserted.map((r) => ({ ...r }))).then(
              onFulfilled,
              onRejected,
            );
          },
        };
        return thenable;
      },
    };
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            // Mutate matching rows in place
            const arr = tableArray(table.__table);
            const matched: Array<Record<string, unknown>> = [];
            for (const r of arr) {
              if (evalPredicate(filter, r)) {
                Object.assign(r, patch);
                matched.push(r);
              }
            }
            updateCalls.push({
              table: table.__table,
              patch,
              filter,
            });
            const thenable = {
              returning() {
                return Promise.resolve(matched.map((r) => ({ ...r })));
              },
              then(
                onFulfilled: (v: unknown) => unknown,
                onRejected?: (e: unknown) => unknown,
              ) {
                return Promise.resolve(matched.map((r) => ({ ...r }))).then(
                  onFulfilled,
                  onRejected,
                );
              },
            };
            return thenable;
          },
        };
      },
    };
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return buildSelect(projection);
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

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const { GET: GET_MENTIONS } = await import('@/app/api/portal/crm/mentions/route');
const { PATCH: PATCH_NOTIF_ID } = await import(
  '@/app/api/portal/crm/notifications/[id]/route'
);
const { GET: GET_NOTIFS, PUT: PUT_NOTIFS } = await import(
  '@/app/api/portal/crm/notifications/route'
);
const { GET: GET_PIPELINES, POST: POST_PIPELINES } = await import(
  '@/app/api/portal/crm/pipelines/route'
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(
  url: string,
  init?: RequestInit & { body?: unknown },
): Request {
  const opts: RequestInit = { ...init };
  if (init?.body !== undefined && typeof init.body !== 'string') {
    opts.body = JSON.stringify(init.body);
    opts.headers = {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    };
  }
  return new Request(url, opts);
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  state.clientMembers.length = 0;
  state.users.length = 0;
  state.crmNotifications.length = 0;
  state.crmPipelines.length = 0;
  state.crmPipelineStages.length = 0;
  state.nextPipelineId = 1;
  state.nextStageId = 1;
  updateCalls.length = 0;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  ensureDefaultPipelineMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
  ensureDefaultPipelineMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// GET /api/portal/crm/mentions
// ---------------------------------------------------------------------------

describe('GET /api/portal/crm/mentions', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET_MENTIONS();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      success: false,
      message: 'Unauthorized',
    });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await GET_MENTIONS();
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await GET_MENTIONS();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns empty array when no members exist for the client', async () => {
    const res = await GET_MENTIONS();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: [] });
  });

  it('returns id+name for members scoped to the active client', async () => {
    state.users.push({ id: 7, name: 'Alice', email: 'a@x.test' });
    state.users.push({ id: 8, name: 'Bob', email: 'b@x.test' });
    state.users.push({ id: 9, name: 'Charlie', email: 'c@x.test' });
    state.clientMembers.push({ clientId: 10, userId: 7 });
    state.clientMembers.push({ clientId: 10, userId: 8 });
    // Member of another client — must be excluded.
    state.clientMembers.push({ clientId: 999, userId: 9 });

    const res = await GET_MENTIONS();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    const sorted = (body.data as Array<{ id: number; name: string }>).sort(
      (a, b) => a.id - b.id,
    );
    expect(sorted).toEqual([
      { id: 7, name: 'Alice' },
      { id: 8, name: 'Bob' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/portal/crm/notifications/[id]
// ---------------------------------------------------------------------------

describe('PATCH /api/portal/crm/notifications/[id]', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const req = makeReq('http://x/api/portal/crm/notifications/1', {
      method: 'PATCH',
    });
    const res = await PATCH_NOTIF_ID(req, makeParams('1'));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const req = makeReq('http://x/api/portal/crm/notifications/1', {
      method: 'PATCH',
    });
    const res = await PATCH_NOTIF_ID(req, makeParams('1'));
    expect(res.status).toBe(404);
  });

  it('returns 400 when id is not a number', async () => {
    const req = makeReq('http://x/api/portal/crm/notifications/abc', {
      method: 'PATCH',
    });
    const res = await PATCH_NOTIF_ID(req, makeParams('abc'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid ID');
  });

  it('returns 404 when the notification does not belong to the active client/user', async () => {
    state.crmNotifications.push({
      id: 1,
      clientId: 999,
      userId: 7,
      read: false,
    });
    const req = makeReq('http://x/api/portal/crm/notifications/1', {
      method: 'PATCH',
      body: { read: true },
    });
    const res = await PATCH_NOTIF_ID(req, makeParams('1'));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Notification not found');
  });

  it('marks the matching notification as read by default (empty body)', async () => {
    state.crmNotifications.push({
      id: 1,
      clientId: 10,
      userId: 7,
      read: false,
    });
    const req = makeReq('http://x/api/portal/crm/notifications/1', {
      method: 'PATCH',
    });
    const res = await PATCH_NOTIF_ID(req, makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.read).toBe(true);
    expect(state.crmNotifications[0].read).toBe(true);
  });

  it('marks as read when body is malformed JSON (parse-error path)', async () => {
    state.crmNotifications.push({
      id: 1,
      clientId: 10,
      userId: 7,
      read: false,
    });
    const req = new Request('http://x/api/portal/crm/notifications/1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    const res = await PATCH_NOTIF_ID(req, makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.read).toBe(true);
  });

  it('marks as unread when { read: false } is supplied', async () => {
    state.crmNotifications.push({
      id: 1,
      clientId: 10,
      userId: 7,
      read: true,
    });
    const req = makeReq('http://x/api/portal/crm/notifications/1', {
      method: 'PATCH',
      body: { read: false },
    });
    const res = await PATCH_NOTIF_ID(req, makeParams('1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.read).toBe(false);
    expect(state.crmNotifications[0].read).toBe(false);
  });

  it('forces read=true when body.read is any non-false value', async () => {
    state.crmNotifications.push({
      id: 2,
      clientId: 10,
      userId: 7,
      read: false,
    });
    const req = makeReq('http://x/api/portal/crm/notifications/2', {
      method: 'PATCH',
      body: { read: 'maybe' },
    });
    const res = await PATCH_NOTIF_ID(req, makeParams('2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.read).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/portal/crm/notifications
// ---------------------------------------------------------------------------

describe('GET /api/portal/crm/notifications', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const req = makeReq('http://x/api/portal/crm/notifications', {
      method: 'GET',
    });
    const res = await GET_NOTIFS(req);
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const req = makeReq('http://x/api/portal/crm/notifications', {
      method: 'GET',
    });
    const res = await GET_NOTIFS(req);
    expect(res.status).toBe(404);
  });

  it('returns empty list with unreadCount 0 when there are no rows', async () => {
    const req = makeReq('http://x/api/portal/crm/notifications', {
      method: 'GET',
    });
    const res = await GET_NOTIFS(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: [], unreadCount: 0 });
  });

  it('returns notifications scoped to client+user and an accurate unread count', async () => {
    state.crmNotifications.push({
      id: 1,
      clientId: 10,
      userId: 7,
      read: false,
      createdAt: new Date('2026-02-01'),
    });
    state.crmNotifications.push({
      id: 2,
      clientId: 10,
      userId: 7,
      read: true,
      createdAt: new Date('2026-02-02'),
    });
    // Another client — must be excluded.
    state.crmNotifications.push({
      id: 3,
      clientId: 999,
      userId: 7,
      read: false,
      createdAt: new Date('2026-02-03'),
    });
    // Another user under same client — must be excluded.
    state.crmNotifications.push({
      id: 4,
      clientId: 10,
      userId: 8,
      read: false,
      createdAt: new Date('2026-02-04'),
    });

    const req = makeReq('http://x/api/portal/crm/notifications', {
      method: 'GET',
    });
    const res = await GET_NOTIFS(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.unreadCount).toBe(1);
  });

  it('honors unreadOnly=true', async () => {
    state.crmNotifications.push({
      id: 1,
      clientId: 10,
      userId: 7,
      read: false,
      createdAt: new Date('2026-02-01'),
    });
    state.crmNotifications.push({
      id: 2,
      clientId: 10,
      userId: 7,
      read: true,
      createdAt: new Date('2026-02-02'),
    });
    const req = makeReq(
      'http://x/api/portal/crm/notifications?unreadOnly=true',
      { method: 'GET' },
    );
    const res = await GET_NOTIFS(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(1);
  });

  it('clamps limit above 100 down to 100', async () => {
    for (let i = 1; i <= 150; i++) {
      state.crmNotifications.push({
        id: i,
        clientId: 10,
        userId: 7,
        read: i % 2 === 0,
        createdAt: new Date('2026-02-01'),
      });
    }
    const req = makeReq(
      'http://x/api/portal/crm/notifications?limit=9999',
      { method: 'GET' },
    );
    const res = await GET_NOTIFS(req);
    const body = await res.json();
    expect(body.data).toHaveLength(100);
  });

  it('ignores invalid (non-numeric) and non-positive limit', async () => {
    for (let i = 1; i <= 80; i++) {
      state.crmNotifications.push({
        id: i,
        clientId: 10,
        userId: 7,
        read: false,
        createdAt: new Date('2026-02-01'),
      });
    }
    const req1 = makeReq(
      'http://x/api/portal/crm/notifications?limit=NaN',
      { method: 'GET' },
    );
    const body1 = await (await GET_NOTIFS(req1)).json();
    // limit defaults to 50
    expect(body1.data).toHaveLength(50);

    const req2 = makeReq(
      'http://x/api/portal/crm/notifications?limit=0',
      { method: 'GET' },
    );
    const body2 = await (await GET_NOTIFS(req2)).json();
    expect(body2.data).toHaveLength(50);
  });

  it('honors a small custom limit', async () => {
    for (let i = 1; i <= 10; i++) {
      state.crmNotifications.push({
        id: i,
        clientId: 10,
        userId: 7,
        read: false,
        createdAt: new Date('2026-02-01'),
      });
    }
    const req = makeReq(
      'http://x/api/portal/crm/notifications?limit=3',
      { method: 'GET' },
    );
    const body = await (await GET_NOTIFS(req)).json();
    expect(body.data).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/portal/crm/notifications
// ---------------------------------------------------------------------------

describe('PUT /api/portal/crm/notifications', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const req = makeReq('http://x/api/portal/crm/notifications', {
      method: 'PUT',
      body: { all: true },
    });
    const res = await PUT_NOTIFS(req);
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const req = makeReq('http://x/api/portal/crm/notifications', {
      method: 'PUT',
      body: { all: true },
    });
    const res = await PUT_NOTIFS(req);
    expect(res.status).toBe(404);
  });

  it('marks every unread notification as read when { all: true }', async () => {
    state.crmNotifications.push({
      id: 1,
      clientId: 10,
      userId: 7,
      read: false,
    });
    state.crmNotifications.push({
      id: 2,
      clientId: 10,
      userId: 7,
      read: false,
    });
    state.crmNotifications.push({
      id: 3,
      clientId: 10,
      userId: 7,
      read: true,
    });
    // Other tenant — must remain untouched.
    state.crmNotifications.push({
      id: 4,
      clientId: 999,
      userId: 7,
      read: false,
    });
    const req = makeReq('http://x/api/portal/crm/notifications', {
      method: 'PUT',
      body: { all: true },
    });
    const res = await PUT_NOTIFS(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(state.crmNotifications.find((n) => n.id === 1)?.read).toBe(true);
    expect(state.crmNotifications.find((n) => n.id === 2)?.read).toBe(true);
    expect(state.crmNotifications.find((n) => n.id === 4)?.read).toBe(false);
  });

  it('marks the listed ids as read when given { ids: number[] }', async () => {
    state.crmNotifications.push({
      id: 1,
      clientId: 10,
      userId: 7,
      read: false,
    });
    state.crmNotifications.push({
      id: 2,
      clientId: 10,
      userId: 7,
      read: false,
    });
    state.crmNotifications.push({
      id: 3,
      clientId: 10,
      userId: 7,
      read: false,
    });
    const req = makeReq('http://x/api/portal/crm/notifications', {
      method: 'PUT',
      body: { ids: [1, 3] },
    });
    const res = await PUT_NOTIFS(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(state.crmNotifications.find((n) => n.id === 1)?.read).toBe(true);
    expect(state.crmNotifications.find((n) => n.id === 2)?.read).toBe(false);
    expect(state.crmNotifications.find((n) => n.id === 3)?.read).toBe(true);
  });

  it('returns 400 when neither all nor ids is supplied', async () => {
    const req = makeReq('http://x/api/portal/crm/notifications', {
      method: 'PUT',
      body: {},
    });
    const res = await PUT_NOTIFS(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/ids/i);
  });

  it('returns 400 when ids is an empty array', async () => {
    const req = makeReq('http://x/api/portal/crm/notifications', {
      method: 'PUT',
      body: { ids: [] },
    });
    const res = await PUT_NOTIFS(req);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/portal/crm/pipelines
// ---------------------------------------------------------------------------

describe('GET /api/portal/crm/pipelines', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET_PIPELINES();
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await GET_PIPELINES();
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await GET_PIPELINES();
    expect(res.status).toBe(404);
  });

  it('calls ensureDefaultPipeline and returns an empty array when no pipelines exist', async () => {
    const res = await GET_PIPELINES();
    expect(res.status).toBe(200);
    expect(ensureDefaultPipelineMock).toHaveBeenCalledWith(10);
    expect(await res.json()).toEqual({ success: true, data: [] });
  });

  it('returns pipelines with their stages and excludes other-tenant rows', async () => {
    state.crmPipelines.push({
      id: 1,
      clientId: 10,
      name: 'Sales',
      isDefault: true,
      createdAt: new Date('2026-02-01'),
    });
    state.crmPipelines.push({
      id: 2,
      clientId: 10,
      name: 'Support',
      isDefault: false,
      createdAt: new Date('2026-02-02'),
    });
    // Other tenant — must be excluded.
    state.crmPipelines.push({
      id: 3,
      clientId: 999,
      name: 'Other',
      isDefault: false,
      createdAt: new Date('2026-02-03'),
    });
    state.crmPipelineStages.push({
      id: 10,
      pipelineId: 1,
      name: 'Lead',
      sortOrder: 0,
    });
    state.crmPipelineStages.push({
      id: 11,
      pipelineId: 1,
      name: 'Won',
      sortOrder: 1,
    });
    state.crmPipelineStages.push({
      id: 12,
      pipelineId: 2,
      name: 'Open',
      sortOrder: 0,
    });
    // Stage on excluded pipeline — must not surface.
    state.crmPipelineStages.push({
      id: 13,
      pipelineId: 3,
      name: 'Ghost',
      sortOrder: 0,
    });

    const res = await GET_PIPELINES();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    const sales = body.data.find(
      (p: { id: number }) => p.id === 1,
    ) as { stages: Array<{ id: number }> };
    const support = body.data.find(
      (p: { id: number }) => p.id === 2,
    ) as { stages: Array<{ id: number }> };
    expect(sales.stages.map((s) => s.id).sort()).toEqual([10, 11]);
    expect(support.stages.map((s) => s.id)).toEqual([12]);
  });

  it('returns pipelines with empty stages arrays when there are no stages', async () => {
    state.crmPipelines.push({
      id: 1,
      clientId: 10,
      name: 'Empty',
      isDefault: true,
      createdAt: new Date('2026-02-01'),
    });
    const res = await GET_PIPELINES();
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].stages).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/portal/crm/pipelines
// ---------------------------------------------------------------------------

describe('POST /api/portal/crm/pipelines', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const req = makeReq('http://x/api/portal/crm/pipelines', {
      method: 'POST',
      body: { name: 'Sales' },
    });
    const res = await POST_PIPELINES(req);
    expect(res.status).toBe(401);
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const req = makeReq('http://x/api/portal/crm/pipelines', {
      method: 'POST',
      body: { name: 'Sales' },
    });
    const res = await POST_PIPELINES(req);
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const req = makeReq('http://x/api/portal/crm/pipelines', {
      method: 'POST',
      body: { name: 'Sales' },
    });
    const res = await POST_PIPELINES(req);
    expect(res.status).toBe(404);
  });

  it('returns 400 when name is missing', async () => {
    const req = makeReq('http://x/api/portal/crm/pipelines', {
      method: 'POST',
      body: {},
    });
    const res = await POST_PIPELINES(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Pipeline name is required');
  });

  it('returns 400 when name is whitespace only', async () => {
    const req = makeReq('http://x/api/portal/crm/pipelines', {
      method: 'POST',
      body: { name: '    ' },
    });
    const res = await POST_PIPELINES(req);
    expect(res.status).toBe(400);
  });

  it('creates the first pipeline as default with the 6 default stages', async () => {
    const req = makeReq('http://x/api/portal/crm/pipelines', {
      method: 'POST',
      body: { name: '  Sales  ' },
    });
    const res = await POST_PIPELINES(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Sales');
    expect(body.data.isDefault).toBe(true);
    expect(body.data.clientId).toBe(10);
    expect(body.data.stages).toHaveLength(6);
    const names = body.data.stages.map((s: { name: string }) => s.name);
    expect(names).toEqual([
      'Lead',
      'Qualified',
      'Proposal',
      'Negotiation',
      'Closed Won',
      'Closed Lost',
    ]);
    // Verify state side-effects
    expect(state.crmPipelines).toHaveLength(1);
    expect(state.crmPipelineStages).toHaveLength(6);
  });

  it('marks subsequent pipelines as non-default', async () => {
    // Pre-existing pipeline for the client
    state.crmPipelines.push({
      id: 99,
      clientId: 10,
      name: 'Existing',
      isDefault: true,
      createdAt: new Date('2026-02-01'),
    });
    state.nextPipelineId = 100;
    const req = makeReq('http://x/api/portal/crm/pipelines', {
      method: 'POST',
      body: { name: 'Second' },
    });
    const res = await POST_PIPELINES(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.isDefault).toBe(false);
  });
});
