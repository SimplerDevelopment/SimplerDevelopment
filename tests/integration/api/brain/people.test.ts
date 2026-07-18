/**
 * Brain people — REST round-trip + tenancy isolation + expertise attach/detach
 * + who-knows happy path.
 *
 * Contract:
 *   - 401 unauth, 404 cross-tenant
 *   - POST /people: fullName required (400 otherwise)
 *   - PATCH /people/[id]: returns updated row; 404 when missing; 400 on cycle
 *   - DELETE /people/[id]: 404 on missing, cross-tenant safe
 *   - POST /people/[id]/expertise: attach (idempotent, level upsert)
 *   - DELETE /people/[id]/expertise: detach
 *   - GET /people/[id]/org-units: returns org-unit memberships
 *   - GET /who-knows: tag-resolution + ranked people
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedPerson(
  ctx: TenantCtx,
  overrides: { fullName?: string; managerId?: number | null; title?: string } = {},
): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_people
      (client_id, full_name, manager_id, title, status, profile_urls, source)
    VALUES (
      ${ctx.client.id},
      ${overrides.fullName ?? `person-${Date.now()}-${Math.floor(Math.random() * 9999)}`},
      ${overrides.managerId ?? null},
      ${overrides.title ?? null},
      'active',
      '[]'::jsonb,
      'manual'
    )
    RETURNING id
  `;
  return row;
}

async function seedExpertiseTag(
  ctx: TenantCtx,
  name: string,
  description?: string,
): Promise<{ id: number; name: string; slug: string }> {
  const sql = getTestSql();
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const [row] = await sql<{ id: number; name: string; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_expertise_tags (client_id, name, slug, description, source)
    VALUES (${ctx.client.id}, ${name}, ${slug}, ${description ?? null}, 'manual')
    RETURNING id, name, slug
  `;
  return row;
}

async function seedOrgUnit(ctx: TenantCtx, name: string, slug?: string): Promise<{ id: number }> {
  const sql = getTestSql();
  const finalSlug = slug ?? name.toLowerCase().replace(/\s+/g, '-');
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_org_units (client_id, name, slug, path, sort_order)
    VALUES (${ctx.client.id}, ${name}, ${finalSlug}, ${finalSlug}, 0)
    RETURNING id
  `;
  return row;
}

async function attachPrimaryUnit(
  ctx: TenantCtx,
  personId: number,
  orgUnitId: number,
): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_person_org_units
      (client_id, person_id, org_unit_id, "primary", role_in_unit)
    VALUES (${ctx.client.id}, ${personId}, ${orgUnitId}, true, null)
  `;
}

async function attachExpertiseRow(
  ctx: TenantCtx,
  personId: number,
  tagId: number,
  level: number | null = null,
): Promise<void> {
  const sql = getTestSql();
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_person_expertise
      (client_id, person_id, expertise_tag_id, level)
    VALUES (${ctx.client.id}, ${personId}, ${tagId}, ${level})
  `;
}

// ─── POST /people ────────────────────────────────────────────────────────────

describe('Brain people — POST /people @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-people-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/people/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { fullName: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when fullName is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/people/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'No name' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/fullName/i);
  });

  it('creates a person scoped to the tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/people/route');
    const res = await callHandler<{ success: boolean; data: { id: number; fullName: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { fullName: 'Ada Lovelace', title: 'Founder' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.fullName).toBe('Ada Lovelace');

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number }[]>`
      SELECT client_id FROM ${sql(TEST_SCHEMA)}.brain_people WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
  });
});

// ─── GET / PATCH / DELETE /people/[id] ───────────────────────────────────────

describe('Brain people — GET /people/[id] @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-people-read'); });

  it('returns person with relations', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const p = await seedPerson(A, { fullName: 'Linus' });
    const route = await import('@/app/api/portal/brain/people/[id]/route');
    const res = await callHandler<{
      success: boolean;
      data: { person: { id: number; fullName: string }; directReports: unknown[]; orgUnits: unknown[]; expertise: unknown[] };
    }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(p.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.person.fullName).toBe('Linus');
    expect(Array.isArray(res.data?.data.directReports)).toBe(true);
    expect(Array.isArray(res.data?.data.orgUnits)).toBe(true);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-people-read-b');
    const pB = await seedPerson(B, { fullName: 'Forbidden' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/people/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(pB.id) } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain people — PATCH /people/[id] @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-people-patch'); });

  it('updates own person', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const p = await seedPerson(A, { fullName: 'Before' });
    const route = await import('@/app/api/portal/brain/people/[id]/route');
    const res = await callHandler<{ data: { fullName: string; title: string | null } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(p.id) }, body: { fullName: 'After', title: 'CTO' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.fullName).toBe('After');
    expect(res.data?.data.title).toBe('CTO');
  });

  it('400 when managerId change would create a cycle (direct report becomes manager)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const boss = await seedPerson(A, { fullName: 'Boss' });
    const report = await seedPerson(A, { fullName: 'Report', managerId: boss.id });

    const route = await import('@/app/api/portal/brain/people/[id]/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(boss.id) }, body: { managerId: report.id } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/cycle/i);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-people-patch-b');
    const pB = await seedPerson(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/people/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(pB.id) }, body: { fullName: 'hijack' } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain people — DELETE /people/[id] @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-people-del'); });

  it('hard-deletes (CASCADE drops junction rows)', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const p = await seedPerson(A);
    const tag = await seedExpertiseTag(A, 'kubernetes');
    await attachExpertiseRow(A, p.id, tag.id, 3);

    const route = await import('@/app/api/portal/brain/people/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(p.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const personRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_people WHERE id = ${p.id}
    `;
    expect(personRows.length).toBe(0);

    const junctionRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_person_expertise WHERE person_id = ${p.id}
    `;
    expect(junctionRows.length).toBe(0);
  });

  it('404 on missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/people/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('404 cross-tenant — DB untouched', async () => {
    const B = await sessionForNewClientUser('brain-people-del-b');
    const pB = await seedPerson(B);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/people/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(pB.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_people WHERE id = ${pB.id}
    `;
    expect(rows.length).toBe(1);
  });
});

// ─── /people/[id]/expertise ──────────────────────────────────────────────────

describe('Brain people — POST /people/[id]/expertise @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-people-exp'); });

  it('attaches a tag and is idempotent on second call', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const p = await seedPerson(A);
    const tag = await seedExpertiseTag(A, 'k8s');
    const route = await import('@/app/api/portal/brain/people/[id]/expertise/route');

    const first = await callHandler<{ data: { id: number; alreadyAttached: boolean } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(p.id) }, body: { expertiseTagId: tag.id, level: 3 } },
    );
    expect(first.status).toBe(200);
    expect(first.data?.data.alreadyAttached).toBe(false);

    // Second attach with a new level — alreadyAttached=true; level updated.
    const second = await callHandler<{ data: { id: number; alreadyAttached: boolean } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(p.id) }, body: { expertiseTagId: tag.id, level: 4 } },
    );
    expect(second.status).toBe(200);
    expect(second.data?.data.alreadyAttached).toBe(true);

    const sql = getTestSql();
    const [row] = await sql<{ level: number }[]>`
      SELECT level FROM ${sql(TEST_SCHEMA)}.brain_person_expertise
      WHERE person_id = ${p.id} AND expertise_tag_id = ${tag.id}
    `;
    expect(row.level).toBe(4);
  });

  it('404 when expertise tag belongs to another tenant', async () => {
    const B = await sessionForNewClientUser('brain-people-exp-b');
    const tagB = await seedExpertiseTag(B, 'foreign-tag');
    const p = await seedPerson(A);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/people/[id]/expertise/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(p.id) }, body: { expertiseTagId: tagB.id } },
    );
    expect(res.status).toBe(404);
  });
});

describe('Brain people — DELETE /people/[id]/expertise @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-people-exp-del'); });

  it('detaches an expertise tag', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const p = await seedPerson(A);
    const tag = await seedExpertiseTag(A, 'fundraising');
    await attachExpertiseRow(A, p.id, tag.id, 2);

    const route = await import('@/app/api/portal/brain/people/[id]/expertise/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      {
        params: { id: String(p.id) },
        url: `http://localhost:3000/?expertiseTagId=${tag.id}`,
      },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_person_expertise
      WHERE person_id = ${p.id} AND expertise_tag_id = ${tag.id}
    `;
    expect(rows.length).toBe(0);
  });
});

// ─── GET /people/[id]/org-units ─────────────────────────────────────────────

describe('Brain people — GET /people/[id]/org-units @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-people-ou'); });

  it('returns the person org-unit memberships', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const p = await seedPerson(A);
    const ou = await seedOrgUnit(A, 'Engineering');
    await attachPrimaryUnit(A, p.id, ou.id);

    const route = await import('@/app/api/portal/brain/people/[id]/org-units/route');
    const res = await callHandler<{ data: { items: { id: number; name: string; primary: boolean }[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(p.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.items).toHaveLength(1);
    expect(res.data?.data.items[0].name).toBe('Engineering');
    expect(res.data?.data.items[0].primary).toBe(true);
  });
});

// ─── GET /who-knows ──────────────────────────────────────────────────────────

describe('Brain who-knows — GET /who-knows @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-who-knows'); });

  it('400 when query is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/who-knows/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { url: 'http://localhost:3000/' },
    );
    expect(res.status).toBe(400);
  });

  it('ranks people: level + primary-unit bonus', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const kube = await seedExpertiseTag(A, 'kubernetes');
    const ou = await seedOrgUnit(A, 'Platform');

    const alice = await seedPerson(A, { fullName: 'Alice' });
    const bob = await seedPerson(A, { fullName: 'Bob' });
    const carol = await seedPerson(A, { fullName: 'Carol' });

    // Alice: tag with level + primary unit = 1 + 0.5 + 0.2 = 1.7
    await attachExpertiseRow(A, alice.id, kube.id, 3);
    await attachPrimaryUnit(A, alice.id, ou.id);
    // Bob: tag, no level, no primary = 1.0
    await attachExpertiseRow(A, bob.id, kube.id, null);
    // Carol: tag with level, no primary = 1.5
    await attachExpertiseRow(A, carol.id, kube.id, 4);

    const route = await import('@/app/api/portal/brain/who-knows/route');
    const res = await callHandler<{
      data: {
        tagMatches: { id: number; name: string }[];
        people: { personId: number; fullName: string; score: number }[];
      };
    }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { url: 'http://localhost:3000/?query=kuber' },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.tagMatches.map((t) => t.name)).toContain('kubernetes');
    const names = res.data?.data.people.map((p) => p.fullName);
    expect(names?.[0]).toBe('Alice');   // 1.7
    expect(names?.[1]).toBe('Carol');   // 1.5
    expect(names?.[2]).toBe('Bob');     // 1.0
  });

  it('does NOT return people from other tenants', async () => {
    const B = await sessionForNewClientUser('brain-who-knows-b');
    const tagB = await seedExpertiseTag(B, 'kubernetes');
    const ev = await seedPerson(B, { fullName: 'Eve' });
    await attachExpertiseRow(B, ev.id, tagB.id, 4);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/who-knows/route');
    const res = await callHandler<{
      data: { tagMatches: unknown[]; people: { fullName: string }[] };
    }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { url: 'http://localhost:3000/?query=kuber' },
    );
    expect(res.status).toBe(200);
    // Tenant A doesn't even own the tag, so tagMatches must be empty.
    expect(res.data?.data.tagMatches).toEqual([]);
    expect(res.data?.data.people).toEqual([]);
  });
});
