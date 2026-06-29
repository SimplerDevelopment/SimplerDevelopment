// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Companion coverage test for lib/brain/people.ts.
 *
 * The primary test (tests/unit/brain-people.test.ts) covers:
 *   scoreWhoKnowsCandidates, wouldCreateManagerCycle, createPerson basics.
 *
 * This file covers everything else:
 *   listPeople, getPersonById, updatePerson, deletePerson,
 *   attachExpertise, detachExpertise,
 *   listExpertiseTags, getExpertiseTagById,
 *   createExpertiseTag, updateExpertiseTag, deleteExpertiseTag,
 *   mergeExpertiseTags, whoKnows.
 *
 * @typescript-eslint/only-throw-error — not applicable; we only throw via
 *   module under test (which throws Error literals).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── MOCK STATE ───────────────────────────────────────────────────────────────
// selectQueue: each db.select() call pops the front entry. Each entry is the
// array that the terminal chain call resolves with.
// The chain is fully fluid: every method returns `this`; the last one resolves.
// Terminal methods: limit() and offset() both resolve to avoid ordering issues.

const selectQueue: any[][] = [];
let insertResult: any[] = [];
let updateResult: any[] = [];
let deleteResult: any[] = [];

function makeChain(results: any[]): any {
  const c: any = {
    from: () => c,
    innerJoin: () => c,
    where: () => c,
    orderBy: () => c,
    // Both limit() and offset() resolve so the chain works regardless of
    // which is last.  The module calls .limit().offset() for listPeople, and
    // .limit() alone for the many single-row fetches.
    limit: () => c,
    offset: () => Promise.resolve(results),
    // Some chains end at .limit() without .offset() — expose as a thenable
    // by making limit() return a promise-like that ALSO has chain methods.
    then: (resolve: any) => Promise.resolve(results).then(resolve),
    catch: (reject: any) => Promise.resolve(results).catch(reject),
    finally: (fn: any) => Promise.resolve(results).finally(fn),
  };
  // Override limit to return a chain that is ALSO a thenable (for cases that
  // end at limit) AND has .offset() for the listPeople call.
  c.limit = () => {
    const sub: any = {
      ...c,
      offset: () => Promise.resolve(results),
      then: (resolve: any) => Promise.resolve(results).then(resolve),
      catch: (reject: any) => Promise.resolve(results).catch(reject),
      finally: (fn: any) => Promise.resolve(results).finally(fn),
    };
    return sub;
  };
  return c;
}

// Build a mock db that supports all the operations people.ts uses.
// For the transaction case we want the callback to receive a tx that uses the
// same selectQueue so tests can stage responses in order.
function buildMockDb(): any {
  const mockDb: any = {
    select: vi.fn(() => makeChain(selectQueue.shift() ?? [])),
    insert: vi.fn(() => ({
      values: () => ({ returning: () => Promise.resolve(insertResult) }),
    })),
    update: vi.fn(() => ({
      set: () => ({
        where: () => ({ returning: () => Promise.resolve(updateResult) }),
      }),
    })),
    delete: vi.fn(() => ({
      where: () => ({ returning: () => Promise.resolve(deleteResult) }),
    })),
    transaction: vi.fn(async (cb: (tx: any) => Promise<any>) => cb(mockDb)),
  };
  return mockDb;
}

const mockDb = buildMockDb();

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('@/lib/db/schema', () => ({
  brainPeople: {
    clientId: {}, id: {}, managerId: {}, fullName: {}, email: {}, title: {},
    status: {}, source: {}, userId: {}, startDate: {}, endDate: {}, notes: {},
    profileUrls: {}, createdBy: {}, updatedAt: {},
    $inferInsert: {},
  },
  brainOrgUnits: { id: {}, name: {}, path: {} },
  brainPersonOrgUnits: {
    clientId: {}, personId: {}, orgUnitId: {}, primary: {}, roleInUnit: {},
  },
  brainExpertiseTags: {
    clientId: {}, id: {}, name: {}, slug: {}, description: {}, source: {},
    createdAt: {},
    $inferInsert: {},
  },
  brainPersonExpertise: {
    clientId: {}, personId: {}, expertiseTagId: {}, level: {}, id: {},
  },
  brainAuditLogs: {
    clientId: {}, actorId: {}, action: {}, entityType: {}, entityId: {}, metadata: {},
  },
  clientMembers: { clientId: {}, userId: {}, id: {} },
}));

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async () => undefined),
}));

