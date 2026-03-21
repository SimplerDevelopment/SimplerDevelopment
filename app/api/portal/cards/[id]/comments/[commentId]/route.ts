import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCardComments } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { commentId } = await params;
  const cId = parseInt(commentId, 10);
  const userId = parseInt(session.user.id, 10);
  const role = (session.user as { role?: string })?.role;
  const isStaff = role === 'admin' || role === 'employee';

  const condition = isStaff
    ? eq(kanbanCardComments.id, cId)
    : and(eq(kanbanCardComments.id, cId), eq(kanbanCardComments.userId, userId));

  await db.delete(kanbanCardComments).where(condition);
  return NextResponse.json({ success: true });
}
