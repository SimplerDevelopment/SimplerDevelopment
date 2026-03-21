import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCardFiles } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { deleteFromS3 } from '@/lib/s3/delete';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { fileId } = await params;
  const { commentId } = await req.json();

  await db.update(kanbanCardFiles)
    .set({ commentId })
    .where(eq(kanbanCardFiles.id, parseInt(fileId, 10)));

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { fileId } = await params;
    const fId = parseInt(fileId, 10);
    const userId = parseInt(session.user.id, 10);
    const role = (session.user as { role?: string })?.role;
    const isStaff = role === 'admin' || role === 'employee';

    const condition = isStaff
      ? eq(kanbanCardFiles.id, fId)
      : and(eq(kanbanCardFiles.id, fId), eq(kanbanCardFiles.userId, userId));

    const [file] = await db.select().from(kanbanCardFiles).where(condition).limit(1);
    if (!file) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    await deleteFromS3(file.storedFilename);
    await db.delete(kanbanCardFiles).where(eq(kanbanCardFiles.id, fId));

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/portal/cards/[id]/files/[fileId]]', err);
    return NextResponse.json({ success: false, message: 'Delete failed' }, { status: 500 });
  }
}