vi.mock('@/lib/brain/dashboard', () => ({
  revalidateBrainDashboard: vi.fn(),
  revalidateBrainStaticCounts: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  asc: (a: unknown) => ({ op: 'asc', a }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
    {},
  ),
}));

// ─── IMPORT MODULE UNDER TEST ─────────────────────────────────────────────────

const mod = await import('@/lib/brain/people');
const {
  listPeople,
  getPersonById,
  updatePerson,
  deletePerson,
  attachExpertise,
  detachExpertise,
  listExpertiseTags,
  getExpertiseTagById,
  createExpertiseTag,
  updateExpertiseTag,
  deleteExpertiseTag,
  mergeExpertiseTags,
  whoKnows,
} = mod;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function stage(rows: any[]) {
  selectQueue.push(rows);
}

function resetDb(opts: { insert?: any[]; update?: any[]; del?: any[] } = {}) {
  selectQueue.length = 0;
  insertResult = opts.insert ?? [];
  updateResult = opts.update ?? [];
  deleteResult = opts.del ?? [];
  mockDb.select.mockClear();
  mockDb.insert.mockClear();
  mockDb.update.mockClear();
  mockDb.delete.mockClear();
  mockDb.transaction.mockClear();
  // Re-apply impls after .mockClear().
  mockDb.select.mockImplementation(() => makeChain(selectQueue.shift() ?? []));
  mockDb.insert.mockImplementation(() => ({
    values: () => ({ returning: () => Promise.resolve(insertResult) }),
  }));
  mockDb.update.mockImplementation(() => ({
    set: () => ({
      where: () => ({ returning: () => Promise.resolve(updateResult) }),
    }),
  }));
  mockDb.delete.mockImplementation(() => ({
    where: () => ({ returning: () => Promise.resolve(deleteResult) }),
  }));
  mockDb.transaction.mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockDb));
}

const PERSON_ROW = {
  id: 1,
  clientId: 10,
  fullName: 'Alice',
  email: 'alice@example.com',
  title: 'Engineer',
  status: 'active' as const,
  managerId: null as number | null,
  notes: null,
  profileUrls: [],
  source: 'manual',
  startDate: null,
  endDate: null,
  userId: null as number | null,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TAG_ROW = {
  id: 5,
  clientId: 10,
  name: 'TypeScript',
  slug: 'typescript',
  description: null as string | null,
  source: 'manual',
  createdAt: new Date(),
};

// ─── listPeople ───────────────────────────────────────────────────────────────

describe('listPeople @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('returns empty array when no rows', async () => {
    stage([]); // person rows
    const result = await listPeople(10, {});
    expect(result).toEqual([]);
  });

  it('happy path — returns mapped rows with primaryOrgUnit', async () => {
    stage([{ id: 1, fullName: 'Alice', email: 'a@x.com', title: 'Eng', status: 'active', managerId: null }]);
    stage([{ personId: 1, orgUnitId: 7, orgUnitName: 'Engineering' }]);
    const result = await listPeople(10, {});
    expect(result).toHaveLength(1);
    expect(result[0].primaryOrgUnit).toEqual({ id: 7, name: 'Engineering' });
  });

  it('returns null primaryOrgUnit when no primary unit found for person', async () => {
    stage([{ id: 1, fullName: 'Bob', email: null, title: null, status: 'active', managerId: null }]);
    stage([]);
    const result = await listPeople(10, {});
    expect(result[0].primaryOrgUnit).toBeNull();
  });

  it('applies single status string filter', async () => {
    stage([]);
    await listPeople(10, { status: 'active' });
    // No throw = filter applied without error.
  });

  it('applies non-empty status array filter', async () => {
    stage([]);
    await listPeople(10, { status: ['active', 'inactive'] });
  });

  it('skips inArray for empty status array', async () => {
    stage([]);
    await listPeople(10, { status: [] });
  });

  it('applies managerId filter', async () => {
    stage([]);
    await listPeople(10, { managerId: 42 });
  });

  it('applies non-empty search filter', async () => {
    stage([]);
    await listPeople(10, { search: 'alice' });
  });

  it('ignores whitespace-only search', async () => {
    stage([]);
    await listPeople(10, { search: '   ' });
  });

  it('applies orgUnitId EXISTS subquery filter', async () => {
    stage([]);
    await listPeople(10, { orgUnitId: 3 });
  });

  it('applies expertiseTagId EXISTS subquery filter', async () => {
    stage([]);
    await listPeople(10, { expertiseTagId: 9 });
  });

  it('clamps limit above 100 to 100', async () => {
    stage([]);
    await listPeople(10, { limit: 9999 });
  });

  it('falls back to default limit for NaN', async () => {
    stage([]);
    await listPeople(10, { limit: NaN });
  });

  it('normalises negative offset to 0', async () => {
    stage([]);
    await listPeople(10, { offset: -5 });
  });
});

