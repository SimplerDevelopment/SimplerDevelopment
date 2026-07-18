/**
 * Brain Goals REST — checkin endpoint.
 *
 *   POST /api/portal/brain/goals/[id]/checkin
 *     body: { currentMetric?: number; note?: string | null; status?: BrainGoalStatus }
 *
 * Per PLAN.md: checkin updates `lastCheckedInAt` (always) plus any provided
 * fields, and auto-classifies status when `currentMetric` is given but `status`
 * is not. NO audit log row is written — too chatty; lastCheckedInAt is the
 * breadcrumb.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { checkinGoal } from '@/lib/brain/goals';
import type { BrainGoalStatus } from '@/lib/db/schema';

const ALLOWED_STATUSES: BrainGoalStatus[] = [
  'open',
  'on_track',
  'at_risk',
  'off_track',
  'achieved',
  'missed',
];

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const goalId = parseInt(id, 10);
  if (Number.isNaN(goalId)) {
    return NextResponse.json({ success: false, message: 'Invalid goal id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }
  if (body.status !== undefined && !ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { success: false, message: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  const updated = await checkinGoal(result.client.id, result.userId, goalId, {
    currentMetric: typeof body.currentMetric === 'number' ? body.currentMetric : undefined,
    note: body.note === null ? null : (typeof body.note === 'string' ? body.note : undefined),
    status: body.status as BrainGoalStatus | undefined,
  });

  if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}
