// @vitest-environment node
/**
 * Unit tests for the durable email-campaign send job (PUX-046):
 * enqueueCampaignSend's terminal-row cleanup + dedupe key, and
 * runCampaignSendJob's guards and final-attempt cancellation.
 *
 * Recording-fake db + module mocks — same pattern as
 * automation-delayed-action.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── DB mock ────────────────────────────────────────────────────────────────

const state: {
  selects: unknown[][][];       // FIFO of result sets, one per db.select() call
  updates: { table: string; set: Record<string, unknown> }[];
  deletes: { table: string }[];
} = { selects: [], updates: [], deletes: [] };

const fakeDb = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(state.selects.shift()?.[0] ?? []),
      }),
    }),
  }),
  update: (table: { _?: { name?: string } }) => ({
    set: (set: Record<string, unknown>) => ({
      where: () => {
        state.updates.push({ table: table?._?.name ?? 'unknown', set });
        return Promise.resolve();
      },
    }),
  }),
  delete: (table: { _?: { name?: string } }) => ({
    where: () => {
      state.deletes.push({ table: table?._?.name ?? 'unknown' });
      return Promise.resolve();
    },
  }),
};

// Lazy property functions — vi.mock factories are hoisted above the const
// declarations, so referencing fakeDb directly here would hit the TDZ.
vi.mock('@/lib/db', () => ({
  db: {
    select: (...a: unknown[]) => (fakeDb.select as (...x: unknown[]) => unknown)(...a),
    update: (...a: unknown[]) => (fakeDb.update as (...x: unknown[]) => unknown)(...a),
    delete: (...a: unknown[]) => (fakeDb.delete as (...x: unknown[]) => unknown)(...a),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  emailCampaigns: { _: { name: 'email_campaigns' }, id: 'id' },
  internalJobs: {
    _: { name: 'internal_jobs' },
    dedupeKey: 'dedupeKey',
    status: 'status',
    attemptCount: 'attemptCount',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: (...args: unknown[]) => args,
  and: (...args: unknown[]) => args,
  inArray: (...args: unknown[]) => args,
}));

// ─── Queue + send mocks ─────────────────────────────────────────────────────

const mockEnqueueJob = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/jobs', () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
  MAX_ATTEMPTS: 3,
}));

const mockExecuteCampaignSend = vi.fn().mockResolvedValue({ sent: 1, failed: 0, total: 1 });
vi.mock('@/lib/email/campaign-send', () => ({
  executeCampaignSend: (...args: unknown[]) => mockExecuteCampaignSend(...args),
}));

import {
  enqueueCampaignSend,
  runCampaignSendJob,
  campaignSendDedupeKey,
} from '@/lib/email/campaign-send-job';

type Db = Parameters<typeof runCampaignSendJob>[1];
const db = fakeDb as unknown as Db;

beforeEach(() => {
  state.selects = [];
  state.updates = [];
  state.deletes = [];
  mockEnqueueJob.mockClear().mockResolvedValue(undefined);
  mockExecuteCampaignSend.mockClear().mockResolvedValue({ sent: 1, failed: 0, total: 1 });
});

describe('enqueueCampaignSend', () => {
  it('clears terminal rows for the dedupe key, then enqueues with it', async () => {
    await enqueueCampaignSend(5, 9, db);

    // Terminal-row cleanup runs first so a re-send isn't swallowed by an old
    // completed/dead_letter row's unique dedupe key.
    expect(state.deletes).toEqual([{ table: 'internal_jobs' }]);
    expect(mockEnqueueJob).toHaveBeenCalledTimes(1);
    const params = mockEnqueueJob.mock.calls[0][0] as {
      clientId: number; type: string; payload: Record<string, unknown>; dedupeKey: string;
    };
    expect(params.clientId).toBe(9);
    expect(params.type).toBe('email.campaign_send');
    expect(params.payload).toEqual({ campaignId: 5, clientId: 9 });
    expect(params.dedupeKey).toBe(campaignSendDedupeKey(5));
    expect(params.dedupeKey).toBe('email.campaign_send:5');

    // The enqueue owns the status transition — every producer gets the
    // 'sending' flip without repeating it.
    const flips = state.updates.filter(u => u.table === 'email_campaigns');
    expect(flips).toHaveLength(1);
    expect(flips[0].set.status).toBe('sending');
  });
});

describe('runCampaignSendJob', () => {
  const payload = { campaignId: 5, clientId: 9 };

  it('throws on a malformed payload (queue retry/dead-letter is the escalation)', async () => {
    await expect(runCampaignSendJob({ campaignId: 'nope' }, db)).rejects.toThrow(/campaignId/);
  });

  it('no-ops when the campaign was deleted since enqueue', async () => {
    state.selects = [[[]]];
    await runCampaignSendJob(payload, db);
    expect(mockExecuteCampaignSend).not.toHaveBeenCalled();
  });

  it('refuses when the campaign no longer belongs to the enqueuing client', async () => {
    state.selects = [[[{ id: 5, clientId: 999, status: 'draft' }]]];
    await runCampaignSendJob(payload, db);
    expect(mockExecuteCampaignSend).not.toHaveBeenCalled();
  });

  it('no-ops when the campaign already reached status=sent', async () => {
    state.selects = [[[{ id: 5, clientId: 9, status: 'sent' }]]];
    await runCampaignSendJob(payload, db);
    expect(mockExecuteCampaignSend).not.toHaveBeenCalled();
  });

  it('runs executeCampaignSend with the loaded campaign row', async () => {
    const campaign = { id: 5, clientId: 9, status: 'draft' };
    state.selects = [[[campaign]]];
    await runCampaignSendJob(payload, db);
    expect(mockExecuteCampaignSend).toHaveBeenCalledWith(5, campaign);
    expect(state.updates).toEqual([]); // no status meddling on success
  });

  it('rethrows on a NON-final failure without cancelling the campaign', async () => {
    mockExecuteCampaignSend.mockRejectedValueOnce(new Error('resend down'));
    state.selects = [
      [[{ id: 5, clientId: 9, status: 'sending' }]], // campaign fetch
      [[{ attemptCount: 0 }]],                        // job row: first attempt
    ];
    await expect(runCampaignSendJob(payload, db)).rejects.toThrow('resend down');
    expect(state.updates.filter(u => u.table === 'email_campaigns')).toHaveLength(0);
  });

  it('cancels the campaign on the FINAL attempt, then rethrows', async () => {
    mockExecuteCampaignSend.mockRejectedValueOnce(new Error('no resend key'));
    state.selects = [
      [[{ id: 5, clientId: 9, status: 'sending' }]],
      [[{ attemptCount: 2 }]], // attempt 3 of MAX_ATTEMPTS=3 → terminal
    ];
    await expect(runCampaignSendJob(payload, db)).rejects.toThrow('no resend key');
    const cancels = state.updates.filter(u => u.table === 'email_campaigns');
    expect(cancels).toHaveLength(1);
    expect(cancels[0].set.status).toBe('cancelled');
  });
});
