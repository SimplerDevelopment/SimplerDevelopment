/**
 * Portal A/B results — GET /api/portal/experiments/[id]/results
 *
 * Seeds a clean, deterministic dataset and verifies the results endpoint
 * returns the expected per-variant counts, conversion rates, lift, and
 * z-test p-value.
 *
 * Setup:
 *   500 visitors per arm (1000 total assignments — matches the prompt spec).
 *   - every visitor fires a 'view' event (so views = 500 per arm)
 *   - variant 'a' has 25 goal hits  → 5% conversion
 *   - variant 'b' has 50 goal hits  → 10% conversion
 *
 *   ⇒ lift (b vs a) ≈ 100%, z ≈ 3.00, one-tailed p ≈ 0.00135
 *
 * NOTE: the route counts views from `ab_events` rows where `kind='view'`,
 *       NOT from `ab_assignments`, so we seed view events directly.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../../helpers/test-db';

interface VariantStat {
  key: string;
  label: string;
  views: number;
  goals: number;
  conversionRate: number;
}
interface Comparison {
  variantKey: string;
  controlKey: string;
  z: number;
  p: number;
  lift: number;
  significant: boolean;
}

async function seedExperimentForTenant(ctx: TenantCtx, status: string = 'running') {
  const sql = getTestSql();
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const [s] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.client_websites (client_id, name, domain)
    VALUES (${ctx.client.id}, ${`ab-results-${stamp}`}, ${`ab-results-${stamp}.test`})
    RETURNING id
  `;
  const [p] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.posts (
      website_id, title, slug, post_type, content, published
    ) VALUES (
      ${s.id}, 'Results Page', ${`ab-results-${stamp}`}, 'blog',
      ${JSON.stringify({ blocks: [], version: '1.0' })}, true
    ) RETURNING id
  `;
  const [exp] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.ab_experiments (
      post_id, name, status, variant_split, goal_metric, created_by
    ) VALUES (
      ${p.id}, 'Results test', ${status},
      ${JSON.stringify({ a: 50, b: 50 })}::jsonb,
      'page_view', ${ctx.user.id}
    ) RETURNING id
  `;
  await sql`
    INSERT INTO ${sql(TEST_SCHEMA)}.ab_variants (experiment_id, key, label)
    VALUES (${exp.id}, 'a', 'Control'),
           (${exp.id}, 'b', 'Variant B')
  `;
  return { experimentId: exp.id, postId: p.id };
}

/**
 * Bulk-seed the funnel:
 *   - `viewsPerArm` visitors see each variant (one 'view' event each)
 *   - the first `goalsA` of arm A also fire a 'goal'; the first `goalsB` of B
 *
 * Each visitor id is unique across the whole seed, so de-dupe-by-distinct-
 * visitor in the route still counts every event.
 */
async function seedFunnel(experimentId: number, viewsPerArm: number, goalsA: number, goalsB: number) {
  const sql = getTestSql();

  // Build assignment rows + view event rows in chunks. (Bulk-VALUES inserts
  // through postgres.js are fastest as one statement per chunk.)
  const chunkSize = 500;
  const arms: Array<{ key: 'a' | 'b'; views: number; goals: number }> = [
    { key: 'a', views: viewsPerArm, goals: goalsA },
    { key: 'b', views: viewsPerArm, goals: goalsB },
  ];

  for (const arm of arms) {
    const visitorIds: string[] = [];
    for (let i = 0; i < arm.views; i++) {
      // Pad to 16+ chars so the column accepts it (varchar(64)). The visitor
      // regex on the public route doesn't apply here — we're seeding rows
      // directly, not going through the API.
      visitorIds.push(`vis-${arm.key}-${String(i).padStart(8, '0')}-${Date.now() % 100000}`);
    }

    // Assignments — sticky bucket for the visitor.
    for (let off = 0; off < visitorIds.length; off += chunkSize) {
      const slice = visitorIds.slice(off, off + chunkSize);
      const tuples = slice.map(v => `(${experimentId}, '${arm.key}', '${v}')`).join(', ');
      await sql.unsafe(`
        INSERT INTO "${TEST_SCHEMA}".ab_assignments (experiment_id, variant_key, visitor_id)
        VALUES ${tuples}
      `);
    }

    // View events.
    for (let off = 0; off < visitorIds.length; off += chunkSize) {
      const slice = visitorIds.slice(off, off + chunkSize);
      const tuples = slice.map(v => `(${experimentId}, '${arm.key}', '${v}', 'view')`).join(', ');
      await sql.unsafe(`
        INSERT INTO "${TEST_SCHEMA}".ab_events (experiment_id, variant_key, visitor_id, kind)
        VALUES ${tuples}
      `);
    }

    // Goal events — first N visitors in this arm convert.
    const goalSlice = visitorIds.slice(0, arm.goals);
    for (let off = 0; off < goalSlice.length; off += chunkSize) {
      const slice = goalSlice.slice(off, off + chunkSize);
      const tuples = slice.map(v => `(${experimentId}, '${arm.key}', '${v}', 'goal')`).join(', ');
      await sql.unsafe(`
        INSERT INTO "${TEST_SCHEMA}".ab_events (experiment_id, variant_key, visitor_id, kind)
        VALUES ${tuples}
      `);
    }
  }
}

