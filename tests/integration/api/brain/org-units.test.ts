/**
 * Brain org-units — round-trip: create / tree / move / merge / members / delete.
 *
 * Contract checks:
 *   - 401 unauthenticated
 *   - tenant isolation on all routes (cross-tenant id → 404)
 *   - tree response shape (children, memberCount)
 *   - member add/remove flow including ON CONFLICT upsert + primary flip
 *   - delete refuses with members unless ?force=true
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedPerson(ctx: TenantCtx, fullName = `person-${Date.now()}`): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_people (client_id, full_name)
    VALUES (${ctx.client.id}, ${fullName})
    RETURNING id
  `;
  return row;
}

async function createUnit(
  ctx: TenantCtx,
  body: { name: string; parentId?: number | null; leadPersonId?: number | null },
): Promise<{ id: number; name: string; slug: string; path: string; parentId: number | null }> {
  const route = await import('@/app/api/portal/brain/org-units/route');
  const res = await callHandler<{ success: boolean; data: { id: number; name: string; slug: string; path: string; parentId: number | null } }>(
    route as unknown as Record<string, unknown>,
    'POST',
    { body },
  );
  expect(res.status).toBe(200);
  expect(res.data?.success).toBe(true);
  return res.data!.data;
}

describe('Brain org-units — POST /org-units @brain @org-units', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-org-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/org-units/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: { name: 'Eng' } });
    expect(res.status).toBe(401);
  });

  it('400 when name is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/org-units/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'POST', { body: {} });
    expect(res.status).toBe(400);
  });

  it('creates a root unit with auto-slug + path', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const u = await createUnit(A, { name: 'Engineering' });
    expect(u.slug).toBe('engineering');
    expect(u.path).toBe('/engineering');
    expect(u.parentId).toBeNull();
  });

  it('suffixes -2 on slug collision', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await createUnit(A, { name: 'Engineering' });
    const u2 = await createUnit(A, { name: 'Engineering' });
    expect(u2.slug).toBe('engineering-2');
    expect(u2.path).toBe('/engineering-2');
  });

  it('nests path under parent', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const parent = await createUnit(A, { name: 'Engineering' });
    const child = await createUnit(A, { name: 'Platform', parentId: parent.id });
    expect(child.path).toBe('/engineering/platform');
  });

  it('rejects leadPersonId from another tenant', async () => {
    const B = await sessionForNewClientUser('brain-org-create-b');
    const personB = await seedPerson(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/org-units/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Hijack', leadPersonId: personB.id } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/lead person/i);
  });
});

describe('Brain org-units — GET /org-units (tree + flat) @brain @org-units', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-org-list'); });

  it('returns a nested tree with memberCount', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const root = await createUnit(A, { name: 'Engineering' });
    const platform = await createUnit(A, { name: 'Platform', parentId: root.id });
    await createUnit(A, { name: 'Marketing' });

    const person = await seedPerson(A);
    const membersRoute = await import('@/app/api/portal/brain/org-units/[id]/members/route');
    await callHandler(membersRoute as unknown as Record<string, unknown>, 'POST', {
      params: { id: String(platform.id) },
      body: { personId: person.id },
    });

    const route = await import('@/app/api/portal/brain/org-units/route');
    const res = await callHandler<{ success: boolean; data: { tree: Array<{ id: number; name: string; children: Array<{ id: number; memberCount: number }>; memberCount: number }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    const tree = res.data!.data.tree;
    expect(tree.map((n) => n.name).sort()).toEqual(['Engineering', 'Marketing']);
    const engNode = tree.find((n) => n.name === 'Engineering')!;
    expect(engNode.children).toHaveLength(1);
    expect(engNode.children[0].id).toBe(platform.id);
    expect(engNode.children[0].memberCount).toBe(1);
  });

  it('returns a path-ordered flat list when as=flat', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await createUnit(A, { name: 'Eng' });
    await createUnit(A, { name: 'Marketing' });

    const route = await import('@/app/api/portal/brain/org-units/route');
    const res = await callHandler<{ success: boolean; data: { items: Array<{ name: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { url: 'http://localhost:3000/?as=flat' },
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.items.length).toBe(2);
  });

  it('cross-tenant isolation — only own units appear', async () => {
    mockedAuth.mockResolvedValue(A.session);
    await createUnit(A, { name: 'Eng' });
    const B = await sessionForNewClientUser('brain-org-list-b');
    mockedAuth.mockResolvedValue(B.session);
    await createUnit(B, { name: 'BTeam' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/org-units/route');
    const res = await callHandler<{ success: boolean; data: { tree: Array<{ name: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.data!.data.tree.map((n) => n.name)).toEqual(['Eng']);
  });
});

describe('Brain org-units — GET /org-units/[id] @brain @org-units', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-org-get'); });

  it('returns unit + ancestors + members', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const eng = await createUnit(A, { name: 'Eng' });
    const platform = await createUnit(A, { name: 'Platform', parentId: eng.id });
    const runtime = await createUnit(A, { name: 'Runtime', parentId: platform.id });

    const route = await import('@/app/api/portal/brain/org-units/[id]/route');
    const res = await callHandler<{ success: boolean; data: { unit: { name: string }; ancestors: Array<{ id: number; name: string }>; members: unknown[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(runtime.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.unit.name).toBe('Runtime');
    expect(res.data!.data.ancestors.map((a) => a.id)).toEqual([eng.id, platform.id]);
    expect(res.data!.data.members).toEqual([]);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-org-get-b');
    mockedAuth.mockResolvedValue(B.session);
    const bUnit = await createUnit(B, { name: 'BTeam' });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/org-units/[id]/route');
    const res = await callHandler(route as unknown as Record<string, unknown>, 'GET', { params: { id: String(bUnit.id) } });
    expect(res.status).toBe(404);
  });
});

describe('Brain org-units — PATCH /org-units/[id] (slug stable) @brain @org-units', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-org-patch'); });

  it('renaming does NOT change slug or path', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const eng = await createUnit(A, { name: 'Engineering' });
    expect(eng.slug).toBe('engineering');
    expect(eng.path).toBe('/engineering');

    const route = await import('@/app/api/portal/brain/org-units/[id]/route');
    const res = await callHandler<{ success: boolean; data: { name: string; slug: string; path: string } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(eng.id) }, body: { name: 'Platform Engineering' } },
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.name).toBe('Platform Engineering');
    expect(res.data!.data.slug).toBe('engineering');
    expect(res.data!.data.path).toBe('/engineering');
  });
});

describe('Brain org-units — POST /org-units/[id]/move (path sync) @brain @org-units', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-org-move'); });

  it('reparents the unit + rewrites every descendant path', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const eng = await createUnit(A, { name: 'Eng' });
    const platform = await createUnit(A, { name: 'Platform', parentId: eng.id });
    const runtime = await createUnit(A, { name: 'Runtime', parentId: platform.id });
    expect(runtime.path).toBe('/eng/platform/runtime');

    const infra = await createUnit(A, { name: 'Infra' });

    // Move 'Platform' from /eng → /infra. Runtime's path must follow.
    const moveRoute = await import('@/app/api/portal/brain/org-units/[id]/move/route');
    const res = await callHandler<{ success: boolean; data: { path: string } }>(
      moveRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(platform.id) }, body: { newParentId: infra.id } },
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.path).toBe('/infra/platform');

    // Verify Runtime got rewritten.
    const idRoute = await import('@/app/api/portal/brain/org-units/[id]/route');
    const r = await callHandler<{ success: boolean; data: { unit: { path: string } } }>(
      idRoute as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(runtime.id) } },
    );
    expect(r.data!.data.unit.path).toBe('/infra/platform/runtime');
  });

  it('rejects a cycle (moving a unit under its descendant)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const eng = await createUnit(A, { name: 'Eng' });
    const platform = await createUnit(A, { name: 'Platform', parentId: eng.id });

    const moveRoute = await import('@/app/api/portal/brain/org-units/[id]/move/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      moveRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(eng.id) }, body: { newParentId: platform.id } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/itself|descendant/i);
  });

  it('promotes a child to root when newParentId=null', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const eng = await createUnit(A, { name: 'Eng' });
    const platform = await createUnit(A, { name: 'Platform', parentId: eng.id });

    const moveRoute = await import('@/app/api/portal/brain/org-units/[id]/move/route');
    const res = await callHandler<{ success: boolean; data: { parentId: number | null; path: string } }>(
      moveRoute as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(platform.id) }, body: { newParentId: null } },
    );
    expect(res.status).toBe(200);
    expect(res.data!.data.parentId).toBeNull();
    expect(res.data!.data.path).toBe('/platform');
  });
});

describe('Brain org-units — POST /org-units/[id]/merge @brain @org-units', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-org-merge'); });

  it('reattaches members + children, then deletes source', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const source = await createUnit(A, { name: 'OldTeam' });
    const target = await createUnit(A, { name: 'NewTeam' });
    const child = await createUnit(A, { name: 'Squad', parentId: source.id });

    const p1 = await seedPerson(A, 'p-one');
    const p2 = await seedPerson(A, 'p-two');
    const membersRoute = await import('@/app/api/portal/brain/org-units/[id]/members/route');
    await callHandler(membersRoute as unknown as Record<string, unknown>, 'POST', { params: { id: String(source.id) }, body: { personId: p1.id } });
    await callHandler(membersRoute as unknown as Record<string, unknown>, 'POST', { params: { id: String(target.id) }, body: { personId: p2.id } });

    const route = await import('@/app/api/portal/brain/org-units/[id]/merge/route');
    const res = await callHandler<{ success: boolean; data: { name: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(source.id) }, body: { targetOrgUnitId: target.id } },
    );
    expect(res.status).toBe(200);

    // Source row gone.
    const sql = getTestSql();
    const sourceRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_org_units WHERE id = ${source.id}
    `;
    expect(sourceRows.length).toBe(0);

    // Child re-parented under target with updated path.
    const childRows = await sql<{ parent_id: number | null; path: string }[]>`
      SELECT parent_id, path FROM ${sql(TEST_SCHEMA)}.brain_org_units WHERE id = ${child.id}
    `;
    expect(childRows[0].parent_id).toBe(target.id);
    expect(childRows[0].path).toBe(`${target.path}/squad`);

    // Both members now on target.
    const memberRows = await sql<{ person_id: number }[]>`
      SELECT person_id FROM ${sql(TEST_SCHEMA)}.brain_person_org_units
      WHERE org_unit_id = ${target.id} ORDER BY person_id
    `;
    expect(memberRows.map((r) => r.person_id).sort()).toEqual([p1.id, p2.id].sort());
  });
});

describe('Brain org-units — DELETE /org-units/[id] (with/without force) @brain @org-units', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-org-del'); });

  it('refuses to delete a unit with members unless force=true', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const u = await createUnit(A, { name: 'HasMembers' });
    const p = await seedPerson(A);
    const membersRoute = await import('@/app/api/portal/brain/org-units/[id]/members/route');
    await callHandler(membersRoute as unknown as Record<string, unknown>, 'POST', { params: { id: String(u.id) }, body: { personId: p.id } });

    const route = await import('@/app/api/portal/brain/org-units/[id]/route');
    const refused = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(u.id) } },
    );
    expect(refused.status).toBe(409);
    expect(refused.data?.message).toMatch(/force=true/i);

    const forced = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(u.id) }, url: `http://localhost:3000/?force=true` },
    );
    expect(forced.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`SELECT id FROM ${sql(TEST_SCHEMA)}.brain_org_units WHERE id = ${u.id}`;
    expect(rows.length).toBe(0);
  });

  it('deletes a unit with no members + no children directly', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const u = await createUnit(A, { name: 'Empty' });

    const route = await import('@/app/api/portal/brain/org-units/[id]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(u.id) } },
    );
    expect(res.status).toBe(200);
  });
});

describe('Brain org-units — members CRUD @brain @org-units', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-org-members'); });

  it('adds a member; upserts roleInUnit on the same (person,unit)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const u = await createUnit(A, { name: 'Team' });
    const p = await seedPerson(A);

    const route = await import('@/app/api/portal/brain/org-units/[id]/members/route');
    const first = await callHandler<{ success: boolean; data: { roleInUnit: string | null } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(u.id) }, body: { personId: p.id, roleInUnit: 'Lead' } },
    );
    expect(first.status).toBe(200);
    expect(first.data!.data.roleInUnit).toBe('Lead');

    const second = await callHandler<{ success: boolean; data: { roleInUnit: string | null } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(u.id) }, body: { personId: p.id, roleInUnit: 'Architect' } },
    );
    expect(second.status).toBe(200);
    expect(second.data!.data.roleInUnit).toBe('Architect');

    // Junction still has exactly one row.
    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_person_org_units
      WHERE person_id = ${p.id} AND org_unit_id = ${u.id}
    `;
    expect(rows.length).toBe(1);
  });

  it('primary=true on one membership flips primary=false on all others for the person', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const u1 = await createUnit(A, { name: 'TeamOne' });
    const u2 = await createUnit(A, { name: 'TeamTwo' });
    const p = await seedPerson(A);

    const route = await import('@/app/api/portal/brain/org-units/[id]/members/route');
    await callHandler(route as unknown as Record<string, unknown>, 'POST', { params: { id: String(u1.id) }, body: { personId: p.id, primary: true } });
    await callHandler(route as unknown as Record<string, unknown>, 'POST', { params: { id: String(u2.id) }, body: { personId: p.id, primary: true } });

    const sql = getTestSql();
    const rows = await sql<{ org_unit_id: number; primary: boolean }[]>`
      SELECT org_unit_id, "primary" FROM ${sql(TEST_SCHEMA)}.brain_person_org_units
      WHERE person_id = ${p.id} ORDER BY org_unit_id
    `;
    const byUnit = new Map(rows.map((r) => [r.org_unit_id, r.primary]));
    expect(byUnit.get(u1.id)).toBe(false);
    expect(byUnit.get(u2.id)).toBe(true);
  });

  it('DELETE removes the membership', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const u = await createUnit(A, { name: 'Team' });
    const p = await seedPerson(A);
    const route = await import('@/app/api/portal/brain/org-units/[id]/members/route');
    await callHandler(route as unknown as Record<string, unknown>, 'POST', { params: { id: String(u.id) }, body: { personId: p.id } });

    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(u.id) }, body: { personId: p.id } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_person_org_units
      WHERE person_id = ${p.id} AND org_unit_id = ${u.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('cross-tenant person rejected when adding to own unit', async () => {
    const B = await sessionForNewClientUser('brain-org-members-b');
    const personB = await seedPerson(B);

    mockedAuth.mockResolvedValue(A.session);
    const u = await createUnit(A, { name: 'AUnit' });

    const route = await import('@/app/api/portal/brain/org-units/[id]/members/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(u.id) }, body: { personId: personB.id } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/person/i);
  });
});
