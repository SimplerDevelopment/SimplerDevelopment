// @vitest-environment node
/**
 * Unit tests for `lib/brain/decisions.ts`.
 *
 * We're not running real SQL — drizzle/db is mocked with a fluent stub that
 * returns programmable rows. These tests exercise the pure logic guards:
 *
 *   - validation on create / supersede (missing title/decision/rationale)
 *   - forbidden-field rejection on update (decision / rationale / reversibility)
 *   - supersede refusal when the old decision is already superseded
 *   - supersede refusal when the caller passes supersededByDecisionId
 *   - default values applied on create (status, source, reversibility)
 *   - soft-reject idempotence on an already-rejected row
 *
 * The full round-trip — actual SQL, audit-log inserts, cross-tenant safety —
 * is covered by tests/integration/api/brain/decisions.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- DB mock --------------------------------------------------------------
// A fluent chain that records the most recent insert/update values and
// resolves `.returning()` to a programmable row queue. The `captured` object
// is a top-level const so test bodies can read/seed it; vi.mock factories
// reference it via closure — vitest hoists the factory above imports but
// initializing a const literal is safe (the lazy-evaluated property reads
// happen when the SUT actually calls db.*, not at module load).
const captured = {
  inserts: [] as Array<{ values: Record<string, unknown> | null }>,
  updates: [] as Array<{ set: Record<string, unknown> | null }>,
  selectRows: [] as Array<Record<string, unknown>>,
  insertReturning: [] as Array<Record<string, unknown>>,
  updateReturning: [] as Array<Record<string, unknown>>,
  txCalls: 0,
  /** Most recent `where()` argument from a SELECT chain (used to verify filters). */
  lastSelectWhere: undefined as unknown,
};

function resetCaptured() {
  captured.inserts.length = 0;
  captured.updates.length = 0;
  captured.selectRows.length = 0;
  captured.insertReturning.length = 0;
  captured.updateReturning.length = 0;
  captured.txCalls = 0;
  captured.lastSelectWhere = undefined;
}

vi.mock('@/lib/db', () => {
  function makeSelectChain() {
    // The chain must be both thenable (so `.limit(...)` callers can `await`
    // it without a trailing `.offset()`) AND keep .offset chainable for
    // listDecisions, which calls `.limit(limit).offset(offset)`. We hand back
    // the same object from every step; `then` makes it await-able anywhere.
    const chain: Record<string, unknown> = {};
    chain.from = () => chain;
    chain.where = (w: unknown) => { captured.lastSelectWhere = w; return chain; };
    chain.orderBy = () => chain;
    chain.limit = () => chain;
    chain.offset = () => chain;
    chain.then = (resolve: (rows: Record<string, unknown>[]) => unknown) =>
      Promise.resolve([...captured.selectRows]).then(resolve);
    return chain;
  }

  function makeInsertChain() {
    const chain: Record<string, unknown> = {};
    chain.values = (v: Record<string, unknown>) => {
      captured.inserts.push({ values: v });
      return chain;
    };
    chain.returning = () =>
      Promise.resolve(
        captured.insertReturning.length > 0 ? [captured.insertReturning.shift()] : [],
      );
    return chain;
  }

  function makeUpdateChain() {
    const chain: Record<string, unknown> = {};
    chain.set = (v: Record<string, unknown>) => {
      captured.updates.push({ set: v });
      return chain;
    };
    chain.where = () => chain;
    chain.returning = () =>
      Promise.resolve(
        captured.updateReturning.length > 0 ? [captured.updateReturning.shift()] : [],
      );
    return chain;
  }

  // db.transaction passes a tx with the same surface — our mock just calls
  // through with itself.
  const stub: Record<string, unknown> = {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
  };
  stub.transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    captured.txCalls += 1;
    return fn(stub);
  };
  return { db: stub };
});

vi.mock('@/lib/db/schema', () => ({
  brainDecisions: {
    id: { __col: 'id' },
    clientId: { __col: 'client_id' },
    status: { __col: 'status' },
    decidedAt: { __col: 'decided_at' },
    supersededByDecisionId: { __col: 'superseded_by_decision_id' },
    decisionMakerId: { __col: 'decision_maker_id' },
    reversibility: { __col: 'reversibility' },
  },
  brainEntityTopics: {
    entityId: { __col: 'entity_id' },
    entityType: { __col: 'entity_type' },
    topicId: { __col: 'topic_id' },
    clientId: { __col: 'client_id' },
  },
}));

