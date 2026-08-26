// @vitest-environment node
/**
 * Unit tests for lib/email/ab-promotion.ts (PUX-049).
 *
 * executeAbPromotion used to dispatch the held-back A/B remainder via an
 * inline per-recipient Resend loop. It now records the winner subject and
 * hands the remainder to the durable internal_jobs queue
 * (enqueueCampaignSend, PUX-046) for tenant-owned campaigns, falling back to
 * the synchronous executeCampaignSend only for global/agency campaigns
 * (clientId null) — the same fork app/api/cron/email-scheduled-send uses,
 * because internal_jobs.client_id is NOT NULL.
 *
 * These tests assert:
 *   - winner selection (aggregateAbVariantCounts + pickAbWinner) is still
 *     invoked identically — "who wins" logic is untouched.
 *   - the winner subject is persisted to BOTH `subject` (what
 *     executeCampaignSend actually sends) and `abWinnerSubject` (audit),
 *     before any dispatch — this is the bug the ticket called out.
 *   - dispatch goes through enqueueCampaignSend for a tenant-owned campaign,
 *     and never touches executeCampaignSend directly.
 *   - dispatch falls back to executeCampaignSend (synchronous) for a
 *     clientId-null campaign, and never enqueues.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted shared state — vi.hoisted runs before all vi.mock factories.
// ---------------------------------------------------------------------------
const H = vi.hoisted(() => {
  const dbState: {
    alreadySent: Array<{ subscriberId: number }>;
    activeSubs: Array<{ id: number }>;
  } = { alreadySent: [], activeSubs: [] };
  const updateCalls: Array<Record<string, unknown>> = [];
  const callOrder: string[] = [];
  return {
    dbState,
    updateCalls,
    callOrder,
    aggregateCountsMock: vi.fn(),
    pickWinnerMock: vi.fn(),
    enqueueCampaignSendMock: vi.fn(async () => {
      callOrder.push('enqueue');
    }),
    executeCampaignSendMock: vi.fn(async () => {
      callOrder.push('execute');
      return { sent: 2, failed: 0, total: 2 };
    }),
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

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
    emailCampaigns: wrap('emailCampaigns'),
    emailSubscribers: wrap('emailSubscribers'),
    emailCampaignSends: wrap('emailCampaignSends'),
  };
});

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
}));

vi.mock('@/lib/db', () => {
  const makeSelectChain = () => {
    let table = '';
    const chain: Record<string, unknown> = {
      from(t: { __table: string }) {
        table = t.__table;
        return chain;
      },
      where() {
        if (table === 'emailCampaignSends') return Promise.resolve(H.dbState.alreadySent);
        if (table === 'emailSubscribers') return Promise.resolve(H.dbState.activeSubs);
        return Promise.resolve([]);
      },
    };
    return chain;
  };
  const makeUpdateChain = (table: string) => {
    const call: Record<string, unknown> = { table };
    const chain: Record<string, unknown> = {
      set(values: Record<string, unknown>) {
        call.values = values;
        return chain;
      },
      where(predicate: unknown) {
        call.where = predicate;
        H.updateCalls.push(call);
        H.callOrder.push('update');
        return Promise.resolve(undefined);
      },
    };
    return chain;
  };
  return {
    db: {
      select: (..._args: unknown[]) => makeSelectChain(),
      update: (t: { __table: string }) => makeUpdateChain(t.__table),
    },
  };
});

vi.mock('@/lib/email/subject-ab', () => ({
  aggregateAbVariantCounts: (...args: unknown[]) => H.aggregateCountsMock(...args),
  pickAbWinner: (...args: unknown[]) => H.pickWinnerMock(...args),
}));

vi.mock('@/lib/email/campaign-send-job', () => ({
  enqueueCampaignSend: (...args: unknown[]) => H.enqueueCampaignSendMock(...args),
}));

vi.mock('@/lib/email/campaign-send', () => ({
  executeCampaignSend: (...args: unknown[]) => H.executeCampaignSendMock(...args),
}));

// ---------------------------------------------------------------------------
// SUT (after mocks)
// ---------------------------------------------------------------------------
import { executeAbPromotion } from '@/lib/email/ab-promotion';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCampaign(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 5,
    clientId: 9,
    listId: 10,
    subject: 'Subject A',
    abSubjectB: 'Subject B',
    abWinnerMetric: 'open',
    ...overrides,
  };
}

beforeEach(() => {
  H.dbState.alreadySent = [];
  H.dbState.activeSubs = [];
  H.updateCalls.length = 0;
  H.callOrder.length = 0;
  H.aggregateCountsMock.mockReset().mockResolvedValue([
    { variant: 'a', sent: 5, opened: 1, clicked: 0 },
    { variant: 'b', sent: 5, opened: 3, clicked: 0 },
  ]);
  H.pickWinnerMock.mockReset().mockReturnValue({ winner: 'b', reason: 'B beat A on open (3 vs 1)' });
  H.enqueueCampaignSendMock.mockClear();
  // Don't override with mockResolvedValue here — that would replace the
  // hoisted implementation (which pushes onto callOrder) with a plain stub.
  H.executeCampaignSendMock.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeAbPromotion', () => {
  it('picks the winner via aggregateAbVariantCounts + pickAbWinner unchanged', async () => {
    H.dbState.activeSubs = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const campaign = makeCampaign({ abWinnerMetric: 'click' });

    await executeAbPromotion(5, campaign);

    expect(H.aggregateCountsMock).toHaveBeenCalledWith(5);
    expect(H.pickWinnerMock).toHaveBeenCalledWith(
      await H.aggregateCountsMock.mock.results[0].value,
      'click',
    );
  });

  it('writes the winner subject to BOTH `subject` and `abWinnerSubject` before dispatching (queued path)', async () => {
    H.dbState.alreadySent = [{ subscriberId: 1 }];
    H.dbState.activeSubs = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const campaign = makeCampaign(); // clientId: 9 → tenant-owned

    const result = await executeAbPromotion(5, campaign);

    expect(H.updateCalls).toHaveLength(1);
    const values = H.updateCalls[0].values as Record<string, unknown>;
    // `subject` must be updated too — executeCampaignSend reads campaign.subject,
    // not abWinnerSubject, to build the outgoing email. Missing this would
    // silently re-dispatch a "B" win with the original subject A.
    expect(values.subject).toBe('Subject B');
    expect(values.abWinnerSubject).toBe('Subject B');
    expect(values.abDecidedAt).toBeInstanceOf(Date);

    expect(result.winner).toBe('b');
    expect(result.winnerSubject).toBe('Subject B');
    expect(result.total).toBe(2); // remainder: 3 active minus 1 already-sent
    expect(result.queued).toBe(true);
  });

  it('enqueues the durable send job for a tenant-owned campaign and never dispatches inline', async () => {
    H.dbState.activeSubs = [{ id: 1 }, { id: 2 }];
    const campaign = makeCampaign({ clientId: 9 });

    await executeAbPromotion(5, campaign);

    expect(H.enqueueCampaignSendMock).toHaveBeenCalledWith(5, 9);
    expect(H.executeCampaignSendMock).not.toHaveBeenCalled();
    // The decision must be persisted before the job can possibly drain it.
    expect(H.callOrder).toEqual(['update', 'enqueue']);
  });

  it('falls back to synchronous executeCampaignSend for a global/agency campaign (clientId null) and never enqueues', async () => {
    H.dbState.activeSubs = [{ id: 1 }, { id: 2 }];
    const campaign = makeCampaign({ clientId: null });

    const result = await executeAbPromotion(5, campaign);

    expect(H.executeCampaignSendMock).toHaveBeenCalledTimes(1);
    const [calledId, calledCampaign] = H.executeCampaignSendMock.mock.calls[0] as [number, Record<string, unknown>];
    expect(calledId).toBe(5);
    // Must pass the already-decided fields so executeCampaignSend's abActive
    // check reads false (otherwise it would re-split into A/B buckets again).
    expect(calledCampaign.subject).toBe('Subject B');
    expect(calledCampaign.abDecidedAt).toBeInstanceOf(Date);

    expect(H.enqueueCampaignSendMock).not.toHaveBeenCalled();
    expect(H.callOrder).toEqual(['update', 'execute']);

    expect(result.queued).toBe(false);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('keeps the tie-break-to-A behavior: subject stays as the original A subject', async () => {
    H.dbState.activeSubs = [{ id: 1 }];
    H.pickWinnerMock.mockReturnValue({ winner: 'a', reason: 'Tie on open (1 each) — defaulting to A' });
    const campaign = makeCampaign({ subject: 'Original A' });

    const result = await executeAbPromotion(5, campaign);

    expect(result.winnerSubject).toBe('Original A');
    const values = H.updateCalls[0].values as Record<string, unknown>;
    expect(values.subject).toBe('Original A');
  });
});
