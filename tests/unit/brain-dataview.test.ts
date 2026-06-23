// @vitest-environment node
/**
 * Unit tests for lib/brain/dataview.ts.
 *
 * Two layers:
 *  1. Pure validators / class shape (validateQuery, listSupportedTypes,
 *     DataviewError, MAX_LIMIT) — exhaustive happy-path + edge-case +
 *     invalid-input coverage with no mocks needed.
 *  2. runDataview executor routing — mocks the drizzle chain so the
 *     per-type branches in the final switch and each executor's
 *     limit / sort / filter / columns plumbing get exercised without
 *     touching a real database.
 *
 * SQL semantics (the actual WHERE clause, JOIN correctness) belong to the
 * integration layer; here we only verify the JS-level orchestration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture every argument passed through the fluent drizzle chain so each
// test can assert how the executor wired the query together.
const captured: {
  whereArg: unknown;
  orderByArg: unknown;
  limitArg: unknown;
  selectShape: unknown;
  fromTable: unknown;
  joinTable: unknown;
  joinKind: 'inner' | 'left' | null;
  joinCond: unknown;
} = {
  whereArg: null,
  orderByArg: null,
  limitArg: null,
  selectShape: null,
  fromTable: null,
  joinTable: null,
  joinKind: null,
  joinCond: null,
};

// Rows the next chain terminates with. Tests overwrite per case.
let nextRows: Array<Record<string, unknown>> = [];

vi.mock('@/lib/db', () => {
  const chain: Record<string, unknown> = {};
  chain.from = (t: unknown) => {
    captured.fromTable = t;
    return chain;
  };
  chain.innerJoin = (t: unknown, c: unknown) => {
    captured.joinTable = t;
    captured.joinCond = c;
    captured.joinKind = 'inner';
    return chain;
  };
  chain.leftJoin = (t: unknown, c: unknown) => {
    captured.joinTable = t;
    captured.joinCond = c;
    captured.joinKind = 'left';
    return chain;
  };
  chain.where = (arg: unknown) => {
    captured.whereArg = arg;
    return chain;
  };
  chain.orderBy = (arg: unknown) => {
    captured.orderByArg = arg;
    return chain;
  };
  // .limit() resolves the chain — runDataview awaits this terminal.
  chain.limit = (arg: unknown) => {
    captured.limitArg = arg;
    return Promise.resolve(nextRows);
  };

  return {
    db: {
      select: (shape: unknown) => {
        captured.selectShape = shape;
        return chain;
      },
    },
  };
});

// Schema columns are pure tag objects — equality / identity is all the
// production code needs from them inside our mocked chain. Inlined inside
// the vi.mock factory because vi.mock is hoisted above module-level decls.
vi.mock('@/lib/db/schema', () => {
  const makeCol = (name: string) => ({ __col: name, name });
  const buildTable = (cols: string[]) => {
    const obj: Record<string, unknown> = {};
    for (const c of cols) obj[c] = makeCol(c);
    return obj;
  };
  return {
    brainNotes: buildTable([
      'id', 'title', 'tags', 'pinned', 'sourceUrl', 'updatedAt', 'createdAt',
      'companyId', 'dealId', 'contactId', 'meetingId', 'clientId',
    ]),
    brainMeetings: buildTable([
      'id', 'title', 'status', 'meetingDate', 'updatedAt', 'createdAt',
      'companyId', 'dealId', 'clientId',
    ]),
    brainTasks: buildTable([
      'id', 'title', 'status', 'priority', 'dueDate', 'updatedAt', 'createdAt',
      'ownerId', 'meetingId', 'companyId', 'dealId', 'clientId',
    ]),
    crmCompanies: buildTable([
      'id', 'name', 'domain', 'industry', 'size', 'updatedAt', 'createdAt', 'clientId',
    ]),
    crmContacts: buildTable([
      'id', 'firstName', 'lastName', 'email', 'title', 'status', 'updatedAt',
      'createdAt', 'companyId', 'clientId',
    ]),
    crmDeals: buildTable([
      'id', 'title', 'status', 'priority', 'value', 'updatedAt', 'createdAt',
      'companyId', 'contactId', 'pipelineId', 'stageId', 'ownerId', 'clientId',
    ]),
    posts: buildTable([
      'id', 'title', 'slug', 'published', 'postType', 'updatedAt', 'createdAt',
      'websiteId',
    ]),
    clientWebsites: buildTable(['id', 'clientId']),
  };
});

// drizzle-orm helpers — return tagged markers so we can introspect.
vi.mock('drizzle-orm', () => ({
  and: (...args: unknown[]) => ({ __op: 'and', args }),
  asc: (col: unknown) => ({ __op: 'asc', col }),
  desc: (col: unknown) => ({ __op: 'desc', col }),
  eq: (a: unknown, b: unknown) => ({ __op: 'eq', a, b }),
  gt: (a: unknown, b: unknown) => ({ __op: 'gt', a, b }),
  lt: (a: unknown, b: unknown) => ({ __op: 'lt', a, b }),
  ilike: (a: unknown, b: unknown) => ({ __op: 'ilike', a, b }),
  inArray: (a: unknown, b: unknown) => ({ __op: 'inArray', a, b }),
  // sql tag — return a marker that swallows interpolations.
  sql: Object.assign(
    (parts: TemplateStringsArray, ...vals: unknown[]) => ({ __op: 'sql', parts: [...parts], vals }),
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

vi.mock('drizzle-orm/pg-core', () => ({
  alias: (table: unknown, name: string) => ({ __alias: name, table }),
}));

// Subject under test — import AFTER the mocks above.
import {
  MAX_LIMIT,
  DataviewError,
  listSupportedTypes,
  validateQuery,
  runDataview,
  type DataviewQuery,
} from '@/lib/brain/dataview';

const resetCaptured = () => {
  captured.whereArg = null;
  captured.orderByArg = null;
  captured.limitArg = null;
  captured.selectShape = null;
  captured.fromTable = null;
  captured.joinTable = null;
  captured.joinCond = null;
  captured.joinKind = null;
  nextRows = [];
};

describe('lib/brain/dataview — constants & error', () => {
  it('MAX_LIMIT is the hard upper bound (50)', () => {
    expect(MAX_LIMIT).toBe(50);
  });

  it('DataviewError defaults status to 400', () => {
    const e = new DataviewError('bad');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(DataviewError);
    expect(e.message).toBe('bad');
    expect(e.status).toBe(400);
    expect(e.name).toBe('DataviewError');
  });

  it('DataviewError accepts custom status (e.g. 500)', () => {
    const e = new DataviewError('boom', 500);
    expect(e.status).toBe(500);
  });
});

describe('lib/brain/dataview — listSupportedTypes', () => {
  it('returns all seven registered types', () => {
    const types = listSupportedTypes();
    expect(types).toEqual(
      expect.arrayContaining(['notes', 'meetings', 'tasks', 'companies', 'contacts', 'deals', 'posts']),
    );
    expect(types).toHaveLength(7);
  });

  it('returns a fresh array view — no key duplicates', () => {
    const types = listSupportedTypes();
    expect(new Set(types).size).toBe(types.length);
  });
});

describe('lib/brain/dataview — validateQuery', () => {
  describe('top-level shape', () => {
    it('rejects null', () => {
      expect(() => validateQuery(null)).toThrow(DataviewError);
      expect(() => validateQuery(null)).toThrow(/JSON object/);
    });

    it('rejects undefined', () => {
      expect(() => validateQuery(undefined)).toThrow(DataviewError);
    });

    it('rejects primitives', () => {
      expect(() => validateQuery('notes')).toThrow(/JSON object/);
      expect(() => validateQuery(42)).toThrow(/JSON object/);
      expect(() => validateQuery(true)).toThrow(/JSON object/);
    });

    it('rejects missing type', () => {
      expect(() => validateQuery({})).toThrow(/query\.type is required/);
    });

    it('rejects non-string type', () => {
      expect(() => validateQuery({ type: 123 })).toThrow(/query\.type is required/);
    });

    it('rejects unknown type with the supported list in the message', () => {
      try {
        validateQuery({ type: 'widgets' });
        throw new Error('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(DataviewError);
        const err = e as DataviewError;
        expect(err.message).toMatch(/unknown type "widgets"/);
        expect(err.message).toMatch(/notes/);
        expect(err.message).toMatch(/posts/);
      }
    });

    it('accepts a bare type with no options', () => {
      const q = validateQuery({ type: 'notes' });
      expect(q).toEqual({ type: 'notes', filter: undefined, sort: undefined, columns: undefined, limit: undefined });
    });
  });

  describe('filter', () => {
    it('rejects non-object filter', () => {
      expect(() => validateQuery({ type: 'notes', filter: 'bad' })).toThrow(/filter must be an object/);
      expect(() => validateQuery({ type: 'notes', filter: null })).toThrow(/filter must be an object/);
    });

    it('rejects filter keys not on the type allowlist', () => {
      expect(() => validateQuery({ type: 'notes', filter: { foo: 1 } })).toThrow(/filter key "foo" not allowed/);
    });

    it('accepts filterable extension keys (e.g. companyId for notes)', () => {
      const q = validateQuery({ type: 'notes', filter: { companyId: 1 } });
      expect(q.filter).toEqual({ companyId: 1 });
    });

    it('accepts notes-only relationship keys (dealId/contactId/meetingId)', () => {
      const q = validateQuery({
        type: 'notes',
        filter: { dealId: 2, contactId: 3, meetingId: 4 },
      });
      expect(q.filter).toMatchObject({ dealId: 2, contactId: 3, meetingId: 4 });
    });

    it('rejects companyId on a type that does not allow it (posts)', () => {
      expect(() => validateQuery({ type: 'posts', filter: { companyId: 1 } })).toThrow(/filter key "companyId" not allowed/);
    });

    it('passes through operator-object filters verbatim', () => {
      const q = validateQuery({
        type: 'tasks',
        filter: {
          status: { op: 'in', value: ['open', 'done'] },
          title: { op: 'like', value: 'foo' },
          dueDate: { op: 'gt', value: '2026-01-01' },
        },
      });
      expect(q.filter).toMatchObject({
        status: { op: 'in', value: ['open', 'done'] },
        title: { op: 'like', value: 'foo' },
        dueDate: { op: 'gt', value: '2026-01-01' },
      });
    });

    it('accepts an empty filter object', () => {
      const q = validateQuery({ type: 'notes', filter: {} });
      expect(q.filter).toEqual({});
    });

    it('accepts contacts virtual keys (firstName/lastName)', () => {
      const q = validateQuery({ type: 'contacts', filter: { firstName: 'A', lastName: 'B' } });
      expect(q.filter).toMatchObject({ firstName: 'A', lastName: 'B' });
    });
  });

  describe('sort', () => {
    it('rejects non-string sort', () => {
      expect(() => validateQuery({ type: 'notes', sort: 42 })).toThrow(/sort must be a string/);
    });

    it('rejects unknown column', () => {
      expect(() => validateQuery({ type: 'notes', sort: 'nope' })).toThrow(/sort key "nope" not allowed/);
    });

    it('strips leading "-" before checking allowlist', () => {
      const q = validateQuery({ type: 'notes', sort: '-updatedAt' });
      expect(q.sort).toBe('-updatedAt');
    });

    it('accepts a bare ascending sort', () => {
      const q = validateQuery({ type: 'notes', sort: 'title' });
      expect(q.sort).toBe('title');
    });

    it('rejects "-" prefix on a non-sortable column', () => {
      expect(() => validateQuery({ type: 'notes', sort: '-nope' })).toThrow(/sort key "nope" not allowed/);
    });

    it('rejects extension filter keys as sort keys (companyId is filterable but not sortable on notes)', () => {
      // For notes, companyId is filterable but NOT in sortable (which is the
      // bare NOTE_COLS set). Verifies the boundary.
      expect(() => validateQuery({ type: 'notes', sort: 'companyId' })).toThrow(/sort key "companyId" not allowed/);
    });
  });

  describe('columns', () => {
    it('rejects non-array columns', () => {
      expect(() => validateQuery({ type: 'notes', columns: 'title' })).toThrow(/columns must be an array of strings/);
    });

    it('rejects array with non-string entries', () => {
      expect(() => validateQuery({ type: 'notes', columns: ['title', 42] })).toThrow(/columns must be an array of strings/);
    });

    it('rejects unknown column', () => {
      expect(() => validateQuery({ type: 'notes', columns: ['title', 'nope'] })).toThrow(/column "nope" not allowed/);
    });

    it('accepts a valid subset', () => {
      const q = validateQuery({ type: 'notes', columns: ['title', 'tags'] });
      expect(q.columns).toEqual(['title', 'tags']);
    });

    it('accepts an empty columns array (treated as default)', () => {
      const q = validateQuery({ type: 'notes', columns: [] });
      expect(q.columns).toEqual([]);
    });

    it('rejects filterable-only extension columns (e.g. companyId for notes — not in columns)', () => {
      expect(() => validateQuery({ type: 'notes', columns: ['companyId'] })).toThrow(/column "companyId" not allowed/);
    });
  });

  describe('limit', () => {
    it('rejects non-positive numbers', () => {
      expect(() => validateQuery({ type: 'notes', limit: 0 })).toThrow(/limit must be a positive integer/);
      expect(() => validateQuery({ type: 'notes', limit: -3 })).toThrow(/limit must be a positive integer/);
    });

    it('rejects non-finite', () => {
      expect(() => validateQuery({ type: 'notes', limit: Number.NaN })).toThrow(/limit must be a positive integer/);
      expect(() => validateQuery({ type: 'notes', limit: Number.POSITIVE_INFINITY })).toThrow(/limit must be a positive integer/);
    });

    it('rejects unparseable strings', () => {
      expect(() => validateQuery({ type: 'notes', limit: 'abc' })).toThrow(/limit must be a positive integer/);
    });

    it('parses numeric strings', () => {
      const q = validateQuery({ type: 'notes', limit: '5' });
      expect(q.limit).toBe(5);
    });

    it('floors fractional', () => {
      const q = validateQuery({ type: 'notes', limit: 3.9 });
      expect(q.limit).toBe(3);
    });

    it('clamps to MAX_LIMIT (50)', () => {
      const q = validateQuery({ type: 'notes', limit: 1000 });
      expect(q.limit).toBe(MAX_LIMIT);
    });

    it('passes through limit at exactly MAX_LIMIT', () => {
      const q = validateQuery({ type: 'notes', limit: MAX_LIMIT });
      expect(q.limit).toBe(MAX_LIMIT);
    });

    it('treats fractional <1 (e.g. 0.5) as invalid', () => {
      expect(() => validateQuery({ type: 'notes', limit: 0.5 })).toThrow(/limit must be a positive integer/);
    });
  });
});

describe('lib/brain/dataview — runDataview executor routing', () => {
  beforeEach(() => {
    resetCaptured();
  });

  it('routes notes → brainNotes table with default desc(updatedAt)', async () => {
    nextRows = [{
      id: 1, title: 'n', tags: null, pinned: false, sourceUrl: null,
      updatedAt: 'u', createdAt: 'c',
    }];
    const out = await runDataview(42, { type: 'notes' });
    expect(captured.fromTable).toMatchObject({ updatedAt: expect.anything(), title: expect.anything() });
    expect(captured.limitArg).toBe(MAX_LIMIT);
    expect(captured.orderByArg).toMatchObject({ __op: 'desc' });
    expect(out.columns).toEqual(['title', 'tags', 'pinned', 'sourceUrl', 'updatedAt']);
    expect(out.rows[0]).toEqual({
      title: 'n', tags: null, pinned: false, sourceUrl: null, updatedAt: 'u',
    });
  });

  it('honors caller-supplied limit', async () => {
    nextRows = [];
    await runDataview(1, { type: 'notes', limit: 7 });
    expect(captured.limitArg).toBe(7);
  });

  it('honors caller-supplied columns subset', async () => {
    nextRows = [{ id: 9, title: 'T', updatedAt: 'u' }];
    const out = await runDataview(1, { type: 'notes', columns: ['id', 'title'] });
    expect(out.columns).toEqual(['id', 'title']);
    expect(out.rows[0]).toEqual({ id: 9, title: 'T' });
  });

  it('fills missing requested columns with null in projection', async () => {
    nextRows = [{ title: 'only-title' }];
    const out = await runDataview(1, { type: 'notes', columns: ['title', 'tags'] });
    expect(out.rows[0]).toEqual({ title: 'only-title', tags: null });
  });

  it('asc sort yields an asc() orderBy marker', async () => {
    nextRows = [];
    await runDataview(1, { type: 'notes', sort: 'title' });
    expect(captured.orderByArg).toMatchObject({ __op: 'asc' });
  });

  it('desc sort ("-title") yields a desc() orderBy marker', async () => {
    nextRows = [];
    await runDataview(1, { type: 'notes', sort: '-title' });
    expect(captured.orderByArg).toMatchObject({ __op: 'desc' });
  });

  it('passes a single base eq() through .where() (no and()-wrap)', async () => {
    nextRows = [];
    await runDataview(123, { type: 'notes' });
    // One base condition, no filters → returned as-is, not and()-wrapped.
    expect(captured.whereArg).toMatchObject({ __op: 'eq' });
  });

  it('and()-wraps base + filter conditions', async () => {
    nextRows = [];
    await runDataview(1, { type: 'notes', filter: { title: 'foo' } });
    expect(captured.whereArg).toMatchObject({ __op: 'and' });
  });

  it('treats null filter value as IS NULL via sql marker', async () => {
    nextRows = [];
    await runDataview(1, { type: 'notes', filter: { tags: null } });
    // and(...) wrapper holds two conds; the second one is the sql IS NULL marker.
    const w = captured.whereArg as { __op: string; args: unknown[] };
    expect(w.__op).toBe('and');
    expect(w.args[1]).toMatchObject({ __op: 'sql' });
  });

  it('uses inArray() for op:in filter', async () => {
    nextRows = [];
    await runDataview(1, { type: 'tasks', filter: { status: { op: 'in', value: ['open', 'done'] } } });
    const w = captured.whereArg as { args: unknown[] };
    expect(w.args[1]).toMatchObject({ __op: 'inArray' });
  });

  it('silently drops op:in with empty array (no extra cond appended)', async () => {
    nextRows = [];
    await runDataview(1, { type: 'tasks', filter: { status: { op: 'in', value: [] } } });
    // No effective filter → single base cond, returned bare.
    expect(captured.whereArg).toMatchObject({ __op: 'eq' });
  });

  it('uses gt() for op:gt', async () => {
    nextRows = [];
    await runDataview(1, { type: 'tasks', filter: { dueDate: { op: 'gt', value: '2026-01-01' } } });
    const w = captured.whereArg as { args: unknown[] };
    expect(w.args[1]).toMatchObject({ __op: 'gt' });
  });

  it('uses lt() for op:lt', async () => {
    nextRows = [];
    await runDataview(1, { type: 'tasks', filter: { dueDate: { op: 'lt', value: '2026-12-31' } } });
    const w = captured.whereArg as { args: unknown[] };
    expect(w.args[1]).toMatchObject({ __op: 'lt' });
  });

  it('uses ilike() with %wrapping for op:like', async () => {
    nextRows = [];
    await runDataview(1, { type: 'tasks', filter: { title: { op: 'like', value: 'foo' } } });
    const w = captured.whereArg as { args: unknown[] };
    expect(w.args[1]).toMatchObject({ __op: 'ilike', b: '%foo%' });
  });

  it('routes meetings to its own executor with default desc(meetingDate)', async () => {
    nextRows = [{ id: 1, title: 'm', status: 's', meetingDate: 'd', updatedAt: 'u', createdAt: 'c' }];
    const out = await runDataview(1, { type: 'meetings' });
    expect(out.columns).toEqual(['title', 'status', 'meetingDate', 'updatedAt']);
    expect(captured.orderByArg).toMatchObject({ __op: 'desc' });
  });

  it('routes tasks to its own executor', async () => {
    nextRows = [{
      id: 1, title: 't', status: 'open', priority: 'p',
      dueDate: 'd', updatedAt: 'u', createdAt: 'c',
    }];
    const out = await runDataview(1, { type: 'tasks' });
    expect(out.columns).toEqual(['title', 'status', 'priority', 'dueDate', 'updatedAt']);
  });

  it('routes companies with default asc(name) sort', async () => {
    nextRows = [{
      id: 1, name: 'Acme', domain: 'a.co', industry: 'i', size: 's',
      updatedAt: 'u', createdAt: 'c',
    }];
    const out = await runDataview(1, { type: 'companies' });
    expect(captured.orderByArg).toMatchObject({ __op: 'asc' });
    expect(out.columns).toEqual(['name', 'domain', 'industry', 'size', 'updatedAt']);
  });

  it('routes contacts with a leftJoin to crmCompanies', async () => {
    nextRows = [{
      id: 1, name: 'X', email: 'x@y', title: null, company: null,
      status: 'active', updatedAt: 'u', createdAt: 'c',
    }];
    const out = await runDataview(1, { type: 'contacts' });
    expect(captured.joinKind).toBe('left');
    expect(out.columns).toEqual(['name', 'email', 'title', 'company', 'status', 'updatedAt']);
  });

  it('routes deals with a leftJoin to aliased deal_company', async () => {
    nextRows = [{
      id: 1, title: 't', status: 's', priority: 'p', value: 1,
      company: null, updatedAt: 'u', createdAt: 'c',
    }];
    const out = await runDataview(1, { type: 'deals' });
    expect(captured.joinKind).toBe('left');
    expect(captured.joinTable).toMatchObject({ __alias: 'deal_company' });
    expect(out.columns).toEqual(['title', 'status', 'priority', 'value', 'company', 'updatedAt']);
  });

  it('routes posts with an innerJoin to clientWebsites for tenant scoping', async () => {
    nextRows = [{
      id: 1, title: 'P', slug: 'p', published: true, postType: 'blog',
      updatedAt: 'u', createdAt: 'c',
    }];
    const out = await runDataview(1, { type: 'posts' });
    expect(captured.joinKind).toBe('inner');
    expect(out.columns).toEqual(['title', 'slug', 'published', 'postType', 'updatedAt']);
  });

  it('throws DataviewError(500) for a type-registered-but-not-wired type', async () => {
    // We can only hit the default branch by handing runDataview a type that
    // bypasses validateQuery — the caller passes a DataviewQuery directly.
    await expect(
      runDataview(1, { type: 'unknown' } as unknown as DataviewQuery),
    ).rejects.toMatchObject({ status: 500, name: 'DataviewError' });
  });
});
