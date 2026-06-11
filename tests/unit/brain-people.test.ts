// @vitest-environment node
/**
 * Unit tests for lib/brain/people.ts pure helpers + tenant-validation logic.
 *
 * Covers:
 *   - scoreWhoKnowsCandidates: table-driven scoring (per-tag, level bonus,
 *     primary-org-unit bonus, sort order, limit cap).
 *   - createPerson: userId tenancy validation rejects users not in the client.
 *   - wouldCreateManagerCycle: rejects self-as-manager and descendant chains.
 *   - listPeople: status/managerId/search/orgUnit/expertiseTag filters, empty result.
 *   - getPersonById: found (with manager + reports + orgUnits + expertise), not found.
 *   - updatePerson: not found, cycle guard, field patching, status-flip revalidation.
 *   - deletePerson: not found, found+deleted.
 *   - attachExpertise: person not found, tag not found, already-attached update, fresh insert.
 *   - detachExpertise: deleted, not-found.
 *   - listExpertiseTags: basic, search filter, source filter.
 *   - getExpertiseTagById: found, not found.
 *   - createExpertiseTag: happy path, slug collision, empty name.
 *   - updateExpertiseTag: name patch, no-op empty patch, not found.
 *   - deleteExpertiseTag: not found, in_use, force delete.
 *   - mergeExpertiseTags: same-id guard, source not found, reattach path.
 *   - whoKnows: empty query, no tag matches, no junctions, full scoring path.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── MOCKS — must be hoisted before importing the module under test. ─────────

const mockInsertReturning = vi.fn();
const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
};

vi.mock('@/lib/db', () => ({ db: mockDb }));

vi.mock('@/lib/db/schema', () => ({
  brainPeople: { clientId: {}, id: {}, managerId: {}, fullName: {}, email: {}, title: {}, status: {}, notes: {}, profileUrls: {} },
  brainOrgUnits: { id: {}, name: {}, path: {} },
  brainPersonOrgUnits: { clientId: {}, personId: {}, orgUnitId: {}, primary: {}, roleInUnit: {} },
  brainExpertiseTags: { clientId: {}, id: {}, name: {}, slug: {}, description: {}, source: {}, createdAt: {} },
  brainPersonExpertise: { clientId: {}, id: {}, personId: {}, expertiseTagId: {}, level: {} },
  brainAuditLogs: {},
  clientMembers: { clientId: {}, userId: {}, id: {} },
}));

// The audit module reads db internally — short-circuit it so we don't have to
// model the audit insert chain on every test.
vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async () => undefined),
}));

// Dashboard revalidation — fire-and-forget side-effects, short-circuit.
vi.mock('@/lib/brain/dashboard', () => ({
  revalidateBrainDashboard: vi.fn(),
  revalidateBrainStaticCounts: vi.fn(),
}));

const peopleMod = await import('@/lib/brain/people');
const {
  scoreWhoKnowsCandidates,
  createPerson,
  wouldCreateManagerCycle,
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
} = peopleMod;

// ─── FIXTURE FACTORIES ────────────────────────────────────────────────────────

const FIXED_DATE = new Date('2024-01-15T10:00:00.000Z');

function makePerson(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    clientId: 10,
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    title: 'Engineer',
    status: 'active' as const,
    managerId: null,
    notes: null,
    profileUrls: [],
    userId: null,
    source: 'manual',
    startDate: null,
    endDate: null,
    createdBy: null,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
    ...over,
  };
}

function makeTag(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 50,
    clientId: 10,
    name: 'TypeScript',
    slug: 'typescript',
    description: null,
    source: 'manual',
    createdAt: FIXED_DATE,
    ...over,
  };
}

/**
 * Build a single-chain select mock that resolves immediately.
 * chain: e.g. ['from','where','limit'] or ['from','innerJoin','where','orderBy']
 * Each intermediate returns `this` except the final which resolves `result`.
 */
function selectChain(result: unknown[], ...chain: string[]) {
  const last = chain[chain.length - 1];
  const obj: Record<string, unknown> = {};
  for (const key of chain) {
    if (key === last) {
      obj[key] = () => Promise.resolve(result);
    } else {
      obj[key] = () => obj;
    }
  }
  return { from: () => obj };
}

