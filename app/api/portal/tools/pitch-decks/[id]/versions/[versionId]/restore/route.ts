import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks, pitchDeckVersions } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const { id, versionId } = await params;
  const deckId = parseInt(id);

  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

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
    slides: (deck.slides || []) as PitchDeckSlide[],
    theme: (deck.theme || {}) as PitchDeckTheme,
    label: 'Before restore',
    trigger: 'manual',
    createdBy: userId,
  });

  // Restore the version
  const [updated] = await db.update(pitchDecks).set({
    slides: version.slides as PitchDeckSlide[],
    theme: version.theme as PitchDeckTheme,
    updatedAt: new Date(),
  }).where(eq(pitchDecks.id, deck.id)).returning();

  return NextResponse.json({ success: true, data: updated });
}
