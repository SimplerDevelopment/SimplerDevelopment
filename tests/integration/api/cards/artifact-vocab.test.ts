/**
 * resolveArtifactTitle — the SHARED resolver behind the MCP artifact-link
 * tools (lib/mcp/tools/artifact-vocab.ts).
 *
 * This exists because the REST route at /api/portal/cards/[id]/artifacts
 * carries its OWN copy of this logic. Its sibling test (artifacts.test.ts)
 * therefore proves nothing about this module — the MCP path
 * (kanban_card_artifact_link) goes through here instead, and its only other
 * coverage is a unit test that mocks the database, which by construction
 * cannot catch a missing tenant filter. tests/CLAUDE.md records that lesson.
 *
 * The branch under test is inverted relative to its neighbours: a run owns a
 * `client_id` directly, but its display title lives on the joined
 * `agent_flows` row. Filtering tenancy on the JOINED table rather than the
 * run reads as correct and returns a plausible title — for the wrong tenant.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { twoTenants, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { resolveArtifactTitle, COMMON_ARTIFACT_TABLES } from '@/lib/mcp/tools/artifact-vocab';

async function seedRun(tenant: TenantCtx, flowName: string) {
  const sql = getTestSql();
  const graph = { nodes: [], edges: [] };
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES ('Vocab project', ${tenant.client.id}, 'active', ${tenant.user.id})
    RETURNING id
  `;
  const [flow] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.agent_flows (project_id, client_id, name, status, graph, created_by)
    VALUES (${proj.id}, ${tenant.client.id}, ${flowName}, 'active', ${sql.json(graph as never)}, ${tenant.user.id})
    RETURNING id
  `;
  const [run] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.agent_flow_runs (flow_id, project_id, client_id, status, graph, started_by)
    VALUES (${flow.id}, ${proj.id}, ${tenant.client.id}, 'running', ${sql.json(graph as never)}, ${tenant.user.id})
    RETURNING id
  `;
  return run.id;
}

describe('resolveArtifactTitle — agent_flow_run @artifacts @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('resolves the flow name and run id for the owning tenant', async () => {
    const runId = await seedRun(A, 'Ship checklist');

    const result = await resolveArtifactTitle(
      'agent_flow_run', runId, A.client.id, COMMON_ARTIFACT_TABLES,
    );

    expect(result.found).toBe(true);
    expect(result).toMatchObject({ title: `Ship checklist — run #${runId}` });
  });

  it("does not resolve another tenant's run", async () => {
    const runB = await seedRun(B, "B's confidential flow");

    const result = await resolveArtifactTitle(
      'agent_flow_run', runB, A.client.id, COMMON_ARTIFACT_TABLES,
    );

    // Not-found is the whole contract here: a caller that got `found: true`
    // would write B's flow name onto A's card as a display title.
    expect(result.found).toBe(false);
  });

  it('does not resolve a run id that does not exist', async () => {
    const result = await resolveArtifactTitle(
      'agent_flow_run', 999999, A.client.id, COMMON_ARTIFACT_TABLES,
    );
    expect(result.found).toBe(false);
  });
});