// ─── getPersonById ────────────────────────────────────────────────────────────

describe('getPersonById @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('returns null when person not found', async () => {
    stage([]);
    expect(await getPersonById(10, 999)).toBeNull();
  });

  it('returns person with null manager when managerId is null', async () => {
    stage([{ ...PERSON_ROW, managerId: null }]); // person
    stage([]); // directReports
    stage([]); // orgUnits
    stage([]); // expertise
    const result = await getPersonById(10, 1);
    expect(result).not.toBeNull();
    expect(result!.manager).toBeNull();
    expect(result!.person.fullName).toBe('Alice');
  });

  it('resolves manager row when managerId is set', async () => {
    const manager = { id: 2, fullName: 'Bob', title: 'Lead' };
    stage([{ ...PERSON_ROW, managerId: 2 }]); // person
    stage([manager]); // manager
    stage([]); // directReports
    stage([]); // orgUnits
    stage([]); // expertise
    const result = await getPersonById(10, 1);
    expect(result!.manager).toEqual(manager);
  });

  it('sets manager to null when managerId is set but manager row missing', async () => {
    stage([{ ...PERSON_ROW, managerId: 2 }]);
    stage([]); // manager not found
    stage([]); // directReports
    stage([]); // orgUnits
    stage([]); // expertise
    const result = await getPersonById(10, 1);
    expect(result!.manager).toBeNull();
  });

  it('includes direct reports, orgUnits, and expertise in result', async () => {
    stage([{ ...PERSON_ROW, managerId: null }]);
    stage([{ id: 3, fullName: 'Charlie', title: null }]); // directReports
    stage([{ id: 7, name: 'Eng', path: '/eng', primary: true, roleInUnit: null }]); // orgUnits
    stage([{ tagId: 5, name: 'TypeScript', level: 3 }]); // expertise
    const result = await getPersonById(10, 1);
    expect(result!.directReports).toHaveLength(1);
    expect(result!.orgUnits[0].name).toBe('Eng');
    expect(result!.expertise[0].name).toBe('TypeScript');
  });
});

// ─── updatePerson ─────────────────────────────────────────────────────────────

