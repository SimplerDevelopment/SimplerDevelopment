// POST /api/public/pitch-decks/[slug]/view — record a viewer-analytics event
// from the public deck presenter. Public (no auth); only published decks are
// tracked. Body: { sessionId?, slideIndex?, dwellMs? } — slideIndex null = a
// deck-open event; non-null = a per-slide dwell.
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { pitchDecks, pitchDeckViews } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [deck] = await db
    .select({ id: pitchDecks.id })
    .from(pitchDecks)
    .where(and(eq(pitchDecks.slug, slug), eq(pitchDecks.status, 'published')))
    .limit(1);
  if (!deck) return NextResponse.json({ success: false, message: 'Deck not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 100) : null;
  const slideIndex = Number.isInteger(body.slideIndex) ? body.slideIndex : null;
  const dwellMs = Number.isInteger(body.dwellMs) && body.dwellMs >= 0 ? body.dwellMs : null;

  await db.insert(pitchDeckViews).values({ deckId: deck.id, sessionId, slideIndex, dwellMs });

  return NextResponse.json({ success: true });
}
