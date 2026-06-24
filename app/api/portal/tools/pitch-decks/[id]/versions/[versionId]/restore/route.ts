import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks, pitchDeckVersions } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { hasServiceAccess } from '@/lib/portal-auth';
import { convertAllSlidesToV2, isV2Slides } from '@/lib/pitch-deck-migration';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const { id, versionId } = await params;
  const deckId = parseInt(id);

  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  if (!(await hasServiceAccess(client.id, 'pitch-decks'))) return NextResponse.json({ success: false, message: 'This feature requires an active pitch-decks subscription.', requiresService: 'pitch-decks', upsellUrl: '/portal/services' }, { status: 403 });

  // Verify deck belongs to client
  const [deck] = await db.select().from(pitchDecks)
    .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, client.id)))
    .limit(1);
  if (!deck) return NextResponse.json({ success: false, message: 'Deck not found' }, { status: 404 });

  // Get the version
  const [version] = await db.select().from(pitchDeckVersions)
    .where(and(eq(pitchDeckVersions.id, parseInt(versionId)), eq(pitchDeckVersions.deckId, deckId)))
    .limit(1);
  if (!version) return NextResponse.json({ success: false, message: 'Version not found' }, { status: 404 });

  // Save current state as a version before restoring (so user can undo)
  await db.insert(pitchDeckVersions).values({
    deckId: deck.id,
    slides: deck.slides as PitchDeckSlideV2[],
    theme: (deck.theme || {}) as PitchDeckTheme,
    formatVersion: deck.formatVersion,
    label: 'Before restore',
    trigger: 'manual',
    createdBy: userId,
  });

  // Convert v1 version slides to v2 if needed
  let restoredSlides = version.slides as PitchDeckSlide[] | PitchDeckSlideV2[];
  let restoredFormatVersion = version.formatVersion;
  if (restoredSlides.length && !isV2Slides(restoredSlides as unknown[])) {
    restoredSlides = convertAllSlidesToV2(restoredSlides as PitchDeckSlide[]);
    restoredFormatVersion = 2;
  } else if (isV2Slides(restoredSlides as unknown[])) {
    restoredFormatVersion = 2;
  }

  // Restore the version
  const [updated] = await db.update(pitchDecks).set({
    slides: restoredSlides,
    theme: version.theme as PitchDeckTheme,
    formatVersion: restoredFormatVersion,
    updatedAt: new Date(),
  }).where(eq(pitchDecks.id, deck.id)).returning();

  return NextResponse.json({ success: true, data: updated });
}