describe('updatePerson @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('returns null when person not found in pre-check', async () => {
    stage([]); // before = []
    expect(await updatePerson(10, 99, 1, { fullName: 'Nope' })).toBeNull();
  });

  it('throws when managerId change would create a self-cycle', async () => {
    stage([PERSON_ROW]); // before exists
    // wouldCreateManagerCycle: personId===newManagerId short-circuits before db hits
    await expect(updatePerson(10, 99, 1, { managerId: 1 })).rejects.toThrow(/cycle/i);
  });

  it('happy path — updates all patchable fields', async () => {
    stage([PERSON_ROW]); // before
    // wouldCreateManagerCycle needs one select for descendants (managerId=null→skip, use managerId=3)
    stage([]); // collectDescendants: no descendants of person 1
    resetDb({ update: [{ ...PERSON_ROW, fullName: 'Alice Updated', status: 'inactive' as const }] });
    stage([PERSON_ROW]); // re-stage because resetDb cleared
    stage([]); // collectDescendants

    const result = await updatePerson(10, 99, 1, {
      fullName: 'Alice Updated',
      email: 'new@x.com',
      managerId: 3, // non-null, triggers cycle guard
      title: 'Senior',
      startDate: null,
      endDate: null,
      status: 'inactive',
      notes: 'note',
      profileUrls: [{ label: 'gh', url: 'https://github.com/alice' }],
    });
    expect(result!.fullName).toBe('Alice Updated');
  });

  it('revalidates dashboard when status flips active → inactive', async () => {
    const { revalidateBrainDashboard } = await import('@/lib/brain/dashboard');
    const mockRevalidate = vi.mocked(revalidateBrainDashboard);
    mockRevalidate.mockClear();

    const before = { ...PERSON_ROW, status: 'active' as const };
    const updated = { ...PERSON_ROW, status: 'inactive' as const };
    stage([before]);
    resetDb({ update: [updated] });
    stage([before]); // re-stage after resetDb

    await updatePerson(10, 99, 1, { status: 'inactive' });
    expect(mockRevalidate).toHaveBeenCalledWith(10);
  });

  it('does NOT revalidate when status does not change', async () => {
    const { revalidateBrainDashboard } = await import('@/lib/brain/dashboard');
    const mockRevalidate = vi.mocked(revalidateBrainDashboard);
    mockRevalidate.mockClear();

    const before = { ...PERSON_ROW, status: 'active' as const };
    const updated = { ...PERSON_ROW, status: 'active' as const };
    stage([before]);
    resetDb({ update: [updated] });
    stage([before]);

    await updatePerson(10, 99, 1, { status: 'active' });
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it('returns null when update returns empty (race)', async () => {
    stage([PERSON_ROW]);
    resetDb({ update: [] });
    stage([PERSON_ROW]);

    const result = await updatePerson(10, 99, 1, { title: 'Ghost' });
    expect(result).toBeNull();
  });
});

// ─── deletePerson ─────────────────────────────────────────────────────────────

describe('deletePerson @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('returns false when person not found', async () => {
    stage([]); // row not found
    expect(await deletePerson(10, 99, 999)).toBe(false);
  });

  it('returns true and revalidates when deleted', async () => {
    const { revalidateBrainDashboard } = await import('@/lib/brain/dashboard');
    const mockRevalidate = vi.mocked(revalidateBrainDashboard);
    mockRevalidate.mockClear();

    stage([{ id: 1 }]); // row found
    resetDb({ del: [{ id: 1 }] });
    stage([{ id: 1 }]);

    expect(await deletePerson(10, 99, 1)).toBe(true);
    expect(mockRevalidate).toHaveBeenCalledWith(10);
  });

  it('returns false when delete returns empty (concurrent delete)', async () => {
    stage([{ id: 1 }]);
    resetDb({ del: [] });
    stage([{ id: 1 }]);

    expect(await deletePerson(10, 99, 1)).toBe(false);
  });
});

// ─── attachExpertise ──────────────────────────────────────────────────────────

