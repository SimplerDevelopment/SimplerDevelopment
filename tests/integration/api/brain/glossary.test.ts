/**
 * Brain glossary — full REST round-trip + tenancy + lookup + bulk-import +
 * delete cascade prune.
 *
 * Routes:
 *   GET  /api/portal/brain/glossary             list (filters)
 *   POST /api/portal/brain/glossary             create
 *   GET  /api/portal/brain/glossary/[id]        get with relatedTerms
 *   PATCH/api/portal/brain/glossary/[id]        update (no slug)
 *   DELETE /api/portal/brain/glossary/[id]      hard delete + prune
 *   POST /api/portal/brain/glossary/lookup      scored substring/alias match
 *   POST /api/portal/brain/glossary/bulk-import upsert
 *
 * Tenancy isolation: every endpoint exercises a cross-tenant assertion.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

interface SeedTermOpts {
  term?: string;
  slug?: string;
  definition?: string;
  shortDefinition?: string | null;
  aliases?: string[];
  status?: 'active' | 'deprecated';
  category?: string | null;
  ownerId?: number | null;
  relatedTermIds?: number[];
}

async function seedTerm(ctx: TenantCtx, overrides: SeedTermOpts = {}): Promise<{ id: number; slug: string }> {
  const sql = getTestSql();
  const slug = overrides.slug ?? `t-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const aliases = JSON.stringify(overrides.aliases ?? []);
  const related = JSON.stringify(overrides.relatedTermIds ?? []);
  const [row] = await sql<{ id: number; slug: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_glossary_terms (
      client_id, term, slug, definition, short_definition, aliases, status, category, owner_id, related_term_ids, source
    ) VALUES (
      ${ctx.client.id},
      ${overrides.term ?? `Term ${slug}`},
      ${slug},
      ${overrides.definition ?? 'A definition.'},
      ${overrides.shortDefinition ?? null},
      ${aliases}::json,
      ${overrides.status ?? 'active'},
      ${overrides.category ?? null},
      ${overrides.ownerId ?? null},
      ${related}::json,
      'manual'
    )
    RETURNING id, slug
  `;
  return row;
}

async function readRow(id: number): Promise<{ id: number; client_id: number; term: string; slug: string; status: string; related_term_ids: number[] } | undefined> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number; client_id: number; term: string; slug: string; status: string; related_term_ids: unknown }[]>`
    SELECT id, client_id, term, slug, status, related_term_ids
    FROM ${sql(TEST_SCHEMA)}.brain_glossary_terms WHERE id = ${id}
  `;
  if (!row) return undefined;
  // postgres-js may return `json` columns as a raw JSON string; normalize to
  // a JS array so .toEqual([…]) assertions work regardless.
  let related: number[] = [];
  const raw = row.related_term_ids;
  if (Array.isArray(raw)) {
    related = raw.filter((n): n is number => typeof n === 'number');
  } else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) related = parsed.filter((n) => typeof n === 'number');
    } catch { /* leave empty */ }
  }
  return { ...row, related_term_ids: related };
}

// ─── POST /glossary ─────────────────────────────────────────────────────────

