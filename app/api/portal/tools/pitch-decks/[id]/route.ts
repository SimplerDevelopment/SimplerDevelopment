import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import type { PitchDeckSlide } from '@/lib/db/schema';
import { eq, and, ne } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { convertAllSlidesToV2, isV2Slides } from '@/lib/pitch-deck-migration';

/** Normalize a user-entered slug to a URL-safe form. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function resolveDecks(deckId: number, userId: number) {
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [deck] = await db.select().from(pitchDecks)
    .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, client.id)))
    .limit(1);
  return deck ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const deck = await resolveDecks(parseInt(id), parseInt(session.user.id, 10));
  if (!deck) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Lazy migration: convert v1 slides to v2 block format on read
  if (deck.formatVersion !== 2 && deck.slides?.length && !isV2Slides(deck.slides)) {
    const v2Slides = convertAllSlidesToV2(deck.slides as PitchDeckSlide[]);
    await db.update(pitchDecks).set({ slides: v2Slides, formatVersion: 2, updatedAt: new Date() })
      .where(eq(pitchDecks.id, deck.id));
    deck.slides = v2Slides;
    deck.formatVersion = 2;
  }

  return NextResponse.json({ success: true, data: deck });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const deck = await resolveDecks(parseInt(id), parseInt(session.user.id, 10));
  if (!deck) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() || null;
  if (body.status !== undefined) updates.status = body.status;
  if (body.slides !== undefined) { updates.slides = body.slides; updates.formatVersion = 2; }
  if (body.theme !== undefined) updates.theme = body.theme;
  if (body.sourceUrl !== undefined) updates.sourceUrl = body.sourceUrl?.trim() || null;

  // SEO fields — mirror the posts table so the public renderer can fall back
  // through deck.seoTitle -> deck.title -> branding when generating <head>.
  if (body.seoTitle !== undefined) updates.seoTitle = body.seoTitle?.trim() || null;
  if (body.seoDescription !== undefined) updates.seoDescription = body.seoDescription?.trim() || null;
  if (body.ogImage !== undefined) updates.ogImage = body.ogImage?.trim() || null;
  if (body.canonicalUrl !== undefined) updates.canonicalUrl = body.canonicalUrl?.trim() || null;
  if (body.noIndex !== undefined) updates.noIndex = !!body.noIndex;

  if (body.slug !== undefined) {
    const normalized = slugify(String(body.slug ?? ''));
    if (!normalized) {
      return NextResponse.json(
        { success: false, message: 'Slug must contain at least one letter or number.' },
        { status: 400 },
      );
    }
    if (normalized !== deck.slug) {
      // Enforce per-client slug uniqueness. pitch_decks has no DB unique
      // constraint on (client_id, slug) yet, so we check here.
      const [collision] = await db.select({ id: pitchDecks.id })
        .from(pitchDecks)
        .where(and(
          eq(pitchDecks.clientId, deck.clientId),
          eq(pitchDecks.slug, normalized),
          ne(pitchDecks.id, deck.id),
        ))
        .limit(1);
      if (collision) {
        return NextResponse.json(
          { success: false, message: `The slug "${normalized}" is already used by another deck.` },
          { status: 409 },
        );
      }
      updates.slug = normalized;
    }
  }

  const [updated] = await db.update(pitchDecks)
    .set(updates)
    .where(eq(pitchDecks.id, deck.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const deck = await resolveDecks(parseInt(id), parseInt(session.user.id, 10));
  if (!deck) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(pitchDecks).where(eq(pitchDecks.id, deck.id));
  return NextResponse.json({ success: true });
}
