import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCardTimeLogs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; logId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') {
    return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
  }

  const { logId } = await params;
  await db.delete(kanbanCardTimeLogs).where(eq(kanbanCardTimeLogs.id, parseInt(logId, 10)));
  return NextResponse.json({ success: true });
}