describe('GET /api/portal/experiments/[id]/results @ab @portal', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('ab-results'); });

  it('401 when unauthenticated', async () => {
    const { experimentId } = await seedExperimentForTenant(A);
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/experiments/[id]/results/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(experimentId) } },
    );
    expect(res.status).toBe(401);
  });

  it('returns per-variant counts, conversion rate, lift, and a significant p-value', async () => {
    const { experimentId } = await seedExperimentForTenant(A);
    // 500 + 500 visitors; 25 vs 50 goals → 5% vs 10% conv → lift +100%
    await seedFunnel(experimentId, 500, 25, 50);

    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/experiments/[id]/results/route');
    const res = await callHandler<{
      success: boolean;
      data: {
        experiment: { id: number; status: string };
        stats: VariantStat[];
        comparisons: Comparison[];
      };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(experimentId) } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(res.data?.data.experiment.id).toBe(experimentId);

    const stats = res.data!.data.stats;
    expect(stats.map(s => s.key)).toEqual(['a', 'b']);

    const a = stats.find(s => s.key === 'a')!;
    const b = stats.find(s => s.key === 'b')!;
    expect(a.views).toBe(500);
    expect(b.views).toBe(500);
    expect(a.goals).toBe(25);
    expect(b.goals).toBe(50);
    expect(a.conversionRate).toBeCloseTo(0.05, 6);
    expect(b.conversionRate).toBeCloseTo(0.10, 6);

    const comps = res.data!.data.comparisons;
    expect(comps).toHaveLength(1);
    const bVsA = comps[0];
    expect(bVsA.controlKey).toBe('a');
    expect(bVsA.variantKey).toBe('b');
    expect(bVsA.lift).toBeCloseTo(1.0, 2);          // (10% - 5%) / 5% = 100%
    // With 500-trial arms, z ≈ 3.00 → one-tailed p ≈ 0.00135. Use a slightly
    // generous bound so this isn't brittle against floating-point drift.
    expect(bVsA.p).toBeLessThan(0.005);             // strong signal
    expect(bVsA.significant).toBe(true);
    expect(bVsA.z).toBeGreaterThan(2.5);
  });

  it('returns zeroed stats and a non-significant comparison when no events seeded', async () => {
    const { experimentId } = await seedExperimentForTenant(A);
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/experiments/[id]/results/route');
    const res = await callHandler<{
      success: boolean;
      data: { stats: VariantStat[]; comparisons: Comparison[] };
    }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(experimentId) } },
    );
    expect(res.status).toBe(200);
    for (const s of res.data!.data.stats) {
      expect(s.views).toBe(0);
      expect(s.goals).toBe(0);
      expect(s.conversionRate).toBe(0);
    }
    expect(res.data!.data.comparisons[0].significant).toBe(false);
  });

  it('@tenancy cross-tenant cannot read another client\'s results (404)', async () => {
    const { experimentId } = await seedExperimentForTenant(A);
    const B = await sessionForNewClientUser('ab-results-other');
    mockedAuth.mockResolvedValue(B.session);

    const route = await import('@/app/api/portal/experiments/[id]/results/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'GET',
      { params: { id: String(experimentId) } },
    );
    expect(res.status).toBe(404);
    expect(res.data?.success).toBe(false);
  });
});
