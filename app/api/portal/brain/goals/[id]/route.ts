/**
 * Brain Goals REST — single resource.
 *
 *   GET    /api/portal/brain/goals/[id]    returns { goal, initiative } (slim parent ref)
 *   PATCH  /api/portal/brain/goals/[id]    partial update
 *   DELETE /api/portal/brain/goals/[id]    hard delete (leaf row)
 *
 * Cross-tenant goals 404 — the helper queries by (id, clientId) so a foreign
 * goal id reads as "not found".
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { deleteGoal, getGoalById, updateGoal } from '@/lib/brain/goals';
import type { BrainGoalStatus } from '@/lib/db/schema';

const ALLOWED_STATUSES: BrainGoalStatus[] = [
  'open',
  'on_track',
  'at_risk',
  'off_track',
  'achieved',
  'missed',
];

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const goalId = parseInt(id, 10);
  if (Number.isNaN(goalId)) {
    return NextResponse.json({ success: false, message: 'Invalid goal id' }, { status: 400 });
  }
  const row = await getGoalById(result.client.id, goalId);
  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: row });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  const updated = await updateGoal(result.client.id, result.userId, goalId, {
    title: typeof body.title === 'string' ? body.title : undefined,
    description: body.description === null ? null : (typeof body.description === 'string' ? body.description : undefined),
    ownerId: body.ownerId === null ? null : (typeof body.ownerId === 'number' ? body.ownerId : undefined),
    unit: body.unit === null ? null : (typeof body.unit === 'string' ? body.unit : undefined),
    targetMetric: body.targetMetric === null ? null : (typeof body.targetMetric === 'number' ? body.targetMetric : undefined),
    currentMetric: body.currentMetric === null ? null : (typeof body.currentMetric === 'number' ? body.currentMetric : undefined),
    targetDate: body.targetDate === null
      ? null
      : (typeof body.targetDate === 'string' && body.targetDate ? new Date(body.targetDate) : undefined),
    sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
    status: body.status as BrainGoalStatus | undefined,
  });

  if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const goalId = parseInt(id, 10);
  if (Number.isNaN(goalId)) {
    return NextResponse.json({ success: false, message: 'Invalid goal id' }, { status: 400 });
  }

  const ok = await deleteGoal(result.client.id, result.userId, goalId);
  if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: { id: goalId, deleted: true } });
}
