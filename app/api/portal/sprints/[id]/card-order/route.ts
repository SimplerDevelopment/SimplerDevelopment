import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { sprints, projects, kanbanCards } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeSprint(sprintId: number, session: any): Promise<{ sprint: typeof sprints.$inferSelect; canEdit: boolean } | null> {
  const [sprint] = await db.select().from(sprints).where(eq(sprints.id, sprintId)).limit(1);
  if (!sprint) return null;

  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { sprint, canEdit: true };

  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, sprint.projectId), eq(projects.clientId, client.id))).limit(1);
  if (!proj) return null;

  return { sprint, canEdit: proj.isPrivate };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sprintId = parseInt(id, 10);
  const result = await authorizeSprint(sprintId, session);
  if (!result) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!result.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { cardIds } = await req.json();
  if (!Array.isArray(cardIds)) return NextResponse.json({ success: false, message: 'cardIds array required' }, { status: 400 });

  for (let i = 0; i < cardIds.length; i++) {
    const cardId = Number(cardIds[i]);
    if (!Number.isFinite(cardId)) continue;
    await db.update(kanbanCards)
      .set({ sprintOrder: i })
      .where(and(eq(kanbanCards.id, cardId), eq(kanbanCards.sprintId, sprintId)));
  }

  return NextResponse.json({ success: true });
}
