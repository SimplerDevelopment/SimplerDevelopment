// GET   /api/portal/posts/:id/experiments — list experiments on a post
// POST  /api/portal/posts/:id/experiments — create a draft experiment
//                                            (auto-seeds 50/50 a+b variants)

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abExperiments, abVariants } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { authorizePostForUser } from '@/lib/ab/access';
import { normalizeSplit } from '@/lib/ab/assign';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const postId = parseInt(id, 10);
  const access = await authorizePostForUser(parseInt(session.user.id, 10), postId);
  if (!access) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  const experiments = await db
    .select()
    .from(abExperiments)
    .where(and(eq(abExperiments.targetType, 'post'), eq(abExperiments.targetId, postId)))
    .orderBy(desc(abExperiments.createdAt));

  return NextResponse.json({ success: true, data: experiments });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const postId = parseInt(id, 10);
  const userId = parseInt(session.user.id, 10);
  const access = await authorizePostForUser(userId, postId);
  if (!access) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  let body: {
    name?: string;
    hypothesis?: string;
    goalMetric?: string;
    goalSelector?: string | null;
    variantSplit?: Record<string, number>;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const name = (body.name || '').trim();
  if (!name) return NextResponse.json({ success: false, error: 'name_required' }, { status: 400 });

  const goalMetric = body.goalMetric || 'page_view';
  if (!['page_view', 'cta_click', 'form_submit'].includes(goalMetric)) {
    return NextResponse.json({ success: false, error: 'invalid_goal_metric' }, { status: 400 });
  }

  // Default to a 50/50 split between two variants ("a" = control, "b" = challenger).
  const split = body.variantSplit && Object.keys(body.variantSplit).length > 0
    ? normalizeSplit(body.variantSplit)
    : { a: 50, b: 50 };

  const [experiment] = await db.insert(abExperiments).values({
    targetType: 'post',
    targetId: postId,
    postId,
    name,
    hypothesis: body.hypothesis || null,
    status: 'draft',
    variantSplit: split,
    goalMetric,
    goalSelector: body.goalSelector || null,
    createdBy: userId,
  }).returning();

  // Seed variants for any keys in the split that don't already exist. Block-
  // tree overrides start null — control = live post content; the challenger
  // is filled in by the variant editor.
  const variantInserts = Object.keys(split).map((key, i) => ({
    experimentId: experiment.id,
    key,
    label: key === 'a' ? 'Control' : `Variant ${key.toUpperCase()}`,
    blockTreeOverride: null,
    // i is just for sort stability; not stored.
    _i: i,
  }));
  if (variantInserts.length > 0) {
    await db.insert(abVariants).values(variantInserts.map(({ _i, ...v }) => v));
  }

  return NextResponse.json({ success: true, data: experiment });
}