/**
 * Build a select mock that returns `this` through every intermediate
 * in `throughKeys` and then resolves `result` when the FINAL key is called.
 * This mirrors how Drizzle's fluent builder works when the caller awaits
 * the terminal call.
 */
function selectFluent(result: unknown[], ...chain: string[]) {
  // Same as selectChain but also allows chaining from `from` returning obj.
  return selectChain(result, ...chain);
}

// ─── 1. scoreWhoKnowsCandidates — table-driven scoring ───────────────────────

describe('scoreWhoKnowsCandidates @brain @people @unit', () => {
  function person(over: Partial<{
    id: number;
    name: string;
    title: string | null;
    hasPrimary: boolean;
    tags: { id: number; name: string; level: number | null }[];
  }>) {
    return {
      personId: over.id ?? 1,
      fullName: over.name ?? 'A',
      title: over.title ?? null,
      hasPrimaryOrgUnit: over.hasPrimary ?? false,
      primaryOrgUnit: (over.hasPrimary ?? false) ? { id: 99, name: 'Eng' } : null,
      matchedTags: over.tags ?? [],
    };
  }

  it('case 1 — single matched tag, no level: score=1', () => {
    const r = scoreWhoKnowsCandidates([
      person({ id: 1, name: 'Alice', tags: [{ id: 10, name: 'k8s', level: null }] }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].score).toBe(1);
  });

  it('case 2 — matched tag with level set adds +0.5 bonus', () => {
    const r = scoreWhoKnowsCandidates([
      person({ id: 1, name: 'Alice', tags: [{ id: 10, name: 'k8s', level: 3 }] }),
    ]);
    expect(r[0].score).toBe(1.5);
  });

  it('case 3 — primary-org-unit adds +0.2 bonus once per person', () => {
    const r = scoreWhoKnowsCandidates([
      person({
        id: 1,
        name: 'Alice',
        hasPrimary: true,
        tags: [
          { id: 10, name: 'k8s', level: null },
          { id: 11, name: 'helm', level: null },
        ],
      }),
    ]);
    // 2 tags (no level) + 0.2 primary = 2.2
    expect(r[0].score).toBe(2.2);
    expect(r[0].primaryOrgUnit).toEqual({ id: 99, name: 'Eng' });
  });

  it('case 4 — combined: 2 tags, one with level, + primary', () => {
    const r = scoreWhoKnowsCandidates([
      person({
        id: 1,
        name: 'Alice',
        hasPrimary: true,
        tags: [
          { id: 10, name: 'k8s', level: 4 },
          { id: 11, name: 'helm', level: null },
        ],
      }),
    ]);
    // 1 + 0.5 (level) + 1 + 0 + 0.2 = 2.7
    expect(r[0].score).toBe(2.7);
  });

  it('case 5 — sort by score DESC, fullName ASC tie-break, with limit cap', () => {
    const r = scoreWhoKnowsCandidates(
      [
        person({ id: 1, name: 'Charlie', tags: [{ id: 10, name: 'k8s', level: null }] }),    // 1
        person({ id: 2, name: 'Bob', tags: [{ id: 10, name: 'k8s', level: 3 }] }),           // 1.5
        person({ id: 3, name: 'Alice', tags: [{ id: 10, name: 'k8s', level: null }] }),      // 1 — ties Charlie, sorted first
        person({
          id: 4,
          name: 'Dana',
          hasPrimary: true,
          tags: [{ id: 10, name: 'k8s', level: 4 }, { id: 11, name: 'helm', level: 2 }],
        }), // 1+0.5 + 1+0.5 + 0.2 = 3.2
      ],
      3,
    );
    expect(r.map((p) => p.fullName)).toEqual(['Dana', 'Bob', 'Alice']);
    expect(r).toHaveLength(3);
  });
});

// ─── 2. wouldCreateManagerCycle — descendant chain guard ─────────────────────

describe('wouldCreateManagerCycle @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
  });

  // The cycle guard walks descendants by repeatedly querying
  // `db.select(...).from(brain_people).where(inArray(managerId, frontier))`.
  // Tests below stage each iteration's result via sequential mockImplementation
  // returns — see the call counter in each `it` block.

  it('returns true when newManagerId === personId (self-loop)', async () => {
    // Doesn't need any db hits.
    mockDb.select.mockReturnValue({
      from: () => ({ where: () => Promise.resolve([]) }),
    });
    expect(await wouldCreateManagerCycle(1, 5, 5)).toBe(true);
  });

  it('returns true when newManagerId is a direct report of the person', async () => {
    // person 5 -> [10] (10 reports to 5). Making 10 the manager of 5 would cycle.
    let call = 0;
    mockDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call++;
          if (call === 1) return Promise.resolve([{ id: 10 }]); // 5's direct reports
          return Promise.resolve([]); // no more descendants
        },
      }),
    }));
    expect(await wouldCreateManagerCycle(1, 5, 10)).toBe(true);
  });

  it('returns true when newManagerId is a deeper descendant (5 → 10 → 20)', async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call++;
          if (call === 1) return Promise.resolve([{ id: 10 }]); // depth 1
          if (call === 2) return Promise.resolve([{ id: 20 }]); // depth 2 — descendant of 10
          return Promise.resolve([]);
        },
      }),
    }));
    expect(await wouldCreateManagerCycle(1, 5, 20)).toBe(true);
  });

  it('returns false when newManagerId is NOT in the descendant chain', async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call++;
          if (call === 1) return Promise.resolve([{ id: 10 }]);
          return Promise.resolve([]); // no further descendants
        },
      }),
    }));
    expect(await wouldCreateManagerCycle(1, 5, 99)).toBe(false);
  });
});

