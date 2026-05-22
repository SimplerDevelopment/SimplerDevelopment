// @vitest-environment node
/**
 * Unit tests for lib/brain/document-acks — pure-logic edges:
 *   - assignRequiredRead with expandOrgUnit fan-out (Pattern B txAudit)
 *   - acknowledge idempotency (re-ack same tuple is a no-op)
 *   - complianceReport partitioning math (assigned vs ack'd vs pending vs overdue)
 *
 * The DB layer is stubbed — these tests guard the contract, not the SQL.
 * Real round-trips live in tests/integration/api/brain/document-acks.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB mock ────────────────────────────────────────────────────────────────
// Per-test queues: each `db.select()...` resolves to the next array in
// `selectQueues`; same for insert/update returning. Same shape used in
// brain-initiatives.test.ts so the patterns are recognizable.

type Row = Record<string, unknown>;

const state: {
  /** Queue of result sets — every `await db.select()...` consumes one. */
  selectQueues: Row[][];
  insertReturning: Row[][];
  updateReturning: Row[][];
  /** Captures every insert/update for assertions. */
  inserts: Array<{ table?: string; values: unknown }>;
  updates: Array<{ table?: string; set: Record<string, unknown> }>;
  deletes: number;
  auditCalls: Array<Record<string, unknown>>;
  /** Whether db.transaction was invoked (Pattern B path). */
  txCalls: number;
  /** Capture inserts performed via the tx handle (Pattern B). */
  txInserts: Array<{ values: unknown }>;
} = {
  selectQueues: [],
  insertReturning: [],
  updateReturning: [],
  inserts: [],
  updates: [],
  deletes: 0,
  auditCalls: [],
  txCalls: 0,
  txInserts: [],
};

function reset() {
  state.selectQueues = [];
  state.insertReturning = [];
  state.updateReturning = [];
  state.inserts = [];
  state.updates = [];
  state.deletes = 0;
  state.auditCalls = [];
  state.txCalls = 0;
  state.txInserts = [];
}

function makeSelectChain(consumeRows: () => Row[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'orderBy', 'limit', 'offset', 'innerJoin', 'leftJoin']) {
    chain[m] = () => chain;
  }
  (chain as { then: (cb: (rows: Row[]) => unknown) => Promise<unknown> }).then =
    (cb) => Promise.resolve(cb(consumeRows()));
  return chain;
}
function makeInsertChain(target: 'inserts' | 'txInserts', consumeReturning: () => Row[]) {
  const chain: Record<string, unknown> = {};
  chain.values = (v: unknown) => { state[target].push({ values: v }); return chain; };
  chain.onConflictDoNothing = () => chain;
  chain.onConflictDoUpdate = () => chain;
  chain.returning = () => Promise.resolve(consumeReturning());
  (chain as { then: (cb: (rows: Row[]) => unknown) => Promise<unknown> }).then =
    (cb) => Promise.resolve(cb([]));
  return chain;
}
function makeUpdateChain(consumeReturning: () => Row[]) {
  const chain: Record<string, unknown> = {};
  chain.set = (v: Record<string, unknown>) => { state.updates.push({ set: v }); return chain; };
  chain.where = () => chain;
  chain.returning = () => Promise.resolve(consumeReturning());
  (chain as { then: (cb: (rows: Row[]) => unknown) => Promise<unknown> }).then =
    (cb) => Promise.resolve(cb([]));
  return chain;
}
function makeDeleteChain() {
  const chain: Record<string, unknown> = {};
  chain.where = () => { state.deletes += 1; return chain; };
  (chain as { then: (cb: (rows: Row[]) => unknown) => Promise<unknown> }).then =
    (cb) => Promise.resolve(cb([]));
  return chain;
}

vi.mock('@/lib/db', () => {
  const popSelect = () => state.selectQueues.shift() ?? [];
  const popInsertRet = () => state.insertReturning.shift() ?? [];
  const popUpdateRet = () => state.updateReturning.shift() ?? [];
  const db = {
    select: vi.fn(() => makeSelectChain(popSelect)),
    insert: vi.fn(() => makeInsertChain('inserts', popInsertRet)),
    update: vi.fn(() => makeUpdateChain(popUpdateRet)),
    delete: vi.fn(() => makeDeleteChain()),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      state.txCalls += 1;
      const tx = {
        select: vi.fn(() => makeSelectChain(popSelect)),
        insert: vi.fn(() => makeInsertChain('txInserts', popInsertRet)),
        update: vi.fn(() => makeUpdateChain(popUpdateRet)),
        delete: vi.fn(() => makeDeleteChain()),
      };
      return fn(tx);
    }),
  };
  return { db };
});

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async (args: Record<string, unknown>) => {
    state.auditCalls.push(args);
  }),
}));

// Import after mocks.
import {
  assignRequiredRead,
  acknowledge,
  complianceReport,
} from '@/lib/brain/document-acks';

beforeEach(() => { reset(); });

// ─── assignRequiredRead — org_unit fan-out ──────────────────────────────────