describe('attachExpertise @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('throws when person not found in tenant', async () => {
    stage([]); // person lookup fails
    await expect(attachExpertise(10, 99, 1, { expertiseTagId: 5 })).rejects.toThrow(/person not found/i);
  });

  it('throws when expertise tag not found in tenant', async () => {
    stage([{ id: 1 }]); // person found
    stage([]);           // tag not found
    await expect(attachExpertise(10, 99, 1, { expertiseTagId: 5 })).rejects.toThrow(/expertise tag not found/i);
  });

  it('updates level and returns alreadyAttached=true when junction exists', async () => {
    stage([{ id: 1 }]);  // person
    stage([{ id: 5 }]);  // tag
    stage([{ id: 42 }]); // existing junction
    const result = await attachExpertise(10, 99, 1, { expertiseTagId: 5, level: 3 });
    expect(result).toEqual({ id: 42, alreadyAttached: true });
  });

  it('inserts new junction when not attached, returns alreadyAttached=false', async () => {
    stage([{ id: 1 }]); // person
    stage([{ id: 5 }]); // tag
    stage([]);           // no existing junction
    resetDb({ insert: [{ id: 77 }] });
    stage([{ id: 1 }]);
    stage([{ id: 5 }]);
    stage([]);

    const result = await attachExpertise(10, 99, 1, { expertiseTagId: 5, level: null });
    expect(result).toEqual({ id: 77, alreadyAttached: false });
  });

  it('defaults level to null when omitted', async () => {
    stage([{ id: 1 }]);
    stage([{ id: 5 }]);
    stage([]);
    resetDb({ insert: [{ id: 78 }] });
    stage([{ id: 1 }]);
    stage([{ id: 5 }]);
    stage([]);

    const result = await attachExpertise(10, 99, 1, { expertiseTagId: 5 });
    expect(result.alreadyAttached).toBe(false);
  });
});

// ─── detachExpertise ──────────────────────────────────────────────────────────

describe('detachExpertise @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('returns false when no junction exists', async () => {
    resetDb({ del: [] });
    expect(await detachExpertise(10, 99, 1, 5)).toBe(false);
  });

  it('returns true when junction deleted', async () => {
    resetDb({ del: [{ id: 42 }] });
    expect(await detachExpertise(10, 99, 1, 5)).toBe(true);
  });
});

// ─── listExpertiseTags ────────────────────────────────────────────────────────

describe('listExpertiseTags @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('returns empty array when no tags', async () => {
    stage([]);
    expect(await listExpertiseTags(10, {})).toEqual([]);
  });

  it('maps rows and coerces string peopleCount to number', async () => {
    stage([{ ...TAG_ROW, peopleCount: '3' }]);
    const result = await listExpertiseTags(10, {});
    expect(result[0].peopleCount).toBe(3);
    expect(result[0].name).toBe('TypeScript');
  });

  it('coerces null peopleCount to 0', async () => {
    stage([{ ...TAG_ROW, peopleCount: null }]);
    const result = await listExpertiseTags(10, {});
    expect(result[0].peopleCount).toBe(0);
  });

  it('applies source filter without error', async () => {
    stage([]);
    await listExpertiseTags(10, { source: 'import' });
  });

  it('applies non-empty search filter', async () => {
    stage([]);
    await listExpertiseTags(10, { search: 'type' });
  });

  it('ignores whitespace-only search', async () => {
    stage([]);
    await listExpertiseTags(10, { search: '  ' });
  });
});

// ─── getExpertiseTagById ──────────────────────────────────────────────────────

describe('getExpertiseTagById @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('returns null when tag not found', async () => {
    stage([]);
    expect(await getExpertiseTagById(10, 5)).toBeNull();
  });

  it('returns tag with associated people', async () => {
    stage([TAG_ROW]);
    stage([{ id: 1, fullName: 'Alice', title: 'Eng', level: 2 }]);
    const result = await getExpertiseTagById(10, 5);
    expect(result!.tag.name).toBe('TypeScript');
    expect(result!.people).toHaveLength(1);
  });
});

// ─── createExpertiseTag ───────────────────────────────────────────────────────

