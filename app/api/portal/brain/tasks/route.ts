import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listTasks, createTask, type BrainTask } from '@/lib/brain/tasks';
import { logAudit } from '@/lib/brain/audit';

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') as BrainTask['status'] | null;
  const ownerId = url.searchParams.get('ownerId');
  const meetingId = url.searchParams.get('meetingId');
  const needsReview = url.searchParams.get('needsReview');

  const tasks = await listTasks(result.client.id, {
    status: status ?? undefined,
    ownerId: ownerId ? parseInt(ownerId, 10) : undefined,
    meetingId: meetingId ? parseInt(meetingId, 10) : undefined,
    needsReview: needsReview === 'true' ? true : needsReview === 'false' ? false : undefined,
  });
  return NextResponse.json({ success: true, data: tasks });
}

export async function POST(request: Request) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

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
