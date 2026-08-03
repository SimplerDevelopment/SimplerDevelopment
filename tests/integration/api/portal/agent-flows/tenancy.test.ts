/**
 * Cross-tenant isolation for the Workflow Designer's project-scoped agent
 * flow routes (APWD-003, Unit 2):
 *
 *   GET    /api/portal/projects/[id]/flows
 *   POST   /api/portal/projects/[id]/flows
 *   GET    /api/portal/projects/[id]/flows/[flowId]
 *   PUT    /api/portal/projects/[id]/flows/[flowId]
 *   DELETE /api/portal/projects/[id]/flows/[flowId]
 *
 * The table (`agent_flows`, drizzle/9013_agent_flows_manual.sql) is a
 * hand-written manual migration, not a journaled one — but its filename
 * still matches the `\d{4,}_.+\.sql` glob the integration-test template
 * builder replays (tests/helpers/test-db.ts buildTemplateDatabase), so it
 * exists in the per-worker test DB with no extra setup here.
 *
 * Coverage:
 *   - POST stamps clientId from the loaded project row, never the body.
 *   - GET [id]/flows only lists the caller's project's own flows (not a
 *     sibling project's, even within the same tenant).
 *   - Cross-tenant: B reading/updating/deleting A's flow (via A's real
 *     project id) returns 404 — never 403 (no existence leak).
 *   - Foreign flowId: a flowId that is real but belongs to a DIFFERENT
 *     project (same tenant) is rejected 404 by the [id]/flows/[flowId]
 *     route for that project id — proves flowId is never trusted alone.
 *   - A flow can never be moved across projects via PUT (no projectId/
 *     clientId field accepted in the body; the UPDATE itself is re-scoped).
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { twoTenants, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import type { AgentFlowGraph } from '@/lib/agent-flows/types';

interface AgentFlowRow {
  id: number;
  projectId: number;
  clientId: number;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  graph: AgentFlowGraph;
  createdAt: string;
  updatedAt: string;
}

async function seedProject(tenant: TenantCtx, role: 'owner' | 'editor' | 'viewer' = 'editor'): Promise<number> {
  const sql = getTestSql();
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES ('Flow project', ${tenant.client.id}, 'active', ${tenant.user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${proj.id}, ${tenant.user.id}, ${role})
  `;
  return proj.id;
}

async function collectionRoute() {
  return import('@/app/api/portal/projects/[id]/flows/route');
}
async function itemRoute() {
  return import('@/app/api/portal/projects/[id]/flows/[flowId]/route');
}

async function createFlow(projectId: number, body: unknown = { name: 'Onboarding flow' }) {
  const route = await collectionRoute();
  return callHandler<{ success: boolean; data: AgentFlowRow }>(
    route as unknown as Record<string, unknown>, 'POST',
    { params: { id: String(projectId) }, body },
  );
}

const sampleGraph: AgentFlowGraph = {
  nodes: [
    { id: 'n1', position: { x: 0, y: 0 }, data: { kind: 'agent', agentType: 'backend-engineer', label: 'Backend' } },
  ],
  edges: [],
};

describe('POST /api/portal/projects/[id]/flows @agent-flows @create', () => {
  let A: TenantCtx;
  beforeEach(async () => { ({ A } = await twoTenants()); });

  it('stamps clientId from the project, ignoring any clientId in the body', async () => {
    const projectId = await seedProject(A);
    mockedAuth.mockResolvedValue(A.session);

    const res = await createFlow(projectId, { name: 'Spoofed', clientId: 999999 });
    expect(res.status).toBe(201);
    expect(res.data?.data.clientId).toBe(A.client.id);
    expect(res.data?.data.projectId).toBe(projectId);
    expect(res.data?.data.graph).toEqual({ nodes: [], edges: [] });
  });

  it('missing name: 400', async () => {
    const projectId = await seedProject(A);
    mockedAuth.mockResolvedValue(A.session);
    const res = await createFlow(projectId, {});
    expect(res.status).toBe(400);
  });

  it('non-string name: 400 (not a 500)', async () => {
    const projectId = await seedProject(A);
    mockedAuth.mockResolvedValue(A.session);
    const res = await createFlow(projectId, { name: 123 });
    expect(res.status).toBe(400);
  });

  it('viewer role cannot create a flow: 403', async () => {
    const projectId = await seedProject(A, 'viewer');
    mockedAuth.mockResolvedValue(A.session);
    const res = await createFlow(projectId, { name: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/portal/projects/[id]/flows @agent-flows @list @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('lists only this project\'s flows, not a sibling project\'s (same tenant)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectOne = await seedProject(A);
    const projectTwo = await seedProject(A);
    await createFlow(projectOne, { name: 'One-only' });
    await createFlow(projectTwo, { name: 'Two-only' });

    const route = await collectionRoute();
    const res = await callHandler<{ data: Array<{ name: string; nodeCount: number; edgeCount: number }> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(projectOne) } },
    );
    expect(res.status).toBe(200);
    const names = res.data?.data.map(f => f.name) ?? [];
    expect(names).toContain('One-only');
    expect(names).not.toContain('Two-only');
  });

  it('derives nodeCount/edgeCount from the graph and does not return the full graph', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId, { name: 'Counted' });
    const flowId = created.data!.data.id;

    const itemR = await itemRoute();
    await callHandler(itemR as unknown as Record<string, unknown>, 'PUT', {
      params: { id: String(projectId), flowId: String(flowId) },
      body: { graph: sampleGraph },
    });

    const route = await collectionRoute();
    const res = await callHandler<{ data: Array<Record<string, unknown>> }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(projectId) } },
    );
    const row = res.data?.data.find(f => f.id === flowId);
    expect(row).toBeTruthy();
    expect(row!.nodeCount).toBe(1);
    expect(row!.edgeCount).toBe(0);
    expect(row!.graph).toBeUndefined();
  });

  it('cross-tenant: B given A\'s real project id gets 404, not A\'s flows', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    await createFlow(projectId, { name: 'A-secret' });

    mockedAuth.mockResolvedValue(B.session);
    const route = await collectionRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(projectId) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('GET/PUT/DELETE /api/portal/projects/[id]/flows/[flowId] @agent-flows @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('owner can read their own flow', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    const route = await itemRoute();
    const res = await callHandler<{ data: AgentFlowRow }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(projectId), flowId: String(flowId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.id).toBe(flowId);
  });

  it('cross-tenant GET: B reading A\'s flow via A\'s project id returns 404', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    mockedAuth.mockResolvedValue(B.session);
    const route = await itemRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(projectId), flowId: String(flowId) } },
    );
    expect(res.status).toBe(404);
  });

  it('cross-tenant PUT: B saving A\'s flow returns 404 and the row is unchanged', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    mockedAuth.mockResolvedValue(B.session);
    const route = await itemRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(projectId), flowId: String(flowId) }, body: { graph: sampleGraph, name: 'Hijacked' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ name: string; client_id: number }[]>`
      SELECT name, client_id FROM ${sql(TEST_SCHEMA)}.agent_flows WHERE id = ${flowId}
    `;
    expect(row.name).not.toBe('Hijacked');
    expect(row.client_id).toBe(A.client.id);
  });

  it('cross-tenant DELETE: B deleting A\'s flow returns 404 and the row survives', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    mockedAuth.mockResolvedValue(B.session);
    const route = await itemRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(projectId), flowId: String(flowId) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.agent_flows WHERE id = ${flowId}
    `;
    expect(rows).toHaveLength(1);
  });

  it('foreign flowId: a real flow from a DIFFERENT project (same tenant) is rejected on PUT (404)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectOne = await seedProject(A);
    const projectTwo = await seedProject(A);
    const flowInProjectTwo = await createFlow(projectTwo);
    const flowId = flowInProjectTwo.data!.data.id;

    // Attempt to PUT that flow through project ONE's URL — flowId is real,
    // but agentFlows.projectId !== projectOne, so the joined lookup must
    // fail closed.
    const route = await itemRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(projectOne), flowId: String(flowId) }, body: { graph: sampleGraph, name: 'Moved' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ name: string; project_id: number }[]>`
      SELECT name, project_id FROM ${sql(TEST_SCHEMA)}.agent_flows WHERE id = ${flowId}
    `;
    expect(row.project_id).toBe(projectTwo);
    expect(row.name).not.toBe('Moved');
  });

  it('foreign flowId: rejected the same way on GET and DELETE', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectOne = await seedProject(A);
    const projectTwo = await seedProject(A);
    const flowInProjectTwo = await createFlow(projectTwo);
    const flowId = flowInProjectTwo.data!.data.id;

    const route = await itemRoute();
    const getRes = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(projectOne), flowId: String(flowId) } },
    );
    expect(getRes.status).toBe(404);

    const delRes = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(projectOne), flowId: String(flowId) } },
    );
    expect(delRes.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.agent_flows WHERE id = ${flowId}
    `;
    expect(rows).toHaveLength(1);
  });

  it('PUT saves the whole graph + name/description/status', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    const route = await itemRoute();
    const res = await callHandler<{ data: AgentFlowRow }>(
      route as unknown as Record<string, unknown>, 'PUT',
      {
        params: { id: String(projectId), flowId: String(flowId) },
        body: { name: 'Renamed', description: 'longer copy', status: 'active', graph: sampleGraph },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('Renamed');
    expect(res.data?.data.description).toBe('longer copy');
    expect(res.data?.data.status).toBe('active');
    expect(res.data?.data.graph).toEqual(sampleGraph);
    expect(res.data?.data.projectId).toBe(projectId);
    expect(res.data?.data.clientId).toBe(A.client.id);
  });

  it('PUT missing graph: 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    const route = await itemRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(projectId), flowId: String(flowId) }, body: { name: 'No graph' } },
    );
    expect(res.status).toBe(400);
  });

  it('PUT with an oversized graph (>500 nodes): 413', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    const oversizedGraph: AgentFlowGraph = {
      nodes: Array.from({ length: 501 }, (_, i) => ({
        id: `n${i}`,
        position: { x: 0, y: 0 },
        data: { kind: 'agent', agentType: 'backend-engineer', label: `Node ${i}` },
      })),
      edges: [],
    };

    const route = await itemRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(projectId), flowId: String(flowId) }, body: { graph: oversizedGraph } },
    );
    expect(res.status).toBe(413);
  });

  it('PUT with an invalid node agentType: 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    const invalidGraph: AgentFlowGraph = {
      nodes: [
        { id: 'n1', position: { x: 0, y: 0 }, data: { kind: 'agent', agentType: 'not-a-real-agent' as never, label: 'Bad' } },
      ],
      edges: [],
    };

    const route = await itemRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(projectId), flowId: String(flowId) }, body: { graph: invalidGraph } },
    );
    expect(res.status).toBe(400);
  });

  it('PUT with an edge referencing a non-existent node: 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    // n1 exists; n-missing does not. The canvas cannot produce this, but the
    // API must not persist a connector to nowhere.
    const danglingGraph: AgentFlowGraph = {
      nodes: [
        { id: 'n1', position: { x: 0, y: 0 }, data: { kind: 'agent', agentType: 'backend-engineer', label: 'Backend' } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n-missing' }],
    };

    const route = await itemRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(projectId), flowId: String(flowId) }, body: { graph: danglingGraph } },
    );
    expect(res.status).toBe(400);
  });

  it('PUT with a valid two-node edge still saves (edge check does not over-reject)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    const connectedGraph: AgentFlowGraph = {
      nodes: [
        { id: 'n1', position: { x: 0, y: 0 }, data: { kind: 'agent', agentType: 'backend-engineer', label: 'Backend' } },
        { id: 'n2', position: { x: 0, y: 100 }, data: { kind: 'step', agentType: null, label: 'Run the gates' } },
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2', label: 'done', kind: 'handoff' }],
    };

    const route = await itemRoute();
    const res = await callHandler<{ data: AgentFlowRow }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(projectId), flowId: String(flowId) }, body: { graph: connectedGraph } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.graph).toEqual(connectedGraph);
  });

  it('PUT accepts a human node assigned to a real project member', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    // A is a member of this project by construction (seedProject adds them).
    const humanGraph: AgentFlowGraph = {
      nodes: [
        {
          id: 'h1',
          position: { x: 0, y: 0 },
          data: { kind: 'human', agentType: null, label: 'Sign-off', assigneeIds: [A.user.id] },
        },
      ],
      edges: [],
    };

    const route = await itemRoute();
    const res = await callHandler<{ data: AgentFlowRow }>(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(projectId), flowId: String(flowId) }, body: { graph: humanGraph } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.graph).toEqual(humanGraph);
  });

  it('PUT rejects a human node assigned to a user who is not a member of this project: 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    // B belongs to a different tenant entirely and is not a member here.
    const foreignGraph: AgentFlowGraph = {
      nodes: [
        {
          id: 'h1',
          position: { x: 0, y: 0 },
          data: { kind: 'human', agentType: null, label: 'Sign-off', assigneeIds: [B.user.id] },
        },
      ],
      edges: [],
    };

    const route = await itemRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(projectId), flowId: String(flowId) }, body: { graph: foreignGraph } },
    );
    expect(res.status).toBe(400);

    // And nothing was written.
    const sql = getTestSql();
    const rows = await sql<{ graph: AgentFlowGraph }[]>`
      SELECT graph FROM ${sql(TEST_SCHEMA)}.agent_flows WHERE id = ${flowId}
    `;
    expect(rows[0].graph.nodes).toHaveLength(0);
  });

  it('viewer role cannot PUT or DELETE: 403', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A, 'owner');
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    // Downgrade A to viewer on this project.
    const sql = getTestSql();
    await sql`
      UPDATE ${sql(TEST_SCHEMA)}.project_members
      SET role = 'viewer'
      WHERE project_id = ${projectId} AND user_id = ${A.user.id}
    `;

    const route = await itemRoute();
    const putRes = await callHandler(
      route as unknown as Record<string, unknown>, 'PUT',
      { params: { id: String(projectId), flowId: String(flowId) }, body: { graph: sampleGraph } },
    );
    expect(putRes.status).toBe(403);

    const delRes = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(projectId), flowId: String(flowId) } },
    );
    expect(delRes.status).toBe(403);
  });

  it('DELETE cascades cleanly (no orphan row after delete)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const projectId = await seedProject(A);
    const created = await createFlow(projectId);
    const flowId = created.data!.data.id;

    const route = await itemRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(projectId), flowId: String(flowId) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.agent_flows WHERE id = ${flowId}
    `;
    expect(rows).toHaveLength(0);
  });
});