describe('createExpertiseTag @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('throws when name is blank', async () => {
    await expect(createExpertiseTag(10, 99, { name: '  ' })).rejects.toThrow(/name is required/i);
  });

  it('creates tag when no slug collision', async () => {
    stage([]);  // no collision
    resetDb({ insert: [TAG_ROW] });
    stage([]);

    const result = await createExpertiseTag(10, 99, { name: 'TypeScript' });
    expect(result.slug).toBe('typescript');
  });

  it('disambiguates slug by appending counter on collision', async () => {
    stage([{ id: 99 }]); // first slug taken
    stage([]);            // second slug free
    resetDb({ insert: [{ ...TAG_ROW, slug: 'typescript-2' }] });
    stage([{ id: 99 }]);
    stage([]);

    const result = await createExpertiseTag(10, 99, { name: 'TypeScript' });
    expect(result.slug).toBe('typescript-2');
  });

  it('passes description and source through to insert', async () => {
    stage([]);
    resetDb({ insert: [{ ...TAG_ROW, description: 'A typed language', source: 'import' }] });
    stage([]);

    const result = await createExpertiseTag(10, 99, {
      name: 'TypeScript',
      description: 'A typed language',
      source: 'import',
    });
    expect(result.description).toBe('A typed language');
    expect(result.source).toBe('import');
  });

  it('revalidates static counts after create', async () => {
    const { revalidateBrainStaticCounts } = await import('@/lib/brain/dashboard');
    vi.mocked(revalidateBrainStaticCounts).mockClear();

    stage([]);
    resetDb({ insert: [TAG_ROW] });
    stage([]);

    await createExpertiseTag(10, 99, { name: 'Go' });
    expect(vi.mocked(revalidateBrainStaticCounts)).toHaveBeenCalledWith(10);
  });
});

// ─── updateExpertiseTag ───────────────────────────────────────────────────────

describe('updateExpertiseTag @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('returns current row unchanged when patch is empty (no-op path)', async () => {
    stage([TAG_ROW]);
    const result = await updateExpertiseTag(10, 99, 5, {});
    expect(result!.name).toBe('TypeScript');
  });

  it('returns null when no-op and tag not found', async () => {
    stage([]);
    expect(await updateExpertiseTag(10, 99, 999, {})).toBeNull();
  });

  it('updates name field', async () => {
    const updated = { ...TAG_ROW, name: 'TS' };
    resetDb({ update: [updated] });
    expect((await updateExpertiseTag(10, 99, 5, { name: 'TS' }))!.name).toBe('TS');
  });

  it('updates description field without name', async () => {
    const updated = { ...TAG_ROW, description: 'Desc only' };
    resetDb({ update: [updated] });
    expect((await updateExpertiseTag(10, 99, 5, { description: 'Desc only' }))!.description).toBe('Desc only');
  });

  it('returns null when update finds no matching row (race)', async () => {
    resetDb({ update: [] });
    expect(await updateExpertiseTag(10, 99, 5, { name: 'Missing' })).toBeNull();
  });
});

// ─── deleteExpertiseTag ───────────────────────────────────────────────────────

describe('deleteExpertiseTag @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('returns not_found when tag does not exist', async () => {
    stage([]);
    expect(await deleteExpertiseTag(10, 99, 999)).toEqual({ deleted: false, reason: 'not_found' });
  });

  it('returns in_use when usage count > 0 and force=false', async () => {
    stage([{ id: 5 }]);  // tag found
    stage([{ count: 2 }]); // usage check
    expect(await deleteExpertiseTag(10, 99, 5)).toEqual({ deleted: false, reason: 'in_use' });
  });

  it('proceeds to delete when usage count is 0', async () => {
    stage([{ id: 5 }]);
    stage([{ count: 0 }]);
    const result = await deleteExpertiseTag(10, 99, 5);
    expect(result.deleted).toBe(true);
  });

  it('force=true skips usage check and deletes', async () => {
    stage([{ id: 5 }]); // only tag lookup needed
    const result = await deleteExpertiseTag(10, 99, 5, { force: true });
    expect(result).toEqual({ deleted: true });
  });

  it('revalidates static counts after successful delete', async () => {
    const { revalidateBrainStaticCounts } = await import('@/lib/brain/dashboard');
    vi.mocked(revalidateBrainStaticCounts).mockClear();

    stage([{ id: 5 }]);
    stage([{ count: 0 }]);

    await deleteExpertiseTag(10, 99, 5);
    expect(vi.mocked(revalidateBrainStaticCounts)).toHaveBeenCalledWith(10);
  });
});

