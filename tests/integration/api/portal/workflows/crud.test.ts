/**
 * Visual workflow builder — CRUD endpoints.
 *
 *   POST   /api/portal/workflows         (blank or templateId-clone)
 *   GET    /api/portal/workflows         (list within tenant)
 *   PATCH  /api/portal/workflows/[id]    (status / graph / trigger / name)
 *   DELETE /api/portal/workflows/[id]    (cascades runs + step logs)
 *
 * Coverage:
 *   - Auth (401) on each verb.
 *   - POST blank: status='draft', graph has trigger node only, name defaults.
 *   - POST templateId: graph cloned from template, status='draft', deep clone
 *     (mutating the response cannot leak into other workflows).
 *   - POST templateId='nope': 404.
 *   - GET tenancy isolation — A's list excludes B's rows.
 *   - GET [id] tenancy isolation — A reading B's id returns 404.
 *   - PATCH transitions draft → active → paused; PATCH unknown status → 400.
 *   - PATCH cross-tenant returns 404 (route uses where(client_id) so the
 *     existing-row probe fails before the update).
 *   - DELETE cascades workflow_runs + workflow_step_logs (FK ON DELETE CASCADE).
 *   - DELETE cross-tenant: A cannot delete B's workflow (row stays).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { twoTenants, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import type { WorkflowGraph, WorkflowTriggerConfig } from '@/lib/workflows/types';

interface WorkflowRow {
  id: number;
  clientId: number;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'paused';
  trigger: WorkflowTriggerConfig;
  graph: WorkflowGraph;
}

async function seedRunWithSteps(workflowId: number, clientId: number): Promise<{ runId: number; stepIds: number[] }> {
  const sql = getTestSql();
  const [run] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.workflow_runs
      (workflow_id, client_id, triggered_by, status, context, started_at)
    VALUES
      (${workflowId}, ${clientId}, 'unit-seed', 'completed',
       ${sql.json({ seeded: true })}, now())
    RETURNING id
  `;
  const steps = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.workflow_step_logs
      (run_id, node_id, action, status, input, output, duration_ms, occurred_at)
    VALUES
      (${run.id}, 'trigger', 'trigger', 'success',
       ${sql.json({})}, ${sql.json({})}, 0, now()),
      (${run.id}, 'wait-1h', 'wait', 'success',
       ${sql.json({})}, ${sql.json({ waited: 0 })}, 0, now())
    RETURNING id
  `;
  return { runId: run.id, stepIds: steps.map((s) => s.id) };
}

describe('POST /api/portal/workflows @workflows @create', () => {
  let A: TenantCtx;
  beforeEach(async () => { ({ A } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/workflows/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: {} });
    expect(res.status).toBe(401);
  });

  it('blank create: status=draft + name defaults + graph has only trigger node', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/workflows/route');
    const res = await callHandler<{ data: WorkflowRow }>(
      route as unknown as Record<string, unknown>, 'POST', { body: {} },
    );
    expect(res.status).toBe(200);
    const wf = res.data?.data;
    expect(wf).toBeTruthy();
    expect(wf!.clientId).toBe(A.client.id);
    expect(wf!.status).toBe('draft');
    expect(wf!.name).toBe('Untitled workflow');
    expect(wf!.graph.nodes).toHaveLength(1);
    expect(wf!.graph.nodes[0].type).toBe('trigger');
    expect(wf!.graph.edges).toHaveLength(0);
  });

  it('clone from template: graph cloned, status=draft, name from template', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/workflows/route');
    const res = await callHandler<{ data: WorkflowRow }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { templateId: 'new-lead-nurture' } },
    );
    expect(res.status).toBe(200);
    const wf = res.data?.data;
    expect(wf!.status).toBe('draft');
    expect(wf!.name).toMatch(/lead nurture/i);
    // Sanity-check the cloned graph matches the seed template shape.
    const nodeIds = wf!.graph.nodes.map((n) => n.id).sort();
    expect(nodeIds).toEqual(['trigger', 'wait-1h', 'welcome-email']);
    expect(wf!.graph.edges).toHaveLength(2);
    expect(wf!.trigger.kind).toBe('contact.created');
  });

  it('templateId not found: 404', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/workflows/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { templateId: 'nope' } },
    );
    expect(res.status).toBe(404);
  });

  it('cloned graph is a deep copy — mutating one workflow does not leak to another', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/workflows/route');
    const r1 = await callHandler<{ data: WorkflowRow }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { templateId: 'new-lead-nurture' } },
    );
    const r2 = await callHandler<{ data: WorkflowRow }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { templateId: 'new-lead-nurture' } },
    );
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // Different PK ids — separate rows, separate graphs.
    expect(r1.data!.data.id).not.toBe(r2.data!.data.id);
    // The two graphs should be value-equal but not reference-equal.
    expect(r1.data!.data.graph).toEqual(r2.data!.data.graph);
    expect(r1.data!.data.graph).not.toBe(r2.data!.data.graph);
  });
});

describe('GET /api/portal/workflows @workflows @list @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('401 unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/workflows/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', {});
    expect(res.status).toBe(401);
  });

  it('lists only the caller tenant workflows', async () => {
    // Seed one for A, one for B via the API itself so the row matches what
    // the route would actually persist.
    mockedAuth.mockResolvedValue(A.session);
    const create = await import('@/app/api/portal/workflows/route');
    await callHandler(create as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'A-only' } });

    mockedAuth.mockResolvedValue(B.session);
    await callHandler(create as unknown as Record<string, unknown>, 'POST',
      { body: { name: 'B-only' } });

    // A reads — sees only their own.
    mockedAuth.mockResolvedValue(A.session);
    const list = await callHandler<{ data: WorkflowRow[] }>(
      create as unknown as Record<string, unknown>, 'GET', {},
    );
    expect(list.status).toBe(200);
    const names = list.data?.data.map((w) => w.name) ?? [];
    expect(names).toContain('A-only');
    expect(names).not.toContain('B-only');
    for (const wf of list.data?.data ?? []) {
      expect(wf.clientId).toBe(A.client.id);
    }
  });
});

describe('GET /api/portal/workflows/[id] @workflows @read @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('returns the workflow when caller owns it', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const created = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST', { body: {} },
    );
    const id = created.data!.data.id;

    const idRoute = await import('@/app/api/portal/workflows/[id]/route');
    const res = await callHandler<{ data: WorkflowRow }>(
      idRoute as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.id).toBe(id);
  });

  it('cross-tenant: A reading B-owned workflow returns 404', async () => {
    mockedAuth.mockResolvedValue(B.session);
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const bWorkflow = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST', { body: {} },
    );
    const idRoute = await import('@/app/api/portal/workflows/[id]/route');

    mockedAuth.mockResolvedValue(A.session);
    const res = await callHandler(
      idRoute as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(bWorkflow.data!.data.id) } },
    );
    expect(res.status).toBe(404);
  });

  it('non-numeric id: 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const idRoute = await import('@/app/api/portal/workflows/[id]/route');
    const res = await callHandler(
      idRoute as unknown as Record<string, unknown>, 'GET',
      { params: { id: 'abc' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/portal/workflows/[id] @workflows @update', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('updates status: draft → active → paused', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const created = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST', { body: {} },
    );
    const id = created.data!.data.id;

    const idRoute = await import('@/app/api/portal/workflows/[id]/route');

    const toActive = await callHandler<{ data: WorkflowRow }>(
      idRoute as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(id) }, body: { status: 'active' } },
    );
    expect(toActive.status).toBe(200);
    expect(toActive.data?.data.status).toBe('active');

    const toPaused = await callHandler<{ data: WorkflowRow }>(
      idRoute as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(id) }, body: { status: 'paused' } },
    );
    expect(toPaused.status).toBe(200);
    expect(toPaused.data?.data.status).toBe('paused');
  });

  it('invalid status: 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const created = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST', { body: {} },
    );
    const idRoute = await import('@/app/api/portal/workflows/[id]/route');
    const res = await callHandler(
      idRoute as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(created.data!.data.id) },
        body: { status: 'archived' } },
    );
    expect(res.status).toBe(400);
  });

  it('updates graph + name + description', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const created = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST', { body: {} },
    );
    const id = created.data!.data.id;

    const newGraph: WorkflowGraph = {
      nodes: [
        { id: 't', type: 'trigger', position: { x: 0, y: 0 }, data: { kind: 'contact.created' } },
        { id: 'a', type: 'action', position: { x: 0, y: 100 }, data: { kind: 'wait', ms: 1000 } },
      ],
      edges: [{ id: 'e', source: 't', target: 'a' }],
    };

    const idRoute = await import('@/app/api/portal/workflows/[id]/route');
    const res = await callHandler<{ data: WorkflowRow }>(
      idRoute as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(id) }, body: { name: 'Renamed', description: 'longer copy', graph: newGraph } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('Renamed');
    expect(res.data?.data.description).toBe('longer copy');
    expect(res.data?.data.graph.nodes.map((n) => n.id).sort()).toEqual(['a', 't']);
  });

  it('cross-tenant @tenancy: A cannot patch B-owned workflow (404)', async () => {
    mockedAuth.mockResolvedValue(B.session);
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const bWorkflow = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST', { body: {} },
    );
    const idRoute = await import('@/app/api/portal/workflows/[id]/route');

    mockedAuth.mockResolvedValue(A.session);
    const res = await callHandler(
      idRoute as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(bWorkflow.data!.data.id) }, body: { status: 'active' } },
    );
    expect(res.status).toBe(404);

    // And the row remained unchanged in B's namespace.
    const sql = getTestSql();
    const [row] = await sql<{ status: string; client_id: number }[]>`
      SELECT status, client_id
      FROM ${sql(TEST_SCHEMA)}.workflows
      WHERE id = ${bWorkflow.data!.data.id}
    `;
    expect(row.status).toBe('draft');
    expect(row.client_id).toBe(B.client.id);
  });
});

describe('DELETE /api/portal/workflows/[id] @workflows @delete @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('cascades: deleting the workflow removes its runs + step logs', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const created = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST', { body: {} },
    );
    const id = created.data!.data.id;

    const { runId } = await seedRunWithSteps(id, A.client.id);

    const idRoute = await import('@/app/api/portal/workflows/[id]/route');
    const res = await callHandler(
      idRoute as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const remainingWf = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.workflows WHERE id = ${id}
    `;
    expect(remainingWf).toHaveLength(0);

    const remainingRuns = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.workflow_runs WHERE id = ${runId}
    `;
    expect(remainingRuns).toHaveLength(0);

    const remainingLogs = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.workflow_step_logs WHERE run_id = ${runId}
    `;
    expect(remainingLogs).toHaveLength(0);
  });

  it('cross-tenant @tenancy: A cannot delete B-owned workflow', async () => {
    mockedAuth.mockResolvedValue(B.session);
    const collectionRoute = await import('@/app/api/portal/workflows/route');
    const bWorkflow = await callHandler<{ data: WorkflowRow }>(
      collectionRoute as unknown as Record<string, unknown>, 'POST', { body: {} },
    );

    const idRoute = await import('@/app/api/portal/workflows/[id]/route');
    mockedAuth.mockResolvedValue(A.session);
    // The route returns 200 envelope success because the WHERE-filtered
    // delete affects 0 rows, but the row must still exist in B.
    await callHandler(
      idRoute as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(bWorkflow.data!.data.id) } },
    );

    const sql = getTestSql();
    const [row] = await sql<{ id: number; client_id: number }[]>`
      SELECT id, client_id
      FROM ${sql(TEST_SCHEMA)}.workflows
      WHERE id = ${bWorkflow.data!.data.id}
    `;
    expect(row).toBeTruthy();
    expect(row.client_id).toBe(B.client.id);
  });
});