vi.mock('@/lib/brain/audit', () => ({
  logAudit: vi.fn(async () => {}),
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => ({ kind: 'eq', col: col.__col, val }),
  and: (...parts: unknown[]) => ({ kind: 'and', parts }),
  desc: (col: { __col: string }) => ({ kind: 'desc', col: col.__col }),
  gte: (col: { __col: string }, val: unknown) => ({ kind: 'gte', col: col.__col, val }),
  lte: (col: { __col: string }, val: unknown) => ({ kind: 'lte', col: col.__col, val }),
  inArray: (col: { __col: string }, val: unknown) => ({ kind: 'inArray', col: col.__col, val }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
}));

// Import the SUT only after all mocks are in place.
const {
  createDecision,
  listDecisions,
  softRejectDecision,
  supersedeDecision,
  updateDecision,
} = await import('@/lib/brain/decisions');

// Helper: recursively scan a serialized where-clause tree (produced by the
// drizzle mocks above) for an entry matching a predicate. Used by the
// listDecisions filter assertions so the test doesn't depend on the precise
// order of pushed conditions.
function findCondition(
  tree: unknown,
  predicate: (node: { kind: string; col?: string; val?: unknown }) => boolean,
): boolean {
  if (!tree || typeof tree !== 'object') return false;
  const node = tree as { kind?: string; col?: string; val?: unknown; parts?: unknown[] };
  if (typeof node.kind === 'string' && predicate(node as { kind: string; col?: string; val?: unknown })) {
    return true;
  }
  if (Array.isArray(node.parts)) {
    return node.parts.some((p) => findCondition(p, predicate));
  }
  return false;
}

beforeEach(resetCaptured);

// --- createDecision -------------------------------------------------------

describe('createDecision — validation', () => {
  it('throws when title is missing', async () => {
    await expect(
      createDecision(1, 7, { title: '', decision: 'd', rationale: 'r' }),
    ).rejects.toThrow(/title is required/);
  });
  it('throws when decision text is missing', async () => {
    await expect(
      createDecision(1, 7, { title: 't', decision: '', rationale: 'r' }),
    ).rejects.toThrow(/decision is required/);
  });
  it('throws when rationale is missing', async () => {
    await expect(
      createDecision(1, 7, { title: 't', decision: 'd', rationale: '' }),
    ).rejects.toThrow(/rationale is required/);
  });
});

describe('createDecision — defaults', () => {
  it('applies status=accepted, source=manual, reversibility=two_way', async () => {
    captured.insertReturning.push({ id: 99, reversibility: 'two_way' });
    await createDecision(5, 11, {
      title: 'pick stripe',
      decision: 'use stripe for billing',
      rationale: 'we already integrate it',
    });

    expect(captured.inserts).toHaveLength(1);
    const v = captured.inserts[0].values!;
    expect(v.clientId).toBe(5);
    expect(v.status).toBe('accepted');
    expect(v.source).toBe('manual');
    expect(v.reversibility).toBe('two_way');
    expect(v.confidentialityLevel).toBe('standard');
    expect(v.createdBy).toBe(11);
    expect(v.decisionMakerId).toBe(11); // defaults to actor when not specified
  });

  it('honours explicit reversibility=one_way', async () => {
    captured.insertReturning.push({ id: 100, reversibility: 'one_way' });
    await createDecision(5, 11, {
      title: 't',
      decision: 'd',
      rationale: 'r',
      reversibility: 'one_way',
    });
    expect(captured.inserts[0].values!.reversibility).toBe('one_way');
  });
});

// --- updateDecision — forbidden-field guard -------------------------------

describe('updateDecision — forbidden fields', () => {
  it('throws when caller tries to mutate decision text', async () => {
    await expect(
      updateDecision(1, 7, 42, { decision: 'changed' } as unknown as Parameters<typeof updateDecision>[3]),
    ).rejects.toThrow(/use supersedeDecision/);
  });
  it('throws when caller tries to mutate rationale', async () => {
    await expect(
      updateDecision(1, 7, 42, { rationale: 'changed' } as unknown as Parameters<typeof updateDecision>[3]),
    ).rejects.toThrow(/use supersedeDecision/);
  });
  it('throws when caller tries to mutate reversibility', async () => {
    await expect(
      updateDecision(1, 7, 42, { reversibility: 'one_way' } as unknown as Parameters<typeof updateDecision>[3]),
    ).rejects.toThrow(/use supersedeDecision/);
  });
  it('returns the row when patch is empty (no DB write)', async () => {
    captured.selectRows.push({ id: 42, clientId: 1, title: 'x', status: 'accepted' });
    const out = await updateDecision(1, 7, 42, {});
    // The empty-patch short-circuit returns the row without queuing an update.
    expect(out).toBeTruthy();
    expect(captured.updates).toHaveLength(0);
  });
  it('returns null when the row is not visible to the tenant', async () => {
    // selectRows empty → before-row lookup returns null path → null.
    const out = await updateDecision(1, 7, 42, { title: 'new' });
    expect(out).toBeNull();
  });
});

// --- supersedeDecision — cycle + caller-passed FK guard --------------------

describe('supersedeDecision — guards', () => {
  it('throws when caller passes supersededByDecisionId', async () => {
    await expect(
      supersedeDecision(1, 7, 42, {
        title: 't',
        decision: 'd',
        rationale: 'r',
        // @ts-expect-error — testing the runtime guard for an invalid caller
        supersededByDecisionId: 99,
      }),
    ).rejects.toThrow(/set automatically/);
  });

  it('throws when old decision is already superseded (cycle guard)', async () => {
    captured.selectRows.push({
      id: 42, clientId: 1, status: 'superseded', supersededByDecisionId: 50,
      reversibility: 'two_way', confidentialityLevel: 'standard',
    });
    await expect(
      supersedeDecision(1, 7, 42, { title: 't', decision: 'd', rationale: 'r' }),
    ).rejects.toThrow(/already superseded/);
  });

  it('throws when old decision points at someone (closed chain)', async () => {
    // status='accepted' but supersededByDecisionId set — defensive double check.
    captured.selectRows.push({
      id: 42, clientId: 1, status: 'accepted', supersededByDecisionId: 50,
      reversibility: 'two_way', confidentialityLevel: 'standard',
    });
    await expect(
      supersedeDecision(1, 7, 42, { title: 't', decision: 'd', rationale: 'r' }),
    ).rejects.toThrow(/already superseded/);
  });

  it('throws when the old decision does not exist for this tenant', async () => {
    // selectRows empty → 'decision not found'.
    await expect(
      supersedeDecision(1, 7, 99, { title: 't', decision: 'd', rationale: 'r' }),
    ).rejects.toThrow(/not found/);
  });

  it('throws when input title is missing', async () => {
    await expect(
      supersedeDecision(1, 7, 42, { title: '', decision: 'd', rationale: 'r' }),
    ).rejects.toThrow(/title is required/);
  });
});

// --- softRejectDecision — idempotence -------------------------------------

describe('softRejectDecision', () => {
  it('returns null when the row is missing for this tenant', async () => {
    const out = await softRejectDecision(1, 7, 999, 'gone');
    expect(out).toBeNull();
    expect(captured.updates).toHaveLength(0);
  });

  it('returns the row unchanged when already rejected (idempotent)', async () => {
    captured.selectRows.push({ id: 42, clientId: 1, status: 'rejected' });
    const out = await softRejectDecision(1, 7, 42, 'redundant');
    expect(out?.status).toBe('rejected');
    // No second UPDATE was queued — we short-circuited.
    expect(captured.updates).toHaveLength(0);
  });

  it('writes the status=rejected patch when row was previously accepted', async () => {
    captured.selectRows.push({ id: 42, clientId: 1, status: 'accepted' });
    captured.updateReturning.push({ id: 42, clientId: 1, status: 'rejected' });
    const out = await softRejectDecision(1, 7, 42, 'no longer relevant');
    expect(out?.status).toBe('rejected');
    expect(captured.updates).toHaveLength(1);
    expect(captured.updates[0].set!.status).toBe('rejected');
  });
});

// --- listDecisions — filter wiring ----------------------------------------

describe('listDecisions — filter conditions', () => {
  it('always scopes by clientId', async () => {
    await listDecisions(7);
    expect(
      findCondition(captured.lastSelectWhere, (n) => n.kind === 'eq' && n.col === 'client_id' && n.val === 7),
    ).toBe(true);
  });

  it('does NOT add a topic-related condition when topicId is undefined', async () => {
    await listDecisions(7);
    expect(
      findCondition(
        captured.lastSelectWhere,
        (n) => n.kind === 'inArray' || (n.kind === 'eq' && n.col === 'topic_id'),
      ),
    ).toBe(false);
  });

  it('wires an inArray(id, …) subquery when topicId is set', async () => {
    await listDecisions(7, { topicId: 42 });
    // The subquery itself is opaque to our mock — we just assert the outer
    // condition is an inArray on decisions.id. The subquery's tenancy guard
    // is exercised by tests/integration/api/brain/decisions.test.ts.
    expect(
      findCondition(captured.lastSelectWhere, (n) => n.kind === 'inArray' && n.col === 'id'),
    ).toBe(true);
  });

  it('preserves the supersededOnly filter when set alongside topicId', async () => {
    await listDecisions(7, { topicId: 42, supersededOnly: true });
    expect(
      findCondition(
        captured.lastSelectWhere,
        (n) => n.kind === 'eq' && n.col === 'status' && n.val === 'superseded',
      ),
    ).toBe(true);
    expect(
      findCondition(captured.lastSelectWhere, (n) => n.kind === 'inArray' && n.col === 'id'),
    ).toBe(true);
  });
});
