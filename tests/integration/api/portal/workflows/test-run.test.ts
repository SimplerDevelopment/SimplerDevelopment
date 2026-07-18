/**
 * Visual workflow builder — POST /api/portal/workflows/[id]/test-run.
 *
 * The endpoint hands the workflow + a synthetic context to lib/workflows/runtime.ts.
 * We exercise it end-to-end against a live Postgres test schema and assert:
 *   - workflow_runs row written with status='completed' (or 'failed')
 *   - workflow_step_logs rows for each visited node, in order
 *   - duration / status math is right (durationMs is non-negative, run rows
 *     have started_at + completed_at on completion)
 *   - cross-tenant test-run is rejected (404)
 *
 * Webhook-emitting templates would otherwise fire real HTTP — we stub fetch so
 * the test suite stays hermetic and the assertions cover the runtime's record-
 * keeping rather than network behaviour.
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
interface RunResult {
  data: { runId: number; status: 'completed' | 'failed'; error?: string };
}

beforeEach(() => {
  // Hermetic webhook stub — the create_task / wait / send_email / add_to_list
  // / condition kinds don't hit fetch, but the webhook-to-slack template does.
  global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
});

describe('POST /api/portal/workflows/[id]/test-run @workflows @run', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/workflows/[id]/test-run/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: '1' }, body: {} },
    );
    expect(res.status).toBe(401);
  });

  it('runs a templated workflow and records run + step logs', async () => {
    mockedAuth.mockResolvedValue(A.session);

    // Use new-lead-nurture: trigger → wait → send_email. Three step logs total.
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const created = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST',
      { body: { templateId: 'new-lead-nurture' } },
    );
    expect(created.status).toBe(200);
    const id = created.data!.data.id;

    const runRoute = await import('@/app/api/portal/workflows/[id]/test-run/route');
    const res = await callHandler<RunResult>(
      runRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: { context: { source: 'spec' } } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('completed');
    const runId = res.data!.data.runId;

    const sql = getTestSql();
    // Run row: status, client scoping, started_at + completed_at non-null.
    const [run] = await sql<{
      id: number; status: string; client_id: number; workflow_id: number;
      triggered_by: string | null; started_at: Date; completed_at: Date | null; error: string | null;
    }[]>`
      SELECT id, status, client_id, workflow_id, triggered_by, started_at, completed_at, error
      FROM ${sql(TEST_SCHEMA)}.workflow_runs
      WHERE id = ${runId}
    `;
    expect(run.status).toBe('completed');
    expect(run.client_id).toBe(A.client.id);
    expect(run.workflow_id).toBe(id);
    expect(run.triggered_by).toBe('test-run');
    expect(run.error).toBeNull();
    expect(run.started_at).toBeTruthy();
    expect(run.completed_at).toBeTruthy();
    expect(run.completed_at!.getTime()).toBeGreaterThanOrEqual(run.started_at.getTime());

    // Step logs: trigger marker + each downstream action, in order, with non-
    // negative durations.
    const steps = await sql<{
      node_id: string; action: string; status: string; duration_ms: number | null; occurred_at: Date;
    }[]>`
      SELECT node_id, action, status, duration_ms, occurred_at
      FROM ${sql(TEST_SCHEMA)}.workflow_step_logs
      WHERE run_id = ${runId}
      ORDER BY id ASC
    `;
    expect(steps.length).toBe(3);
    expect(steps.map((s) => s.action)).toEqual(['trigger', 'wait', 'send_email']);
    // wait + send_email are step kinds we intentionally short-circuit (wait
    // is capped, send_email is currently a TODO/skipped) — but every step
    // must record a non-negative duration_ms.
    for (const s of steps) {
      expect(s.duration_ms ?? 0).toBeGreaterThanOrEqual(0);
    }
    // Status math: trigger marker is success, wait succeeds, send_email is
    // skipped (per runtime), and the run as a whole still completes.
    expect(steps[0].status).toBe('success');
    expect(steps[1].status).toBe('success');
    expect(steps[2].status).toBe('skipped');
  });

  it('records status=failed when the graph is missing a trigger', async () => {
    mockedAuth.mockResolvedValue(A.session);

    // Start from a blank workflow then PATCH its graph to remove the trigger
    // node — this produces a deliberately-broken workflow we can run.
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const created = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST', { body: {} },
    );
    const id = created.data!.data.id;

    const idRoute = await import('@/app/api/portal/workflows/[id]/route');
    const orphanGraph: WorkflowGraph = {
      nodes: [
        { id: 'orphan', type: 'action', position: { x: 0, y: 0 }, data: { kind: 'wait', ms: 0 } },
      ],
      edges: [],
    };
    await callHandler(
      idRoute as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(id) }, body: { graph: orphanGraph } },
    );

    const runRoute = await import('@/app/api/portal/workflows/[id]/test-run/route');
    const res = await callHandler<RunResult>(
      runRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: {} },
    );
    // The route returns success=false when the run failed; HTTP 200 envelope.
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('failed');
    expect(res.data?.data.error).toMatch(/no trigger/i);

    const sql = getTestSql();
    const [run] = await sql<{ status: string; error: string | null; completed_at: Date | null }[]>`
      SELECT status, error, completed_at
      FROM ${sql(TEST_SCHEMA)}.workflow_runs
      WHERE id = ${res.data!.data.runId}
    `;
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/no trigger/i);
    expect(run.completed_at).toBeTruthy();
  });

  it('walks fan-out templates: every node visited produces a step log', async () => {
    mockedAuth.mockResolvedValue(A.session);

    // stage-advance-celebration fans out from one trigger to two parallel
    // actions (create_task + webhook). Three step logs total.
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const created = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST',
      { body: { templateId: 'stage-advance-celebration' } },
    );
    const id = created.data!.data.id;

    const runRoute = await import('@/app/api/portal/workflows/[id]/test-run/route');
    const res = await callHandler<RunResult>(
      runRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(id) }, body: {} },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('completed');

    const sql = getTestSql();
    const steps = await sql<{ node_id: string; action: string }[]>`
      SELECT node_id, action
      FROM ${sql(TEST_SCHEMA)}.workflow_step_logs
      WHERE run_id = ${res.data!.data.runId}
      ORDER BY id ASC
    `;
    // 3 nodes total: trigger + thank-you-task + celebrate-hook.
    expect(steps).toHaveLength(3);
    const visited = new Set(steps.map((s) => s.node_id));
    expect(visited.has('trigger')).toBe(true);
    expect(visited.has('thank-you-task')).toBe(true);
    expect(visited.has('celebrate-hook')).toBe(true);

    // Webhook should have been invoked exactly once (against the celebrate
    // template URL). create_task is best-effort — skips silently when the
    // tenant has no kanban project, so it does NOT call fetch.
    expect((global.fetch as unknown as Mock).mock.calls.length).toBe(1);
    const [calledUrl] = (global.fetch as unknown as Mock).mock.calls[0];
    expect(String(calledUrl)).toContain('hooks.example.com');
  });

  it('cross-tenant @tenancy: A cannot test-run B-owned workflow (404, no run row)', async () => {
    // B creates the workflow.
    mockedAuth.mockResolvedValue(B.session);
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const bWorkflow = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST',
      { body: { templateId: 'new-lead-nurture' } },
    );

    // A tries to test-run it.
    mockedAuth.mockResolvedValue(A.session);
    const runRoute = await import('@/app/api/portal/workflows/[id]/test-run/route');
    const res = await callHandler(
      runRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(bWorkflow.data!.data.id) }, body: {} },
    );
    expect(res.status).toBe(404);

    // No run row was inserted under either tenant.
    const sql = getTestSql();
    const runs = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.workflow_runs
      WHERE workflow_id = ${bWorkflow.data!.data.id}
    `;
    expect(runs).toHaveLength(0);
  });

  it('non-numeric id: 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const runRoute = await import('@/app/api/portal/workflows/[id]/test-run/route');
    const res = await callHandler(
      runRoute as unknown as Record<string, unknown>, 'POST',
      { params: { id: 'abc' }, body: {} },
    );
    expect(res.status).toBe(400);
  });
});
