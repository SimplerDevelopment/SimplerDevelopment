/**
 * MCP credentials that span several companies — tenant resolution, real DB.
 *
 * A credential is now tied to the USER and carries an allowlist of portal
 * clients; each tool call names the company it acts on. Everything that can go
 * wrong here is a cross-tenant write, so none of it can be proven against a
 * mocked DB (per tests/CLAUDE.md a mock returns whatever it was told to):
 *
 *  1. an omitted clientId on an ambiguous roster must write NOTHING
 *  2. a named company must be the one written — not the credential's default
 *  3. a company outside the consent allowlist must be refused
 *  4. a company in the allowlist the user no longer belongs to must drop out
 *  5. a viewer must not write a company they can only read
 *  6. a single-company credential must behave exactly as before
 *
 * The `clientId` handling under test is in `lib/mcp/client-scope.ts`; the harness
 * routes through the real `hydrateReachable`, so (4) exercises the genuine
 * allowlist ∩ client_members intersection rather than a hand-built roster.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { twoTenants, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { buildMcpServerForTest, callTool } from '../../../helpers/mcp-harness';

/** Make `user` a member of `client` with the given role. */
async function addMembership(userId: number, clientId: number, role: string): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_members (client_id, user_id, role)
    VALUES (${clientId}, ${userId}, ${role})
    ON CONFLICT (client_id, user_id) DO UPDATE SET role = EXCLUDED.role
  `;
}

async function removeMembership(userId: number, clientId: number): Promise<void> {
  const sql = getTestSql();
  await sql`
    DELETE FROM ${sql(TEST_SCHEMA)}.client_members
    WHERE client_id = ${clientId} AND user_id = ${userId}
  `;
}

/**
 * Wait for the MCP wrapper's fire-and-forget audit writes to land.
 *
 * Every tool call fires `void logAgentAction(...)` (lib/mcp/server.ts) — an INSERT
 * that takes FOR KEY SHARE locks on its client and user parent rows. This file
 * makes many calls, so left in flight those inserts overlap the next test's setup
 * and deadlock it; only the audit side retries on 40P01 (see the comment in
 * lib/audit/agent-action-log.ts), so the victim is whatever this file does next.
 *
 * Polls until the row count stops moving rather than sleeping a fixed interval — a
 * fixed sleep just relocates the flake to whenever the machine is loaded.
 */
async function drainAuditWrites(): Promise<void> {
  const sql = getTestSql();
  let previous = -1;
  for (let attempt = 0; attempt < 40; attempt++) {
    const [row] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM ${sql(TEST_SCHEMA)}.agent_action_log
    `;
    if (row.n === previous) return;
    previous = row.n;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

async function projectsOf(clientId: number): Promise<{ id: number; name: string }[]> {
  const sql = getTestSql();
  return sql<{ id: number; name: string }[]>`
    SELECT id, name FROM ${sql(TEST_SCHEMA)}.projects WHERE client_id = ${clientId} ORDER BY id
  `;
}

