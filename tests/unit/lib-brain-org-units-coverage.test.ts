// @vitest-environment node
/**
 * Companion coverage test for lib/brain/org-units.ts.
 *
 * The existing tests (brain-org-units.test.ts, brain-org-units-path.test.ts)
 * cover only the pure helpers. This file drives every DB-coupled function
 * (listOrgUnits, getOrgUnitTree, getOrgUnitById, createOrgUnit, updateOrgUnit,
 * moveOrgUnit, mergeOrgUnits, deleteOrgUnit, addMember, removeMember,
 * setPrimaryUnit) via an in-memory chainable DB mock — mirroring the pattern
 * in tests/unit/brain-meetings.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── In-memory store — shared across the test module ─────────────────────────

interface OrgUnitRow {
  id: number;
  clientId: number;
  parentId: number | null;
  name: string;
  slug: string;
  path: string;
  description: string | null;
  leadPersonId: number | null;
  color: string | null;
  icon: string | null;
  sortOrder: number;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface PersonOrgUnitRow {
  id: number;
  clientId: number;
  personId: number;
  orgUnitId: number;
  primary: boolean;
  roleInUnit: string | null;
}

interface PersonRow {
  id: number;
  clientId: number;
  fullName: string;
  title: string | null;
}

// Use a single mutable container object so the vi.mock factory can close over
// it by reference (the factory runs lazily, AFTER the module body initialises).
const store = {
  brainOrgUnits: [] as OrgUnitRow[],
  brainPersonOrgUnits: [] as PersonOrgUnitRow[],
  brainPeople: [] as PersonRow[],
  auditCalls: [] as unknown[],
  revalidateCalls: [] as number[],
};

// ─── Schema mock ─────────────────────────────────────────────────────────────

vi.mock('@/lib/db/schema', () => {
  const wrap = (tableName: string) =>
    new Proxy({ __table: tableName }, {
      get(_t, prop: string) {
        if (prop === '__table') return tableName;
        if (prop === '$inferSelect' || prop === '$inferInsert') return undefined;
        return { __col: prop, __table: tableName };
      },
    });
  const tables = {
    brainOrgUnits: wrap('brainOrgUnits'),
    brainPersonOrgUnits: wrap('brainPersonOrgUnits'),
    brainPeople: wrap('brainPeople'),
  };
  return new Proxy(tables, {
    has: (t, p) =>
      (p in t) || !(p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string'),
    get: (t, p: string) =>
      (p in t)
        ? t[p as keyof typeof t]
        : (p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string')
          ? undefined
          : wrap(p),
  });
});

// ─── drizzle-orm mock ────────────────────────────────────────────────────────

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  ne: (a: unknown, b: unknown) => ({ op: 'ne', a, b }),
  asc: (_a: unknown) => ({ op: 'asc' }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
    {},
  ),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
}));

// ─── Audit + dashboard mocks ─────────────────────────────────────────────────

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: unknown) => { store.auditCalls.push(args); }),
}));

vi.mock('@/lib/brain/dashboard', () => ({
  revalidateBrainStaticCounts: vi.fn((clientId: number) => { store.revalidateCalls.push(clientId); }),
}));

// ─── DB mock — all helpers defined INSIDE the factory for reliable closure ───

vi.mock('@/lib/db', () => {
  // ── predicate helpers ────────────────────────────────────────────────────

  type Filter = {
    op?: string;
    a?: { __col?: string };
    b?: unknown;
    args?: Filter[];
    values?: unknown[];
  };

  function evalFilter(filter: unknown, row: Record<string, unknown>): boolean {
    if (!filter || typeof filter !== 'object') return true;
    const f = filter as Filter;
    switch (f.op) {
      case 'eq': return f.a?.__col ? row[f.a.__col] === f.b : true;
      case 'ne': return f.a?.__col ? row[f.a.__col] !== f.b : true;
      case 'and': return (f.args ?? []).every((a) => evalFilter(a, row));
      case 'sql': {
        // sql`` fragments carry template values. Detect LIKE path patterns:
        // the source always passes (path, exactStr, path, likeStr) where
        // likeStr ends with '/%'. Use these to filter by path prefix.
        const vals = (f.values ?? []) as unknown[];
        const likeStr = vals.find((v): v is string => typeof v === 'string' && v.endsWith('/%'));
        const exactStr = vals.find((v): v is string => typeof v === 'string' && v !== likeStr && !v.endsWith('::text[]') && typeof v === 'string');
        if (likeStr) {
          const prefix = likeStr.slice(0, -2); // strip /%
          const path = row['path'] as string | undefined;
          if (path === undefined) return true; // no path column — pass through
          return path === prefix || path.startsWith(prefix + '/') || path === (exactStr ?? null);
        }
        return true; // no LIKE pattern — pass (e.g. ANY(slugs) queries)
      }
      default: return true;
    }
  }

  function project(
    row: Record<string, unknown>,
    proj: Record<string, unknown> | null,
    matchedRows?: Array<Record<string, unknown>>,
  ): Record<string, unknown> {
    if (!proj) return { ...row };
    const out: Record<string, unknown> = {};
    for (const [alias, ref] of Object.entries(proj)) {
      const r = ref as { __col?: string; op?: string } | undefined;
      if (r?.op === 'sql') {
        // count(*)::int — return the count of all matched rows, same for every row.
        out[alias] = matchedRows?.length ?? 1;
      } else {
        out[alias] = r?.__col ? row[r.__col] : undefined;
      }
    }
    return out;
  }

  function rows(name: string): Array<Record<string, unknown>> {
    return (store as unknown as Record<string, Array<Record<string, unknown>>>)[name] ?? [];
  }

  // ── select builder ───────────────────────────────────────────────────────

  function buildSelect(proj: Record<string, unknown> | null) {
    let table = '';
    let filter: unknown = null;
    let limitN: number | null = null;
    let joined = false;

    const chain: Record<string, unknown> = {
      from(t: { __table: string }) { table = t.__table; return chain; },
      innerJoin(_t: unknown, _on: unknown) { joined = true; return chain; },
      where(f: unknown) { filter = f; return chain; },
      orderBy() { return chain; },
      groupBy() { return resolve(); },
      limit(n: number) { limitN = n; return resolve(); },
      then(ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) {
        return resolve().then(ok, fail);
      },
    };

    function resolve(): Promise<Array<Record<string, unknown>>> {
      if (!table) return Promise.resolve([]);

      // Inner-join path: brainPersonOrgUnits × brainPeople
      if (table === 'brainPersonOrgUnits' && joined && proj && 'fullName' in proj) {
        const filtered = store.brainPersonOrgUnits.filter(
          (r) => evalFilter(filter, r as unknown as Record<string, unknown>),
        );
        return Promise.resolve(filtered.map((r) => {
          const p = store.brainPeople.find((pp) => pp.id === r.personId);
          return {
            personId: r.personId,
            fullName: p?.fullName ?? '',
            title: p?.title ?? null,
            primary: r.primary,
            roleInUnit: r.roleInUnit,
          };
        }));
      }

      const matched = rows(table).filter((r) => evalFilter(filter, r));

      // GROUP BY aggregate (count(*))
      const hasSqlCol = proj && Object.values(proj).some((v) => (v as { op?: string })?.op === 'sql');
      if (hasSqlCol && proj) {
        // Find the non-sql column (group-by key).
        const groupCol = Object.entries(proj).find(([, v]) => (v as { op?: string })?.op !== 'sql');
        if (groupCol) {
          const [alias, ref] = groupCol;
          const colName = (ref as { __col?: string }).__col;
          if (colName) {
            const groups = new Map<unknown, number>();
            for (const r of matched) {
              const k = r[colName];
              groups.set(k, (groups.get(k) ?? 0) + 1);
            }
            return Promise.resolve(
              Array.from(groups.entries()).map(([k, cnt]) => ({ [alias]: k, count: cnt })),
            );
          }
        }
      }

      let out = matched.map((r) => project(r, proj, matched));
      if (limitN !== null) out = out.slice(0, limitN);
      return Promise.resolve(out);
    }

    return chain;
  }

  // ── insert builder ───────────────────────────────────────────────────────

  let _id = 5000;
  function nextInsertId() { return _id++; }

  function buildInsert(t: { __table: string }) {
    return {
      values(vals: Record<string, unknown> | Record<string, unknown>[]) {
        const arr = Array.isArray(vals) ? vals : [vals];
        const inserted = arr.map((v) => {
          const row = { ...v, id: nextInsertId(), createdAt: new Date(), updatedAt: new Date() };
          rows(t.__table).push(row);
          return row;
        });
        return {
          onConflictDoUpdate(_opts: unknown) {
            const [nr] = inserted;
            if (nr && 'personId' in nr && 'orgUnitId' in nr) {
              const all = rows(t.__table);
              const existIdx = all.findIndex(
                (r) => r['personId'] === nr['personId'] && r['orgUnitId'] === nr['orgUnitId'] && r['id'] !== nr['id'],
              );
              if (existIdx !== -1) {
                const existing = all[existIdx];
                Object.assign(existing, { primary: nr['primary'], roleInUnit: nr['roleInUnit'] });
                const dupIdx = all.findIndex((r) => r['id'] === nr['id']);
                if (dupIdx !== -1) all.splice(dupIdx, 1);
                return { returning() { return Promise.resolve([existing]); } };
              }
            }
            return { returning() { return Promise.resolve(inserted); } };
          },
          returning() { return Promise.resolve(inserted); },
          then(ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) {
            return Promise.resolve(inserted).then(ok, fail);
          },
        };
      },
    };
  }

  // ── update builder ───────────────────────────────────────────────────────

  function buildUpdate(t: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            const matched = rows(t.__table).filter((r) => evalFilter(filter, r));
            for (const r of matched) Object.assign(r, patch);
            return {
              returning() { return Promise.resolve(matched.map((r) => ({ ...r }))); },
              then(ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) {
                return Promise.resolve(matched.map((r) => ({ ...r }))).then(ok, fail);
              },
            };
          },
        };
      },
    };
  }

  // ── delete builder ───────────────────────────────────────────────────────

  function buildDelete(t: { __table: string }) {
    return {
      where(filter: unknown) {
        const all = rows(t.__table);
        const matched: Array<Record<string, unknown>> = [];
        const rest: Array<Record<string, unknown>> = [];
        for (const r of all) (evalFilter(filter, r) ? matched : rest).push(r);
        all.length = 0;
        for (const r of rest) all.push(r);
        return {
          returning() { return Promise.resolve(matched.map((r) => ({ id: r['id'] }))); },
          then(ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) {
            return Promise.resolve(matched.map((r) => ({ id: r['id'] }))).then(ok, fail);
          },
        };
      },
    };
  }

  // ── transaction ──────────────────────────────────────────────────────────

  async function fakeTransaction(fn: (tx: unknown) => Promise<void>) {
    const tx = { select: buildSelect, insert: buildInsert, update: buildUpdate, delete: buildDelete };
    await fn(tx);
  }

  return {
    db: {
      select: buildSelect,
      insert: buildInsert,
      update: buildUpdate,
      delete: buildDelete,
      transaction: fakeTransaction,
    },
  };
});

// ─── Import module under test AFTER mocks ────────────────────────────────────

const {
  listOrgUnits,
  getOrgUnitTree,
  getOrgUnitById,
  createOrgUnit,
  updateOrgUnit,
  moveOrgUnit,
  mergeOrgUnits,
  deleteOrgUnit,
  addMember,
  removeMember,
  setPrimaryUnit,
} = await import('@/lib/brain/org-units');

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _testId = 1;
function nextId() { return _testId++; }

function makeUnit(over: Partial<OrgUnitRow> = {}): OrgUnitRow {
  return {
    id: nextId(),
    clientId: 1,
    parentId: null,
    name: 'Engineering',
    slug: 'engineering',
    path: '/engineering',
    description: null,
    leadPersonId: null,
    color: null,
    icon: null,
    sortOrder: 0,
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function makePerson(over: Partial<PersonRow> = {}): PersonRow {
  return {
    id: nextId(),
    clientId: 1,
    fullName: 'Alice Smith',
    title: 'Engineer',
    ...over,
  };
}

function makeMembership(over: Partial<PersonOrgUnitRow> = {}): PersonOrgUnitRow {
  return {
    id: nextId(),
    clientId: 1,
    personId: 100,
    orgUnitId: 200,
    primary: false,
    roleInUnit: null,
    ...over,
  };
}

beforeEach(() => {
  store.brainOrgUnits.length = 0;
  store.brainPersonOrgUnits.length = 0;
  store.brainPeople.length = 0;
  store.auditCalls.length = 0;
  store.revalidateCalls.length = 0;
});

// ─── listOrgUnits ─────────────────────────────────────────────────────────────

describe('listOrgUnits', () => {
  it('returns empty array when no units', async () => {
    expect(await listOrgUnits(1)).toEqual([]);
  });

  it('returns units present in the store', async () => {
    const u = makeUnit({ clientId: 1 });
    store.brainOrgUnits.push(u);
    const result = await listOrgUnits(1);
    expect(result.find((r) => r.id === u.id)).toBeDefined();
  });
});

// ─── getOrgUnitTree ──────────────────────────────────────────────────────────

describe('getOrgUnitTree', () => {
  it('returns empty tree when no units', async () => {
    expect(await getOrgUnitTree(1)).toEqual([]);
  });

  it('assembles root nodes with memberCount=0', async () => {
    const u = makeUnit({ clientId: 1, parentId: null, sortOrder: 0 });
    store.brainOrgUnits.push(u);
    const [node] = await getOrgUnitTree(1);
    expect(node.id).toBe(u.id);
    expect(node.children).toEqual([]);
    expect(node.memberCount).toBe(0);
  });

  it('attaches child to parent and exposes memberCount', async () => {
    const parent = makeUnit({ id: 10, clientId: 1, parentId: null, sortOrder: 0 });
    const child = makeUnit({ id: 11, clientId: 1, parentId: 10, slug: 'platform', path: '/engineering/platform', sortOrder: 0 });
    store.brainOrgUnits.push(parent, child);
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, orgUnitId: 10, personId: 42 }));

    const tree = await getOrgUnitTree(1);
    const parentNode = tree.find((n) => n.id === 10);
    expect(parentNode!.children).toHaveLength(1);
    expect(parentNode!.children[0].id).toBe(11);
    expect(typeof parentNode!.memberCount).toBe('number');
  });

  it('orphan defense — child whose parent is missing surfaces as root', async () => {
    const orphan = makeUnit({ id: 20, clientId: 1, parentId: 999, sortOrder: 0 });
    store.brainOrgUnits.push(orphan);
    const tree = await getOrgUnitTree(1);
    expect(tree.some((n) => n.id === 20)).toBe(true);
  });

  it('sorts children by sortOrder then name', async () => {
    const parent = makeUnit({ id: 30, clientId: 1, parentId: null, sortOrder: 0 });
    const c1 = makeUnit({ id: 31, clientId: 1, parentId: 30, sortOrder: 2, name: 'Beta', slug: 'beta', path: '/p/beta' });
    const c2 = makeUnit({ id: 32, clientId: 1, parentId: 30, sortOrder: 1, name: 'Alpha', slug: 'alpha', path: '/p/alpha' });
    const c3 = makeUnit({ id: 33, clientId: 1, parentId: 30, sortOrder: 1, name: 'Zeta', slug: 'zeta', path: '/p/zeta' });
    store.brainOrgUnits.push(parent, c1, c2, c3);
    const tree = await getOrgUnitTree(1);
    const pNode = tree.find((n) => n.id === 30)!;
    expect(pNode.children.map((c) => c.id)).toEqual([32, 33, 31]);
  });
});

// ─── getOrgUnitById ───────────────────────────────────────────────────────────

describe('getOrgUnitById', () => {
  it('returns null when unit not found', async () => {
    expect(await getOrgUnitById(1, 9999)).toBeNull();
  });

  it('returns unit with empty ancestors + members for a root unit', async () => {
    const u = makeUnit({ id: 50, clientId: 1, parentId: null, slug: 'eng', path: '/eng' });
    store.brainOrgUnits.push(u);
    const result = await getOrgUnitById(1, 50);
    expect(result!.unit.id).toBe(50);
    expect(result!.ancestors).toEqual([]);
    expect(result!.members).toEqual([]);
  });

  it('resolves ancestor chain from path segments', async () => {
    const eng = makeUnit({ id: 60, clientId: 1, slug: 'eng', path: '/eng' });
    const plat = makeUnit({ id: 61, clientId: 1, slug: 'platform', path: '/eng/platform', parentId: 60 });
    const rt = makeUnit({ id: 62, clientId: 1, slug: 'runtime', path: '/eng/platform/runtime', parentId: 61 });
    store.brainOrgUnits.push(eng, plat, rt);
    const result = await getOrgUnitById(1, 62);
    expect(result!.ancestors.length).toBe(2);
    expect(result!.ancestors[0].slug).toBe('eng');
    expect(result!.ancestors[1].slug).toBe('platform');
  });

  it('returns members joined with people data', async () => {
    const u = makeUnit({ id: 70, clientId: 1, slug: 'design', path: '/design' });
    const person = makePerson({ id: 200, clientId: 1, fullName: 'Bob', title: 'Designer' });
    store.brainOrgUnits.push(u);
    store.brainPeople.push(person);
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, orgUnitId: 70, personId: 200, primary: true, roleInUnit: 'Lead' }));
    const result = await getOrgUnitById(1, 70);
    expect(result!.members).toHaveLength(1);
    expect(result!.members[0].fullName).toBe('Bob');
    expect(result!.members[0].primary).toBe(true);
    expect(result!.members[0].roleInUnit).toBe('Lead');
  });
});

// ─── createOrgUnit ───────────────────────────────────────────────────────────

describe('createOrgUnit', () => {
  it('throws when name is empty', async () => {
    await expect(createOrgUnit(1, null, { name: '   ' })).rejects.toThrow('Org unit name is required.');
  });

  it('throws when parentId not found', async () => {
    await expect(createOrgUnit(1, null, { name: 'Sub', parentId: 9999 })).rejects.toThrow('not found');
  });

  it('throws when leadPersonId not found', async () => {
    await expect(createOrgUnit(1, null, { name: 'Team', leadPersonId: 9999 })).rejects.toThrow('not found');
  });

  it('creates a root unit', async () => {
    const created = await createOrgUnit(1, null, { name: 'Engineering' });
    expect(created.slug).toBe('engineering');
    expect(created.path).toBe('/engineering');
    expect(created.parentId).toBeNull();
    expect(store.auditCalls).toHaveLength(1);
    expect(store.revalidateCalls).toContain(1);
  });

  it('creates a child unit with parent path', async () => {
    const parent = makeUnit({ id: 80, clientId: 1, slug: 'eng', path: '/eng' });
    store.brainOrgUnits.push(parent);
    const child = await createOrgUnit(1, 42, { name: 'Platform', parentId: 80 });
    expect(child.parentId).toBe(80);
    expect(child.path).toBe('/eng/platform');
  });

  it('deduplicates slug with -2 suffix', async () => {
    store.brainOrgUnits.push(makeUnit({ clientId: 1, slug: 'engineering', path: '/engineering' }));
    const created = await createOrgUnit(1, null, { name: 'Engineering' });
    expect(created.slug).toBe('engineering-2');
  });

  it('creates with valid leadPersonId', async () => {
    const person = makePerson({ id: 300, clientId: 1 });
    store.brainPeople.push(person);
    const created = await createOrgUnit(1, null, { name: 'Team', leadPersonId: 300 });
    expect(created.leadPersonId).toBe(300);
  });

  it('applies optional fields (color, icon, description, sortOrder)', async () => {
    const created = await createOrgUnit(1, null, { name: 'Design', color: '#f00', icon: 'palette', description: 'D', sortOrder: 5 });
    expect(created.color).toBe('#f00');
    expect(created.icon).toBe('palette');
    expect(created.description).toBe('D');
    expect(created.sortOrder).toBe(5);
  });
});

// ─── updateOrgUnit ───────────────────────────────────────────────────────────

describe('updateOrgUnit', () => {
  it('returns null when unit not found', async () => {
    expect(await updateOrgUnit(1, null, 9999, { name: 'X' })).toBeNull();
  });

  it('throws when leadPersonId not found', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 90, clientId: 1 }));
    await expect(updateOrgUnit(1, null, 90, { leadPersonId: 9999 })).rejects.toThrow('not found');
  });

  it('updates name and description without touching slug or path', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 91, clientId: 1, slug: 'eng', path: '/eng' }));
    const updated = await updateOrgUnit(1, 1, 91, { name: 'Eng Revised', description: 'New' });
    expect(updated!.name).toBe('Eng Revised');
    expect(updated!.slug).toBe('eng');
    expect(store.auditCalls).toHaveLength(1);
  });

  it('updates with valid leadPersonId', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 92, clientId: 1 }));
    store.brainPeople.push(makePerson({ id: 400, clientId: 1 }));
    const updated = await updateOrgUnit(1, null, 92, { leadPersonId: 400 });
    expect(updated!.leadPersonId).toBe(400);
  });

  it('updates color, icon, sortOrder', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 93, clientId: 1 }));
    const updated = await updateOrgUnit(1, null, 93, { color: '#0f0', icon: 'group', sortOrder: 3 });
    expect(updated!.color).toBe('#0f0');
    expect(updated!.sortOrder).toBe(3);
  });
});

// ─── moveOrgUnit ─────────────────────────────────────────────────────────────

describe('moveOrgUnit', () => {
  it('returns null when unit not found', async () => {
    expect(await moveOrgUnit(1, null, 9999, null)).toBeNull();
  });

  it('no-op when parent is already the same', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 100, clientId: 1, parentId: null }));
    const result = await moveOrgUnit(1, null, 100, null);
    expect(result!.id).toBe(100);
    expect(store.auditCalls).toHaveLength(0);
  });

  it('throws when new parent not found', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 101, clientId: 1, parentId: null }));
    await expect(moveOrgUnit(1, null, 101, 9999)).rejects.toThrow('not found');
  });

  it('throws on cycle — move under self', async () => {
    // Only the moving unit is in the store.
    store.brainOrgUnits.push(makeUnit({ id: 102, clientId: 1, parentId: null, slug: 'eng', path: '/eng' }));
    await expect(moveOrgUnit(1, null, 102, 102)).rejects.toThrow('Cannot move org unit under itself');
  });

  it('moves a root unit under a new parent', async () => {
    // newParent lives at /infra — clearly different from /moving.
    const newParent = makeUnit({ id: 110, clientId: 1, slug: 'infra', path: '/infra' });
    // moving lives at /moving — subtree query filters path='/moving' OR LIKE '/moving/%'.
    // /infra does NOT start with '/moving/' so the LIKE filter should exclude it.
    const moving = makeUnit({ id: 111, clientId: 1, slug: 'moving', path: '/moving', parentId: null });
    store.brainOrgUnits.push(newParent, moving);

    const result = await moveOrgUnit(1, 42, 111, 110);
    expect(result).not.toBeNull();
    expect(result!.path).toBe('/infra/moving');
    expect(store.auditCalls).toHaveLength(1);
  });

  it('moves to root (newParentId = null)', async () => {
    // parent at /infra, moving at /infra/eng.
    // Subtree filter: path='/infra/eng' OR LIKE '/infra/eng/%'.
    // /infra does NOT equal '/infra/eng' and does NOT start with '/infra/eng/'.
    store.brainOrgUnits.push(makeUnit({ id: 120, clientId: 1, slug: 'infra', path: '/infra' }));
    store.brainOrgUnits.push(makeUnit({ id: 121, clientId: 1, slug: 'eng', path: '/infra/eng', parentId: 120 }));
    const result = await moveOrgUnit(1, null, 121, null);
    expect(result!.path).toBe('/eng');
  });

  it('rewrites descendant paths in transaction', async () => {
    const dest = makeUnit({ id: 130, clientId: 1, slug: 'dest', path: '/dest' });
    // moving at /src, child at /src/kid.
    const moving = makeUnit({ id: 131, clientId: 1, slug: 'src', path: '/src', parentId: null });
    const child = makeUnit({ id: 132, clientId: 1, slug: 'kid', path: '/src/kid', parentId: 131 });
    store.brainOrgUnits.push(dest, moving, child);

    await moveOrgUnit(1, null, 131, 130);
    const updated = store.brainOrgUnits.find((u) => u.id === 132);
    expect(updated!.path).toBe('/dest/src/kid');
  });
});

// ─── mergeOrgUnits ───────────────────────────────────────────────────────────

describe('mergeOrgUnits', () => {
  it('throws when source === target', async () => {
    await expect(mergeOrgUnits(1, null, 5, 5)).rejects.toThrow('itself');
  });

  it('returns null when source not found', async () => {
    expect(await mergeOrgUnits(1, null, 9999, 1)).toBeNull();
  });

  it('throws when target not found', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 140, clientId: 1, slug: 's140', path: '/s140' }));
    await expect(mergeOrgUnits(1, null, 140, 9999)).rejects.toThrow('not found');
  });

  it('throws when target is a descendant of source', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 150, clientId: 1, slug: 'srcpar', path: '/srcpar' }));
    store.brainOrgUnits.push(makeUnit({ id: 151, clientId: 1, slug: 'srcchild', path: '/srcpar/srcchild', parentId: 150 }));
    await expect(mergeOrgUnits(1, null, 150, 151)).rejects.toThrow('descendants');
  });

  it('merges source into target (no children, no members)', async () => {
    // Use completely separate slugs/paths to avoid LIKE bleed.
    store.brainOrgUnits.push(makeUnit({ id: 160, clientId: 1, slug: 'oldt', path: '/oldt' }));
    store.brainOrgUnits.push(makeUnit({ id: 161, clientId: 1, slug: 'newt', path: '/newt' }));
    const result = await mergeOrgUnits(1, 1, 160, 161);
    expect(result!.id).toBe(161);
    expect(store.brainOrgUnits.find((u) => u.id === 160)).toBeUndefined();
    expect(store.auditCalls).toHaveLength(1);
    expect(store.revalidateCalls).toContain(1);
  });

  it('deduplicates members (drops source row when person already in target)', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 170, clientId: 1, slug: 'sA', path: '/sA' }));
    store.brainOrgUnits.push(makeUnit({ id: 171, clientId: 1, slug: 'tA', path: '/tA' }));
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, orgUnitId: 170, personId: 500 }));
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, orgUnitId: 171, personId: 500 }));
    const before = store.brainPersonOrgUnits.length;
    await mergeOrgUnits(1, null, 170, 171);
    expect(store.brainPersonOrgUnits.length).toBeLessThan(before);
    expect(store.brainPersonOrgUnits.find((m) => m.personId === 500 && m.orgUnitId === 171)).toBeDefined();
  });

  it('reattaches non-duplicate members to target', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 180, clientId: 1, slug: 'sB', path: '/sB' }));
    store.brainOrgUnits.push(makeUnit({ id: 181, clientId: 1, slug: 'tB', path: '/tB' }));
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, orgUnitId: 180, personId: 600 }));
    await mergeOrgUnits(1, null, 180, 181);
    const m = store.brainPersonOrgUnits.find((r) => r.personId === 600);
    expect(m!.orgUnitId).toBe(181);
  });

  it('reparents source children under target', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 190, clientId: 1, slug: 'sC', path: '/sC' }));
    store.brainOrgUnits.push(makeUnit({ id: 191, clientId: 1, slug: 'tC', path: '/tC' }));
    store.brainOrgUnits.push(makeUnit({ id: 192, clientId: 1, slug: 'kid', path: '/sC/kid', parentId: 190 }));
    await mergeOrgUnits(1, null, 190, 191);
    const kid = store.brainOrgUnits.find((u) => u.id === 192);
    expect(kid!.parentId).toBe(191);
    expect(kid!.path).toBe('/tC/kid');
  });
});

// ─── deleteOrgUnit ───────────────────────────────────────────────────────────

describe('deleteOrgUnit', () => {
  it('returns false when unit not found', async () => {
    expect(await deleteOrgUnit(1, null, 9999)).toBe(false);
  });

  it('throws when unit has members and force is not set', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 200, clientId: 1, slug: 'wm', path: '/wm' }));
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, orgUnitId: 200, personId: 700 }));
    await expect(deleteOrgUnit(1, null, 200)).rejects.toThrow('force=true');
  });

  it('throws when unit has children and force is not set', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 201, clientId: 1, slug: 'pd', path: '/pd' }));
    store.brainOrgUnits.push(makeUnit({ id: 202, clientId: 1, slug: 'cd', path: '/pd/cd', parentId: 201 }));
    await expect(deleteOrgUnit(1, null, 201)).rejects.toThrow('force=true');
  });

  it('error message references both member and child counts', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 203, clientId: 1, slug: 'md', path: '/md' }));
    store.brainOrgUnits.push(makeUnit({ id: 204, clientId: 1, slug: 'chmul', path: '/md/chmul', parentId: 203 }));
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, orgUnitId: 203, personId: 800 }));
    await expect(deleteOrgUnit(1, null, 203)).rejects.toThrow(/member|child/i);
  });

  it('deletes a leaf unit with no members or children', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 210, clientId: 1, slug: 'leaf', path: '/leaf' }));
    expect(await deleteOrgUnit(1, 1, 210)).toBe(true);
    expect(store.brainOrgUnits.find((x) => x.id === 210)).toBeUndefined();
    expect(store.auditCalls).toHaveLength(1);
    expect(store.revalidateCalls).toContain(1);
  });

  it('force-deletes unit with members (members detached)', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 211, clientId: 1, slug: 'wmf', path: '/wmf' }));
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, orgUnitId: 211, personId: 900 }));
    expect(await deleteOrgUnit(1, null, 211, { force: true })).toBe(true);
    expect(store.brainPersonOrgUnits.find((m) => m.orgUnitId === 211 && m.personId === 900)).toBeUndefined();
  });

  it('force-deletes a root unit — children become roots with corrected paths', async () => {
    // /rx deleted; child /rx/kx becomes /kx.
    store.brainOrgUnits.push(makeUnit({ id: 230, clientId: 1, slug: 'rx', path: '/rx', parentId: null }));
    store.brainOrgUnits.push(makeUnit({ id: 231, clientId: 1, slug: 'kx', path: '/rx/kx', parentId: 230 }));
    expect(await deleteOrgUnit(1, null, 230, { force: true })).toBe(true);
    const updated = store.brainOrgUnits.find((x) => x.id === 231);
    expect(updated!.parentId).toBeNull();
    expect(updated!.path).toBe('/kx');
  });

  it('force-deletes a nested unit — children reparented to grandparent', async () => {
    // grandparent /gp; deleted /gp/mid; grandchild /gp/mid/gc → /gp/gc.
    store.brainOrgUnits.push(makeUnit({ id: 220, clientId: 1, slug: 'gp', path: '/gp' }));
    store.brainOrgUnits.push(makeUnit({ id: 221, clientId: 1, slug: 'mid', path: '/gp/mid', parentId: 220 }));
    store.brainOrgUnits.push(makeUnit({ id: 222, clientId: 1, slug: 'gc', path: '/gp/mid/gc', parentId: 221 }));
    expect(await deleteOrgUnit(1, null, 221, { force: true })).toBe(true);
    const gc = store.brainOrgUnits.find((x) => x.id === 222);
    expect(gc!.parentId).toBe(220);
    expect(gc!.path).toBe('/gp/gc');
  });
});

// ─── addMember ───────────────────────────────────────────────────────────────

describe('addMember', () => {
  it('throws when org unit not found', async () => {
    await expect(addMember(1, null, { orgUnitId: 9999, personId: 1 })).rejects.toThrow('not found');
  });

  it('throws when person not found', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 240, clientId: 1 }));
    await expect(addMember(1, null, { orgUnitId: 240, personId: 9999 })).rejects.toThrow('not found');
  });

  it('inserts a non-primary membership', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 241, clientId: 1 }));
    store.brainPeople.push(makePerson({ id: 1000, clientId: 1 }));
    const r = await addMember(1, null, { orgUnitId: 241, personId: 1000, primary: false });
    expect(r.personId).toBe(1000);
    expect(r.primary).toBe(false);
    expect(store.auditCalls).toHaveLength(1);
  });

  it('inserts a primary membership and flips other memberships', async () => {
    store.brainOrgUnits.push(makeUnit({ id: 242, clientId: 1 }));
    store.brainOrgUnits.push(makeUnit({ id: 243, clientId: 1, slug: 'u2', path: '/u2' }));
    store.brainPeople.push(makePerson({ id: 1001, clientId: 1 }));
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, orgUnitId: 243, personId: 1001, primary: true }));
    const r = await addMember(1, null, { orgUnitId: 242, personId: 1001, primary: true });
    expect(r.primary).toBe(true);
    const other = store.brainPersonOrgUnits.find((m) => m.orgUnitId === 243 && m.personId === 1001);
    expect(other!.primary).toBe(false);
  });
});

// ─── removeMember ────────────────────────────────────────────────────────────

describe('removeMember', () => {
  it('returns false when membership not found', async () => {
    expect(await removeMember(1, null, { orgUnitId: 9999, personId: 9999 })).toBe(false);
  });

  it('returns true and removes the membership', async () => {
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, orgUnitId: 250, personId: 2000 }));
    expect(await removeMember(1, 1, { orgUnitId: 250, personId: 2000 })).toBe(true);
    expect(store.brainPersonOrgUnits.find((m) => m.orgUnitId === 250 && m.personId === 2000)).toBeUndefined();
    expect(store.auditCalls).toHaveLength(1);
  });
});

// ─── setPrimaryUnit ───────────────────────────────────────────────────────────

describe('setPrimaryUnit', () => {
  it('returns false when (person, unit) pair does not exist', async () => {
    expect(await setPrimaryUnit(1, null, 9999, 9999)).toBe(false);
  });

  it('sets primary=true on target and primary=false on others in same tx', async () => {
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, personId: 3000, orgUnitId: 260, primary: true }));
    store.brainPersonOrgUnits.push(makeMembership({ clientId: 1, personId: 3000, orgUnitId: 261, primary: false }));
    expect(await setPrimaryUnit(1, 1, 3000, 261)).toBe(true);
    expect(store.brainPersonOrgUnits.find((m) => m.orgUnitId === 260)!.primary).toBe(false);
    expect(store.brainPersonOrgUnits.find((m) => m.orgUnitId === 261)!.primary).toBe(true);
    expect(store.auditCalls).toHaveLength(1);
  });
});
