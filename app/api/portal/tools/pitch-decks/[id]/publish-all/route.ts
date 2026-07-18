/**
 * POST /api/portal/tools/pitch-decks/[id]/publish-all
 *
 * Walk every slide on the deck and publish any with a `draft`. Removes
 * `pendingDelete` tombstones, materializes `pendingCreate` slides, merges
 * regular update drafts into live fields. Tenancy: the deck must belong to
 * the caller's portal client. Mirrors the MCP tool `decks_publish_all` and
 * shares its semantics via `lib/decks/publish-slide.ts`.
 */
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { hasServiceAccess } from '@/lib/portal-auth';
import {
  applyPublishAllToSlides,
  countDraftSlides,
} from '@/lib/decks/publish-slide';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const deckId = parseInt(id, 10);
  if (Number.isNaN(deckId)) {
    return NextResponse.json({ success: false, message: 'Invalid deck id' }, { status: 400 });
  }

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }
  if (!(await hasServiceAccess(client.id, 'pitch-decks'))) return NextResponse.json({ success: false, message: 'This feature requires an active pitch-decks subscription.', requiresService: 'pitch-decks', upsellUrl: '/portal/services' }, { status: 403 });

  const [deck] = await db.select().from(pitchDecks)
    .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, client.id)))
    .limit(1);
  if (!deck) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const liveSlides: PitchDeckSlideV2[] = Array.isArray(deck.slides)
    ? (deck.slides as PitchDeckSlideV2[])
    : [];
  const draftCount = countDraftSlides(liveSlides);
  const nextSlides = applyPublishAllToSlides(liveSlides);

  const [updated] = await db.update(pitchDecks)
    .set({ slides: nextSlides, formatVersion: 2, updatedAt: new Date() })
    .where(eq(pitchDecks.id, deck.id))
    .returning();

  return NextResponse.json({
    success: true,
    data: updated,
    publishedCount: draftCount,
  });
}
