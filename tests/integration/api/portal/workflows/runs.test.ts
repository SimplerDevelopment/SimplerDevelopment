/**
 * Visual workflow builder — GET /api/portal/workflows/[id]/runs.
 *
 *   - Returns the runs for a given workflow, newest first (orderBy started_at DESC).
 *   - Cross-tenant: A reading B-owned workflow's runs returns 404 BEFORE the
 *     runs table is read (route uses an ownership probe).
 *   - After a test-run, the listed run row is consistent with the
 *     `workflow_step_logs` rows joined by run_id (logs are emitted in DFS order).
 *
 * The route returns runs only — step logs aren't joined into the response. We
 * assert the underlying step-log ordering separately via direct SQL since the
 * runtime walks the graph in a deterministic DFS and the test specification
 * calls for "step logs in correct order".
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { twoTenants, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import type { WorkflowGraph } from '@/lib/workflows/types';

interface WorkflowRow { id: number; clientId: number; graph: WorkflowGraph }

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
});

describe('GET /api/portal/workflows/[id]/runs @workflows @runs', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/workflows/[id]/runs/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: '1' } },
    );
    expect(res.status).toBe(401);
  });

  it('lists runs after a test-run, newest first; step logs are in DFS order', async () => {
    mockedAuth.mockResolvedValue(A.session);

    // Create + test-run twice so the DESC ordering by started_at is observable.
    // Use form-submission-auto-task (trigger → create_task, no wait) so the
    // run completes near-instantly. new-lead-nurture has a 1-hour wait that
    // the runtime caps at maxWaitMs (default 5s) — fine per run, but slow
    // when we need multiple runs inside a single test timeout.
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const wf = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST',
      { body: { templateId: 'form-submission-auto-task' } },
    );
    const id = wf.data!.data.id;

    const runRoute = await import('@/app/api/portal/workflows/[id]/test-run/route');
    const r1 = await callHandler<{ data: { runId: number } }>(
      runRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: {} },
    );
    // Tiny gap so started_at differs at ms granularity even on a fast box.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const r2 = await callHandler<{ data: { runId: number } }>(
      runRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: {} },
    );

    const listRoute = await import('@/app/api/portal/workflows/[id]/runs/route');
    const list = await callHandler<{ data: Array<{ id: number; status: string; workflowId: number; clientId: number }> }>(
      listRoute as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(id) } },
    );
    expect(list.status).toBe(200);
    const rows = list.data?.data ?? [];
    expect(rows.length).toBe(2);
    // Newest first: r2 then r1.
    expect(rows[0].id).toBe(r2.data!.data.runId);
    expect(rows[1].id).toBe(r1.data!.data.runId);
    for (const row of rows) {
      expect(row.workflowId).toBe(id);
      expect(row.clientId).toBe(A.client.id);
      expect(row.status).toBe('completed');
    }

    // Step logs: ordered by id ASC (insertion order). For form-submission-
    // auto-task the runtime walks trigger → task-followup so the action
    // sequence is deterministic.
    const sql = getTestSql();
    const steps = await sql<{ node_id: string; action: string }[]>`
      SELECT node_id, action
      FROM ${sql(TEST_SCHEMA)}.workflow_step_logs
      WHERE run_id = ${r1.data!.data.runId}
      ORDER BY id ASC
    `;
    expect(steps.map((s) => s.node_id)).toEqual(['trigger', 'task-followup']);
    expect(steps.map((s) => s.action)).toEqual(['trigger', 'create_task']);
  });

  it('cross-tenant @tenancy: A reading B workflow runs returns 404', async () => {
    mockedAuth.mockResolvedValue(B.session);
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const bWf = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST',
      { body: { templateId: 'new-lead-nurture' } },
    );
    const runRoute = await import('@/app/api/portal/workflows/[id]/test-run/route');
    await callHandler(
      runRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(bWf.data!.data.id) }, body: {} },
    );

    mockedAuth.mockResolvedValue(A.session);
    const listRoute = await import('@/app/api/portal/workflows/[id]/runs/route');
    const res = await callHandler(
      listRoute as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(bWf.data!.data.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('respects the ?limit query param', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const wf = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST',
      { body: { templateId: 'form-submission-auto-task' } },
    );
    const id = wf.data!.data.id;

    const runRoute = await import('@/app/api/portal/workflows/[id]/test-run/route');
    for (let i = 0; i < 3; i++) {
      await callHandler(
        runRoute as unknown as Record<string, unknown>, 'POST',
        { params: { id: String(id) }, body: {} },
      );
    }

    const listRoute = await import('@/app/api/portal/workflows/[id]/runs/route');
    const res = await callHandler<{ data: unknown[] }>(
      listRoute as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(id) }, query: { limit: 2 } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data).toHaveLength(2);
  });

  it('non-numeric id: 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/workflows/[id]/runs/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: 'abc' } },
    );
    expect(res.status).toBe(400);
  });
});
