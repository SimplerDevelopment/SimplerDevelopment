import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { promoteTaskToKanban } from '@/lib/brain/tasks';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const projectId = typeof body.projectId === 'number' ? body.projectId : null;
  const columnId = typeof body.columnId === 'number' ? body.columnId : undefined;
  if (!projectId) {
    return NextResponse.json({ success: false, message: 'projectId is required' }, { status: 400 });
  }

  try {
    const out = await promoteTaskToKanban({
      clientId: result.client.id,
      taskId,
      projectId,
      columnId,
      actorId: result.userId,
    });
    return NextResponse.json({ success: true, data: out });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to promote task',
    }, { status: 400 });
  }
}
