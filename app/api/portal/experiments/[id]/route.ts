// GET    /api/portal/experiments/:id    — fetch experiment + variants
// PATCH  /api/portal/experiments/:id    — update status / split / goal config
// DELETE /api/portal/experiments/:id    — drop the experiment + variants
//                                          (events + assignments cascade)

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abExperiments, abVariants } from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';
import { authorizeExperimentForUser } from '@/lib/ab/access';
import { normalizeSplit } from '@/lib/ab/assign';

const VALID_STATUS = new Set(['draft', 'running', 'completed', 'archived']);
const VALID_GOAL_METRICS = new Set(['page_view', 'cta_click', 'form_submit']);

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
    .where(eq(abVariants.experimentId, experimentId))
    .orderBy(asc(abVariants.key));

  return NextResponse.json({ success: true, data: { experiment, variants } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const experimentId = parseInt(id, 10);
  const access = await authorizeExperimentForUser(parseInt(session.user.id, 10), experimentId);
  if (!access) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  let body: {
    name?: string;
    hypothesis?: string | null;
    status?: string;
    variantSplit?: Record<string, number>;
    goalMetric?: string;
    goalSelector?: string | null;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = { updatedAt: new Date() };

  if (typeof body.name === 'string') {
    const trimmed = body.name.trim();
    if (!trimmed) return NextResponse.json({ success: false, error: 'name_required' }, { status: 400 });
    if (trimmed.length > 255) return NextResponse.json({ success: false, error: 'name_too_long' }, { status: 400 });
    patch.name = trimmed;
  }
  if ('hypothesis' in body) patch.hypothesis = body.hypothesis ?? null;
  if (typeof body.goalMetric === 'string') {
    if (!VALID_GOAL_METRICS.has(body.goalMetric)) {
      return NextResponse.json({ success: false, error: 'invalid_goal_metric' }, { status: 400 });
    }
    patch.goalMetric = body.goalMetric;
  }
  if ('goalSelector' in body) patch.goalSelector = body.goalSelector ?? null;
  if (body.variantSplit && typeof body.variantSplit === 'object') {
    patch.variantSplit = normalizeSplit(body.variantSplit);
  }

  if (typeof body.status === 'string') {
    if (!VALID_STATUS.has(body.status)) {
      return NextResponse.json({ success: false, error: 'invalid_status' }, { status: 400 });
    }
    patch.status = body.status;
    if (body.status === 'running') patch.startedAt = new Date();
    if (body.status === 'completed' || body.status === 'archived') patch.endedAt = new Date();
  }

  const [updated] = await db
    .update(abExperiments)
    .set(patch)
    .where(eq(abExperiments.id, experimentId))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const experimentId = parseInt(id, 10);
  const access = await authorizeExperimentForUser(parseInt(session.user.id, 10), experimentId);
  if (!access) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  await db.delete(abExperiments).where(eq(abExperiments.id, experimentId));
  return NextResponse.json({ success: true, data: { deleted: true } });
}
