/**
 * Brain Goals REST — collection endpoint.
 *
 *   GET    /api/portal/brain/goals?initiativeId=&status=&ownerId=&limit=&offset=
 *   POST   /api/portal/brain/goals     body: CreateGoalInput
 *
 * Auth: requireBrainEntitlement on every method. Tenancy is enforced inside
 * the lib by every query carrying clientId.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { createGoal, listGoals } from '@/lib/brain/goals';
import type { BrainGoalStatus } from '@/lib/db/schema';

const ALLOWED_STATUSES: BrainGoalStatus[] = [
  'open',
  'on_track',
  'at_risk',
  'off_track',
  'achieved',
  'missed',
];

function parseIntOrUndefined(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const initiativeId = parseIntOrUndefined(url.searchParams.get('initiativeId'));
  const ownerId = parseIntOrUndefined(url.searchParams.get('ownerId'));
  const statusRaw = url.searchParams.get('status');
  let status: BrainGoalStatus | undefined;
  if (statusRaw !== null) {
    if (!ALLOWED_STATUSES.includes(statusRaw as BrainGoalStatus)) {
      return NextResponse.json(
        { success: false, message: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    status = statusRaw as BrainGoalStatus;
  }

  // Cap limit at 100 per PLAN — anything bigger means the caller should page.
  const limitRaw = parseIntOrUndefined(url.searchParams.get('limit'));
  const offsetRaw = parseIntOrUndefined(url.searchParams.get('offset'));
  const limit = Math.min(Math.max(limitRaw ?? 50, 1), 100);
  const offset = Math.max(offsetRaw ?? 0, 0);

  const items = await listGoals(result.client.id, {
    initiativeId,
    status,
    ownerId,
    limit,
    offset,
  });

  return NextResponse.json({ success: true, data: { items, limit, offset } });
}

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }
  if (typeof body.initiativeId !== 'number' || !Number.isFinite(body.initiativeId)) {
    return NextResponse.json({ success: false, message: 'initiativeId is required' }, { status: 400 });
  }
  if (typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ success: false, message: 'title is required' }, { status: 400 });
  }
  if (body.status !== undefined && !ALLOWED_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { success: false, message: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const goal = await createGoal(result.client.id, result.userId, {
      initiativeId: body.initiativeId,
      title: body.title,
      description: typeof body.description === 'string' ? body.description : null,
      ownerId: typeof body.ownerId === 'number' ? body.ownerId : null,
      unit: typeof body.unit === 'string' ? body.unit : null,
      targetMetric: typeof body.targetMetric === 'number' ? body.targetMetric : null,
      currentMetric: typeof body.currentMetric === 'number' ? body.currentMetric : null,
      targetDate: typeof body.targetDate === 'string' && body.targetDate ? new Date(body.targetDate) : null,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
      status: body.status as BrainGoalStatus | undefined,
    });
    return NextResponse.json({ success: true, data: goal });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create failed';
    // `initiative not found in tenant` is a client-shaped error — surface as 400.
    if (message.includes('initiative not found in tenant')) {
      return NextResponse.json({ success: false, message }, { status: 400 });
    }
    console.error('[brain.goals] create failed', { clientId: result.client.id, err });
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
