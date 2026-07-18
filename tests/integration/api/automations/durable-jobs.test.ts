/**
 * Durable automation-jobs queue integration tests @automations
 *
 * Verifies the durability layer added to emitEvent:
 *   A) emitEvent journals every event to automation_jobs and marks it
 *      'completed' once in-process handlers finish.
 *   B) An event whose in-process dispatch was dropped (a 'pending' row past the
 *      grace window) is re-run by the process-automation-jobs cron — at-least-once
 *      delivery + retries, instead of the old silent drop.
 */
import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('@/lib/ai/portal-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai/portal-tools')>();
  return { ...actual, executePortalTool: vi.fn() };
});

import { executePortalTool } from '@/lib/ai/portal-tools';
const mockTool = executePortalTool as unknown as Mock;

import { emitEvent } from '@/lib/automation';
import { GET as processAutomationJobs } from '@/app/api/cron/process-automation-jobs/route';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function createRule(clientId: number, event: string): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.automation_rules (client_id, name, trigger, conditions, actions, enabled, source)
    VALUES (${clientId}, 'durable test', ${JSON.stringify({ event })}::jsonb, '[]'::jsonb,
            ${JSON.stringify([{ tool: 'send_email', params: { to: 'x@test.local', subject: 'hi' } }])}::jsonb, true, 'manual')
    RETURNING id`;
  return row.id;
}

async function jobsFor(clientId: number, event: string) {
  const sql = getTestSql();
  return sql<{ id: number; status: string; attempt_count: number; processed_at: string | null }[]>`
    SELECT id, status, attempt_count, processed_at FROM ${sql(TEST_SCHEMA)}.automation_jobs
    WHERE client_id = ${clientId} AND event = ${event} ORDER BY id DESC`;
}

async function logCount(clientId: number): Promise<number> {
  const sql = getTestSql();
  const [r] = await sql<{ c: number }[]>`
    SELECT count(*)::int AS c FROM ${sql(TEST_SCHEMA)}.automation_logs WHERE client_id = ${clientId}`;
  return r?.c ?? 0;
}

async function poll(fn: () => Promise<boolean>, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
}

const cronReq = () =>
  new Request('http://localhost/api/cron/process-automation-jobs', { headers: { 'x-vercel-cron': '1' } });

describe('durable automation jobs @automations', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    mockTool.mockReset();
    mockTool.mockResolvedValue({ ok: true });
    A = await sessionForNewClientUser('durable-a');
  });
  afterEach(async () => {
    const sql = getTestSql();
    await sql`DELETE FROM ${sql(TEST_SCHEMA)}.automation_jobs`;
    await sql`DELETE FROM ${sql(TEST_SCHEMA)}.automation_logs`;
    await sql`DELETE FROM ${sql(TEST_SCHEMA)}.automation_rules`;
  });

  it('A) emitEvent journals the event and marks it completed after in-process dispatch', async () => {
    await createRule(A.client.id, 'booking.created');
    emitEvent('booking.created', A.client.id, A.user.id, { bookingId: 1 });

    await poll(async () => {
      const jobs = await jobsFor(A.client.id, 'booking.created');
      return jobs.length === 1 && jobs[0].status === 'completed';
    });

    const jobs = await jobsFor(A.client.id, 'booking.created');
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('completed');
    expect(jobs[0].processed_at).not.toBeNull();
    expect(await logCount(A.client.id)).toBe(1); // the rule fired in-process
  });

  it('B) the cron re-runs a dropped (pending, past-grace) event and completes it', async () => {
    await createRule(A.client.id, 'booking.created');
    const sql = getTestSql();
    // Simulate an event whose in-process dispatch was dropped: a pending job
    // created 5 minutes ago (past the 90s grace window), with no automation_log.
    const [job] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.automation_jobs (client_id, event, user_id, payload, status, created_at)
      VALUES (${A.client.id}, 'booking.created', ${A.user.id}, ${JSON.stringify({ bookingId: 2 })}::jsonb,
              'pending', now() - interval '5 minutes')
      RETURNING id`;
    expect(await logCount(A.client.id)).toBe(0); // not yet processed

    const res = await processAutomationJobs(cronReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBeGreaterThanOrEqual(1);

    // The cron re-ran the handlers → the rule fired (a log) and the job completed.
    await poll(async () => (await logCount(A.client.id)) >= 1);
    expect(await logCount(A.client.id)).toBe(1);
    const [updated] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.automation_jobs WHERE id = ${job.id}`;
    expect(updated.status).toBe('completed');
  });

  it('B2) the cron does NOT touch a fresh pending job (within the grace window)', async () => {
    await createRule(A.client.id, 'booking.created');
    const sql = getTestSql();
    const [job] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.automation_jobs (client_id, event, user_id, payload, status, created_at)
      VALUES (${A.client.id}, 'booking.created', ${A.user.id}, '{}'::jsonb, 'pending', now())
      RETURNING id`;

    await processAutomationJobs(cronReq());

    const [row] = await sql<{ status: string }[]>`
      SELECT status FROM ${sql(TEST_SCHEMA)}.automation_jobs WHERE id = ${job.id}`;
    expect(row.status).toBe('pending'); // still within grace — left for in-process
    expect(await logCount(A.client.id)).toBe(0);
  });
});
