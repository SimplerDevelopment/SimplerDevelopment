import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks, pitchDeckVersions } from '@/lib/db/schema';
import type { PitchDeckSlide, PitchDeckTheme } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { hasServiceAccess } from '@/lib/portal-auth';

async function resolveDeck(deckId: number, userId: number) {
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [deck] = await db.select().from(pitchDecks)
    .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, client.id)))
    .limit(1);
  return deck ?? null;
}

// List versions for a deck
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const deck = await resolveDeck(parseInt(id), parseInt(session.user.id, 10));
  if (!deck) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const versions = await db
    .select({
      id: pitchDeckVersions.id,
      label: pitchDeckVersions.label,
      trigger: pitchDeckVersions.trigger,
      slideCount: pitchDeckVersions.slides,
      createdAt: pitchDeckVersions.createdAt,
    })
    .from(pitchDeckVersions)
    .where(eq(pitchDeckVersions.deckId, deck.id))
    .orderBy(desc(pitchDeckVersions.createdAt))
    .limit(50);

  // Return metadata only (not full slide data) for the list
  const data = versions.map(v => ({
    id: v.id,
    label: v.label,
    trigger: v.trigger,
    slideCount: Array.isArray(v.slideCount) ? v.slideCount.length : 0,
    createdAt: v.createdAt,
  }));

  return NextResponse.json({ success: true, data });
}

// Save a manual version checkpoint
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const svcClient = await getPortalClient(userId);
  if (!svcClient || !(await hasServiceAccess(svcClient.id, 'pitch-decks'))) return NextResponse.json({ success: false, message: 'This feature requires an active pitch-decks subscription.', requiresService: 'pitch-decks', upsellUrl: '/portal/services' }, { status: 403 });
  const { id } = await params;
  const deck = await resolveDeck(parseInt(id), userId);
  if (!deck) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { label } = await req.json().catch(() => ({ label: null }));

  const [version] = await db.insert(pitchDeckVersions).values({
    deckId: deck.id,
    slides: (deck.slides || []) as PitchDeckSlide[],
    theme: (deck.theme || {}) as PitchDeckTheme,
    label: label?.trim() || null,
    trigger: 'manual',
    createdBy: userId,
  }).returning();

  return NextResponse.json({
    success: true,
    data: {
      id: version.id,
      label: version.label,
      trigger: version.trigger,
      slideCount: Array.isArray(version.slides) ? version.slides.length : 0,
      createdAt: version.createdAt,
    },
  });
}