// ─── 3. createPerson — userId tenancy validation ─────────────────────────────

describe('createPerson — userId tenancy validation @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
    mockDb.insert.mockReset();
    mockInsertReturning.mockReset();
  });

  it('throws when userId does not belong to the calling tenant', async () => {
    // First db.select(...).from(clientMembers).where(...).limit(1) returns [].
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });

    await expect(
      createPerson(1, 99, { fullName: 'Hijack', userId: 7777 }),
    ).rejects.toThrow(/does not belong to this tenant/i);

    // Insert must NOT be reached.
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('inserts when userId is null (skip tenancy check)', async () => {
    // userId omitted → no clientMembers select. Wire up the insert path.
    mockInsertReturning.mockResolvedValueOnce([{ id: 42, fullName: 'Ada', clientId: 1 }]);
    mockDb.insert.mockReturnValueOnce({
      values: () => ({ returning: mockInsertReturning }),
    });

    const person = await createPerson(1, 99, { fullName: 'Ada' });
    expect(person.id).toBe(42);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('inserts when userId belongs to the tenant', async () => {
    // clientMembers lookup returns a row → ok to proceed.
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1 }]) }) }),
    });
    mockInsertReturning.mockResolvedValueOnce([{ id: 43, fullName: 'Linus', clientId: 1, userId: 7 }]);
    mockDb.insert.mockReturnValueOnce({
      values: () => ({ returning: mockInsertReturning }),
    });

    const person = await createPerson(1, 99, { fullName: 'Linus', userId: 7 });
    expect(person.id).toBe(43);
  });

  it('throws on empty fullName', async () => {
    await expect(createPerson(1, 99, { fullName: '   ' })).rejects.toThrow(/fullName/i);
  });
});

// ─── 4. listPeople ────────────────────────────────────────────────────────────

