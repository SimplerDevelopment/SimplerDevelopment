/**
 * Workflow Designer executions — REST routes.
 *
 * Two things here genuinely need a real database:
 *
 *  1. `doneCount` is a CORRELATED SUBQUERY. lib/db/CLAUDE.md documents that an
 *     interpolated outer ref (`${table.col}`) emits an unqualified column name
 *     which resolves against the subquery and SILENTLY RETURNS 0 instead of
 *     erroring. The first version of this route had exactly that bug: every
 *     progress bar would have read 0/N forever with nothing in the logs. A
 *     mocked DB cannot catch it — only real SQL can, which is why this asserts
 *     a NON-ZERO count rather than just "responds 200".
 *
 *  2. Tenancy. Runs carry clientId so a future portal-wide rollup stays
 *     additive; that column is worthless if the route doesn't filter on the
 *     project's ownership.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { twoTenants, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import type { AgentFlowGraph } from '@/lib/agent-flows/types';

const graph: AgentFlowGraph = {
  nodes: [
    { id: 'n1', position: { x: 0, y: 0 }, data: { kind: 'agent', agentType: 'backend-engineer', label: 'Build' } },
    { id: 'n2', position: { x: 0, y: 100 }, data: { kind: 'step', agentType: null, label: 'Gate' } },
    { id: 'n3', position: { x: 0, y: 200 }, data: { kind: 'human', agentType: null, label: 'Sign off' } },
    { id: 'n4', position: { x: 0, y: 300 }, data: { kind: 'agent', agentType: 'code-reviewer', label: 'Review' } },
  ],
  edges: [],
};

async function seedProject(tenant: TenantCtx): Promise<number> {
  const sql = getTestSql();
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES ('Runs project', ${tenant.client.id}, 'active', ${tenant.user.id})
    RETURNING id`;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${proj.id}, ${tenant.user.id}, 'owner')`;
  return proj.id;
}

async function seedFlow(projectId: number, tenant: TenantCtx): Promise<number> {
  const sql = getTestSql();
  const [flow] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.agent_flows (project_id, client_id, name, status, graph, created_by)
    VALUES (${projectId}, ${tenant.client.id}, 'Runs flow', 'active', ${sql.json(graph as never)}, ${tenant.user.id})
    RETURNING id`;
  return flow.id;
}

async function seedRun(flowId: number, projectId: number, tenant: TenantCtx): Promise<number> {
  const sql = getTestSql();
  const [run] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.agent_flow_runs (flow_id, project_id, client_id, status, graph, started_by)
    VALUES (${flowId}, ${projectId}, ${tenant.client.id}, 'running', ${sql.json(graph as never)}, ${tenant.user.id})
    RETURNING id`;
  return run.id;
}

async function seedEvent(runId: number, nodeId: string | null, type: string, status: string | null) {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.agent_flow_run_events (run_id, type, node_id, status)
    VALUES (${runId}, ${type}, ${nodeId}, ${status})`;
}

async function listRoute() {
  return import('@/app/api/portal/projects/[id]/flow-runs/route');
}
async function detailRoute() {
  return import('@/app/api/portal/projects/[id]/flow-runs/[runId]/route');
}

interface RunSummaryRow {
  id: number; flowId: number; flowName: string; status: string;
  nodeCount: number; doneCount: number; depth: number;
}

describe('GET /api/portal/projects/:id/flow-runs @agent-flows @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('counts finished AND skipped nodes — the correlated subquery must not silently return 0', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const flowId = await seedFlow(projectId, A);
    const runId = await seedRun(flowId, projectId, A);

    await seedEvent(runId, null, 'run.started', null);
    await seedEvent(runId, 'n1', 'node.status', 'finished');
    // skipped counts as done — an untaken branch is resolved, not pending.
    await seedEvent(runId, 'n2', 'node.status', 'skipped');
    await seedEvent(runId, 'n4', 'node.status', 'started');

    const route = await listRoute();
    const res = await callHandler<{ data: RunSummaryRow[] }>(
      route as unknown as Record<string, unknown>, 'GET', { params: { id: String(projectId) } },
    );

    expect(res.status).toBe(200);
    const row = res.data!.data.find((r) => r.id === runId)!;
    expect(row.nodeCount).toBe(4);
    // The regression assertion: 0 here means the outer ref went unqualified.
    expect(row.doneCount).toBe(2);
    expect(row.flowName).toBe('Runs flow');
  });

  it('de-duplicates a node that finished more than once in a rework loop', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const flowId = await seedFlow(projectId, A);
    const runId = await seedRun(flowId, projectId, A);

    await seedEvent(runId, 'n1', 'node.status', 'finished');
    await seedEvent(runId, 'n1', 'node.status', 'started');
    await seedEvent(runId, 'n1', 'node.status', 'finished');

    const route = await listRoute();
    const res = await callHandler<{ data: RunSummaryRow[] }>(
      route as unknown as Record<string, unknown>, 'GET', { params: { id: String(projectId) } },
    );
    // count(distinct node_id) — one node done, not three.
    expect(res.data!.data.find((r) => r.id === runId)!.doneCount).toBe(1);
  });

  it("does not list another tenant's runs", async () => {
    const projectB = await seedProject(B);
    const flowB = await seedFlow(projectB, B);
    await seedRun(flowB, projectB, B);

    // A asks for B's project by id.
    mockedAuth.mockResolvedValue(A.session);
    const route = await listRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET', { params: { id: String(projectB) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/portal/projects/:id/flow-runs/:runId @agent-flows @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('returns the run with its graph SNAPSHOT and full event log', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const flowId = await seedFlow(projectId, A);
    const runId = await seedRun(flowId, projectId, A);
    await seedEvent(runId, null, 'run.started', null);
    await seedEvent(runId, 'n1', 'node.status', 'finished');

    const route = await detailRoute();
    const res = await callHandler<{ data: { run: { graph: AgentFlowGraph; status: string }, events: unknown[] } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(projectId), runId: String(runId) } },
    );

    expect(res.status).toBe(200);
    // The snapshot is what makes a stalled run readable later, even if the
    // flow it came from has since been edited.
    expect(res.data!.data.run.graph.nodes).toHaveLength(4);
    expect(res.data!.data.events).toHaveLength(2);
  });

  it("a run from another tenant's project is 404, not 403 — no existence leak", async () => {
    const projectB = await seedProject(B);
    const flowB = await seedFlow(projectB, B);
    const runB = await seedRun(flowB, projectB, B);

    mockedAuth.mockResolvedValue(A.session);
    const route = await detailRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(projectB), runId: String(runB) } },
    );
    expect(res.status).toBe(404);
  });

  it('a real run id under the WRONG project fails closed', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectOne = await seedProject(A);
    const projectTwo = await seedProject(A);
    const flowTwo = await seedFlow(projectTwo, A);
    const runTwo = await seedRun(flowTwo, projectTwo, A);

    // Same tenant owns both, but the run does not belong to projectOne.
    const route = await detailRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(projectOne), runId: String(runTwo) } },
    );
    expect(res.status).toBe(404);
  });
});
