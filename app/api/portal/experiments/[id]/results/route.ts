// GET /api/portal/experiments/:id/results
//
// Aggregates view + goal counts per variant and computes a one-tailed
// two-proportion z-test for every challenger vs the 'a' control.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abExperiments, abVariants, abEvents } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { authorizeExperimentForUser } from '@/lib/ab/access';
import { twoProportionZTest } from '@/lib/ab/stats';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const experimentId = parseInt(id, 10);
  const access = await authorizeExperimentForUser(parseInt(session.user.id, 10), experimentId);
  if (!access) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  const [experiment] = await db
    .select()
    .from(abExperiments)
    .where(eq(abExperiments.id, experimentId))
    .limit(1);
  if (!experiment) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  const variants = await db
    .select()
    .from(abVariants)
    .where(eq(abVariants.experimentId, experimentId));

  // Per-variant view + goal counts. We use COUNT(DISTINCT visitorId) so
  // refreshes don't multiply the funnel.
  const aggregates = await db
    .select({
      variantKey: abEvents.variantKey,
      kind: abEvents.kind,
      visitors: sql<number>`COUNT(DISTINCT ${abEvents.visitorId})`,
      total: sql<number>`COUNT(*)`,
    })
    .from(abEvents)
    .where(eq(abEvents.experimentId, experimentId))
    .groupBy(abEvents.variantKey, abEvents.kind);

  const viewByVariant = new Map<string, number>();
  const goalByVariant = new Map<string, number>();
  for (const row of aggregates) {
    if (row.kind === 'view') viewByVariant.set(row.variantKey, Number(row.visitors));
    else if (row.kind === 'goal') goalByVariant.set(row.variantKey, Number(row.visitors));
  }

  const stats = variants.map(v => {
    const views = viewByVariant.get(v.key) ?? 0;
    const goals = goalByVariant.get(v.key) ?? 0;
    return {
      key: v.key,
      label: v.label,
      views,
      goals,
      conversionRate: views > 0 ? goals / views : 0,
    };
  }).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const control = stats.find(s => s.key === 'a') ?? stats[0];
  const comparisons = control
    ? stats.filter(s => s.key !== control.key).map(s => {
        const result = twoProportionZTest(
          { n: control.views, x: control.goals },
          { n: s.views, x: s.goals },
        );
        return {
          variantKey: s.key,
          controlKey: control.key,
          z: result.z,
          p: result.p,
          lift: result.lift,
          significant: result.p < 0.05,
        };
      })
    : [];

  return NextResponse.json({
    success: true,
    data: {
      experiment,
      stats,
      comparisons,
    },
  });
}