describe('listPeople @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
  });

  // Helper: wire up the two-select pattern (base people rows + primary org-unit batch).
  function wireListPeople(
    peopleRows: unknown[],
    primaryRows: unknown[] = [],
  ) {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) {
        // Base select: .from().where().orderBy().limit().offset()
        return {
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: () => Promise.resolve(peopleRows),
                }),
              }),
            }),
          }),
        };
      }
      // Second select: primary org-unit batch .from().innerJoin().where()
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve(primaryRows),
          }),
        }),
      };
    });
  }

  it('returns empty array when no people found', async () => {
    wireListPeople([]);
    const result = await listPeople(10, {});
    expect(result).toEqual([]);
    // Only one select call needed (short-circuits before primary lookup).
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('returns mapped rows with primaryOrgUnit=null when no primary membership', async () => {
    wireListPeople(
      [{ id: 1, fullName: 'Ada', email: 'ada@x.com', title: 'Eng', status: 'active', managerId: null }],
      [],
    );
    const rows = await listPeople(10, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 1,
      fullName: 'Ada',
      status: 'active',
      primaryOrgUnit: null,
    });
  });

  it('attaches primaryOrgUnit when org-unit batch returns a row', async () => {
    wireListPeople(
      [{ id: 1, fullName: 'Ada', email: null, title: null, status: 'active', managerId: null }],
      [{ personId: 1, orgUnitId: 99, orgUnitName: 'Engineering' }],
    );
    const rows = await listPeople(10, {});
    expect(rows[0].primaryOrgUnit).toEqual({ id: 99, name: 'Engineering' });
  });

  it('accepts a single status string filter without throwing', async () => {
    wireListPeople([]);
    await expect(listPeople(10, { status: 'active' })).resolves.toEqual([]);
  });

  it('accepts an array of statuses without throwing', async () => {
    wireListPeople([]);
    await expect(listPeople(10, { status: ['active', 'inactive'] })).resolves.toEqual([]);
  });

  it('accepts managerId filter without throwing', async () => {
    wireListPeople([]);
    await expect(listPeople(10, { managerId: 5 })).resolves.toEqual([]);
  });

  it('accepts search filter without throwing', async () => {
    wireListPeople([]);
    await expect(listPeople(10, { search: 'Ada' })).resolves.toEqual([]);
  });

  it('accepts orgUnitId filter without throwing', async () => {
    wireListPeople([]);
    await expect(listPeople(10, { orgUnitId: 99 })).resolves.toEqual([]);
  });

  it('accepts expertiseTagId filter without throwing', async () => {
    wireListPeople([]);
    await expect(listPeople(10, { expertiseTagId: 50 })).resolves.toEqual([]);
  });
});

// ─── 5. getPersonById ─────────────────────────────────────────────────────────

describe('getPersonById @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
  });

  it('returns null when person is not found', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
      }),
    });
    expect(await getPersonById(10, 999)).toBeNull();
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it('returns PersonWithRelations when person is found (no manager, no reports)', async () => {
    const person = makePerson({ id: 1, managerId: null });
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) {
        // Person lookup
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([person]) }) }) };
      }
      if (call === 2) {
        // Direct reports
        return { from: () => ({ where: () => ({ orderBy: () => Promise.resolve([]) }) }) };
      }
      if (call === 3) {
        // Org units
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({ orderBy: () => Promise.resolve([]) }),
            }),
          }),
        };
      }
      // Expertise
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({ orderBy: () => Promise.resolve([]) }),
          }),
        }),
      };
    });

    const result = await getPersonById(10, 1);
    expect(result).not.toBeNull();
    expect(result!.person.id).toBe(1);
    expect(result!.manager).toBeNull();
    expect(result!.directReports).toEqual([]);
    expect(result!.orgUnits).toEqual([]);
    expect(result!.expertise).toEqual([]);
  });

  it('resolves manager summary when person has managerId', async () => {
    const person = makePerson({ id: 2, managerId: 1 });
    const manager = { id: 1, fullName: 'Boss Person', title: 'Director' };
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) {
        // Person lookup
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([person]) }) }) };
      }
      if (call === 2) {
        // Manager lookup
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([manager]) }) }) };
      }
      if (call === 3) {
        // Direct reports
        return { from: () => ({ where: () => ({ orderBy: () => Promise.resolve([]) }) }) };
      }
      if (call === 4) {
        // Org units
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({ orderBy: () => Promise.resolve([]) }),
            }),
          }),
        };
      }
      // Expertise
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({ orderBy: () => Promise.resolve([]) }),
          }),
        }),
      };
    });

    const result = await getPersonById(10, 2);
    expect(result!.manager).toEqual(manager);
  });
});