describe('assignRequiredRead — org_unit fan-out (Pattern B)', () => {
  it('expands an org_unit to one row per active member and writes ONE summary audit', async () => {
    // SELECT #1: document lookup (getDocumentForClient)
    state.selectQueues.push([{ id: 50, title: 'Onboarding SOP', slug: 'onboarding', currentPublishedVersionId: 7 }]);
    // SELECT #2: org_unit existence check
    state.selectQueues.push([{ id: 9 }]);
    // SELECT #3: activePersonIdsInOrgUnit
    state.selectQueues.push([{ personId: 1 }, { personId: 2 }, { personId: 3 }]);
    // SELECT #4 (inside tx): existing person-target rows
    state.selectQueues.push([{ targetId: 2 }]); // person 2 already had a row

    const out = await assignRequiredRead(1, 99, {
      documentId: 50,
      targetType: 'org_unit',
      targetId: 9,
      expandOrgUnit: true,
    });
    expect(out.expandedTo).toEqual([1, 2, 3]);
    expect(out.assigned).toBe(2);     // 3 total - 1 already
    expect(out.alreadyAssigned).toBe(1);

    // Pattern B — transaction was used.
    expect(state.txCalls).toBe(1);
    // The tx inserts both the bulk required_reads rows and the summary
    // audit row. Two inserts total: one for the bulk values, one for the
    // audit log.
    expect(state.txInserts.length).toBe(2);
    // The first insert is the bulk values (an array of 3 person-targets).
    const firstValues = state.txInserts[0].values as Array<Record<string, unknown>>;
    expect(Array.isArray(firstValues)).toBe(true);
    expect(firstValues.length).toBe(3);
    expect(firstValues.every((v) => v.targetType === 'person')).toBe(true);

    // No external logAudit call — Pattern B writes via tx insert.
    expect(state.auditCalls.length).toBe(0);
  });

  it('with no active members, writes a summary audit via Pattern A and returns 0/0/[]', async () => {
    state.selectQueues.push([{ id: 50, title: 't', slug: 's', currentPublishedVersionId: null }]); // doc
    state.selectQueues.push([{ id: 9 }]); // org_unit
    state.selectQueues.push([]); // no members

    const out = await assignRequiredRead(1, null, {
      documentId: 50,
      targetType: 'org_unit',
      targetId: 9,
      expandOrgUnit: true,
    });
    expect(out.assigned).toBe(0);
    expect(out.alreadyAssigned).toBe(0);
    expect(out.expandedTo).toEqual([]);
    expect(state.txCalls).toBe(0);
    expect(state.auditCalls.length).toBe(1);
    expect(state.auditCalls[0].action).toBe('brain_document.assign_required_read');
  });

  it('refuses when document is not in this tenant', async () => {
    state.selectQueues.push([]); // doc lookup → empty
    await expect(
      assignRequiredRead(1, null, { documentId: 99, targetType: 'person', targetId: 1 }),
    ).rejects.toThrow(/document not found/i);
  });

  it('refuses when pinnedVersionId belongs to a different document', async () => {
    state.selectQueues.push([{ id: 50, title: 't', slug: 's', currentPublishedVersionId: 7 }]);
    state.selectQueues.push([]); // version lookup → empty
    await expect(
      assignRequiredRead(1, null, {
        documentId: 50,
        targetType: 'person',
        targetId: 1,
        pinnedVersionId: 999,
      }),
    ).rejects.toThrow(/pinnedVersionId/);
  });
});

// ─── acknowledge — idempotency ──────────────────────────────────────────────

describe('acknowledge — idempotency', () => {
  it('returns the existing row without inserting again when (doc, version, person) already ack\'d', async () => {
    // doc
    state.selectQueues.push([{ id: 50, title: 't', slug: 's', currentPublishedVersionId: 7 }]);
    // version
    state.selectQueues.push([{ id: 7 }]);
    // person
    state.selectQueues.push([{ id: 3 }]);
    // already-acked → existing row
    const existingAck = {
      id: 12, clientId: 1, documentId: 50, versionId: 7, personId: 3,
      requiredReadId: null, acknowledgmentNote: null, acknowledgedAt: new Date(),
    };
    state.selectQueues.push([existingAck]);

    const out = await acknowledge(1, 99, { documentId: 50, versionId: 7, personId: 3 });
    expect(out.id).toBe(12);
    // No insert, no audit — pure idempotent no-op.
    expect(state.inserts.length).toBe(0);
    expect(state.auditCalls.length).toBe(0);
  });

  it('writes ack + audit on first call; auto-links matching person-target required-read', async () => {
    state.selectQueues.push([{ id: 50, title: 't', slug: 's', currentPublishedVersionId: 7 }]);
    state.selectQueues.push([{ id: 7 }]);
    state.selectQueues.push([{ id: 3 }]);
    state.selectQueues.push([]); // no existing ack
    state.selectQueues.push([{ id: 555 }]); // auto-link required-read lookup
    state.insertReturning.push([{
      id: 12, clientId: 1, documentId: 50, versionId: 7, personId: 3,
      requiredReadId: 555, acknowledgmentNote: null, acknowledgedAt: new Date(),
    }]);

    const out = await acknowledge(1, 99, { documentId: 50, versionId: 7, personId: 3 });
    expect(out.id).toBe(12);
    expect(out.requiredReadId).toBe(555);
    expect(state.inserts.length).toBe(1);
    expect((state.inserts[0].values as Record<string, unknown>).requiredReadId).toBe(555);

    // Pattern A audit was written after the insert.
    expect(state.auditCalls.length).toBe(1);
    expect(state.auditCalls[0].action).toBe('brain_document.acknowledge');
  });

  it('rejects when the version does not belong to the document', async () => {
    state.selectQueues.push([{ id: 50, title: 't', slug: 's', currentPublishedVersionId: 7 }]);
    state.selectQueues.push([]); // version mismatch
    await expect(
      acknowledge(1, null, { documentId: 50, versionId: 999, personId: 3 }),
    ).rejects.toThrow(/version not found/);
  });
});