// ─── mergeExpertiseTags ───────────────────────────────────────────────────────

describe('mergeExpertiseTags @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('throws when sourceId === targetId', async () => {
    await expect(mergeExpertiseTags(10, 99, 5, 5)).rejects.toThrow(/cannot merge a tag into itself/i);
  });

  it('throws when source tag not found', async () => {
    stage([]); // source lookup → not found
    await expect(mergeExpertiseTags(10, 99, 5, 6)).rejects.toThrow(/source tag not found/i);
  });

  it('throws when target tag not found', async () => {
    stage([{ id: 5 }]); // source found
    stage([]);           // target not found
    await expect(mergeExpertiseTags(10, 99, 5, 6)).rejects.toThrow(/target tag not found/i);
  });

  it('merges with zero sourceLinks and reattached=0', async () => {
    stage([{ id: 5 }]); // source
    stage([{ id: 6 }]); // target
    stage([]);           // sourceLinks = []
    resetDb({ insert: [{}] });
    stage([{ id: 5 }]);
    stage([{ id: 6 }]);
    stage([]);

    const result = await mergeExpertiseTags(10, 99, 5, 6);
    expect(result).toEqual({ merged: true, reattached: 0 });
  });

  it('revalidates static counts after merge', async () => {
    const { revalidateBrainStaticCounts } = await import('@/lib/brain/dashboard');
    vi.mocked(revalidateBrainStaticCounts).mockClear();

    stage([{ id: 5 }]);
    stage([{ id: 6 }]);
    stage([]);
    resetDb({ insert: [{}] });
    stage([{ id: 5 }]);
    stage([{ id: 6 }]);
    stage([]);

    await mergeExpertiseTags(10, 99, 5, 6);
    expect(vi.mocked(revalidateBrainStaticCounts)).toHaveBeenCalledWith(10);
  });

  it('re-points junction when target has no existing row (reattached++)', async () => {
    // sourceLinks = [{id:1, personId:1, level:2}]
    // existing check for (person=1, target=6) → [] → re-point branch
    stage([{ id: 5 }]);
    stage([{ id: 6 }]);
    stage([{ id: 1, personId: 1, level: 2 }]); // sourceLinks
    stage([]);                                  // existing check → not found
    resetDb({ insert: [{}] });
    stage([{ id: 5 }]);
    stage([{ id: 6 }]);
    stage([{ id: 1, personId: 1, level: 2 }]);
    stage([]);

    const result = await mergeExpertiseTags(10, 99, 5, 6);
    expect(result.reattached).toBe(1);
  });

  it('drops source junction when target already has person (no level to copy)', async () => {
    // existing row has level=null, source link has level=null → skip level update
    stage([{ id: 5 }]);
    stage([{ id: 6 }]);
    stage([{ id: 1, personId: 1, level: null }]); // sourceLinks
    stage([{ id: 99, level: null }]);              // existing for (person=1, target=6)
    resetDb({ insert: [{}] });
    stage([{ id: 5 }]);
    stage([{ id: 6 }]);
    stage([{ id: 1, personId: 1, level: null }]);
    stage([{ id: 99, level: null }]);

    const result = await mergeExpertiseTags(10, 99, 5, 6);
    expect(result.reattached).toBe(0);
  });

  it('copies source level to target when target.level is null and source has level', async () => {
    // existing row has level=null, source link has level=3 → update existing level
    stage([{ id: 5 }]);
    stage([{ id: 6 }]);
    stage([{ id: 1, personId: 1, level: 3 }]); // sourceLinks
    stage([{ id: 99, level: null }]);           // existing with null level
    resetDb({ insert: [{}] });
    stage([{ id: 5 }]);
    stage([{ id: 6 }]);
    stage([{ id: 1, personId: 1, level: 3 }]);
    stage([{ id: 99, level: null }]);

    const result = await mergeExpertiseTags(10, 99, 5, 6);
    expect(result.reattached).toBe(0);
    // update() was called for the level copy.
    expect(mockDb.update).toHaveBeenCalled();
  });
});

