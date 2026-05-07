// POST  /api/portal/experiments/:id/variants — add a new variant
// PATCH /api/portal/experiments/:id/variants — update an existing variant
//                                               (label or blockTreeOverride)

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { abVariants } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { authorizeExperimentForUser } from '@/lib/ab/access';

const KEY_RE = /^[a-z0-9_-]{1,8}$/;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const experimentId = parseInt(id, 10);
  const access = await authorizeExperimentForUser(parseInt(session.user.id, 10), experimentId);
  if (!access) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  let body: { key?: string; label?: string; blockTreeOverride?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const key = (body.key || '').toLowerCase();
  const label = (body.label || '').trim();
  if (!KEY_RE.test(key)) return NextResponse.json({ success: false, error: 'invalid_key' }, { status: 400 });
  if (!label) return NextResponse.json({ success: false, error: 'label_required' }, { status: 400 });

  const [existing] = await db
    .select({ id: abVariants.id })
    .from(abVariants)
    .where(and(eq(abVariants.experimentId, experimentId), eq(abVariants.key, key)))
    .limit(1);
  if (existing) return NextResponse.json({ success: false, error: 'duplicate_key' }, { status: 409 });

  const [variant] = await db.insert(abVariants).values({
    experimentId,
    key,
    label,
    blockTreeOverride: body.blockTreeOverride ?? null,
  }).returning();

  return NextResponse.json({ success: true, data: variant });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const experimentId = parseInt(id, 10);
  const access = await authorizeExperimentForUser(parseInt(session.user.id, 10), experimentId);
  if (!access) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });

  let body: { key?: string; label?: string; blockTreeOverride?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const key = (body.key || '').toLowerCase();
  if (!KEY_RE.test(key)) return NextResponse.json({ success: false, error: 'invalid_key' }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patch: Record<string, any> = {};
  if (typeof body.label === 'string') {
    const label = body.label.trim();
    if (!label) return NextResponse.json({ success: false, error: 'label_required' }, { status: 400 });
    patch.label = label;
  }
  if ('blockTreeOverride' in body) {
    patch.blockTreeOverride = body.blockTreeOverride ?? null;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ success: false, error: 'nothing_to_update' }, { status: 400 });
  }

  const [updated] = await db
    .update(abVariants)
    .set(patch)
    .where(and(eq(abVariants.experimentId, experimentId), eq(abVariants.key, key)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}