describe('POST /api/portal/brain/glossary @brain @glossary', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('glossary-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/glossary/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { term: 'X', definition: 'y' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when term is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { definition: 'y' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/term/i);
  });

  it('400 when definition is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { term: 'X' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/definition/i);
  });

  it('200 creates term, slug auto-derived, scoped to caller tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/route');
    const res = await callHandler<{ data: { id: number; slug: string; term: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { term: 'Hello World!', definition: 'A greeting.' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.slug).toBe('hello-world');
    const row = await readRow(res.data!.data.id);
    expect(row?.client_id).toBe(A.client.id);
    expect(row?.status).toBe('active');
  });

  it('200 collision suffixes -2 on per-tenant slug clash', async () => {
    await seedTerm(A, { term: 'Collide', slug: 'collide' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/route');
    const res = await callHandler<{ data: { slug: string } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { term: 'Collide', definition: 'second definition' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.slug).toBe('collide-2');
  });
});

// ─── GET /glossary (list) ───────────────────────────────────────────────────

describe('GET /api/portal/brain/glossary @brain @glossary', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('glossary-list'); });

  it('returns slim rows with aliasCount', async () => {
    await seedTerm(A, { term: 'API', slug: 'api', aliases: ['app prog interface', 'application api'] });
    await seedTerm(A, { term: 'CRM', slug: 'crm' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/route');
    const res = await callHandler<{ data: { items: Array<{ term: string; aliasCount: number; slug: string }>; total: number } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.total).toBe(2);
    const apiRow = res.data?.data.items.find((r) => r.slug === 'api');
    expect(apiRow?.aliasCount).toBe(2);
  });

  it('filters by status', async () => {
    await seedTerm(A, { slug: 'a', status: 'active' });
    await seedTerm(A, { slug: 'd', status: 'deprecated' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/route');
    const res = await callHandler<{ data: { items: Array<{ slug: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { query: { status: 'deprecated' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.items.map((r) => r.slug)).toEqual(['d']);
  });

  it('cross-tenant: tenant A never sees tenant B rows', async () => {
    const B = await sessionForNewClientUser('glossary-list-b');
    await seedTerm(A, { term: 'A-side', slug: 'a-side' });
    await seedTerm(B, { term: 'B-side', slug: 'b-side' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/route');
    const res = await callHandler<{ data: { items: Array<{ slug: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    const slugs = (res.data?.data.items ?? []).map((r) => r.slug);
    expect(slugs).toContain('a-side');
    expect(slugs).not.toContain('b-side');
  });
});

// ─── GET /glossary/[id] ─────────────────────────────────────────────────────

describe('GET /api/portal/brain/glossary/[id] @brain @glossary', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('glossary-get'); });

  it('200 returns term + relatedTerms', async () => {
    const r1 = await seedTerm(A, { term: 'Sibling', slug: 'sibling' });
    const r2 = await seedTerm(A, { term: 'Main', slug: 'main', relatedTermIds: [r1.id] });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/[id]/route');
    const res = await callHandler<{ data: { term: { id: number; slug: string }; relatedTerms: Array<{ id: number; slug: string }> } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(r2.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.term.slug).toBe('main');
    expect(res.data?.data.relatedTerms.map((r) => r.slug)).toEqual(['sibling']);
  });

  it('cross-tenant id in relatedTermIds is filtered out', async () => {
    const B = await sessionForNewClientUser('glossary-get-b');
    const foreign = await seedTerm(B, { slug: 'foreign' });
    const main = await seedTerm(A, { slug: 'main', relatedTermIds: [foreign.id] });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/[id]/route');
    const res = await callHandler<{ data: { relatedTerms: unknown[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(main.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.relatedTerms).toEqual([]);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('glossary-get-cross');
    const foreign = await seedTerm(B, { slug: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
      { params: { id: String(foreign.id) } },
    );
    expect(res.status).toBe(404);
  });
});

// ─── PATCH /glossary/[id] ────────────────────────────────────────────────────

describe('PATCH /api/portal/brain/glossary/[id] @brain @glossary', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('glossary-patch'); });

  it('200 patches mutable fields', async () => {
    const r = await seedTerm(A, { term: 'Before', slug: 'before' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/[id]/route');
    const res = await callHandler<{ data: { term: string; status: string; slug: string } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(r.id) }, body: { term: 'After', status: 'deprecated' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.term).toBe('After');
    expect(res.data?.data.status).toBe('deprecated');
    // slug stays
    expect(res.data?.data.slug).toBe('before');
  });

  it('404 cross-tenant — no mutation', async () => {
    const B = await sessionForNewClientUser('glossary-patch-b');
    const foreign = await seedTerm(B, { slug: 'foreign', term: 'BForeign' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(foreign.id) }, body: { term: 'Hijacked' } },
    );
    expect(res.status).toBe(404);
    const row = await readRow(foreign.id);
    expect(row?.term).toBe('BForeign');
  });
});

// ─── DELETE /glossary/[id] — cascade prune ──────────────────────────────────

describe('DELETE /api/portal/brain/glossary/[id] @brain @glossary', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('glossary-delete'); });

  it('200 hard-deletes and prunes id from sibling relatedTermIds', async () => {
    const victim = await seedTerm(A, { slug: 'victim', term: 'Victim' });
    const ref1 = await seedTerm(A, { slug: 'ref1', term: 'Ref1', relatedTermIds: [victim.id, 999] });
    const ref2 = await seedTerm(A, { slug: 'ref2', term: 'Ref2', relatedTermIds: [victim.id] });
    const unrelated = await seedTerm(A, { slug: 'unrelated', term: 'Unrelated', relatedTermIds: [9999] });

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/[id]/route');
    const res = await callHandler<{ data: { id: number; deleted: boolean; prunedRelatedTermFromCount: number } }>(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(victim.id) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.deleted).toBe(true);
    expect(res.data?.data.prunedRelatedTermFromCount).toBe(2);

    expect(await readRow(victim.id)).toBeUndefined();
    expect((await readRow(ref1.id))?.related_term_ids).toEqual([999]);
    expect((await readRow(ref2.id))?.related_term_ids).toEqual([]);
    expect((await readRow(unrelated.id))?.related_term_ids).toEqual([9999]);
  });

  it('404 cross-tenant — foreign row untouched', async () => {
    const B = await sessionForNewClientUser('glossary-delete-b');
    const foreign = await seedTerm(B, { slug: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(foreign.id) } },
    );
    expect(res.status).toBe(404);
    expect(await readRow(foreign.id)).toBeDefined();
  });
});

// ─── POST /glossary/lookup ──────────────────────────────────────────────────

describe('POST /api/portal/brain/glossary/lookup @brain @glossary', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('glossary-lookup'); });

  it('400 when query is missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/lookup/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('happy path: exact term match wins over substring', async () => {
    await seedTerm(A, { term: 'API',         slug: 'api',         definition: 'Application Programming Interface' });
    await seedTerm(A, { term: 'API Gateway', slug: 'api-gateway', definition: 'A managed front door for APIs' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/lookup/route');
    const res = await callHandler<{ data: { matches: Array<{ slug: string; matchType: string; score: number }> } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { query: 'API' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.matches[0].slug).toBe('api');
    expect(res.data?.data.matches[0].matchType).toBe('exact_term');
  });

  it('deprecated terms are excluded from lookup', async () => {
    await seedTerm(A, { term: 'OldThing', slug: 'old-thing', status: 'deprecated' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/lookup/route');
    const res = await callHandler<{ data: { matches: unknown[] } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { query: 'OldThing' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.matches).toEqual([]);
  });

  it('cross-tenant isolation', async () => {
    const B = await sessionForNewClientUser('glossary-lookup-b');
    await seedTerm(B, { term: 'SecretTerm', slug: 'secret-term', definition: 'Should not leak' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/lookup/route');
    const res = await callHandler<{ data: { matches: unknown[] } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { query: 'SecretTerm' } },
    );
    expect(res.data?.data.matches).toEqual([]);
  });
});

// ─── POST /glossary/bulk-import ──────────────────────────────────────────────

describe('POST /api/portal/brain/glossary/bulk-import @brain @glossary', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('glossary-bulk'); });

  it('400 when terms missing', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/bulk-import/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: {} },
    );
    expect(res.status).toBe(400);
  });

  it('create-then-update: re-importing same slug updates definition', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/bulk-import/route');

    const first = await callHandler<{ data: { created: number; updated: number; errors: unknown[] } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { terms: [{ term: 'BulkOne', definition: 'first def' }, { term: 'BulkTwo', definition: 'd2' }] } },
    );
    expect(first.status).toBe(200);
    expect(first.data?.data.created).toBe(2);
    expect(first.data?.data.updated).toBe(0);

    const second = await callHandler<{ data: { created: number; updated: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { terms: [{ term: 'BulkOne', definition: 'updated def' }] } },
    );
    expect(second.status).toBe(200);
    expect(second.data?.data.created).toBe(0);
    expect(second.data?.data.updated).toBe(1);

    // Verify the definition was actually updated in the DB
    const sql = getTestSql();
    const [row] = await sql<{ definition: string }[]>`
      SELECT definition FROM ${sql(TEST_SCHEMA)}.brain_glossary_terms
      WHERE client_id = ${A.client.id} AND slug = 'bulkone'
    `;
    expect(row.definition).toBe('updated def');
  });

  it('rejects > 200 terms with 400', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/bulk-import/route');
    const terms = Array.from({ length: 201 }, (_, i) => ({ term: `Term${i}`, definition: 'd' }));
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { terms } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/200/);
  });

  it('cross-tenant: bulk import only affects caller tenant', async () => {
    const B = await sessionForNewClientUser('glossary-bulk-b');
    await seedTerm(B, { term: 'Shared', slug: 'shared', definition: 'B-side definition' });
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/glossary/bulk-import/route');
    await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { terms: [{ term: 'Shared', definition: 'A-side definition' }] } },
    );
    // B's row must still have its original definition.
    const sql = getTestSql();
    const [bRow] = await sql<{ definition: string }[]>`
      SELECT definition FROM ${sql(TEST_SCHEMA)}.brain_glossary_terms
      WHERE client_id = ${B.client.id} AND slug = 'shared'
    `;
    expect(bRow.definition).toBe('B-side definition');
  });
});