// ─── 6. updatePerson ─────────────────────────────────────────────────────────

describe('updatePerson @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
    mockDb.update.mockReset();
  });

  it('returns null when person does not exist', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    expect(await updatePerson(10, 99, 999, { title: 'CTO' })).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('throws when manager change would create a cycle', async () => {
    const person = makePerson({ id: 5, managerId: null });
    let selectCall = 0;
    mockDb.select.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) {
        // "before" row fetch
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([person]) }) }) };
      }
      // collectDescendants — person 5 has direct report 5 (same person) simulated as descendant
      // We make 10 a direct report of 5 to trigger the cycle guard.
      return {
        from: () => ({
          where: () => Promise.resolve([{ id: 10 }]),
        }),
      };
    });

    // managerId: 10 — 10 is a descendant of 5, so this should cycle.
    await expect(updatePerson(10, 99, 5, { managerId: 10 })).rejects.toThrow(/cycle/i);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('updates fields and returns updated row', async () => {
    const before = makePerson({ id: 3, status: 'active' });
    const updated = makePerson({ id: 3, title: 'Staff Eng', status: 'active' });

    let selectCall = 0;
    mockDb.select.mockImplementation(() => {
      selectCall++;
      // Only the "before" fetch — no managerId patch so no cycle check selects.
      return { from: () => ({ where: () => ({ limit: () => Promise.resolve([before]) }) }) };
    });
    mockDb.update.mockReturnValueOnce({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([updated]),
        }),
      }),
    });

    const result = await updatePerson(10, 99, 3, { title: 'Staff Eng' });
    expect(result!.title).toBe('Staff Eng');
  });

  it('returns null when update returns empty (row deleted between read and write)', async () => {
    const before = makePerson({ id: 7 });
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([before]) }) }),
    });
    mockDb.update.mockReturnValueOnce({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    });

    expect(await updatePerson(10, 99, 7, { notes: 'hi' })).toBeNull();
  });
});

// ─── 7. deletePerson ─────────────────────────────────────────────────────────

describe('deletePerson @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
    mockDb.delete.mockReset();
  });

  it('returns false when person is not found', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    expect(await deletePerson(10, 99, 999)).toBe(false);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('returns true when person is found and deleted', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1 }]) }) }),
    });
    mockDb.delete.mockReturnValueOnce({
      where: () => ({
        returning: () => Promise.resolve([{ id: 1 }]),
      }),
    });

    expect(await deletePerson(10, 99, 1)).toBe(true);
  });

  it('returns false when delete affects zero rows (race condition)', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 2 }]) }) }),
    });
    mockDb.delete.mockReturnValueOnce({
      where: () => ({
        returning: () => Promise.resolve([]),
      }),
    });

    expect(await deletePerson(10, 99, 2)).toBe(false);
  });
});

// ─── 8. attachExpertise ───────────────────────────────────────────────────────

describe('attachExpertise @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
    mockDb.insert.mockReset();
    mockDb.update.mockReset();
  });

  it('throws when person is not found in tenant', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    await expect(
      attachExpertise(10, 99, 1, { expertiseTagId: 50 }),
    ).rejects.toThrow(/person not found/i);
  });

  it('throws when expertise tag is not found in tenant', async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) {
        // Person found
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1 }]) }) }) };
      }
      // Tag not found
      return { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) };
    });
    await expect(
      attachExpertise(10, 99, 1, { expertiseTagId: 50 }),
    ).rejects.toThrow(/expertise tag not found/i);
  });

  it('returns { alreadyAttached: true } and updates level when link already exists', async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1 }]) }) }) }; // person
      if (call === 2) return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 50 }]) }) }) }; // tag
      // Existing junction found
      return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 200 }]) }) }) };
    });
    mockDb.update.mockReturnValueOnce({
      set: () => ({ where: () => Promise.resolve() }),
    });

    const result = await attachExpertise(10, 99, 1, { expertiseTagId: 50, level: 3 });
    expect(result).toEqual({ id: 200, alreadyAttached: true });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('inserts new junction row and returns { alreadyAttached: false }', async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1 }]) }) }) }; // person
      if (call === 2) return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 50 }]) }) }) }; // tag
      // No existing junction
      return { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) };
    });
    mockDb.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.resolve([{ id: 300 }]) }),
    });

    const result = await attachExpertise(10, 99, 1, { expertiseTagId: 50 });
    expect(result).toEqual({ id: 300, alreadyAttached: false });
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });
});

