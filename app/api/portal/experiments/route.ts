// GET   /api/portal/experiments — list every experiment the user can see
//                                  (across all target types) for their client.
// POST  /api/portal/experiments — create a draft experiment against any
//                                  supported target. Body:
//   { targetType: 'post' | 'deck', targetId: number, name: string,
//     hypothesis?: string, goalMetric?: string, goalSelector?: string,
//     variantSplit?: { a: number; b: number; ... } }
//
// Surveys + emails are accepted as targetType values once their renderers
// land; until then, `authorizeTargetForUser` rejects them.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abExperiments, abVariants, posts, clientWebsites, pitchDecks } from '@/lib/db/schema';
import type { AbTargetType } from '@/lib/db/schema';
import { AB_TARGET_TYPES } from '@/lib/db/schema';
import { authorizeTargetForUser } from '@/lib/ab/access';
import { normalizeSplit } from '@/lib/ab/assign';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

// GET /api/portal/experiments — list all experiments accessible to the caller's client.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, error: 'client_not_found' }, { status: 404 });

  // abExperiments has no clientId column, so scope by the experiment's TARGET
  // ownership — exactly the model lib/ab/access.ts uses: a post target resolves
  // to its site's clientId, a deck target carries clientId directly. Filtering by
  // createdBy (the previous behavior) both hid teammates' experiments AND leaked
  // an agency user's experiments across every client they belong to. Scoping by
  // the ACTIVE client's owned targets fixes both.
  // (tenant-leak: experiment-list-user-scoped-not-client-scoped)
  const postExperiments = await db
    .select({ exp: abExperiments })
    .from(abExperiments)
    .innerJoin(posts, eq(posts.id, abExperiments.targetId))
    .innerJoin(clientWebsites, eq(clientWebsites.id, posts.websiteId))
    .where(and(eq(abExperiments.targetType, 'post'), eq(clientWebsites.clientId, client.id)));

  const deckExperiments = await db
    .select({ exp: abExperiments })
    .from(abExperiments)
    .innerJoin(pitchDecks, eq(pitchDecks.id, abExperiments.targetId))
    .where(and(eq(abExperiments.targetType, 'deck'), eq(pitchDecks.clientId, client.id)));

  const rows = [...postExperiments, ...deckExperiments]
    .map(r => r.exp)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  const userId = parseInt(session.user.id, 10);

  let body: {
    targetType?: unknown;
    targetId?: unknown;
    name?: unknown;
    hypothesis?: unknown;
    goalMetric?: unknown;
    goalSelector?: unknown;
    variantSplit?: unknown;
  } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const targetType = typeof body.targetType === 'string' ? body.targetType as AbTargetType : 'post';
  if (!AB_TARGET_TYPES.includes(targetType)) {
    return NextResponse.json({ success: false, error: 'invalid_target_type' }, { status: 400 });
  }

  const targetId = typeof body.targetId === 'number' ? body.targetId : Number(body.targetId);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return NextResponse.json({ success: false, error: 'invalid_target_id' }, { status: 400 });
  }

  const access = await authorizeTargetForUser(userId, targetType, targetId);
  if (!access) {
    return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ success: false, error: 'name_required' }, { status: 400 });

  const goalMetric = typeof body.goalMetric === 'string' ? body.goalMetric : 'page_view';
  if (!['page_view', 'cta_click', 'form_submit'].includes(goalMetric)) {
    return NextResponse.json({ success: false, error: 'invalid_goal_metric' }, { status: 400 });
  }

  const rawSplit = body.variantSplit && typeof body.variantSplit === 'object'
    ? body.variantSplit as Record<string, number>
    : null;
  const split = rawSplit && Object.keys(rawSplit).length > 0
    ? normalizeSplit(rawSplit)
    : { a: 50, b: 50 };

  const hypothesis = typeof body.hypothesis === 'string' ? body.hypothesis : null;
  const goalSelector = typeof body.goalSelector === 'string' ? body.goalSelector : null;

  const [experiment] = await db.insert(abExperiments).values({
    targetType,
    targetId,
    // Mirror to legacy column for the post case so older readers keep working.
    postId: targetType === 'post' ? targetId : null,
    name,
    hypothesis,
    status: 'draft',
    variantSplit: split,
    goalMetric,
    goalSelector,
    createdBy: userId,
  }).returning();

  const variantInserts = Object.keys(split).map(key => ({
    experimentId: experiment.id,
    key,
    label: key === 'a' ? 'Control' : `Variant ${key.toUpperCase()}`,
    blockTreeOverride: null,
  }));
  if (variantInserts.length > 0) {
    await db.insert(abVariants).values(variantInserts);
  }

  return NextResponse.json({ success: true, data: experiment });
}
