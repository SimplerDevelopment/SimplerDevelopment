import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardFiles, projects } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { deleteFromS3 } from '@/lib/s3/delete';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCard(cardId: number, session: any): Promise<{ isStaff: boolean } | null> {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;
  const s = session as unknown as { user?: { id: string; role?: string } } | null;
  const role = s?.user?.role;
  if (role === 'admin' || role === 'employee') return { isStaff: true };
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id)))
    .limit(1);
  return proj ? { isStaff: false } : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id, fileId } = await params;
  const cardId = parseInt(id, 10);
  const fId = parseInt(fileId, 10);

  const authz = await authorizeCard(cardId, session);
  if (!authz) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Verify the file belongs to this card (prevents flipping another card's file via mismatched URL).
  const [file] = await db.select({ cardId: kanbanCardFiles.cardId })
    .from(kanbanCardFiles).where(eq(kanbanCardFiles.id, fId)).limit(1);
  if (!file || file.cardId !== cardId) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const { commentId } = await req.json();
  await db.update(kanbanCardFiles)
    .set({ commentId })
    .where(eq(kanbanCardFiles.id, fId));

  return NextResponse.json({ success: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; fileId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

    const { id, fileId } = await params;
    const cardId = parseInt(id, 10);
    const fId = parseInt(fileId, 10);
    const userId = parseInt(session.user.id, 10);

    const authz = await authorizeCard(cardId, session);
    if (!authz) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    // File must belong to this card, and non-staff must additionally be the uploader.
    const condition = authz.isStaff
      ? and(eq(kanbanCardFiles.id, fId), eq(kanbanCardFiles.cardId, cardId))
      : and(eq(kanbanCardFiles.id, fId), eq(kanbanCardFiles.cardId, cardId), eq(kanbanCardFiles.userId, userId));

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
