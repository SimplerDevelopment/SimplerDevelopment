/**
 * Portal A/B experiments CRUD —
 *   POST   /api/portal/posts/[id]/experiments     (create + seed a/b variants)
 *   GET    /api/portal/experiments/[id]            (fetch with variants)
 *   PATCH  /api/portal/experiments/[id]            (status / split / goal config)
 *   DELETE /api/portal/experiments/[id]            (cascades variants/events/assignments)
 *   POST   /api/portal/experiments/[id]/variants   (add variant 'c')
 *   PATCH  /api/portal/experiments/[id]/variants   (update blockTreeOverride)
 *
 * Tenancy: a user from tenant B cannot create or mutate experiments on a post
 * that belongs to tenant A.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

async function seedSiteAndPost(ctx: TenantCtx, label = 'ab'): Promise<{ siteId: number; postId: number }> {
  const sql = getTestSql();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`${label}-${stamp}`}, ${`${label}-${stamp}.test`})
    RETURNING id
  `;
  const [p] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.posts (
      website_id, title, slug, post_type, content, published
    ) VALUES (
      ${s.id}, 'AB Page', ${`ab-page-${stamp}`}, 'blog',
      ${JSON.stringify({ blocks: [], version: '1.0' })}, true
    ) RETURNING id
  `;
  return { siteId: s.id, postId: p.id };
}

async function asTenant(ctx: TenantCtx | null) {
  mockedAuth.mockResolvedValue(ctx?.session ?? null);
}

describe('POST /api/portal/posts/[id]/experiments @ab @portal', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('ab-create'); });

  it('401 when unauthenticated', async () => {
    const { postId } = await seedSiteAndPost(A);
    await asTenant(null);
    const route = await import('@/app/api/portal/posts/[id]/experiments/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(postId) }, body: { name: 'X' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 when name is missing', async () => {
    const { postId } = await seedSiteAndPost(A);
    await asTenant(A);
    const route = await import('@/app/api/portal/posts/[id]/experiments/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(postId) }, body: { hypothesis: 'no name' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toBe('name_required');
  });

  it('creates an experiment and seeds a + b variants 50/50', async () => {
    const { postId } = await seedSiteAndPost(A);
    await asTenant(A);
    const route = await import('@/app/api/portal/posts/[id]/experiments/route');
    const res = await callHandler<{ success: boolean; data: { id: number; status: string; variantSplit: Record<string, number> } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(postId) }, body: {
        name: 'Hero CTA Copy',
        hypothesis: 'Action-first wins',
        goalMetric: 'cta_click',
        goalSelector: '.hero-cta',
      } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.status).toBe('draft');
    expect(res.data?.data.variantSplit).toEqual({ a: 50, b: 50 });

    const sql = getTestSql();
    const variants = await sql<{ key: string; label: string; block_tree_override: unknown }[]>`
      SELECT key, label, block_tree_override
      FROM ${sql(TEST_SCHEMA)}.ab_variants
      WHERE experiment_id = ${res.data!.data.id}
      ORDER BY key
    `;
    expect(variants.map(v => v.key)).toEqual(['a', 'b']);
    expect(variants[0].label).toBe('Control');
    expect(variants[1].label).toBe('Variant B');
    expect(variants[0].block_tree_override).toBeNull();
    expect(variants[1].block_tree_override).toBeNull();
  });

  it('rejects an unknown goal metric (400)', async () => {
    const { postId } = await seedSiteAndPost(A);
    await asTenant(A);
    const route = await import('@/app/api/portal/posts/[id]/experiments/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(postId) }, body: { name: 'X', goalMetric: 'mouse_move' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toBe('invalid_goal_metric');
  });

  it('@tenancy cross-tenant cannot create on another client\'s post (404)', async () => {
    const B = await sessionForNewClientUser('ab-create-other');
    const { postId } = await seedSiteAndPost(A); // post belongs to tenant A
    await asTenant(B);                            // act as tenant B

    const route = await import('@/app/api/portal/posts/[id]/experiments/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(postId) }, body: { name: 'Sneaky' } },
    );
    expect(res.status).toBe(404);
    expect(res.data?.success).toBe(false);

    const sql = getTestSql();
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM ${sql(TEST_SCHEMA)}.ab_experiments WHERE post_id = ${postId}
    `;
    expect(count).toBe(0);
  });
});

/* ------------------------------------------------------------------------- */

