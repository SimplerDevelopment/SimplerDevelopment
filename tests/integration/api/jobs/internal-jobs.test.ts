/**
 * Internal job queue integration tests @jobs
 *
 * Covers the durability guarantees the POD fix depends on:
 *   A) a queued job runs and completes
 *   B) a failing job retries with backoff, then dead-letters — it is never
 *      silently dropped (the old fire-and-forget failure mode)
 *   C) the dedupe key makes a redelivered Stripe webhook a no-op, so one paid
 *      order can never produce two Printful submissions
 *   D) an expired lease is reclaimed — a worker that dies mid-job doesn't
 *      strand the work in 'running' forever
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('@/lib/fulfillment/pod', () => ({ submitPODOrder: vi.fn() }));

import { submitPODOrder } from '@/lib/fulfillment/pod';
const mockSubmit = submitPODOrder as unknown as Mock;

import { enqueueJob, drainInternalJobs, MAX_ATTEMPTS } from '@/lib/jobs';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

type JobRow = {
  id: number;
  status: string;
  attempt_count: number;
  error: string | null;
  next_retry_at: string | null;
  processed_at: string | null;
};

async function jobsFor(clientId: number): Promise<JobRow[]> {
  const sql = getTestSql();
  return sql<JobRow[]>`
    SELECT id, status, attempt_count, error, next_retry_at, processed_at
      FROM ${sql(TEST_SCHEMA)}.internal_jobs
     WHERE client_id = ${clientId} ORDER BY id`;
}

/** Clear the backoff so the next drain picks the job up immediately. */
async function makeDue(id: number): Promise<void> {
  const sql = getTestSql();
  await sql`UPDATE ${sql(TEST_SCHEMA)}.internal_jobs SET next_retry_at = NULL WHERE id = ${id}`;
}

describe('internal jobs queue @jobs', () => {
  let A: TenantCtx;

  beforeEach(async () => {
    mockSubmit.mockReset();
    mockSubmit.mockResolvedValue(undefined);
    A = await sessionForNewClientUser('jobs-a');
  });

  afterEach(async () => {
    const sql = getTestSql();
    await sql`DELETE FROM ${sql(TEST_SCHEMA)}.internal_jobs`;
  });

  it('A) runs a queued pod.submit job and marks it completed', async () => {
    await enqueueJob({
      clientId: A.client.id,
      type: 'pod.submit',
      payload: { orderId: 42 },
      dedupeKey: 'pod.submit:42',
    });

    const before = await jobsFor(A.client.id);
    expect(before).toHaveLength(1);
    expect(before[0].status).toBe('pending');

    const result = await drainInternalJobs();
    expect(result.processed).toBe(1);

    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(mockSubmit.mock.calls[0][0]).toBe(42);

    const after = await jobsFor(A.client.id);
    expect(after[0].status).toBe('completed');
    expect(after[0].processed_at).not.toBeNull();
  });

  it('B) retries a failing job with backoff, then dead-letters it', async () => {
    mockSubmit.mockRejectedValue(new Error('Printful 503'));

    await enqueueJob({
      clientId: A.client.id,
      type: 'pod.submit',
      payload: { orderId: 43 },
      dedupeKey: 'pod.submit:43',
    });
    const [{ id }] = await jobsFor(A.client.id);

    // Attempts 1..MAX_ATTEMPTS-1 → back to pending with a future retry time.
    for (let attempt = 1; attempt < MAX_ATTEMPTS; attempt++) {
      const res = await drainInternalJobs();
      expect(res.failed).toBe(1);

      const [row] = await jobsFor(A.client.id);
      expect(row.status).toBe('pending');
      expect(row.attempt_count).toBe(attempt);
      expect(row.error).toContain('Printful 503');
      // Backoff is set, so a second drain right now must NOT pick it up.
      expect(row.next_retry_at).not.toBeNull();
      const skipped = await drainInternalJobs();
      expect(skipped.failed).toBe(0);

      await makeDue(id);
    }

    // Final attempt → dead_letter, visible to an operator rather than lost.
    const last = await drainInternalJobs();
    expect(last.deadLettered).toBe(1);

    const [dead] = await jobsFor(A.client.id);
    expect(dead.status).toBe('dead_letter');
    expect(dead.attempt_count).toBe(MAX_ATTEMPTS);
    expect(dead.error).toContain('Printful 503');
    expect(mockSubmit).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it('C) a duplicate dedupeKey does not enqueue a second job', async () => {
    const params = {
      clientId: A.client.id,
      type: 'pod.submit' as const,
      payload: { orderId: 44 },
      dedupeKey: 'pod.submit:44',
    };

    // Simulates Stripe redelivering the same webhook.
    await enqueueJob(params);
    await enqueueJob(params);

    expect(await jobsFor(A.client.id)).toHaveLength(1);

    await drainInternalJobs();
    expect(mockSubmit).toHaveBeenCalledTimes(1); // one order, one submission
  });

  it('D) reclaims a job whose lease expired mid-run', async () => {
    const sql = getTestSql();
    // A worker claimed this and died: 'running' with a lease that has passed.
    const [job] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.internal_jobs
        (client_id, type, payload, status, next_retry_at, dedupe_key)
      VALUES (${A.client.id}, 'pod.submit', ${JSON.stringify({ orderId: 45 })}::json,
              'running', now() - interval '1 minute', 'pod.submit:45')
      RETURNING id`;

    const result = await drainInternalJobs();
    expect(result.processed).toBe(1);

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.internal_jobs WHERE id = ${job.id}`;
    expect(row.status).toBe('completed');
    expect(mockSubmit).toHaveBeenCalledWith(45, expect.anything());
  });

  it('E) keeps each tenant\'s jobs attributed to that tenant @tenancy', async () => {
    // internal_jobs has no user-facing read route yet, so there is nothing to
    // leak through today. This pins the property before one exists: the drain
    // deliberately crosses tenants (it is a system process), so client_id must
    // survive it intact — that column is what any future per-tenant view, and
    // the ON DELETE CASCADE, will both key on.
    const B = await sessionForNewClientUser('jobs-b');

    await enqueueJob({
      clientId: A.client.id, type: 'pod.submit',
      payload: { orderId: 47 }, dedupeKey: 'pod.submit:47',
    });
    await enqueueJob({
      clientId: B.client.id, type: 'pod.submit',
      payload: { orderId: 48 }, dedupeKey: 'pod.submit:48',
    });

    await drainInternalJobs();

    const aJobs = await jobsFor(A.client.id);
    const bJobs = await jobsFor(B.client.id);
    expect(aJobs).toHaveLength(1);
    expect(bJobs).toHaveLength(1);
    expect(aJobs[0].id).not.toBe(bJobs[0].id);
    expect(aJobs[0].status).toBe('completed');
    expect(bJobs[0].status).toBe('completed');

    // Both ran, each exactly once, with its own order.
    const orderIds = mockSubmit.mock.calls.map((c) => c[0]).sort();
    expect(orderIds).toEqual([47, 48]);
  });

  it('D2) leaves a job whose lease is still valid alone', async () => {
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.internal_jobs
        (client_id, type, payload, status, next_retry_at, dedupe_key)
      VALUES (${A.client.id}, 'pod.submit', ${JSON.stringify({ orderId: 46 })}::json,
              'running', now() + interval '5 minutes', 'pod.submit:46')`;

    const result = await drainInternalJobs();
    expect(result.processed).toBe(0);
    expect(mockSubmit).not.toHaveBeenCalled(); // still owned by the live worker
  });
});
