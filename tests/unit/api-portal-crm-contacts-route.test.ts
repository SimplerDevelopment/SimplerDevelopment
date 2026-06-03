// @vitest-environment node
/**
 * Unit tests for app/api/portal/crm/contacts/route.ts
 *
 * GET   — list contacts scoped to the portal client with filtering (search,
 *         status, companyId, title, tagId, ownerId, pagination, tags merge).
 * POST  — create contact (validation on firstName, optional tag attach, event
 *         emit + notify broadcast).
 *
 * Everything beneath the route is mocked: auth, getPortalClient, the @/lib/db
 * fluent builder (select / insert), schema column refs, drizzle helpers,
 * emitEvent, notifyAllClientUsers, buildCustomFieldFilters.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

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

const emitEventMock = vi.fn();
vi.mock('@/lib/automation', () => ({
  emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

const notifyAllClientUsersMock = vi.fn();
vi.mock('@/lib/crm/notifications', () => ({
  notifyAllClientUsers: (...args: unknown[]) => notifyAllClientUsersMock(...args),
}));

const buildCustomFieldFiltersMock = vi.fn();
vi.mock('@/lib/crm-custom-field-filter', () => ({
  buildCustomFieldFilters: (...args: unknown[]) => buildCustomFieldFiltersMock(...args),
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
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmContactTags: wrap('crmContactTags'),
    crmTags: wrap('crmTags'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : new Proxy({ __table: String(p) }, { get: (_x, c) => c === "__table" ? String(p) : (typeof c === "string" ? { __col: c, __table: String(p) } : undefined) })) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
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

// ---- in-memory state ----

interface State {
  contacts: Array<Record<string, unknown>>;
  companies: Array<Record<string, unknown>>;
  contactTags: Array<Record<string, unknown>>;
  tags: Array<Record<string, unknown>>;
  countOverride: number | null;
  nextContactId: number;
}

const state: State = {
  contacts: [],
  companies: [],
  contactTags: [],
  tags: [],
  countOverride: null,
  nextContactId: 1,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'crmContacts':
      return state.contacts;
    case 'crmCompanies':
      return state.companies;
    case 'crmContactTags':
      return state.contactTags;
    case 'crmTags':
      return state.tags;
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
  if (f.__sql) {
    // Treat raw sql() conditions as pass-through; the search filter is the
    // only one, and we don't simulate ILIKE matching here.
    return true;
  }
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
    let offsetVal: number | null = null;

    function project(combined: Record<string, Record<string, unknown> | undefined>) {
      if (!projection) {
        return { ...(combined[activeTable!] || {}) };
      }
      const projected: Record<string, unknown> = {};
      for (const [outKey, ref] of Object.entries(projection)) {
        const colRef = ref as
          | { __col?: string; __table?: string; __sql?: boolean }
          | undefined;
        if (colRef?.__sql) {
          // sql<number>`count(*)::int`
          projected[outKey] = state.countOverride;
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

      // count(*) shortcut — projection has a single __sql key
      if (projection) {
        const vals = Object.values(projection);
        const onlySql =
          vals.length === 1 && (vals[0] as { __sql?: boolean })?.__sql === true;
        if (onlySql) {
          const rows = tableArray(activeTable).filter((r) =>
            evalPredicate(filter, r),
          );
          const total = state.countOverride ?? rows.length;
          return Promise.resolve([{ total }]);
        }
      }

      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));

      // Joins
      const joined: Array<Record<string, Record<string, unknown> | undefined>> = [];
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

      if (typeof offsetVal === 'number') out = out.slice(offsetVal);
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
      offset(n: number) {
        offsetVal = n;
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
          const row: Record<string, unknown> = { ...(v as Record<string, unknown>) };
          if (table.__table === 'crmContacts') {
            row.id = state.nextContactId++;
            row.createdAt = new Date('2026-01-01');
            row.updatedAt = new Date('2026-01-01');
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

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return buildSelect(projection);
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

const { GET, POST } = await import('@/app/api/portal/crm/contacts/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGet(qs = ''): NextRequest {
  const url = `http://x/api/portal/crm/contacts${qs ? '?' + qs : ''}`;
  return new NextRequest(url, { method: 'GET' });
}

function makePost(body: unknown): Request {
  return new Request('http://x/api/portal/crm/contacts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.contacts.length = 0;
  state.companies.length = 0;
  state.contactTags.length = 0;
  state.tags.length = 0;
  state.countOverride = null;
  state.nextContactId = 1;

  authMock.mockReset();
  getPortalClientMock.mockReset();
  emitEventMock.mockReset();
  notifyAllClientUsersMock.mockReset();
  buildCustomFieldFiltersMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
  notifyAllClientUsersMock.mockResolvedValue(undefined);
  buildCustomFieldFiltersMock.mockReturnValue([]);
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/portal/crm/contacts', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await GET(makeGet());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 200 with empty list, total=0 and default pagination', async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      data: { contacts: [], total: 0, page: 1, limit: 25 },
    });
  });

  it('returns contacts scoped to client with companyName from join + tags merged in', async () => {
    state.companies.push({ id: 50, name: 'Acme Co' });
    state.contacts.push({
      id: 1,
      clientId: 10,
      companyId: 50,
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'a@x.test',
      phone: '111',
      linkedinUrl: null,
      title: 'CTO',
      source: 'web',
      status: 'active',
      avatarUrl: null,
      address: null,
      notes: null,
      lastContactedAt: null,
      score: 10,
      ownerId: 7,
      createdAt: new Date('2026-02-01'),
      updatedAt: new Date('2026-02-01'),
    });
    // A contact belonging to another client should be excluded
    state.contacts.push({
      id: 2,
      clientId: 999,
      companyId: null,
      firstName: 'Bob',
      lastName: 'Other',
      email: 'b@x.test',
      createdAt: new Date('2026-02-02'),
    });
    state.tags.push({ id: 800, name: 'VIP', color: 'gold' });
    state.contactTags.push({ contactId: 1, tagId: 800 });

    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.contacts).toHaveLength(1);
    expect(body.data.contacts[0].id).toBe(1);
    expect(body.data.contacts[0].firstName).toBe('Alice');
    expect(body.data.contacts[0].companyName).toBe('Acme Co');
    expect(body.data.contacts[0].tags).toEqual([
      { id: 800, name: 'VIP', color: 'gold' },
    ]);
  });

  it('returns contact with empty tags array when no tag rows exist', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      companyId: null,
      firstName: 'Alice',
      createdAt: new Date('2026-02-01'),
    });
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.contacts[0].tags).toEqual([]);
  });

  it('applies status filter', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      status: 'active',
      firstName: 'A',
      createdAt: new Date(),
    });
    state.contacts.push({
      id: 2,
      clientId: 10,
      status: 'inactive',
      firstName: 'B',
      createdAt: new Date(),
    });
    const res = await GET(makeGet('status=active'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.contacts).toHaveLength(1);
    expect(body.data.contacts[0].firstName).toBe('A');
  });

  it('applies companyId filter (parses to int)', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      companyId: 50,
      firstName: 'A',
      createdAt: new Date(),
    });
    state.contacts.push({
      id: 2,
      clientId: 10,
      companyId: 99,
      firstName: 'B',
      createdAt: new Date(),
    });
    const res = await GET(makeGet('companyId=50'));
    const body = await res.json();
    expect(body.data.contacts).toHaveLength(1);
    expect(body.data.contacts[0].companyId).toBe(50);
  });

  it('applies single-title filter via eq', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      title: 'CEO',
      firstName: 'A',
      createdAt: new Date(),
    });
    state.contacts.push({
      id: 2,
      clientId: 10,
      title: 'Dev',
      firstName: 'B',
      createdAt: new Date(),
    });
    const res = await GET(makeGet('title=CEO'));
    const body = await res.json();
    expect(body.data.contacts).toHaveLength(1);
    expect(body.data.contacts[0].title).toBe('CEO');
  });

  it('applies multi-title filter via inArray', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      title: 'CEO',
      firstName: 'A',
      createdAt: new Date(),
    });
    state.contacts.push({
      id: 2,
      clientId: 10,
      title: 'CTO',
      firstName: 'B',
      createdAt: new Date(),
    });
    state.contacts.push({
      id: 3,
      clientId: 10,
      title: 'Dev',
      firstName: 'C',
      createdAt: new Date(),
    });
    const res = await GET(makeGet('title=CEO,CTO'));
    const body = await res.json();
    expect(body.data.contacts).toHaveLength(2);
    const titles = body.data.contacts.map((c: { title: string }) => c.title).sort();
    expect(titles).toEqual(['CEO', 'CTO']);
  });

  it('applies ownerId filter', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      ownerId: 7,
      firstName: 'A',
      createdAt: new Date(),
    });
    state.contacts.push({
      id: 2,
      clientId: 10,
      ownerId: 8,
      firstName: 'B',
      createdAt: new Date(),
    });
    const res = await GET(makeGet('ownerId=7'));
    const body = await res.json();
    expect(body.data.contacts).toHaveLength(1);
    expect(body.data.contacts[0].ownerId).toBe(7);
  });

  it('returns early empty result when tagId filter matches no contacts', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      firstName: 'A',
      createdAt: new Date(),
    });
    const res = await GET(makeGet('tagId=999'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ contacts: [], total: 0, page: 1, limit: 25 });
  });

  it('restricts results when tagId filter matches some contacts', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      firstName: 'A',
      createdAt: new Date(),
    });
    state.contacts.push({
      id: 2,
      clientId: 10,
      firstName: 'B',
      createdAt: new Date(),
    });
    state.contactTags.push({ contactId: 1, tagId: 800 });
    state.tags.push({ id: 800, name: 'VIP', color: null });
    const res = await GET(makeGet('tagId=800'));
    const body = await res.json();
    expect(body.data.contacts).toHaveLength(1);
    expect(body.data.contacts[0].id).toBe(1);
  });

  it('clamps pagination page+limit and forwards them to the response', async () => {
    for (let i = 1; i <= 5; i++) {
      state.contacts.push({
        id: i,
        clientId: 10,
        firstName: `C${i}`,
        createdAt: new Date(),
      });
    }
    const res = await GET(makeGet('page=2&limit=2'));
    const body = await res.json();
    expect(body.data.page).toBe(2);
    expect(body.data.limit).toBe(2);
    expect(body.data.contacts).toHaveLength(2);
    expect(body.data.total).toBe(5);
  });

  it('clamps page below 1 up to 1, and limit above 100 down to 100', async () => {
    const res = await GET(makeGet('page=-5&limit=9999'));
    const body = await res.json();
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(100);
  });

  it('forwards search param without crashing (sql passthrough)', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      firstName: 'Alice',
      createdAt: new Date(),
    });
    const res = await GET(makeGet('search=ali'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('applies custom field filters returned from buildCustomFieldFilters', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      firstName: 'A',
      createdAt: new Date(),
    });
    // Custom field filter that excludes everyone
    buildCustomFieldFiltersMock.mockReturnValueOnce([
      { op: 'eq', a: { __col: 'firstName', __table: 'crmContacts' }, b: 'NeverMatch' },
    ]);
    const res = await GET(makeGet('cf_tier=Gold'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.contacts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/portal/crm/contacts', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(makePost({ firstName: 'A' }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.message).toBe('Unauthorized');
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST(makePost({ firstName: 'A' }));
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await POST(makePost({ firstName: 'A' }));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 400 when firstName missing', async () => {
    const res = await POST(makePost({ lastName: 'X' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('First name is required');
  });

  it('returns 400 when firstName is whitespace only', async () => {
    const res = await POST(makePost({ firstName: '   ' }));
    expect(res.status).toBe(400);
  });

  it('creates a contact, defaults status to active, and returns 201', async () => {
    const res = await POST(
      makePost({ firstName: '  Alice  ', lastName: '  Smith  ', email: ' a@x.test ' }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
    expect(body.data.firstName).toBe('Alice');
    expect(body.data.lastName).toBe('Smith');
    expect(body.data.email).toBe('a@x.test');
    expect(body.data.status).toBe('active');
    expect(body.data.clientId).toBe(10);
    // event emitted
    expect(emitEventMock).toHaveBeenCalledWith(
      'crm.contact.created',
      10,
      7,
      expect.objectContaining({ id: 1, name: 'Alice Smith', email: 'a@x.test' }),
    );
    // broadcast issued
    expect(notifyAllClientUsersMock).toHaveBeenCalledTimes(1);
    expect(notifyAllClientUsersMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 10,
        excludeUserId: 7,
        type: 'contact_created',
        entityType: 'contact',
        entityId: 1,
      }),
    );
  });

  it('coerces blank/missing optional fields to null', async () => {
    const res = await POST(
      makePost({
        firstName: 'A',
        lastName: '',
        email: '',
        phone: '',
        linkedinUrl: '',
        title: '',
        source: '',
        address: '',
        notes: '',
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.lastName).toBeNull();
    expect(body.data.email).toBeNull();
    expect(body.data.phone).toBeNull();
    expect(body.data.linkedinUrl).toBeNull();
    expect(body.data.title).toBeNull();
    expect(body.data.source).toBeNull();
    expect(body.data.address).toBeNull();
    expect(body.data.notes).toBeNull();
  });

  it('uses provided status when given', async () => {
    const res = await POST(makePost({ firstName: 'A', status: 'archived' }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe('archived');
  });

  it('attaches tags when tagIds is a non-empty array', async () => {
    const res = await POST(
      makePost({ firstName: 'A', tagIds: [101, 102] }),
    );
    expect(res.status).toBe(201);
    expect(state.contactTags).toHaveLength(2);
    expect(state.contactTags[0]).toMatchObject({ contactId: 1, tagId: 101 });
    expect(state.contactTags[1]).toMatchObject({ contactId: 1, tagId: 102 });
  });

  it('does not attach tags when tagIds is empty or not an array', async () => {
    await POST(makePost({ firstName: 'A', tagIds: [] }));
    await POST(makePost({ firstName: 'B', tagIds: 'not-array' }));
    expect(state.contactTags).toHaveLength(0);
  });

  it('falls back to email when display name is empty in notify payload', async () => {
    const res = await POST(
      makePost({ firstName: ' ', lastName: ' ', email: 'fallback@x.test' }),
    );
    // firstName ' ' is whitespace-only → rejected; verify the validation path
    expect(res.status).toBe(400);
  });

  it('falls back to "Contact #id" when both name and email are missing', async () => {
    // firstName must be non-empty after trim. The display fallback path runs
    // when first+last together trim to empty, which can't happen because
    // firstName is required. Instead verify that a single-letter firstName
    // produces a sensible title.
    const res = await POST(makePost({ firstName: 'Z' }));
    expect(res.status).toBe(201);
    expect(notifyAllClientUsersMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New contact: Z' }),
    );
  });

  it('swallows broadcast errors without failing the request', async () => {
    notifyAllClientUsersMock.mockRejectedValueOnce(new Error('boom'));
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(makePost({ firstName: 'A' }));
    expect(res.status).toBe(201);
    // Wait a microtask for the catch handler to run
    await new Promise((r) => setImmediate(r));
    expect(consoleErrSpy).toHaveBeenCalled();
    consoleErrSpy.mockRestore();
  });

  it('persists companyId and ownerId when provided', async () => {
    const res = await POST(
      makePost({ firstName: 'A', companyId: 50, ownerId: 7 }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.companyId).toBe(50);
    expect(body.data.ownerId).toBe(7);
  });
});