// ─── complianceReport — partitioning math ───────────────────────────────────

describe('complianceReport — partitioning math', () => {
  it('partitions assigned into ack\'d / pending / overdue against currentPublishedVersionId', async () => {
    const now = Date.now();
    const past = new Date(now - 24 * 60 * 60 * 1000);
    const future = new Date(now + 24 * 60 * 60 * 1000);

    // 1) document
    state.selectQueues.push([{ id: 50, title: 't', slug: 's', currentPublishedVersionId: 7 }]);
    // 2) listRequiredReadsForDocument's main select (joined with people +
    //    org_units). person 1 (overdue), person 2 (future), org_unit 9
    //    (overdue), org_unit 10 (no due).
    state.selectQueues.push([
      { id: 100, targetType: 'person', targetId: 1, pinnedVersionId: null, dueAt: past, assignedAt: new Date(), personName: 'Alice', orgUnitName: null },
      { id: 101, targetType: 'person', targetId: 2, pinnedVersionId: null, dueAt: future, assignedAt: new Date(), personName: 'Bob', orgUnitName: null },
      { id: 102, targetType: 'org_unit', targetId: 9, pinnedVersionId: null, dueAt: past, assignedAt: new Date(), personName: null, orgUnitName: 'Eng' },
      { id: 103, targetType: 'org_unit', targetId: 10, pinnedVersionId: null, dueAt: null, assignedAt: new Date(), personName: null, orgUnitName: 'Sales' },
    ]);
    // 3) org-unit member resolution (active people in units 9 and 10).
    //    Person 3 in unit 9 (overdue), Person 4 in unit 10 (no due),
    //    Person 1 ALSO in unit 9 (already direct-targeted — overlap).
    state.selectQueues.push([
      { orgUnitId: 9, personId: 3 },
      { orgUnitId: 9, personId: 1 },
      { orgUnitId: 10, personId: 4 },
    ]);
    // 4) ack lookup on currentPublishedVersionId=7 — Bob (2) and Carol (4)
    //    ack'd; Alice (1) and Dave (3) pending.
    state.selectQueues.push([
      { personId: 2 },
      { personId: 4 },
    ]);

    const out = await complianceReport(1, 50);
    expect(out).not.toBeNull();
    const r = out!;
    expect(r.document.id).toBe(50);
    expect(r.summary.totalAssigned).toBe(4); // {1, 2, 3, 4}
    expect(r.summary.acknowledged).toBe(2);  // {2, 4}
    expect(r.summary.pending).toBe(2);       // {1, 3}
    // Overdue = pending AND past due. Person 1 had a direct dueAt=past;
    // person 3 was assigned via org_unit 9 (past). Both overdue.
    expect(new Set(r.overduePersonIds)).toEqual(new Set([1, 3]));
    expect(new Set(r.acknowledgedPersonIds)).toEqual(new Set([2, 4]));
    expect(new Set(r.pendingPersonIds)).toEqual(new Set([1, 3]));
  });

  it('when document has no currentPublishedVersionId, acknowledged=0 for everyone', async () => {
    state.selectQueues.push([{ id: 50, title: 't', slug: 's', currentPublishedVersionId: null }]);
    state.selectQueues.push([
      { id: 100, targetType: 'person', targetId: 1, pinnedVersionId: null, dueAt: null, assignedAt: new Date(), personName: 'Alice', orgUnitName: null },
      { id: 101, targetType: 'person', targetId: 2, pinnedVersionId: null, dueAt: null, assignedAt: new Date(), personName: 'Bob', orgUnitName: null },
    ]);
    // No org_units → no member-resolution select consumed.

    const out = await complianceReport(1, 50);
    expect(out).not.toBeNull();
    expect(out!.summary.totalAssigned).toBe(2);
    expect(out!.summary.acknowledged).toBe(0);
    expect(out!.summary.pending).toBe(2);
    expect(out!.summary.overdue).toBe(0);
  });

  it('returns null when document is not in this tenant', async () => {
    state.selectQueues.push([]); // doc lookup → empty
    const out = await complianceReport(1, 999);
    expect(out).toBeNull();
  });
});
