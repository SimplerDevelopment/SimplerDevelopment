import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardComments, kanbanCardFiles, projects } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq, and, inArray } from 'drizzle-orm';
import { logCardActivity } from '@/lib/pm-activity';
import { filterUserIdsVisibleToClient } from '@/lib/security/assert-owned';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizeCard(cardId: number, session: any) {
  const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return null;

  const s = session as unknown as { user?: { id: string; role?: string } } | null;
  const role = s?.user?.role;
  if (role === 'admin' || role === 'employee') return card;

  const userId = parseInt(s!.user!.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [proj] = await db.select().from(projects)
    .where(and(eq(projects.id, card.projectId), eq(projects.clientId, client.id)))
    .limit(1);
  return proj ? card : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const cardId = parseInt(id, 10);

  const card = await authorizeCard(cardId, session);
  if (!card) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { body, mentions, fileIds } = await req.json();
  if (!body?.trim() && (!fileIds?.length)) return NextResponse.json({ success: false, message: 'body is required' }, { status: 400 });

  // Filter mentions[] to userIds visible to the active client (members + staff).
  // Without this, a tenant teammate could @-mention any user in the system and
  // notification fan-out would leak the card title/body cross-tenant.
  let safeMentions: number[] = [];
  if (Array.isArray(mentions) && mentions.length > 0) {
    const userId = parseInt(session.user.id, 10);
    const role = (session.user as { role?: string }).role;
    if (role === 'admin' || role === 'editor' || role === 'employee') {
      safeMentions = mentions.map((m: unknown) => Number(m)).filter((n) => Number.isFinite(n));
    } else {
      const client = await getPortalClient(userId);
      if (client) {
        const numeric = mentions.map((m: unknown) => Number(m)).filter((n) => Number.isFinite(n));
        safeMentions = await filterUserIdsVisibleToClient(numeric, client.id);
      }
    }
  }

  const [comment] = await db.insert(kanbanCardComments).values({
    cardId,
    userId: parseInt(session.user.id, 10),
    body: body?.trim() ?? '',
    mentions: safeMentions,
  }).returning();

  if (fileIds?.length) {
    // Only re-parent files that already belong to this card; never adopt a file
    // by ID alone — that would let any tenant hijack another tenant's file.
    await db.update(kanbanCardFiles)
      .set({ commentId: comment.id })
      .where(and(
        inArray(kanbanCardFiles.id, fileIds),
        eq(kanbanCardFiles.cardId, cardId),
      ));
  }

  await logCardActivity(cardId, parseInt(session.user.id, 10), 'card.commented', { commentId: comment.id });

  return NextResponse.json({ success: true, data: { ...comment, userName: session.user.name ?? null } });
}
