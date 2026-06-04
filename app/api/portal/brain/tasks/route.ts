import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listTasks, countTasks, createTask, type BrainTask } from '@/lib/brain/tasks';
import { logAudit } from '@/lib/brain/audit';

const VALID_TASK_STATUSES: BrainTask['status'][] = ['open', 'in_progress', 'blocked', 'done'];

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  // Accept `?status=open` (single) OR `?status=open,in_progress,blocked` (CSV).
  // Single value preserves the historical single-status contract; CSV unlocks
  // the "my open work" board view without two round-trips.
  const statusRaw = url.searchParams.get('status');
  const statusList = statusRaw
    ? statusRaw
        .split(',')
        .map((s) => s.trim())
        .filter((s): s is BrainTask['status'] => VALID_TASK_STATUSES.includes(s as BrainTask['status']))
    : [];
  const status: BrainTask['status'] | BrainTask['status'][] | undefined =
    statusList.length === 0 ? undefined : statusList.length === 1 ? statusList[0] : statusList;

  const ownerId = url.searchParams.get('ownerId');
  const meetingId = url.searchParams.get('meetingId');
  const needsReview = url.searchParams.get('needsReview');

  // Pagination — default 100, max 200. Additive on top of the historical
  // un-paginated `{ success, data: [...] }` shape so legacy consumers that
  // read `json.data` as the array keep working.
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 100;
  const offset = (page - 1) * limit;

  const filters = {
    status,
    ownerId: ownerId ? parseInt(ownerId, 10) : undefined,
    meetingId: meetingId ? parseInt(meetingId, 10) : undefined,
    needsReview: needsReview === 'true' ? true : needsReview === 'false' ? false : undefined,
  };

  const [tasks, total] = await Promise.all([
    listTasks(result.client.id, { ...filters, limit, offset }),
    countTasks(result.client.id, filters),
  ]);
  return NextResponse.json({ success: true, data: tasks, total, page, limit });
}

export async function POST(request: Request) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ success: false, message: 'title is required' }, { status: 400 });
  }

  const task = await createTask({
    clientId: result.client.id,
    title: body.title.trim(),
    description: typeof body.description === 'string' ? body.description : undefined,
    ownerId: typeof body.ownerId === 'number' ? body.ownerId : null,
    priority: ['low', 'medium', 'high', 'urgent'].includes(body.priority) ? body.priority : 'medium',
    dueDate: body.dueDate ? new Date(body.dueDate) : null,
    source: 'manual',
    createdBy: result.userId,
  });

  await logAudit({
    clientId: result.client.id,
    actorId: result.userId,
    action: 'task.created',
    entityType: 'brain_task',
    entityId: task.id,
  });

  return NextResponse.json({ success: true, data: task });
}