// ─── 9. detachExpertise ───────────────────────────────────────────────────────

describe('detachExpertise @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.delete.mockReset();
  });

  it('returns false when no junction row exists', async () => {
    mockDb.delete.mockReturnValueOnce({
      where: () => ({ returning: () => Promise.resolve([]) }),
    });
    expect(await detachExpertise(10, 99, 1, 50)).toBe(false);
  });

  it('returns true when junction is deleted', async () => {
    mockDb.delete.mockReturnValueOnce({
      where: () => ({ returning: () => Promise.resolve([{ id: 200 }]) }),
    });
    expect(await detachExpertise(10, 99, 1, 50)).toBe(true);
  });
});

// ─── 10. listExpertiseTags ────────────────────────────────────────────────────

describe('listExpertiseTags @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
  });

  function wireTagList(rows: unknown[]) {
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: () => ({
              offset: () => Promise.resolve(rows),
            }),
          }),
        }),
      }),
    });
  }

  it('returns empty array when no tags exist', async () => {
    wireTagList([]);
    expect(await listExpertiseTags(10)).toEqual([]);
  });

  it('returns mapped rows with peopleCount coerced to number', async () => {
    wireTagList([makeTag({ peopleCount: '3' })]);
    const rows = await listExpertiseTags(10);
    expect(rows).toHaveLength(1);
    expect(rows[0].peopleCount).toBe(3);
    expect(rows[0].name).toBe('TypeScript');
  });

  it('accepts search filter without throwing', async () => {
    wireTagList([]);
    await expect(listExpertiseTags(10, { search: 'type' })).resolves.toEqual([]);
  });

  it('accepts source filter without throwing', async () => {
    wireTagList([]);
    await expect(listExpertiseTags(10, { source: 'imported' })).resolves.toEqual([]);
  });
});

// ─── 11. getExpertiseTagById ──────────────────────────────────────────────────

describe('getExpertiseTagById @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
  });

  it('returns null when tag not found', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    expect(await getExpertiseTagById(10, 999)).toBeNull();
  });

  it('returns tag with people when found', async () => {
    const tag = makeTag();
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) {
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([tag]) }) }) };
      }
      // People select
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => ({
              orderBy: () => Promise.resolve([{ id: 1, fullName: 'Ada', title: 'Eng', level: 2 }]),
            }),
          }),
        }),
      };
    });

    const result = await getExpertiseTagById(10, 50);
    expect(result).not.toBeNull();
    expect(result!.tag.id).toBe(50);
    expect(result!.people).toHaveLength(1);
    expect(result!.people[0].fullName).toBe('Ada');
  });
});

// ─── 12. createExpertiseTag ───────────────────────────────────────────────────

describe('createExpertiseTag @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
    mockDb.insert.mockReset();
  });

  it('throws when name is empty', async () => {
    await expect(createExpertiseTag(10, 99, { name: '   ' })).rejects.toThrow(/name is required/i);
  });

  it('creates a tag with no slug collision', async () => {
    // First slug-collision check: no collision → break immediately.
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    const created = makeTag({ id: 60 });
    mockDb.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.resolve([created]) }),
    });

    const result = await createExpertiseTag(10, 99, { name: 'TypeScript' });
    expect(result.id).toBe(60);
  });

  it('disambiguates slug when first candidate collides', async () => {
    let slugCall = 0;
    mockDb.select.mockImplementation(() => {
      slugCall++;
      if (slugCall === 1) {
        // 'typescript' collides
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1 }]) }) }) };
      }
      // 'typescript-2' is free
      return { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) };
    });
    const created = makeTag({ id: 61, slug: 'typescript-2' });
    mockDb.insert.mockReturnValueOnce({
      values: () => ({ returning: () => Promise.resolve([created]) }),
    });

    const result = await createExpertiseTag(10, 99, { name: 'TypeScript' });
    expect(result.slug).toBe('typescript-2');
  });
});

