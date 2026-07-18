import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getTask, updateTask, deleteTask, type BrainTask } from '@/lib/brain/tasks';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (Number.isNaN(taskId)) {
    return NextResponse.json({ success: false, message: 'Invalid task id' }, { status: 400 });
  }
  const task = await getTask(result.client.id, taskId);
  if (!task) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: task });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (Number.isNaN(taskId)) {
    return NextResponse.json({ success: false, message: 'Invalid task id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const updated = await updateTask(result.client.id, taskId, {
    title: typeof body.title === 'string' ? body.title.slice(0, 500) : undefined,
    description: typeof body.description === 'string' ? body.description : (body.description === null ? null : undefined),
    ownerId: typeof body.ownerId === 'number' ? body.ownerId : (body.ownerId === null ? null : undefined),
    status: ['open', 'in_progress', 'blocked', 'done'].includes(body.status) ? body.status as BrainTask['status'] : undefined,
    priority: ['low', 'medium', 'high', 'urgent'].includes(body.priority) ? body.priority : undefined,
    dueDate: body.dueDate ? new Date(body.dueDate) : (body.dueDate === null ? null : undefined),
    blockedReason: typeof body.blockedReason === 'string' ? body.blockedReason : (body.blockedReason === null ? null : undefined),
    needsReview: typeof body.needsReview === 'boolean' ? body.needsReview : undefined,
  }, result.userId);

  if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const taskId = parseInt(id, 10);
  if (Number.isNaN(taskId)) {
    return NextResponse.json({ success: false, message: 'Invalid task id' }, { status: 400 });
  }
  const ok = await deleteTask(result.client.id, taskId, result.userId);
  if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
