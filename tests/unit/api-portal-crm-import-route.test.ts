// @vitest-environment node
/**
 * Unit tests for POST /api/portal/crm/import.
 *
 * The route touches: auth, getPortalClient, the db (select existing emails,
 * insert into crmContacts/crmCompanies/crmDeals, select default pipeline +
 * stage for deal imports), and an inline CSV parser. Everything is mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks (declared BEFORE the route import — Vitest hoists vi.mock)
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
  const wrap = (tableName: string) =>
    new Proxy(
      { __table: tableName },
      {
        get(_t, prop: string) {
          if (prop === '__table') return tableName;
          return { __col: prop, __table: tableName };
        },
      },
    );
  return new Proxy({
    crmContacts: wrap('crmContacts'),
    crmCompanies: wrap('crmCompanies'),
    crmDeals: wrap('crmDeals'),
    crmPipelines: wrap('crmPipelines'),
    crmPipelineStages: wrap('crmPipelineStages'),
  }, { has: (t, p) => (p in t) || !(p === "then" || p === "__esModule" || p === "default" || typeof p !== "string"), get: (t, p) => (p in t) ? t[p] : ((p === "then" || p === "__esModule" || p === "default" || typeof p !== "string") ? undefined : wrap(p)) });
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

// ---- in-memory DB shape ----

interface MockState {
  crmContacts: Array<Record<string, unknown>>;
  crmCompanies: Array<Record<string, unknown>>;
  crmDeals: Array<Record<string, unknown>>;
  crmPipelines: Array<Record<string, unknown>>;
  crmPipelineStages: Array<Record<string, unknown>>;
}

const state: MockState = {
  crmContacts: [],
  crmCompanies: [],
  crmDeals: [],
  crmPipelines: [],
  crmPipelineStages: [],
};

function tableArray(name: string): Array<Record<string, unknown>> {
  return (state as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
}

function evalPredicate(filter: unknown, row: Record<string, unknown>): boolean {
  if (!filter) return true;
  if (typeof filter !== 'object') return true;
  const f = filter as { op?: string; a?: unknown; b?: unknown; args?: unknown[] };
  switch (f.op) {
    case 'eq': {
      const col = f.a as { __col?: string } | undefined;
      if (!col?.__col) return true;
      return row[col.__col] === f.b;
    }
    case 'and':
      return (f.args ?? []).every((arg) => evalPredicate(arg, row));
    default:
      return true;
  }
}

let idCounter = 1000;
function nextId(): number {
  return idCounter++;
}

const insertCalls: Array<{ table: string; rows: Record<string, unknown>[] }> = [];

vi.mock('@/lib/db', () => {
  function buildSelect(projection?: Record<string, unknown>) {
    let activeTable: string | null = null;
    let filter: unknown = null;
    let limit: number | null = null;
    const chain: Record<string, unknown> = {
      from(table: { __table: string }) {
        activeTable = table.__table;
        return chain;
      },
      where(arg: unknown) {
        filter = arg;
        return chain;
      },
      orderBy(_arg: unknown) {
        return chain;
      },
      limit(n: number) {
        limit = n;
        return runQuery();
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return runQuery().then(onFulfilled, onRejected);
      },
    };

    function runQuery(): Promise<Array<Record<string, unknown>>> {
      if (!activeTable) return Promise.resolve([]);
      const rows = tableArray(activeTable).filter((r) => evalPredicate(filter, r));
      let out = rows.map((r) => {
        if (projection) {
          const projected: Record<string, unknown> = {};
          for (const [key, val] of Object.entries(projection)) {
            const col = (val as { __col?: string }).__col;
            projected[key] = col ? r[col] : undefined;
          }
          return projected;
        }
        return { ...r };
      });
      if (limit !== null) out = out.slice(0, limit);
      return Promise.resolve(out);
    }

    return chain;
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = { ...v, id: nextId(), createdAt: new Date(), updatedAt: new Date() };
          tableArray(table.__table).push(row);
          return row;
        });
        insertCalls.push({ table: table.__table, rows: inserted });
        return {
          returning() {
            return Promise.resolve(inserted.map((r) => ({ ...r })));
          },
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(inserted).then(onFulfilled, onRejected);
          },
        };
      },
    };
  }

  return {
    db: {
      select(projection?: Record<string, unknown>) {
        return {
          from(table: { __table: string }) {
            return buildSelect(projection).from(table);
          },
        };
      },
      insert(table: { __table: string }) {
        return buildInsert(table);
      },
    },
  };
});

// ---------------------------------------------------------------------------
// Module under test (dynamic import AFTER mocks)
// ---------------------------------------------------------------------------

const { POST } = await import('@/app/api/portal/crm/import/route');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormDataRequest(parts: Record<string, string | { fileName: string; content: string }>): Request {
  const fd = new FormData();
  for (const [key, val] of Object.entries(parts)) {
    if (typeof val === 'string') {
      fd.append(key, val);
    } else {
      const blob = new Blob([val.content], { type: 'text/csv' });
      fd.append(key, blob, val.fileName);
    }
  }
  return new Request('http://x/api/portal/crm/import', {
    method: 'POST',
    body: fd as unknown as BodyInit,
  });
}

beforeEach(() => {
  state.crmContacts.length = 0;
  state.crmCompanies.length = 0;
  state.crmDeals.length = 0;
  state.crmPipelines.length = 0;
  state.crmPipelineStages.length = 0;
  insertCalls.length = 0;
  idCounter = 1000;

  authMock.mockReset();
  getPortalClientMock.mockReset();

  authMock.mockResolvedValue({ user: { id: '7' } });
  getPortalClientMock.mockResolvedValue({ id: 10 });
});

// ---------------------------------------------------------------------------
// Auth + early validation
// ---------------------------------------------------------------------------

describe('POST /api/portal/crm/import — auth + validation', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(makeFormDataRequest({}));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ success: false, message: 'Unauthorized' });
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST(makeFormDataRequest({}));
    expect(res.status).toBe(401);
  });

  it('returns 404 when getPortalClient returns null', async () => {
    getPortalClientMock.mockResolvedValueOnce(null);
    const res = await POST(makeFormDataRequest({}));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.message).toBe('Client not found');
  });

  it('returns 400 when no file is supplied', async () => {
    const res = await POST(makeFormDataRequest({ entityType: 'contact' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('File is required');
  });

  it('returns 400 when entityType is missing', async () => {
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'x.csv', content: 'firstName\nAlice' },
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain('entityType');
  });

  it('returns 400 when entityType is invalid', async () => {
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'x.csv', content: 'firstName\nAlice' },
        entityType: 'invalid',
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when mapping JSON is malformed', async () => {
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'x.csv', content: 'firstName\nAlice' },
        entityType: 'contact',
        mapping: 'not-json{{',
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toBe('Invalid mapping JSON');
  });

  it('returns 400 when CSV has only a header row (no data rows)', async () => {
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'x.csv', content: 'firstName' },
        entityType: 'contact',
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/header row/);
  });
});

// ---------------------------------------------------------------------------
// Contact imports
// ---------------------------------------------------------------------------

describe('POST /api/portal/crm/import — contacts', () => {
  it('imports contacts with header row matching field names directly', async () => {
    const csv = [
      'firstName,lastName,email',
      'Alice,Smith,alice@example.com',
      'Bob,Jones,bob@example.com',
    ].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'c.csv', content: csv },
        entityType: 'contact',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.imported).toBe(2);
    expect(body.data.skipped).toBe(0);
    expect(state.crmContacts).toHaveLength(2);
    expect(state.crmContacts[0]).toMatchObject({
      clientId: 10,
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      status: 'active',
    });
  });

  it('applies an explicit field mapping (CSV header → DB field)', async () => {
    const csv = [
      'First Name,Last Name,Email Address',
      'Alice,Smith,alice@example.com',
    ].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'c.csv', content: csv },
        entityType: 'contact',
        mapping: JSON.stringify({
          'First Name': 'firstName',
          'Last Name': 'lastName',
          'Email Address': 'email',
        }),
      }),
    );
    expect(res.status).toBe(200);
    expect(state.crmContacts[0]).toMatchObject({
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
    });
  });

  it('reports missing required field per row and skips the row', async () => {
    const csv = ['firstName,lastName', ',Smith', 'Alice,Jones'].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'c.csv', content: csv },
        entityType: 'contact',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(1);
    expect(body.data.skipped).toBe(1);
    expect(body.data.errors[0]).toMatch(/Row 2:.*firstName/);
  });

  it('skips contacts with duplicate emails when skipDuplicates=1', async () => {
    state.crmContacts.push({
      id: 1,
      clientId: 10,
      email: 'alice@example.com',
    });
    const csv = [
      'firstName,email',
      'Alice,alice@example.com',
      'Bob,bob@example.com',
    ].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'c.csv', content: csv },
        entityType: 'contact',
        skipDuplicates: '1',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(1);
    expect(body.data.skipped).toBe(1);
    // Only Bob should be inserted via the insert path
    const insertedContacts = insertCalls
      .filter((c) => c.table === 'crmContacts')
      .flatMap((c) => c.rows);
    expect(insertedContacts).toHaveLength(1);
    expect(insertedContacts[0].email).toBe('bob@example.com');
  });

  it('does NOT check duplicates when skipDuplicates is unset', async () => {
    state.crmContacts.push({ id: 1, clientId: 10, email: 'alice@example.com' });
    const csv = ['firstName,email', 'Alice,alice@example.com'].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'c.csv', content: csv },
        entityType: 'contact',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(1);
    // pre-existing row PLUS the imported one
    expect(state.crmContacts).toHaveLength(2);
  });

  it('handles quoted CSV values including commas and escaped quotes', async () => {
    const csv = [
      'firstName,notes',
      '"Alice","Hello, ""friend"" of mine"',
    ].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'c.csv', content: csv },
        entityType: 'contact',
      }),
    );
    expect(res.status).toBe(200);
    expect(state.crmContacts[0].firstName).toBe('Alice');
    expect(state.crmContacts[0].notes).toBe('Hello, "friend" of mine');
  });
});

// ---------------------------------------------------------------------------
// Company imports
// ---------------------------------------------------------------------------

describe('POST /api/portal/crm/import — companies', () => {
  it('imports companies with all optional fields populated', async () => {
    const csv = [
      'name,domain,industry,size,phone,website,address,notes',
      'Acme,acme.com,SaaS,50,555-1212,https://acme.com,123 Main St,Top tier',
    ].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'c.csv', content: csv },
        entityType: 'company',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(1);
    expect(state.crmCompanies[0]).toMatchObject({
      clientId: 10,
      name: 'Acme',
      domain: 'acme.com',
      industry: 'SaaS',
    });
  });

  it('reports missing required field "name" for companies', async () => {
    const csv = ['name,domain', ',acme.com'].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'c.csv', content: csv },
        entityType: 'company',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(body.data.errors[0]).toMatch(/Row 2:.*name/);
  });
});

// ---------------------------------------------------------------------------
// Deal imports
// ---------------------------------------------------------------------------

describe('POST /api/portal/crm/import — deals', () => {
  it('returns 400 when no pipeline exists for the client', async () => {
    const csv = ['title,value', 'Big Deal,1000'].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'd.csv', content: csv },
        entityType: 'deal',
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/No pipeline found/);
  });

  it('returns 400 when pipeline exists but has no stages', async () => {
    state.crmPipelines.push({ id: 100, clientId: 10 });
    const csv = ['title,value', 'Big Deal,1000'].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'd.csv', content: csv },
        entityType: 'deal',
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/No pipeline stages/);
  });

  it('imports deals, converting value to cents and using default pipeline + first stage', async () => {
    state.crmPipelines.push({ id: 100, clientId: 10 });
    state.crmPipelineStages.push({ id: 500, pipelineId: 100, sortOrder: 1 });
    const csv = [
      'title,value,priority,expectedCloseDate',
      'Big Deal,1500.50,high,2026-12-31',
      'Smaller Deal,99.99,low,',
    ].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'd.csv', content: csv },
        entityType: 'deal',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(2);
    expect(state.crmDeals).toHaveLength(2);
    expect(state.crmDeals[0]).toMatchObject({
      clientId: 10,
      pipelineId: 100,
      stageId: 500,
      title: 'Big Deal',
      value: 150050, // 1500.50 * 100
      priority: 'high',
      status: 'open',
    });
    expect(state.crmDeals[0].expectedCloseDate).toBeInstanceOf(Date);
    expect(state.crmDeals[1].value).toBe(9999);
    expect(state.crmDeals[1].expectedCloseDate).toBeNull();
  });

  it('reports missing required field "title" for deals', async () => {
    state.crmPipelines.push({ id: 100, clientId: 10 });
    state.crmPipelineStages.push({ id: 500, pipelineId: 100, sortOrder: 1 });
    const csv = ['title,value', ',1000'].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'd.csv', content: csv },
        entityType: 'deal',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(body.data.errors[0]).toMatch(/Row 2:.*title/);
  });

  it('handles deals with empty value (null) gracefully', async () => {
    state.crmPipelines.push({ id: 100, clientId: 10 });
    state.crmPipelineStages.push({ id: 500, pipelineId: 100, sortOrder: 1 });
    const csv = ['title,value', 'No Value Deal,'].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'd.csv', content: csv },
        entityType: 'deal',
      }),
    );
    expect(res.status).toBe(200);
    expect(state.crmDeals[0].value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Batching + edge cases
// ---------------------------------------------------------------------------

describe('POST /api/portal/crm/import — batching + edge cases', () => {
  it('handles CRLF (\\r\\n) line endings', async () => {
    const csv = 'firstName,lastName\r\nAlice,Smith\r\nBob,Jones\r\n';
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'c.csv', content: csv },
        entityType: 'contact',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(2);
  });

  it('splits inserts into batches of 500', async () => {
    // 501 rows → expect 2 batches: 500 + 1
    const rows = ['firstName'];
    for (let i = 0; i < 501; i++) rows.push(`User${i}`);
    const csv = rows.join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'c.csv', content: csv },
        entityType: 'contact',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(501);
    const contactInsertCalls = insertCalls.filter((c) => c.table === 'crmContacts');
    expect(contactInsertCalls).toHaveLength(2);
    expect(contactInsertCalls[0].rows).toHaveLength(500);
    expect(contactInsertCalls[1].rows).toHaveLength(1);
  });

  it('skips empty lines between valid rows', async () => {
    const csv = ['firstName', 'Alice', '', 'Bob', '   '].join('\n');
    const res = await POST(
      makeFormDataRequest({
        file: { fileName: 'c.csv', content: csv },
        entityType: 'contact',
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.imported).toBe(2);
  });
});
