/**
 * Brain expertise tags — CRUD + merge round-trip.
 *
 * Contract:
 *   - 401 unauth, 404 cross-tenant
 *   - POST: name required (400 otherwise); auto-slug; collision-disambiguated
 *   - PATCH: name/description; slug stable
 *   - DELETE: 409 when in use, force=true wipes the junctions, 404 missing
 *   - POST /merge: re-attaches junctions, deletes source, audits via tx
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedTag(
  ctx: TenantCtx,
  name: string,
  description?: string,
): Promise<{ id: number; slug: string }> {
  const sql = getTestSql();
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const [row] = await sql<{ id: number; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_expertise_tags (client_id, name, slug, description, source)
    VALUES (${ctx.client.id}, ${name}, ${slug}, ${description ?? null}, 'manual')
    RETURNING id, slug
  `;
  return row;
}

async function seedPerson(ctx: TenantCtx, name = 'Person'): Promise<{ id: number }> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_people (client_id, full_name, status, profile_urls, source)
    VALUES (${ctx.client.id}, ${name}, 'active', '[]'::jsonb, 'manual')
    RETURNING id
  `;
  return row;
}

async function seedJunction(
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

// ─── POST /expertise-tags ────────────────────────────────────────────────────

describe('Brain expertise-tags — POST /expertise-tags @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-tags-create'); });

  it('401 unauth', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/expertise-tags/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'k8s' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when name is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/expertise-tags/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { description: 'no name' } },
    );
    expect(res.status).toBe(400);
  });

  it('creates a tag with auto-slug', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/expertise-tags/route');
    const res = await callHandler<{ data: { id: number; name: string; slug: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'Kubernetes Networking' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.slug).toBe('kubernetes-networking');
  });

  it('disambiguates slug on collision', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/expertise-tags/route');
    const first = await callHandler<{ data: { slug: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'helm' } },
    );
    expect(first.data?.data.slug).toBe('helm');
    const second = await callHandler<{ data: { slug: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { name: 'helm' } },
    );
    expect(second.data?.data.slug).toBe('helm-2');
  });
});

// ─── GET /expertise-tags ─────────────────────────────────────────────────────

describe('Brain expertise-tags — GET /expertise-tags @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-tags-list'); });

  it('returns slim rows with people_count', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const tag = await seedTag(A, 'fundraising');
    const p1 = await seedPerson(A, 'p1');
    const p2 = await seedPerson(A, 'p2');
    await seedJunction(A, p1.id, tag.id);
    await seedJunction(A, p2.id, tag.id, 3);

    const route = await import('@/app/api/portal/brain/expertise-tags/route');
    const res = await callHandler<{ data: { items: { id: number; name: string; peopleCount: number }[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    const row = res.data?.data.items.find((r) => r.name === 'fundraising');
    expect(row?.peopleCount).toBe(2);
  });

  it('isolates by tenant', async () => {
    const B = await sessionForNewClientUser('brain-tags-list-b');
    await seedTag(B, 'tenant-b-only');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/expertise-tags/route');
    const res = await callHandler<{ data: { items: { name: string }[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.items.find((r) => r.name === 'tenant-b-only')).toBeUndefined();
  });
});

// ─── PATCH /expertise-tags/[id] ──────────────────────────────────────────────

describe('Brain expertise-tags — PATCH /expertise-tags/[id] @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-tags-patch'); });

  it('updates name while keeping slug stable', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const tag = await seedTag(A, 'fundraising');
    const route = await import('@/app/api/portal/brain/expertise-tags/[id]/route');
    const res = await callHandler<{ data: { name: string; slug: string } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(tag.id) }, body: { name: 'Capital Raising' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.name).toBe('Capital Raising');
    expect(res.data?.data.slug).toBe(tag.slug); // unchanged
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-tags-patch-b');
    const tagB = await seedTag(B, 'foreign');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/expertise-tags/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(tagB.id) }, body: { name: 'hijack' } },
    );
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /expertise-tags/[id] ─────────────────────────────────────────────

describe('Brain expertise-tags — DELETE /expertise-tags/[id] @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-tags-del'); });

  it('409 when tag is in use and force is not set', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const tag = await seedTag(A, 'in-use');
    const p = await seedPerson(A);
    await seedJunction(A, p.id, tag.id);

    const route = await import('@/app/api/portal/brain/expertise-tags/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(tag.id) } },
    );
    expect(res.status).toBe(409);
  });

  it('force=true deletes even when in use; junctions cascade', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const tag = await seedTag(A, 'force-del');
    const p = await seedPerson(A);
    await seedJunction(A, p.id, tag.id);

    const route = await import('@/app/api/portal/brain/expertise-tags/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(tag.id) }, url: `http://localhost:3000/?force=true` },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const tagRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_expertise_tags WHERE id = ${tag.id}
    `;
    expect(tagRows.length).toBe(0);
    const junctionRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_person_expertise WHERE expertise_tag_id = ${tag.id}
    `;
    expect(junctionRows.length).toBe(0);
  });
});

// ─── POST /expertise-tags/[id]/merge ────────────────────────────────────────

describe('Brain expertise-tags — POST /expertise-tags/[id]/merge @brain @people', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-tags-merge'); });

  it('merges source into target: re-attaches junctions, deletes source', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const source = await seedTag(A, 'k8s');
    const target = await seedTag(A, 'kubernetes');

    const p1 = await seedPerson(A, 'p1');
    const p2 = await seedPerson(A, 'p2');
    const p3 = await seedPerson(A, 'p3');

    // p1 + p2 have source only. p3 has BOTH (target wins on collision).
    await seedJunction(A, p1.id, source.id, 3);
    await seedJunction(A, p2.id, source.id, null);
    await seedJunction(A, p3.id, source.id, 4);
    await seedJunction(A, p3.id, target.id, null);

    const route = await import('@/app/api/portal/brain/expertise-tags/[id]/merge/route');
    const res = await callHandler<{ data: { merged: boolean; reattached: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(source.id) }, body: { targetTagId: target.id } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.merged).toBe(true);
    // p1, p2 re-attached. p3 collision → source's junction dropped, target's preserved.
    expect(res.data?.data.reattached).toBe(2);

    const sql = getTestSql();
    // Source tag must be gone.
    const sourceRows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_expertise_tags WHERE id = ${source.id}
    `;
    expect(sourceRows.length).toBe(0);

    // Each person must end up with exactly one row on the target tag.
    const targetJunctions = await sql<{ person_id: number; level: number | null }[]>`
      SELECT person_id, level FROM ${sql(TEST_SCHEMA)}.brain_person_expertise
      WHERE expertise_tag_id = ${target.id}
      ORDER BY person_id
    `;
    expect(targetJunctions.length).toBe(3);
    // p1: had level 3 on source → kept on target via re-attach.
    const p1Row = targetJunctions.find((r) => r.person_id === p1.id);
    expect(p1Row?.level).toBe(3);
    // p3: target had null level, source had 4 → copied over.
    const p3Row = targetJunctions.find((r) => r.person_id === p3.id);
    expect(p3Row?.level).toBe(4);
  });

  it('400 when source and target are the same', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const tag = await seedTag(A, 'oneandonly');
    const route = await import('@/app/api/portal/brain/expertise-tags/[id]/merge/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(tag.id) }, body: { targetTagId: tag.id } },
    );
    expect(res.status).toBe(400);
  });

  it('404 cross-tenant — never merges into another tenant\'s tag', async () => {
    const B = await sessionForNewClientUser('brain-tags-merge-b');
    const source = await seedTag(A, 'a-tag');
    const targetB = await seedTag(B, 'b-tag');
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/expertise-tags/[id]/merge/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { params: { id: String(source.id) }, body: { targetTagId: targetB.id } },
    );
    expect(res.status).toBe(404);
  });
});