describe('MCP credential spanning several companies @mcp @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;

  beforeEach(async () => {
    ({ A, B } = await twoTenants());
    // A's user joins B's company as an owner — the shape this whole feature
    // exists for: one human, two companies, one MCP connection.
    await addMembership(A.user.id, B.client.id, 'owner');
  });

  // Must run before the next test's setup touches client/user rows.
  afterEach(drainAuditWrites);

  it('reports every reachable company through whoami', async () => {
    const server = await buildMcpServerForTest(A, ['*'], [A.client.id, B.client.id]);
    const me = await callTool(server, 'whoami', {});

    expect(me.defaultClientId).toBe(A.client.id);
    expect(me.clients.map((c: { id: number }) => c.id).sort()).toEqual(
      [A.client.id, B.client.id].sort(),
    );
    expect(me.clients.every((c: { role: string }) => c.role === 'owner')).toBe(true);
  });

  it('refuses a write that does not name its company, and writes nothing', async () => {
    const server = await buildMcpServerForTest(A, ['*'], [A.client.id, B.client.id]);

    const result = await callTool(server, 'projects_create', { name: 'Unnamed company project' });

    // The refusal enumerates the roster so the caller can ask the user.
    expect(String(result)).toContain('clientId is required');
    expect(String(result)).toContain(String(B.client.id));
    expect(await projectsOf(A.client.id)).toHaveLength(0);
    expect(await projectsOf(B.client.id)).toHaveLength(0);
  });

  it('writes the named company, not the credential default', async () => {
    // The regression that matters most: A is the default, B is named. 31 tool
    // modules capture the tenant when the registry is built, so a resolution that
    // happened any later would silently land this row on A.
    const server = await buildMcpServerForTest(A, ['*'], [A.client.id, B.client.id], B.client.id);

    const created = await callTool(server, 'projects_create', { name: 'Beta roof campaign', clientId: B.client.id });
    expect(created.id).toBeTruthy();

    expect(await projectsOf(A.client.id)).toHaveLength(0);
    expect((await projectsOf(B.client.id)).map((p) => p.name)).toEqual(['Beta roof campaign']);
  });

  it('reads back only the named company', async () => {
    const asA = await buildMcpServerForTest(A, ['*'], [A.client.id, B.client.id], A.client.id);
    await callTool(asA, 'projects_create', { name: 'Acme project', clientId: A.client.id });

    const asB = await buildMcpServerForTest(A, ['*'], [A.client.id, B.client.id], B.client.id);
    await callTool(asB, 'projects_create', { name: 'Beta project', clientId: B.client.id });

    const listedB = await callTool(asB, 'projects_list', { clientId: B.client.id });
    const names = (Array.isArray(listedB) ? listedB : listedB.projects ?? []).map(
      (p: { name: string }) => p.name,
    );
    expect(names).toContain('Beta project');
    expect(names).not.toContain('Acme project');
  });

  it('refuses a company the consent allowlist never covered', async () => {
    // A's user genuinely belongs to B, but this credential was granted A only.
    const server = await buildMcpServerForTest(A, ['*'], [A.client.id], B.client.id);

    const result = await callTool(server, 'projects_create', { name: 'Not granted', clientId: B.client.id });

    expect(String(result)).toContain('not available to this credential');
    expect(await projectsOf(B.client.id)).toHaveLength(0);
  });

  it('drops a company the user no longer belongs to, even though it is still in the allowlist', async () => {
    // This is the half that a frozen consent snapshot would get wrong: the token
    // is untouched, only the membership row is gone.
    await removeMembership(A.user.id, B.client.id);

    const server = await buildMcpServerForTest(A, ['*'], [A.client.id, B.client.id], B.client.id);
    const result = await callTool(server, 'projects_create', { name: 'Ex-member write', clientId: B.client.id });

    expect(String(result)).toContain('not available to this credential');
    expect(await projectsOf(B.client.id)).toHaveLength(0);

    // …and the roster no longer advertises it.
    const me = await callTool(server, 'whoami', {});
    expect(me.clients.map((c: { id: number }) => c.id)).toEqual([A.client.id]);
  });

  describe('per-company role', () => {
    beforeEach(async () => {
      await addMembership(A.user.id, B.client.id, 'viewer');
    });

    afterEach(() => {
      delete process.env.AUTH_ROLE_ENFORCE;
    });

    it('lets a viewer read the company they can only view', async () => {
      process.env.AUTH_ROLE_ENFORCE = '1';
      const server = await buildMcpServerForTest(A, ['*'], [A.client.id, B.client.id], B.client.id);

      const listed = await callTool(server, 'projects_list', { clientId: B.client.id });
      expect(listed).toBeDefined();
      expect(String(listed)).not.toContain('Permission denied');
    });

    it('stops a viewer writing that company once enforcement is on', async () => {
      process.env.AUTH_ROLE_ENFORCE = '1';
      const server = await buildMcpServerForTest(A, ['*'], [A.client.id, B.client.id], B.client.id);

      const result = await callTool(server, 'projects_create', { name: 'Viewer write', clientId: B.client.id });

      expect(String(result)).toContain('Permission denied');
      expect(String(result)).toContain('viewer');
      expect(await projectsOf(B.client.id)).toHaveLength(0);
    });

    it('still lets the same credential write the company it owns', async () => {
      process.env.AUTH_ROLE_ENFORCE = '1';
      const server = await buildMcpServerForTest(A, ['*'], [A.client.id, B.client.id], A.client.id);

      await callTool(server, 'projects_create', { name: 'Owner write', clientId: A.client.id });
      expect((await projectsOf(A.client.id)).map((p) => p.name)).toEqual(['Owner write']);
    });
  });

  it('leaves a single-company credential exactly as it was', async () => {
    // No allowlist passed → the pre-existing shape: no clientId needed, no
    // clientId param on the schemas, implicit scoping to the one company.
    const server = await buildMcpServerForTest(A);

    const created = await callTool(server, 'projects_create', { name: 'Solo tenant project' });
    expect(created.id).toBeTruthy();
    expect((await projectsOf(A.client.id)).map((p) => p.name)).toEqual(['Solo tenant project']);
  });
});