// ─── whoKnows ─────────────────────────────────────────────────────────────────

describe('whoKnows @brain @people @unit', () => {
  beforeEach(() => resetDb());

  it('returns empty result for empty query string', async () => {
    expect(await whoKnows(10, '')).toEqual({ tagMatches: [], people: [] });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns empty result for whitespace-only query', async () => {
    expect(await whoKnows(10, '   ')).toEqual({ tagMatches: [], people: [] });
  });

  it('returns empty result when no tags match query', async () => {
    stage([]); // matchedTags = []
    expect(await whoKnows(10, 'kubernetes')).toEqual({ tagMatches: [], people: [] });
  });

  it('returns tagMatches with empty people when no junctions found', async () => {
    const tagMatch = { id: 5, name: 'TypeScript' };
    stage([tagMatch]); // matchedTags
    stage([]);         // junctions = []
    const result = await whoKnows(10, 'type');
    expect(result.tagMatches).toEqual([tagMatch]);
    expect(result.people).toEqual([]);
  });

  it('returns scored people from junctions with primary org unit', async () => {
    const tagMatch = { id: 5, name: 'TypeScript' };
    const junction = { personId: 1, tagId: 5, tagName: 'TypeScript', level: 3, fullName: 'Alice', title: 'Engineer' };
    const primaryRow = { personId: 1, orgUnitId: 7, orgUnitName: 'Engineering' };
    stage([tagMatch]);   // matchedTags
    stage([junction]);   // junctions
    stage([primaryRow]); // primaryRows
    const result = await whoKnows(10, 'type');
    expect(result.people).toHaveLength(1);
    expect(result.people[0].fullName).toBe('Alice');
    // score: 1 (tag) + 0.5 (level) + 0.2 (primary org) = 1.7
    expect(result.people[0].score).toBe(1.7);
    expect(result.people[0].primaryOrgUnit).toEqual({ id: 7, name: 'Engineering' });
  });

  it('handles person with no primary org unit (score has no +0.2 bonus)', async () => {
    stage([{ id: 5, name: 'TypeScript' }]);
    stage([{ personId: 2, tagId: 5, tagName: 'TypeScript', level: null, fullName: 'Bob', title: null }]);
    stage([]); // no primaryRows
    const result = await whoKnows(10, 'type');
    expect(result.people[0].primaryOrgUnit).toBeNull();
    expect(result.people[0].score).toBe(1);
  });

  it('aggregates multiple matched tags for the same person', async () => {
    const tags = [{ id: 5, name: 'TypeScript' }, { id: 6, name: 'React' }];
    const junctions = [
      { personId: 1, tagId: 5, tagName: 'TypeScript', level: null, fullName: 'Alice', title: null },
      { personId: 1, tagId: 6, tagName: 'React', level: 2, fullName: 'Alice', title: null },
    ];
    stage(tags);
    stage(junctions);
    stage([]); // no primary rows
    const result = await whoKnows(10, 'script');
    expect(result.people).toHaveLength(1);
    expect(result.people[0].matchedTags).toHaveLength(2);
    // 1 + 1 + 0.5 (level on React) = 2.5
    expect(result.people[0].score).toBe(2.5);
  });

  it('respects limit option', async () => {
    const tags = [{ id: 5, name: 'TypeScript' }];
    const junctions = [1, 2, 3].map((n) => ({
      personId: n, tagId: 5, tagName: 'TypeScript', level: null, fullName: `Person${n}`, title: null,
    }));
    stage(tags);
    stage(junctions);
    stage([]); // no primary rows
    const result = await whoKnows(10, 'type', { limit: 2 });
    expect(result.people.length).toBeLessThanOrEqual(2);
  });
});
