/**
 * project_custom_fields_* / kanban_card_custom_fields_* — MCP registrar.
 *
 * Real DB, not mocks. Two of these cannot be caught any other way:
 *
 *  1. **Cross-project poisoning.** `card_custom_field_values` has no project
 *     column — only (cardId, fieldId). Both are caller-supplied, and a client
 *     legitimately owns many projects, so a caller with a real card in project
 *     A can name a fieldId from project B and, without the ownership check,
 *     write onto B's field definition through a card they do own. Tenancy
 *     scoping alone does NOT stop this: same client, both sides.
 *
 *  2. **Key de-duplication.** The key is derived from the display name and must
 *     stay unique per project — it is the stable API handle. The uniqueness is
 *     enforced by a DB index, so a mocked DB proves nothing about it.
 */
import { describe, it, expect, beforeEach } from 'vitest';

import { twoTenants, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';
import { buildMcpServerForTest, callTool } from '../../../../helpers/mcp-harness';

async function seedProject(tenant: TenantCtx, name = 'CF project'): Promise<number> {
  const sql = getTestSql();
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES (${name}, ${tenant.client.id}, 'active', ${tenant.user.id})
    RETURNING id`;
  return proj.id;
}

async function seedCard(projectId: number): Promise<number> {
  const sql = getTestSql();
  const [col] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
    VALUES (${projectId}, 'Todo', 0) RETURNING id`;
  const [card] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
    VALUES (${col.id}, ${projectId}, 'Card', 0) RETURNING id`;
  return card.id;
}

describe('project custom fields over MCP @projects @tenancy', () => {
  let A: TenantCtx;
  let B: TenantCtx;
  beforeEach(async () => { ({ A, B } = await twoTenants()); });

  it('creates a field, derives its key, and lists it back', async () => {
    const server = await buildMcpServerForTest(A);
    const projectId = await seedProject(A);

    const created = await callTool(server, 'project_custom_fields_create', {
      projectId, name: 'Autonomy Tier', kind: 'select',
      options: ['Advisory', 'Drafting', 'Pull-request'],
    });
    expect(created.key).toBe('autonomy_tier');

    const listed = await callTool(server, 'project_custom_fields_list', { projectId });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ key: 'autonomy_tier', kind: 'select' });
    expect(listed[0].options).toEqual(['Advisory', 'Drafting', 'Pull-request']);
  });

  it('de-duplicates the derived key when two fields share a display name', async () => {
    const server = await buildMcpServerForTest(A);
    const projectId = await seedProject(A);

    const first = await callTool(server, 'project_custom_fields_create', { projectId, name: 'Risk', kind: 'number' });
    const second = await callTool(server, 'project_custom_fields_create', { projectId, name: 'Risk', kind: 'text' });

    // A unique index backs this; a collision would throw rather than suffix.
    expect(first.key).toBe('risk');
    expect(second.key).toBe('risk_2');
  });

  it('drops options for kinds that cannot use them', async () => {
    const server = await buildMcpServerForTest(A);
    const projectId = await seedProject(A);
    await callTool(server, 'project_custom_fields_create', {
      projectId, name: 'Notes', kind: 'text', options: ['ghost'],
    });
    const listed = await callTool(server, 'project_custom_fields_list', { projectId });
    // Storing them would let a later kind change resurrect stale choices.
    expect(listed[0].options).toEqual([]);
  });

  it('sets and reads a value on a card', async () => {
    const server = await buildMcpServerForTest(A);
    const projectId = await seedProject(A);
    const cardId = await seedCard(projectId);
    const field = await callTool(server, 'project_custom_fields_create', { projectId, name: 'Risk score', kind: 'number' });

    await callTool(server, 'kanban_card_custom_fields_set', {
      cardId, values: [{ fieldId: field.id, value: 14 }],
    });

    const got = await callTool(server, 'kanban_card_custom_fields_get', { cardId });
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ key: 'risk_score', value: 14 });
  });

  it('upserts rather than duplicating on a second set', async () => {
    const server = await buildMcpServerForTest(A);
    const projectId = await seedProject(A);
    const cardId = await seedCard(projectId);
    const field = await callTool(server, 'project_custom_fields_create', { projectId, name: 'Tier', kind: 'text' });

    await callTool(server, 'kanban_card_custom_fields_set', { cardId, values: [{ fieldId: field.id, value: 'a' }] });
    await callTool(server, 'kanban_card_custom_fields_set', { cardId, values: [{ fieldId: field.id, value: 'b' }] });

    const got = await callTool(server, 'kanban_card_custom_fields_get', { cardId });
    expect(got).toHaveLength(1);
    expect(got[0].value).toBe('b');
  });

  it('REFUSES a fieldId from another project of the SAME client (cross-project poisoning)', async () => {
    const server = await buildMcpServerForTest(A);
    const projectOne = await seedProject(A, 'One');
    const projectTwo = await seedProject(A, 'Two');
    const cardInOne = await seedCard(projectOne);
    const fieldInTwo = await callTool(server, 'project_custom_fields_create', { projectId: projectTwo, name: 'Secret', kind: 'text' });

    // Same tenant owns both, so tenancy scoping alone would let this through.
    const res = await callTool(server, 'kanban_card_custom_fields_set', {
      cardId: cardInOne, values: [{ fieldId: fieldInTwo.id, value: 'poison' }],
    });
    expect(res.error).toMatch(/not on this card's project/);

    const sql = getTestSql();
    const rows = await sql`
      SELECT 1 FROM ${sql(TEST_SCHEMA)}.card_custom_field_values WHERE card_id = ${cardInOne}`;
    expect(rows).toHaveLength(0);
  });

  it("does not list or mutate another tenant's project fields", async () => {
    const projectB = await seedProject(B);
    const serverA = await buildMcpServerForTest(A);

    const listed = await callTool(serverA, 'project_custom_fields_list', { projectId: projectB });
    expect(listed.error).toBeTruthy();

    const created = await callTool(serverA, 'project_custom_fields_create', {
      projectId: projectB, name: 'Injected', kind: 'text',
    });
    expect(created.error).toBeTruthy();

    const sql = getTestSql();
    const rows = await sql`
      SELECT 1 FROM ${sql(TEST_SCHEMA)}.project_custom_fields WHERE project_id = ${projectB}`;
    expect(rows).toHaveLength(0);
  });

  it('delete is scoped by projectId, not just field id', async () => {
    const server = await buildMcpServerForTest(A);
    const projectOne = await seedProject(A, 'One');
    const projectTwo = await seedProject(A, 'Two');
    const fieldInTwo = await callTool(server, 'project_custom_fields_create', { projectId: projectTwo, name: 'Keep me', kind: 'text' });

    // Real id, wrong project — must fail closed even within one tenant.
    const res = await callTool(server, 'project_custom_fields_delete', {
      projectId: projectOne, fieldId: fieldInTwo.id,
    });
    expect(res.error).toMatch(/not found/i);

    const still = await callTool(server, 'project_custom_fields_list', { projectId: projectTwo });
    expect(still).toHaveLength(1);
  });
});
