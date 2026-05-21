// @vitest-environment node
/**
 * Unit tests for lib/brain/people.ts pure helpers + tenant-validation logic.
 *
 * Covers:
 *   - scoreWhoKnowsCandidates: table-driven scoring (per-tag, level bonus,
 *     primary-org-unit bonus, sort order, limit cap).
 *   - createPerson: userId tenancy validation rejects users not in the client.
 *   - wouldCreateManagerCycle: rejects self-as-manager and descendant chains.
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
  brainPeople: { clientId: {}, id: {}, managerId: {}, fullName: {}, email: {}, title: {}, status: {} },
  brainOrgUnits: { id: {}, name: {} },
  brainPersonOrgUnits: { clientId: {}, personId: {}, orgUnitId: {}, primary: {} },
  brainExpertiseTags: { clientId: {}, id: {}, name: {}, slug: {}, description: {}, source: {} },
  brainPersonExpertise: { clientId: {}, personId: {}, expertiseTagId: {}, level: {} },
  brainAuditLogs: {},
  clientMembers: { clientId: {}, userId: {}, id: {} },
}));

// The audit module reads db internally — short-circuit it so we don't have to
// model the audit insert chain on every test.
vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async () => undefined),
}));

const peopleMod = await import('@/lib/brain/people');
const { scoreWhoKnowsCandidates, createPerson, wouldCreateManagerCycle } = peopleMod;

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