// ─── 13. updateExpertiseTag ───────────────────────────────────────────────────

describe('updateExpertiseTag @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
    mockDb.update.mockReset();
  });

  it('returns current row without hitting update when patch is empty', async () => {
    const tag = makeTag({ id: 50 });
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([tag]) }) }),
    });

    const result = await updateExpertiseTag(10, 99, 50, {});
    expect(result!.id).toBe(50);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns null when no-op fetch finds no tag', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    expect(await updateExpertiseTag(10, 99, 999, {})).toBeNull();
  });

  it('calls update and returns updated tag when name is patched', async () => {
    const updated = makeTag({ id: 50, name: 'JavaScript' });
    mockDb.update.mockReturnValueOnce({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([updated]),
        }),
      }),
    });

    const result = await updateExpertiseTag(10, 99, 50, { name: 'JavaScript' });
    expect(result!.name).toBe('JavaScript');
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it('returns null when update finds no row', async () => {
    mockDb.update.mockReturnValueOnce({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
        }),
      }),
    });
    expect(await updateExpertiseTag(10, 99, 999, { name: 'X' })).toBeNull();
  });
});

// ─── 14. deleteExpertiseTag ───────────────────────────────────────────────────

describe('deleteExpertiseTag @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
    mockDb.delete.mockReset();
  });

  it('returns not_found when tag does not exist', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    expect(await deleteExpertiseTag(10, 99, 999)).toEqual({ deleted: false, reason: 'not_found' });
  });

  it('returns in_use when tag is referenced and force is false', async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) {
        // Tag exists
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 50 }]) }) }) };
      }
      // Usage count > 0
      return {
        from: () => ({
          where: () => Promise.resolve([{ count: 2 }]),
        }),
      };
    });
    expect(await deleteExpertiseTag(10, 99, 50)).toEqual({ deleted: false, reason: 'in_use' });
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it('deletes when tag is not in use', async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) {
        return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 50 }]) }) }) };
      }
      return { from: () => ({ where: () => Promise.resolve([{ count: 0 }]) }) };
    });
    mockDb.delete.mockReturnValueOnce({
      where: () => Promise.resolve(),
    });

    expect(await deleteExpertiseTag(10, 99, 50)).toEqual({ deleted: true });
  });

  it('force-deletes even when tag is in use', async () => {
    mockDb.select.mockReturnValueOnce({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 50 }]) }) }),
    });
    mockDb.delete.mockReturnValueOnce({
      where: () => Promise.resolve(),
    });

    expect(await deleteExpertiseTag(10, 99, 50, { force: true })).toEqual({ deleted: true });
    // Usage-count select should NOT be called.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});

// ─── 15. mergeExpertiseTags ───────────────────────────────────────────────────

