// @vitest-environment node
/**
 * Unit coverage for the self-serve / PLG trial branch in `isBrainEntitled`.
 *
 * The vitest runtime sets `VITEST_POOL_ID`, which short-circuits the helper
 * before it ever touches the DB. To exercise the post-bypass branches we
 * delete those env vars per-test and mock the `db` module with a fluent
 * chain that returns whatever rows each scenario needs.
 *
 *   brainTrialUntil = null            → falls through to clientServices
 *   brainTrialUntil = future          → entitled (trial wins)
 *   brainTrialUntil = past (expired)  → falls through to clientServices
 *   future trial + no clientServices  → entitled (trial wins on its own)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Per-test fixtures: the trial row returned by the FIRST select() chain
// and the rows returned by the SECOND (joined clientServices) chain.
const fixtures: {
  trialRow: { brainTrialUntil: Date | null } | null;
  serviceRows: Array<{ category: string }>;
} = {
  trialRow: null,
  serviceRows: [],
};

// Track which select() invocation we're on so we can hand back the right
// fixture for each branch.
let selectCall = 0;

vi.mock('@/lib/db', () => {
  const trialChain = {
    from: () => trialChain,
    where: () => trialChain,
    limit: () => Promise.resolve(fixtures.trialRow ? [fixtures.trialRow] : []),
  };
  const serviceChain = {
    from: () => serviceChain,
    innerJoin: () => serviceChain,
    where: () => Promise.resolve(fixtures.serviceRows),
  };
  return {
    db: {
      select: () => {
        selectCall += 1;
        return selectCall === 1 ? trialChain : serviceChain;
      },
    },
  };
});

vi.mock('@/lib/db/schema', () => ({
  clients: {
    id: { __col: 'id' },
    brainTrialUntil: { __col: 'brainTrialUntil' },
  },
  clientServices: {
    clientId: { __col: 'clientId' },
    serviceId: { __col: 'serviceId' },
    status: { __col: 'status' },
  },
  services: {
    id: { __col: 'id' },
    category: { __col: 'category' },
  },
}));

vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: vi.fn(),
  isAuthError: (r: unknown) => typeof r === 'object' && r !== null && 'response' in r,
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: { __col: string }, val: unknown) => ({ kind: 'eq', col: col.__col, val }),
  and: (...parts: unknown[]) => ({ kind: 'and', parts }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
}));

const { isBrainEntitled, requireBrainEntitlement } = await import('@/lib/brain/entitlement');

describe('isBrainEntitled — brainTrialUntil lane', () => {
  const ORIG = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIG };
    // Mask vitest detection so we hit the real branches.
    delete process.env.VITEST_POOL_ID;
    delete process.env.VITEST;
    delete process.env.BRAIN_ENTITLEMENT_BYPASS;

    fixtures.trialRow = null;
    fixtures.serviceRows = [];
    selectCall = 0;
  });

  it('null brainTrialUntil → falls through to clientServices check (no row → false)', async () => {
    fixtures.trialRow = { brainTrialUntil: null };
    fixtures.serviceRows = [];
    await expect(isBrainEntitled(101)).resolves.toBe(false);
    // We must have queried both the trial and the services tables.
    expect(selectCall).toBe(2);
  });

  it('null brainTrialUntil → falls through; active brain SKU still grants entitlement', async () => {
    fixtures.trialRow = { brainTrialUntil: null };
    fixtures.serviceRows = [{ category: 'brain' }];
    await expect(isBrainEntitled(102)).resolves.toBe(true);
    expect(selectCall).toBe(2);
  });

  it('future brainTrialUntil → entitled (trial wins, second query never runs)', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7d
    fixtures.trialRow = { brainTrialUntil: future };
    fixtures.serviceRows = []; // intentionally empty — must not matter
    await expect(isBrainEntitled(103)).resolves.toBe(true);
    expect(selectCall).toBe(1); // only the trial query was issued
  });

  it('past brainTrialUntil (expired) → falls through to clientServices check', async () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // -7d
    fixtures.trialRow = { brainTrialUntil: past };
    fixtures.serviceRows = [];
    await expect(isBrainEntitled(104)).resolves.toBe(false);
    expect(selectCall).toBe(2);
  });

  it('past brainTrialUntil + active bundle → entitled via paid path', async () => {
    const past = new Date(Date.now() - 1000);
    fixtures.trialRow = { brainTrialUntil: past };
    fixtures.serviceRows = [{ category: 'bundle' }];
    await expect(isBrainEntitled(105)).resolves.toBe(true);
    expect(selectCall).toBe(2);
  });

  it('future trial AND no clientServices row → entitled (trial wins)', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000); // +1h
    fixtures.trialRow = { brainTrialUntil: future };
    fixtures.serviceRows = [];
    await expect(isBrainEntitled(106)).resolves.toBe(true);
    expect(selectCall).toBe(1);
  });

  it('no client row at all → falls through to clientServices check', async () => {
    fixtures.trialRow = null; // empty result set
    fixtures.serviceRows = [];
    await expect(isBrainEntitled(107)).resolves.toBe(false);
    expect(selectCall).toBe(2);
  });
});

describe('requireBrainEntitlement — trial passes through to caller (no NextResponse error)', () => {
  const ORIG = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIG };
    delete process.env.VITEST_POOL_ID;
    delete process.env.VITEST;
    delete process.env.BRAIN_ENTITLEMENT_BYPASS;

    fixtures.trialRow = null;
    fixtures.serviceRows = [];
    selectCall = 0;
  });

  it('future trial → returns { client, userId, role } (NOT { response })', async () => {
    const { authorizePortal } = await import('@/lib/portal-auth');
    vi.mocked(authorizePortal).mockResolvedValueOnce({
      // Cast: real shape has more fields, but the helper only forwards these three.
      client: { id: 200 },
      userId: 9,
      role: 'owner',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    fixtures.trialRow = { brainTrialUntil: new Date(Date.now() + 60_000) };
    fixtures.serviceRows = [];

    const result = await requireBrainEntitlement();
    expect('response' in result).toBe(false);
    if ('response' in result) throw new Error('expected pass-through');
    expect(result.client.id).toBe(200);
    expect(result.userId).toBe(9);
    expect(result.role).toBe('owner');
  });
});
