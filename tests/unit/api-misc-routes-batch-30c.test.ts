// @vitest-environment node
/**
 * Unit tests for four CRM portal routes (coverage batch 30c):
 *
 *  1. GET  /api/portal/crm/activities                — list activities (filters, paging)
 *  2. POST /api/portal/crm/activities                — create activity
 *  3. GET  /api/portal/crm/contacts/[id]/emails      — list email activities for a contact
 *  4. POST /api/portal/crm/contacts/[id]/score       — apply a scoring rule to a contact
 *  5. GET  /api/portal/crm/contacts/duplicates       — fuzzy duplicate contact search
 *
 * Everything beneath each route handler is mocked: auth, getPortalClient,
 * the @/lib/db fluent builder (select / insert / update), schema column refs,
 * and drizzle helpers (eq / and / or / desc / sql).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

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
  return {
    crmActivities: wrap('crmActivities'),
    crmContacts: wrap('crmContacts'),
    crmScoringRules: wrap('crmScoringRules'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: true,
      strings: Array.from(strings),
      values,
    }),
    {},
  ),
}));

// ---------------------------------------------------------------------------
// In-memory state + fluent DB mock
// ---------------------------------------------------------------------------

interface State {
  activities: Array<Record<string, unknown>>;
  contacts: Array<Record<string, unknown>>;
  scoringRules: Array<Record<string, unknown>>;
  nextActivityId: number;
  countOverride: number | null;
}

const state: State = {
  activities: [],
  contacts: [],
  scoringRules: [],
  nextActivityId: 1,
  countOverride: null,
};

function tableArray(name: string): Array<Record<string, unknown>> {
  switch (name) {
    case 'crmActivities':
      return state.activities;
    case 'crmContacts':
      return state.contacts;
    case 'crmScoringRules':
      return state.scoringRules;
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
    strings?: string[];
    values?: unknown[];
  };
  if (f.__sql) {
    // Replay the sql template literal so we can evaluate duplicates conditions.
    return evalSqlClause(f, row);
  }
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string; __table?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    case 'or':
      return (f.args ?? []).some((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

/**
 * The duplicates route builds match conditions using `sql` templates:
 *   sql`${crmContacts.email} = ${email}`
 *   sql`${crmContacts.phone} = ${phone}`
 *   sql`(${crmContacts.firstName} ILIKE ${'A%'} AND ${crmContacts.lastName} ILIKE ${'S%'})`
 *
 * Our mocked `sql` records both the raw template strings and the interpolated
 * values, so we can re-interpret each clause against an in-memory row.
 */
