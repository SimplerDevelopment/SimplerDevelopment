// GET /api/portal/tools/pitch-decks/[id]/analytics — viewer analytics for a deck
// (total events, unique sessions, per-slide views + avg time-on-slide).
// Tenant-scoped: the deck must belong to the caller's client.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks, pitchDeckViews } from '@/lib/db/schema';
import { and, eq, isNotNull, count, countDistinct, avg } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const deckId = parseInt((await params).id, 10);
  if (Number.isNaN(deckId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [deck] = await db
    .select({ id: pitchDecks.id })
    .from(pitchDecks)
    .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, client.id)))
    .limit(1);
  if (!deck) return NextResponse.json({ success: false, message: 'Deck not found' }, { status: 404 });

  const [totals] = await db
    .select({ totalEvents: count(), uniqueSessions: countDistinct(pitchDeckViews.sessionId) })
    .from(pitchDeckViews)
    .where(eq(pitchDeckViews.deckId, deckId));

  const perSlideRows = await db
    .select({ slideIndex: pitchDeckViews.slideIndex, views: count(), avgDwellMs: avg(pitchDeckViews.dwellMs) })
    .from(pitchDeckViews)
    .where(and(eq(pitchDeckViews.deckId, deckId), isNotNull(pitchDeckViews.slideIndex)))
    .groupBy(pitchDeckViews.slideIndex)
    .orderBy(pitchDeckViews.slideIndex);

  const perSlide = perSlideRows.map((r) => ({
    slideIndex: r.slideIndex,
    views: Number(r.views),
    avgDwellMs: r.avgDwellMs != null ? Math.round(Number(r.avgDwellMs)) : null,
  }));

  return NextResponse.json({
    success: true,
    data: {
      totalEvents: Number(totals?.totalEvents ?? 0),
      uniqueSessions: Number(totals?.uniqueSessions ?? 0),
      perSlide,
    },
  });
}
