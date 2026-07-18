/**
 * Authorisation matrix — locks in the role-based permission contract.
 *
 * The canonical portal gate is:
 *   - Staff (users.role in 'admin' | 'employee')  → can edit anything
 *   - Client user, projects.clientId matches      → canEdit only if project.isPrivate
 *   - Client user, projects.clientId mismatch     → 404 (never reveals existence)
 *   - Unauthenticated                             → 401
 *
 * This spec parameterises the expected status across 5 roles × 3 representative
 * endpoints so any drift from the above contract fails loudly.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import {
  sessionForNewClientUser,
  sessionForStaff,
  sessionFor,
  type TenantCtx,
} from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import type { ProjectRole } from '@/lib/portal/project-permissions';

type Role = 'staff' | 'owner-private' | 'owner-agency' | 'foreign-client' | 'unauth';

interface Fixture {
  projectId: number;
  columnId: number;
  cardId: number;
  labelId: number;
  owner: TenantCtx;
  foreign: TenantCtx;
  staff: TenantCtx;
}

async function seedProject(opts: { label: string; clientRole?: ProjectRole }): Promise<Fixture> {
  const owner = await sessionForNewClientUser(`owner-${opts.label}`);
  const foreign = await sessionForNewClientUser(`foreign-${opts.label}`);
  const staff = await sessionForStaff(`staff-${opts.label}`);
  const clientRole: ProjectRole = opts.clientRole ?? 'owner';

  const sql = getTestSql();
  const [proj] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
    VALUES (${`${opts.label} project`}, ${owner.client.id}, 'active', ${owner.user.id})
    RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
    VALUES (${proj.id}, ${owner.user.id}, ${clientRole})
  `;
  const [col] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
    VALUES (${proj.id}, 'Todo', 0) RETURNING id
  `;
  const [card] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
    VALUES (${col.id}, ${proj.id}, 'Card', 0) RETURNING id
  `;
  const [label] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.kanban_labels (project_id, name, color)
    VALUES (${proj.id}, 'Label', '#000') RETURNING id
  `;
  return { projectId: proj.id, columnId: col.id, cardId: card.id, labelId: label.id, owner, foreign, staff };
}

function asRole(role: Role, fx: Fixture) {
  switch (role) {
    case 'staff':          return mockedAuth.mockResolvedValue(fx.staff.session);
    case 'owner-private':
    case 'owner-agency':   return mockedAuth.mockResolvedValue(fx.owner.session);
    case 'foreign-client': return mockedAuth.mockResolvedValue(fx.foreign.session);
    case 'unauth':         return mockedAuth.mockResolvedValue(null);
  }
}

describe('Authz matrix — card GET @authz @security', () => {
  let privFx: Fixture;
  let agencyFx: Fixture;
  beforeEach(async () => {
    privFx = await seedProject({ label: 'get-priv' });
    agencyFx = await seedProject({ label: 'get-agency', clientRole: 'viewer' });
  });

  const cases: { role: Role; priv: number; agency: number }[] = [
    // Staff: 200 everywhere
    { role: 'staff',          priv: 200, agency: 200 },
    // Owner: can read own project (both private and agency)
    { role: 'owner-private',  priv: 200, agency: 200 },
    // Foreign client: 404 everywhere (existence not revealed)
    { role: 'foreign-client', priv: 404, agency: 404 },
    // Unauth: 401
    { role: 'unauth',         priv: 401, agency: 401 },
  ];

  for (const c of cases) {
    it(`${c.role} → GET on private ${c.priv}, agency ${c.agency}`, async () => {
      const route = await import('@/app/api/portal/cards/[id]/route');

      asRole(c.role, privFx);
      const priv = await callHandler(
        route as unknown as Record<string, unknown>, 'GET',
        { params: { id: String(privFx.cardId) } },
      );
      expect(priv.status, `private/${c.role}`).toBe(c.priv);

      asRole(c.role, agencyFx);
      const agency = await callHandler(
        route as unknown as Record<string, unknown>, 'GET',
        { params: { id: String(agencyFx.cardId) } },
      );
      expect(agency.status, `agency/${c.role}`).toBe(c.agency);
    });
  }
});

describe('Authz matrix — card PATCH @authz @security', () => {
  let privFx: Fixture;
  let agencyFx: Fixture;
  beforeEach(async () => {
    privFx = await seedProject({ label: 'patch-priv' });
    agencyFx = await seedProject({ label: 'patch-agency', clientRole: 'viewer' });
  });

  const cases: { role: Role; priv: number; agency: number }[] = [
    { role: 'staff',          priv: 200, agency: 200 },
    // Client can edit own private project but NOT own agency project (read-only)
    { role: 'owner-private',  priv: 200, agency: 403 },
    { role: 'foreign-client', priv: 404, agency: 404 },
    { role: 'unauth',         priv: 401, agency: 401 },
  ];

  for (const c of cases) {
    it(`${c.role} → PATCH on private ${c.priv}, agency ${c.agency}`, async () => {
      const route = await import('@/app/api/portal/cards/[id]/route');

      asRole(c.role, privFx);
      const priv = await callHandler(
        route as unknown as Record<string, unknown>, 'PATCH',
        { params: { id: String(privFx.cardId) }, body: { title: `priv-${c.role}` } },
      );
      expect(priv.status, `private/${c.role}`).toBe(c.priv);

      asRole(c.role, agencyFx);
      const agency = await callHandler(
        route as unknown as Record<string, unknown>, 'PATCH',
        { params: { id: String(agencyFx.cardId) }, body: { title: `agency-${c.role}` } },
      );
      expect(agency.status, `agency/${c.role}`).toBe(c.agency);
    });
  }

  it('staff PATCH actually writes (regression check that 200 means the edit landed)', async () => {
    asRole('staff', privFx);
    const route = await import('@/app/api/portal/cards/[id]/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(privFx.cardId) }, body: { title: 'STAFF-EDITED' } },
    );
    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.kanban_cards WHERE id = ${privFx.cardId}
    `;
    expect(row.title).toBe('STAFF-EDITED');
  });

  it('agency-project client PATCH (403) does NOT mutate the row', async () => {
    asRole('owner-private', agencyFx);
    const route = await import('@/app/api/portal/cards/[id]/route');
    await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(agencyFx.cardId) }, body: { title: 'SHOULD-NOT-STICK' } },
    );
    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.kanban_cards WHERE id = ${agencyFx.cardId}
    `;
    expect(row.title).not.toBe('SHOULD-NOT-STICK');
  });
});

describe('Authz matrix — card DELETE @authz @security', () => {
  let privFx: Fixture;
  let agencyFx: Fixture;
  beforeEach(async () => {
    privFx = await seedProject({ label: 'del-priv' });
    agencyFx = await seedProject({ label: 'del-agency', clientRole: 'viewer' });
  });

  const cases: { role: Role; priv: number; agency: number }[] = [
    { role: 'staff',          priv: 200, agency: 200 },
    { role: 'owner-private',  priv: 200, agency: 403 },
    { role: 'foreign-client', priv: 404, agency: 404 },
    { role: 'unauth',         priv: 401, agency: 401 },
  ];

  for (const c of cases) {
    it(`${c.role} → DELETE on private ${c.priv}, agency ${c.agency}`, async () => {
      const route = await import('@/app/api/portal/cards/[id]/route');

      // Fresh cards per assertion so the outcome is observable for 200s
      const sql = getTestSql();
      const [freshPriv] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
        VALUES (${privFx.columnId}, ${privFx.projectId}, 'fresh', 0) RETURNING id
      `;
      const [freshAgency] = await sql<{ id: number }[]>`
        INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
        VALUES (${agencyFx.columnId}, ${agencyFx.projectId}, 'fresh', 0) RETURNING id
      `;

      asRole(c.role, privFx);
      const priv = await callHandler(
        route as unknown as Record<string, unknown>, 'DELETE',
        { params: { id: String(freshPriv.id) } },
      );
      expect(priv.status, `private/${c.role}`).toBe(c.priv);

      asRole(c.role, agencyFx);
      const agency = await callHandler(
        route as unknown as Record<string, unknown>, 'DELETE',
        { params: { id: String(freshAgency.id) } },
      );
      expect(agency.status, `agency/${c.role}`).toBe(c.agency);
    });
  }
});

describe('Authz matrix — role precedence edge cases @authz @security', () => {
  it('staff with a session that has no clientId membership still bypasses (staff precedence over membership)', async () => {
    const owner = await sessionForNewClientUser('precedence');
    const sql = getTestSql();
    // Real staff user, but deliberately NOT a member of owner's client.
    const [staffU] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.users (name, email, password, role, active)
      VALUES ('Unmembered Staff', ${`unmembered-${Date.now()}@test.local`}, 'x', 'admin', true)
      RETURNING id
    `;
    mockedAuth.mockResolvedValue(sessionFor({ id: staffU.id, role: 'admin' }));

    const [proj] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.projects (name, client_id, status, created_by)
      VALUES ('precedence proj', ${owner.client.id}, 'active', ${owner.user.id}) RETURNING id
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.project_members (project_id, user_id, role)
      VALUES (${proj.id}, ${owner.user.id}, 'owner')
    `;
    const [col] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_columns (project_id, name, "order")
      VALUES (${proj.id}, 'Todo', 0) RETURNING id
    `;
    const [card] = await sql<{ id: number }[]>`
      INSERT INTO ${sql(TEST_SCHEMA)}.kanban_cards (column_id, project_id, title, "order")
      VALUES (${col.id}, ${proj.id}, 'Card', 0) RETURNING id
    `;

    const route = await import('@/app/api/portal/cards/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(card.id) }, body: { title: 'staff-no-membership-edit' } },
    );
    expect(res.status).toBe(200);
  });
});