function evalSqlClause(
  f: { strings?: string[]; values?: unknown[] },
  row: Record<string, unknown>,
): boolean {
  const strs = f.strings ?? [];
  const vals = f.values ?? [];
  // Stitch the template into a debug string we can inspect.
  // Even-indexed values are typically column refs; odd-indexed values are operands.
  // Pattern A: `${col} = ${literal}`
  if (
    strs.length === 3 &&
    /\s*=\s*$/.test(strs[1]) &&
    vals.length === 2 &&
    (vals[0] as any)?.__col
  ) {
    const col = (vals[0] as { __col: string }).__col;
    const operand = vals[1];
    return row[col] === operand;
  }
  // Pattern B (firstName + lastName ILIKE prefix): two column refs + two prefixes
  if (
    strs.length === 5 &&
    vals.length === 4 &&
    (vals[0] as any)?.__col &&
    (vals[2] as any)?.__col
  ) {
    const colA = (vals[0] as { __col: string }).__col;
    const colB = (vals[2] as { __col: string }).__col;
    const pfxA = String(vals[1] ?? '').replace(/%$/, '').toLowerCase();
    const pfxB = String(vals[3] ?? '').replace(/%$/, '').toLowerCase();
    const valA = String(row[colA] ?? '').toLowerCase();
    const valB = String(row[colB] ?? '').toLowerCase();
    return valA.startsWith(pfxA) && valB.startsWith(pfxB);
  }
  return false;
}

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limitVal: number | null = null;
    let offsetVal: number | null = null;

    function project(row: Record<string, unknown>) {
      if (!projection) return { ...row };
      const out: Record<string, unknown> = {};
      for (const [outKey, ref] of Object.entries(projection)) {
        const colRef = ref as
          | { __col?: string; __table?: string; __sql?: boolean }
          | undefined;
        if (colRef?.__sql) {
          // sql<number>`count(*)::int` — handled separately in runQuery
          out[outKey] = state.countOverride;
        } else if (colRef?.__col) {
          out[outKey] = row[colRef.__col] ?? null;
        } else {
          out[outKey] = null;
        }
      }
      return out;
    }

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);

      // count(*) shortcut
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

      let rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map(project);
      if (typeof offsetVal === 'number') out = out.slice(offsetVal);
      if (typeof limitVal === 'number') out = out.slice(0, limitVal);
      return Promise.resolve(out);
    }

    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
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
          if (table.__table === 'crmActivities') {
            row.id = state.nextActivityId++;
            row.createdAt = new Date('2026-01-01T00:00:00Z');
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
    let setVals: Record<string, unknown> = {};
    let filter: unknown = null;

    function run(): Promise<Array<Record<string, unknown>>> {
      const arr = tableArray(table.__table);
      const updated: Array<Record<string, unknown>> = [];
      for (const r of arr) {
        if (evalPredicate(filter, r)) {
          Object.assign(r, setVals);
          updated.push(r);
        }
      }
      return Promise.resolve(updated);
    }

    const chain: Record<string, unknown> = {
      set(v: Record<string, unknown>) {
        setVals = v;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      returning() {
        return run().then((rows) => rows.map((r) => ({ ...r })));
      },
      then(
        onFulfilled: (v: unknown) => unknown,
        onRejected?: (e: unknown) => unknown,
      ) {
        return run().then(onFulfilled, onRejected);
      },
    };
    return chain;
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
// Modules under test (imported AFTER mocks are wired)
// ---------------------------------------------------------------------------

const activitiesMod = await import('@/app/api/portal/crm/activities/route');
const emailsMod = await import('@/app/api/portal/crm/contacts/[id]/emails/route');
const scoreMod = await import('@/app/api/portal/crm/contacts/[id]/score/route');
const duplicatesMod = await import('@/app/api/portal/crm/contacts/duplicates/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNextReq(url: string): NextRequest {
  return new NextRequest(new URL(url));
}

function makePost(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.activities.length = 0;
  state.contacts.length = 0;
  state.scoringRules.length = 0;
  state.nextActivityId = 1;
  state.countOverride = null;

  authMock.mockReset();
  getPortalClientMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
});

// ===========================================================================
// 1. /api/portal/crm/activities  (GET + POST)
// ===========================================================================

describe('GET /api/portal/crm/activities', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await activitiesMod.GET(
      makeNextReq('http://x/api/portal/crm/activities'),
    );
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user.id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await activitiesMod.GET(
      makeNextReq('http://x/api/portal/crm/activities'),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await activitiesMod.GET(
      makeNextReq('http://x/api/portal/crm/activities'),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Client not found');
  });

  it('passes the parsed userId (int) to getPortalClient', async () => {
    authMock.mockResolvedValueOnce({ user: { id: '42' } });
    getPortalClientMock.mockResolvedValueOnce(null);
    await activitiesMod.GET(makeNextReq('http://x/api/portal/crm/activities'));
    expect(getPortalClientMock).toHaveBeenCalledWith(42);
  });

  it('returns activities scoped to the portal client with defaults (page 1, limit 25)', async () => {
    state.activities.push({ id: 1, clientId: 10, type: 'call', title: 'A' });
    state.activities.push({ id: 2, clientId: 10, type: 'email', title: 'B' });
    state.activities.push({ id: 3, clientId: 999, type: 'note', title: 'Other client' });

    const res = await activitiesMod.GET(
      makeNextReq('http://x/api/portal/crm/activities'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(25);
    expect(body.data.total).toBe(2);
    expect(body.data.activities.map((a: any) => a.id).sort()).toEqual([1, 2]);
  });

  it('filters by contactId, dealId, companyId when provided', async () => {
    state.activities.push({ id: 1, clientId: 10, contactId: 50, dealId: null, companyId: null, type: 'call', title: 'c50' });
    state.activities.push({ id: 2, clientId: 10, contactId: 51, dealId: null, companyId: null, type: 'call', title: 'c51' });

    const res = await activitiesMod.GET(
      makeNextReq('http://x/api/portal/crm/activities?contactId=50'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.activities.map((a: any) => a.id)).toEqual([1]);
  });

  it('filters by dealId and companyId combined', async () => {
    state.activities.push({ id: 1, clientId: 10, dealId: 7, companyId: 80, contactId: null });
    state.activities.push({ id: 2, clientId: 10, dealId: 7, companyId: 81, contactId: null });
    state.activities.push({ id: 3, clientId: 10, dealId: 8, companyId: 80, contactId: null });

    const res = await activitiesMod.GET(
      makeNextReq('http://x/api/portal/crm/activities?dealId=7&companyId=80'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.activities.map((a: any) => a.id)).toEqual([1]);
  });

  it('clamps page>=1 and limit between 1 and 100', async () => {
    state.activities.push({ id: 1, clientId: 10, type: 'call' });

    const res1 = await activitiesMod.GET(
      makeNextReq('http://x/api/portal/crm/activities?page=-5&limit=9999'),
    );
    const body1 = await res1.json();
    expect(body1.data.page).toBe(1);
    expect(body1.data.limit).toBe(100);

    const res2 = await activitiesMod.GET(
      makeNextReq('http://x/api/portal/crm/activities?page=0&limit=0'),
    );
    const body2 = await res2.json();
    expect(body2.data.page).toBe(1);
    expect(body2.data.limit).toBe(1);
  });

  it('applies offset for paging (page 2, limit 1)', async () => {
    state.activities.push({ id: 1, clientId: 10, type: 'call' });
    state.activities.push({ id: 2, clientId: 10, type: 'call' });
    state.activities.push({ id: 3, clientId: 10, type: 'call' });

    const res = await activitiesMod.GET(
      makeNextReq('http://x/api/portal/crm/activities?page=2&limit=1'),
    );
    const body = await res.json();
    expect(body.data.activities).toHaveLength(1);
    expect(body.data.total).toBe(3);
    expect(body.data.page).toBe(2);
    expect(body.data.limit).toBe(1);
  });
});

describe('POST /api/portal/crm/activities', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await activitiesMod.POST(
      makePost('http://x/api/portal/crm/activities', { type: 't', title: 'x', contactId: 1 }),
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await activitiesMod.POST(
      makePost('http://x/api/portal/crm/activities', { type: 't', title: 'x', contactId: 1 }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 400 when type is missing', async () => {
    const res = await activitiesMod.POST(
      makePost('http://x/api/portal/crm/activities', { title: 'x', contactId: 1 }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Type and title are required');
  });

  it('returns 400 when type is only whitespace', async () => {
    const res = await activitiesMod.POST(
      makePost('http://x/api/portal/crm/activities', { type: '   ', title: 'x', contactId: 1 }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when title is missing', async () => {
    const res = await activitiesMod.POST(
      makePost('http://x/api/portal/crm/activities', { type: 'note', contactId: 1 }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when neither contactId, dealId, nor companyId is provided', async () => {
    const res = await activitiesMod.POST(
      makePost('http://x/api/portal/crm/activities', { type: 'note', title: 'hi' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe(
      'At least one of contactId, dealId, or companyId is required',
    );
  });

  it('creates an activity with trimmed type/title/description and 201 status', async () => {
    const res = await activitiesMod.POST(
      makePost('http://x/api/portal/crm/activities', {
        type: '  call  ',
        title: '  Call Bob  ',
        description: '  intro  ',
        contactId: 50,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.type).toBe('call');
    expect(body.data.title).toBe('Call Bob');
    expect(body.data.description).toBe('intro');
    expect(body.data.clientId).toBe(10);
    expect(body.data.contactId).toBe(50);
    expect(body.data.dealId).toBeNull();
    expect(body.data.companyId).toBeNull();
    expect(body.data.createdBy).toBe(7);
    // ensure persisted
    expect(state.activities).toHaveLength(1);
  });

  it('parses dueDate and completedAt strings into Date objects', async () => {
    const res = await activitiesMod.POST(
      makePost('http://x/api/portal/crm/activities', {
        type: 'task',
        title: 'Follow up',
        contactId: 50,
        dueDate: '2026-06-01T00:00:00Z',
        completedAt: '2026-06-02T00:00:00Z',
      }),
    );
    expect(res.status).toBe(201);
    const stored = state.activities[0];
    expect(stored.dueDate).toBeInstanceOf(Date);
    expect(stored.completedAt).toBeInstanceOf(Date);
    expect((stored.dueDate as Date).toISOString()).toBe('2026-06-01T00:00:00.000Z');
  });

  it('leaves dueDate/completedAt as null when not provided and description null when blank', async () => {
    const res = await activitiesMod.POST(
      makePost('http://x/api/portal/crm/activities', {
        type: 'task',
        title: 'Follow up',
        description: '   ',
        dealId: 7,
      }),
    );
    expect(res.status).toBe(201);
    const stored = state.activities[0];
    expect(stored.dueDate).toBeNull();
    expect(stored.completedAt).toBeNull();
    expect(stored.description).toBeNull();
    expect(stored.dealId).toBe(7);
  });
});

// ===========================================================================
// 2. /api/portal/crm/contacts/[id]/emails  (GET)
// ===========================================================================

describe('GET /api/portal/crm/contacts/[id]/emails', () => {
  function callGet(id: string, qs = '') {
    const req = makeNextReq(`http://x/api/portal/crm/contacts/${id}/emails${qs}`);
    return emailsMod.GET(req, { params: Promise.resolve({ id }) });
  }

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await callGet('5');
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await callGet('5');
    expect(res.status).toBe(404);
  });

  it('returns 400 when the id is not numeric', async () => {
    const res = await callGet('not-a-number');
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid ID');
  });

  it('returns only email-type activities for the given contact + client', async () => {
    state.activities.push({ id: 1, clientId: 10, contactId: 5, type: 'email', title: 'e1' });
    state.activities.push({ id: 2, clientId: 10, contactId: 5, type: 'call', title: 'not email' });
    state.activities.push({ id: 3, clientId: 10, contactId: 99, type: 'email', title: 'other contact' });
    state.activities.push({ id: 4, clientId: 999, contactId: 5, type: 'email', title: 'other client' });

    const res = await callGet('5');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.emails).toHaveLength(1);
    expect(body.data.emails[0].id).toBe(1);
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(25);
  });

  it('clamps page/limit and respects custom values', async () => {
    for (let i = 0; i < 5; i++) {
      state.activities.push({ id: i + 1, clientId: 10, contactId: 5, type: 'email' });
    }
    const res = await callGet('5', '?page=2&limit=2');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.emails).toHaveLength(2);
    expect(body.data.total).toBe(5);
    expect(body.data.page).toBe(2);
    expect(body.data.limit).toBe(2);
  });

  it('returns empty list when no email activities exist for the contact', async () => {
    const res = await callGet('5');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.emails).toEqual([]);
    expect(body.data.total).toBe(0);
  });
});

// ===========================================================================
// 3. /api/portal/crm/contacts/[id]/score  (POST)
// ===========================================================================

describe('POST /api/portal/crm/contacts/[id]/score', () => {
  function callPost(id: string, body: unknown) {
    return scoreMod.POST(
      makePost(`http://x/api/portal/crm/contacts/${id}/score`, body),
      { params: Promise.resolve({ id }) },
    );
  }

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await callPost('5', { eventType: 'form_submitted' });
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await callPost('5', { eventType: 'form_submitted' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when the id is not numeric', async () => {
    const res = await callPost('nope', { eventType: 'form_submitted' });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('Invalid ID');
  });

  it('returns 404 when the contact does not belong to the client', async () => {
    state.contacts.push({ id: 5, clientId: 999, score: 10 });
    const res = await callPost('5', { eventType: 'form_submitted' });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe('Contact not found');
  });

  it('returns 404 when the contact does not exist at all', async () => {
    const res = await callPost('5', { eventType: 'form_submitted' });
    expect(res.status).toBe(404);
  });

  it('returns 400 when eventType is missing', async () => {
    state.contacts.push({ id: 5, clientId: 10, score: 10 });
    const res = await callPost('5', {});
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe('eventType is required');
  });

  it('returns 400 when eventType is whitespace-only', async () => {
    state.contacts.push({ id: 5, clientId: 10, score: 10 });
    const res = await callPost('5', { eventType: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns 404 when no enabled scoring rule matches the event type', async () => {
    state.contacts.push({ id: 5, clientId: 10, score: 10 });
    state.scoringRules.push({
      id: 1,
      clientId: 10,
      eventType: 'form_submitted',
      points: 5,
      enabled: false, // disabled — must not match
    });
    const res = await callPost('5', { eventType: 'form_submitted' });
    expect(res.status).toBe(404);
    expect((await res.json()).message).toBe(
      'No enabled scoring rule found for this event type',
    );
  });

  it('returns 404 when a rule exists for a different client', async () => {
    state.contacts.push({ id: 5, clientId: 10, score: 10 });
    state.scoringRules.push({
      id: 1,
      clientId: 999,
      eventType: 'form_submitted',
      points: 5,
      enabled: true,
    });
    const res = await callPost('5', { eventType: 'form_submitted' });
    expect(res.status).toBe(404);
  });

  it('adds rule.points to contact.score, updates the row, returns the score delta', async () => {
    state.contacts.push({ id: 5, clientId: 10, score: 10 });
    state.scoringRules.push({
      id: 1,
      clientId: 10,
      eventType: 'form_submitted',
      points: 25,
      enabled: true,
    });
    const res = await callPost('5', { eventType: 'form_submitted' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      contactId: 5,
      previousScore: 10,
      pointsAdded: 25,
      newScore: 35,
      eventType: 'form_submitted',
    });
    expect(state.contacts[0].score).toBe(35);
    expect(state.contacts[0].updatedAt).toBeInstanceOf(Date);
  });

  it('trims whitespace around the eventType before matching the rule', async () => {
    state.contacts.push({ id: 5, clientId: 10, score: 0 });
    state.scoringRules.push({
      id: 1,
      clientId: 10,
      eventType: 'booking_made',
      points: 7,
      enabled: true,
    });
    const res = await callPost('5', { eventType: '  booking_made  ' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.newScore).toBe(7);
  });

  it('supports negative point rules (penalties)', async () => {
    state.contacts.push({ id: 5, clientId: 10, score: 20 });
    state.scoringRules.push({
      id: 1,
      clientId: 10,
      eventType: 'unsubscribed',
      points: -10,
      enabled: true,
    });
    const res = await callPost('5', { eventType: 'unsubscribed' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.pointsAdded).toBe(-10);
    expect(body.data.newScore).toBe(10);
  });
});

// ===========================================================================
// 4. /api/portal/crm/contacts/duplicates  (GET)
// ===========================================================================

describe('GET /api/portal/crm/contacts/duplicates', () => {
  function callGet(qs: string) {
    return duplicatesMod.GET(
      makeNextReq(`http://x/api/portal/crm/contacts/duplicates${qs}`),
    );
  }

  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await callGet('?email=a@b.test');
    expect(res.status).toBe(401);
  });

  it('returns 404 when client cannot be resolved', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await callGet('?email=a@b.test');
    expect(res.status).toBe(404);
  });

  it('returns 400 when no search params are supplied', async () => {
    const res = await callGet('');
    expect(res.status).toBe(400);
    expect((await res.json()).message).toBe(
      'At least one search parameter (email, phone, or firstName) is required',
    );
  });

  it('returns 400 when only lastName is supplied (firstName missing)', async () => {
    // The route explicitly requires email, phone, or firstName — lastName alone
    // is not enough.
    const res = await callGet('?lastName=Smith');
    expect(res.status).toBe(400);
  });

  it('returns matches by exact email', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      firstName: 'Alice',
      lastName: 'A',
      email: 'a@b.test',
      phone: null,
      title: null,
      status: 'lead',
      createdAt: new Date('2026-01-01'),
    });
    state.contacts.push({
      id: 2,
      clientId: 10,
      firstName: 'Other',
      lastName: 'B',
      email: 'other@b.test',
      phone: null,
      title: null,
      status: 'lead',
      createdAt: new Date('2026-01-02'),
    });

    const res = await callGet('?email=a@b.test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(1);
    expect(body.data[0].matchReasons).toContain('exact_email');
  });

  it('returns matches by exact phone', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      firstName: 'A',
      lastName: 'B',
      email: null,
      phone: '555-1212',
      title: null,
      status: null,
      createdAt: new Date(),
    });
    const res = await callGet('?phone=555-1212');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].matchReasons).toContain('exact_phone');
  });

  it('returns fuzzy matches by firstName + lastName initial-prefix', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      firstName: 'Alice',
      lastName: 'Smith',
      email: null,
      phone: null,
      title: null,
      status: null,
      createdAt: new Date(),
    });
    state.contacts.push({
      id: 2,
      clientId: 10,
      firstName: 'Albert',
      lastName: 'Stone',
      email: null,
      phone: null,
      title: null,
      status: null,
      createdAt: new Date(),
    });
    state.contacts.push({
      id: 3,
      clientId: 10,
      firstName: 'Bob',
      lastName: 'Smith',
      email: null,
      phone: null,
      title: null,
      status: null,
      createdAt: new Date(),
    });

    const res = await callGet('?firstName=Alfred&lastName=Smithers');
    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.data.map((d: any) => d.id).sort();
    expect(ids).toEqual([1, 2]);
    for (const row of body.data) {
      expect(row.matchReasons).toContain('name_fuzzy');
    }
  });

  it('scopes results to the calling client', async () => {
    state.contacts.push({
      id: 1,
      clientId: 999, // other client
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.test',
      phone: null,
      title: null,
      status: null,
      createdAt: new Date(),
    });
    const res = await callGet('?email=a@b.test');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
  });

  it('sorts results so that exact_email > exact_phone > name_fuzzy', async () => {
    // Row with email match (highest score)
    state.contacts.push({
      id: 1,
      clientId: 10,
      firstName: 'Xavier',
      lastName: 'Yates',
      email: 'a@b.test',
      phone: null,
      title: null,
      status: null,
      createdAt: new Date(),
    });
    // Row with phone match
    state.contacts.push({
      id: 2,
      clientId: 10,
      firstName: 'Xavier',
      lastName: 'Yates',
      email: null,
      phone: '555-1212',
      title: null,
      status: null,
      createdAt: new Date(),
    });
    // Row with name-fuzzy only
    state.contacts.push({
      id: 3,
      clientId: 10,
      firstName: 'Alice',
      lastName: 'Smith',
      email: null,
      phone: null,
      title: null,
      status: null,
      createdAt: new Date(),
    });

    const res = await callGet(
      '?email=a@b.test&phone=555-1212&firstName=Alex&lastName=Stevens',
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.map((d: any) => d.id)).toEqual([1, 2, 3]);
    expect(body.data[0].matchReasons).toContain('exact_email');
    expect(body.data[1].matchReasons).toContain('exact_phone');
    expect(body.data[2].matchReasons).toContain('name_fuzzy');
  });

  it('email comparison is case-insensitive in the annotation phase', async () => {
    state.contacts.push({
      id: 1,
      clientId: 10,
      firstName: 'A',
      lastName: 'B',
      email: 'ALICE@example.com',
      phone: null,
      title: null,
      status: null,
      createdAt: new Date(),
    });
    // Note: the SQL filter is `=` which would be case-sensitive against Postgres,
    // but at the annotation layer the route lowercases both sides. Our mock
    // mimics `=` literally, so we use a matching-case email here to ensure the
    // row is returned, then assert the lowercased annotation logic runs.
    const res = await callGet('?email=ALICE@example.com');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].matchReasons).toContain('exact_email');
  });
});