describe('mergeExpertiseTags @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.transaction.mockReset();
  });

  it('throws when sourceId === targetId', async () => {
    await expect(mergeExpertiseTags(10, 99, 5, 5)).rejects.toThrow(/itself/i);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it('throws when source tag not found inside transaction', async () => {
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn().mockImplementation(() => ({
          from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }), // source not found
        })),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      return fn(tx);
    });
    await expect(mergeExpertiseTags(10, 99, 1, 2)).rejects.toThrow(/source tag not found/i);
  });

  it('throws when target tag not found inside transaction', async () => {
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      let txCall = 0;
      const tx = {
        select: vi.fn().mockImplementation(() => {
          txCall++;
          if (txCall === 1) {
            return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1 }]) }) }) }; // source found
          }
          return { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }; // target not found
        }),
        insert: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      };
      return fn(tx);
    });
    await expect(mergeExpertiseTags(10, 99, 1, 2)).rejects.toThrow(/target tag not found/i);
  });

  it('merges and reattaches source junctions to target', async () => {
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<unknown>) => {
      let txCall = 0;
      const tx = {
        select: vi.fn().mockImplementation(() => {
          txCall++;
          if (txCall === 1) return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 1 }]) }) }) }; // source
          if (txCall === 2) return { from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: 2 }]) }) }) }; // target
          if (txCall === 3) {
            // sourceLinks: one junction for personId=10, level=2
            return {
              from: () => ({
                where: () => Promise.resolve([{ id: 100, personId: 10, level: 2 }]),
              }),
            };
          }
          // No existing junction on target for personId=10
          return { from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) };
        }),
        update: vi.fn().mockReturnValue({
          set: () => ({ where: () => Promise.resolve() }),
        }),
        delete: vi.fn().mockReturnValue({
          where: () => Promise.resolve(),
        }),
        insert: vi.fn().mockReturnValue({
          values: () => Promise.resolve(),
        }),
      };
      return fn(tx);
    });

    const result = await mergeExpertiseTags(10, 99, 1, 2);
    expect(result).toEqual({ merged: true, reattached: 1 });
  });
});

// ─── 16. whoKnows ─────────────────────────────────────────────────────────────

describe('whoKnows @brain @people @unit', () => {
  beforeEach(() => {
    mockDb.select.mockReset();
  });

  it('returns empty result when query is blank', async () => {
    expect(await whoKnows(10, '   ')).toEqual({ tagMatches: [], people: [] });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it('returns empty people when no tags match the query', async () => {
    // Tag match select returns empty.
    mockDb.select.mockReturnValueOnce({
      from: () => ({
        where: () => ({
          orderBy: () => Promise.resolve([]),
        }),
      }),
    });
    expect(await whoKnows(10, 'zig')).toEqual({ tagMatches: [], people: [] });
  });

  it('returns tagMatches with empty people when tags found but no junctions', async () => {
    const tag = { id: 50, name: 'TypeScript' };
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) {
        // Tag match
        return { from: () => ({ where: () => ({ orderBy: () => Promise.resolve([tag]) }) }) };
      }
      // Junctions: empty
      return {
        from: () => ({
          innerJoin: () => ({
            innerJoin: () => ({
              where: () => Promise.resolve([]),
            }),
          }),
        }),
      };
    });

    const result = await whoKnows(10, 'typescript');
    expect(result.tagMatches).toEqual([tag]);
    expect(result.people).toEqual([]);
  });

  it('returns ranked people when tags and junctions both exist', async () => {
    let call = 0;
    mockDb.select.mockImplementation(() => {
      call++;
      if (call === 1) {
        // Tag matches
        return {
          from: () => ({
            where: () => ({
              orderBy: () => Promise.resolve([
                { id: 50, name: 'TypeScript' },
                { id: 51, name: 'JavaScript' },
              ]),
            }),
          }),
        };
      }
      if (call === 2) {
        // Junctions: personId=1 has both tags with levels
        return {
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                where: () => Promise.resolve([
                  { personId: 1, tagId: 50, tagName: 'TypeScript', level: 3, fullName: 'Ada', title: 'Eng' },
                  { personId: 1, tagId: 51, tagName: 'JavaScript', level: 2, fullName: 'Ada', title: 'Eng' },
                ]),
              }),
            }),
          }),
        };
      }
      // Primary org-unit lookup
      return {
        from: () => ({
          innerJoin: () => ({
            where: () => Promise.resolve([
              { personId: 1, orgUnitId: 99, orgUnitName: 'Engineering' },
            ]),
          }),
        }),
      };
    });

    const result = await whoKnows(10, 'script');
    expect(result.tagMatches).toHaveLength(2);
    expect(result.people).toHaveLength(1);
    // Ada: 2 tags with levels → 2 + 0.5 + 0.5 = 3, plus primary +0.2 = 3.2
    expect(result.people[0].score).toBe(3.2);
    expect(result.people[0].primaryOrgUnit).toEqual({ id: 99, name: 'Engineering' });
  });
});
