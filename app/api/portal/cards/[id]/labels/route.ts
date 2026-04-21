import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCardLabels, kanbanCards, kanbanLabels, projects } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { logCardActivity } from '@/lib/pm-activity';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCardEdit(cardId: number, session: any): Promise<{ projectId: number; canEdit: boolean } | null> {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;

  const role = getRole(session);
  if (role === 'admin' || role === 'employee') return { projectId: card.projectId, canEdit: true };

  const s = session as unknown as { user?: { id: string } } | null;
  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id))).limit(1);
  if (!proj) return null;

  return { projectId: card.projectId, canEdit: proj.isPrivate };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const auth_ = await authorizeCardEdit(cardId, session);
  if (!auth_) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!auth_.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const { labelId } = await req.json();
  if (typeof labelId !== 'number') return NextResponse.json({ success: false, message: 'labelId required' }, { status: 400 });

  const [label] = await db.select().from(kanbanLabels).where(eq(kanbanLabels.id, labelId)).limit(1);
  if (!label || label.projectId !== auth_.projectId) {
    return NextResponse.json({ success: false, message: 'Label not in this project' }, { status: 400 });
  }

  await db.insert(kanbanCardLabels).values({ cardId, labelId }).onConflictDoNothing();
  await logCardActivity(cardId, parseInt(session.user.id, 10), 'card.label_added', { labelId, name: label.name, color: label.color });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);
  const auth_ = await authorizeCardEdit(cardId, session);
  if (!auth_) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  if (!auth_.canEdit) return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const labelId = parseInt(url.searchParams.get('labelId') ?? '', 10);
  if (Number.isNaN(labelId)) return NextResponse.json({ success: false, message: 'labelId required' }, { status: 400 });

  const [label] = await db.select().from(kanbanLabels).where(eq(kanbanLabels.id, labelId)).limit(1);
  await db.delete(kanbanCardLabels).where(and(eq(kanbanCardLabels.cardId, cardId), eq(kanbanCardLabels.labelId, labelId)));
  if (label) {
    await logCardActivity(cardId, parseInt(session.user.id, 10), 'card.label_removed', { labelId, name: label.name });
  }

  return NextResponse.json({ success: true });
}
