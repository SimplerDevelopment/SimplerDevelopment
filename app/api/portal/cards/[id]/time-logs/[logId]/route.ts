import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCardTimeLogs, kanbanCards, projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

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

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id: cardId, logId } = await params;

  // Verify the time log belongs to a card in this tenant's project before deleting.
  const [row] = await db
    .select({ id: kanbanCardTimeLogs.id })
    .from(kanbanCardTimeLogs)
    .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardTimeLogs.cardId))
    .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
    .where(
      and(
        eq(kanbanCardTimeLogs.id, parseInt(logId, 10)),
        eq(kanbanCards.id, parseInt(cardId, 10)),
        eq(projects.clientId, client.id),
      )
    )
    .limit(1);

  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(kanbanCardTimeLogs).where(eq(kanbanCardTimeLogs.id, row.id));
  return NextResponse.json({ success: true });
}