describe('PATCH /api/portal/experiments/[id] @ab @portal', () => {
  let A: TenantCtx;
  let experimentId: number;
  beforeEach(async () => {
    A = await sessionForNewClientUser('ab-patch');
    const { postId } = await seedSiteAndPost(A);
    await asTenant(A);
    const create = await import('@/app/api/portal/posts/[id]/experiments/route');
    const res = await callHandler<{ data: { id: number } }>(
      create as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(postId) }, body: { name: 'Lifecycle' } },
    );
    experimentId = res.data!.data.id;
  });

  it('moves draft → running, stamps startedAt', async () => {
    const route = await import('@/app/api/portal/experiments/[id]/route');
    const res = await callHandler<{ success: boolean; data: { status: string; startedAt: string | null } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(experimentId) }, body: { status: 'running' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('running');
    expect(res.data?.data.startedAt).not.toBeNull();
  });

  it('moves running → completed, stamps endedAt', async () => {
    const route = await import('@/app/api/portal/experiments/[id]/route');
    await callHandler(route as unknown as Record<string, unknown>, 'PATCH', {
      params: { id: String(experimentId) }, body: { status: 'running' },
    });
    const res = await callHandler<{ success: boolean; data: { status: string; endedAt: string | null } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(experimentId) }, body: { status: 'completed' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.status).toBe('completed');
    expect(res.data?.data.endedAt).not.toBeNull();
  });

  it('rejects an invalid status (400)', async () => {
    const route = await import('@/app/api/portal/experiments/[id]/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(experimentId) }, body: { status: 'paused' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toBe('invalid_status');
  });

  it('updates variantSplit (renormalised) + goalMetric + goalSelector', async () => {
    const route = await import('@/app/api/portal/experiments/[id]/route');
    const res = await callHandler<{ success: boolean; data: { variantSplit: Record<string, number>; goalMetric: string; goalSelector: string | null } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(experimentId) }, body: {
        variantSplit: { a: 1, b: 1, c: 2 },     // 25/25/50 after normalisation
        goalMetric: 'form_submit',
        goalSelector: 'form#contact',
      } },
    );
    expect(res.status).toBe(200);
    // normalizeSplit produces percent integers summing to ~100
    expect(res.data?.data.variantSplit.a).toBe(25);
    expect(res.data?.data.variantSplit.b).toBe(25);
    expect(res.data?.data.variantSplit.c).toBe(50);
    expect(res.data?.data.goalMetric).toBe('form_submit');
    expect(res.data?.data.goalSelector).toBe('form#contact');
  });

  it('rejects an invalid goal metric (400)', async () => {
    const route = await import('@/app/api/portal/experiments/[id]/route');
    const res = await callHandler<{ error?: string }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(experimentId) }, body: { goalMetric: 'eyeballs' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toBe('invalid_goal_metric');
  });
});

/* ------------------------------------------------------------------------- */

describe('Variants — POST + PATCH /api/portal/experiments/[id]/variants @ab @portal', () => {
  let A: TenantCtx;
  let experimentId: number;
  beforeEach(async () => {
    A = await sessionForNewClientUser('ab-variants');
    const { postId } = await seedSiteAndPost(A);
    await asTenant(A);
    const create = await import('@/app/api/portal/posts/[id]/experiments/route');
    const res = await callHandler<{ data: { id: number } }>(
      create as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(postId) }, body: { name: 'Variants' } },
    );
    experimentId = res.data!.data.id;
  });

  it('adds a new variant "c" with a blockTreeOverride', async () => {
    const route = await import('@/app/api/portal/experiments/[id]/variants/route');
    const overrideTree = { blocks: [{ type: 'heading', text: 'Variant C copy' }], version: '1.0' };
    const res = await callHandler<{ success: boolean; data: { key: string; label: string; blockTreeOverride: unknown } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(experimentId) }, body: {
        key: 'c', label: 'Variant C', blockTreeOverride: overrideTree,
      } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.key).toBe('c');
    expect(res.data?.data.label).toBe('Variant C');
    expect(res.data?.data.blockTreeOverride).toEqual(overrideTree);

    const sql = getTestSql();
    const rows = await sql<{ key: string }[]>`
      SELECT key FROM ${sql(TEST_SCHEMA)}.ab_variants
      WHERE experiment_id = ${experimentId}
      ORDER BY key
    `;
    expect(rows.map(r => r.key)).toEqual(['a', 'b', 'c']);
  });

  it('rejects duplicate variant keys (409)', async () => {
    const route = await import('@/app/api/portal/experiments/[id]/variants/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(experimentId) }, body: { key: 'a', label: 'Dup' } },
    );
    expect(res.status).toBe(409);
    expect(res.data?.error).toBe('duplicate_key');
  });

  it('rejects malformed variant key (400)', async () => {
    const route = await import('@/app/api/portal/experiments/[id]/variants/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(experimentId) }, body: { key: 'TOO LONG NAME WITH SPACES', label: 'X' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.error).toBe('invalid_key');
  });

  it('PATCH updates a variant\'s blockTreeOverride', async () => {
    const route = await import('@/app/api/portal/experiments/[id]/variants/route');
    const tree = { blocks: [{ type: 'paragraph', text: 'B copy' }], version: '1.0' };
    const res = await callHandler<{ success: boolean; data: { blockTreeOverride: unknown } }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(experimentId) }, body: { key: 'b', blockTreeOverride: tree } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.blockTreeOverride).toEqual(tree);
  });

  it('PATCH 404 for an unknown variant key', async () => {
    const route = await import('@/app/api/portal/experiments/[id]/variants/route');
    const res = await callHandler<{ success: boolean; error?: string }>(
      route as unknown as Record<string, unknown>, 'PATCH',
      { params: { id: String(experimentId) }, body: { key: 'z', label: 'Nope' } },
    );
    expect(res.status).toBe(404);
    expect(res.data?.error).toBe('not_found');
  });
});

/* ------------------------------------------------------------------------- */

describe('DELETE /api/portal/experiments/[id] @ab @portal', () => {
  let A: TenantCtx;
  let experimentId: number;

  beforeEach(async () => {
    A = await sessionForNewClientUser('ab-delete');
    const { postId } = await seedSiteAndPost(A);
    await asTenant(A);
    const create = await import('@/app/api/portal/posts/[id]/experiments/route');
    const res = await callHandler<{ data: { id: number } }>(
      create as unknown as Record<string, unknown>, 'POST',
      { params: { id: String(postId) }, body: { name: 'To delete' } },
    );
    experimentId = res.data!.data.id;
  });

  it('cascades variants + events + assignments on delete', async () => {
    const sql = getTestSql();
    // Seed an event + assignment so we can prove cascade runs
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.ab_events (experiment_id, variant_key, visitor_id, kind)
      VALUES (${experimentId}, 'a', 'visitor-cascade-1', 'view'),
             (${experimentId}, 'b', 'visitor-cascade-2', 'goal')
    `;
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.ab_assignments (experiment_id, variant_key, visitor_id)
      VALUES (${experimentId}, 'a', 'visitor-cascade-1'),
             (${experimentId}, 'b', 'visitor-cascade-2')
    `;

    const route = await import('@/app/api/portal/experiments/[id]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(experimentId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const [{ count: expCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM ${sql(TEST_SCHEMA)}.ab_experiments WHERE id = ${experimentId}
    `;
    const [{ count: varCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM ${sql(TEST_SCHEMA)}.ab_variants WHERE experiment_id = ${experimentId}
    `;
    const [{ count: evtCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM ${sql(TEST_SCHEMA)}.ab_events WHERE experiment_id = ${experimentId}
    `;
    const [{ count: assignCount }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM ${sql(TEST_SCHEMA)}.ab_assignments WHERE experiment_id = ${experimentId}
    `;
    expect(expCount).toBe(0);
    expect(varCount).toBe(0);
    expect(evtCount).toBe(0);
    expect(assignCount).toBe(0);
  });

  it('@tenancy DELETE on another tenant\'s experiment returns 404 and leaves the row in place', async () => {
    const B = await sessionForNewClientUser('ab-delete-other');
    await asTenant(B);

    const route = await import('@/app/api/portal/experiments/[id]/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'DELETE',
      { params: { id: String(experimentId) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM ${sql(TEST_SCHEMA)}.ab_experiments WHERE id = ${experimentId}
    `;
    expect(count).toBe(1);
  });
});
