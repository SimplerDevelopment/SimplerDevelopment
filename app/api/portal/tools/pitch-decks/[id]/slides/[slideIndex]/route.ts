/**
 * PATCH /api/portal/tools/pitch-decks/[id]/slides/[slideIndex]
 *
 * Per-slide save endpoint — updates a single slide's `blocks`, `notes`,
 * `pageSettings`, `label`, and/or `draft` field without sending the full
 * slides blob over the wire. The `slideIndex` path slug holds the slide's
 * stable string `id` (matching the sibling `publish` / `generate` routes
 * which use the same convention).
 *
 * Slides are stored as a JSON array in `pitchDecks.slides`; the update
 * resolves the index via id-match inside the existing array, mutates the
 * single element, and writes the whole array back. This still does a single
 * UPDATE — the win is in the *request* payload size (parent only sends one
 * slide instead of the entire deck), not the DB layer. The full-deck PATCH
 * on the parent route is preserved for theme, reorder, and multi-slide ops.
 *
 * Response envelope: `{ success, data: { slide } }` on the happy path.
 */
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { assertBlocksAllowedForRole, BlockGateError } from '@/lib/security/block-allowlist';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; slideIndex: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id, slideIndex: slideId } = await params;
  const deckId = parseInt(id, 10);
  if (Number.isNaN(deckId)) {
    return NextResponse.json({ success: false, message: 'Invalid deck id' }, { status: 400 });
  }

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const [deck] = await db.select().from(pitchDecks)
    .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, client.id)))
    .limit(1);
  if (!deck) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const liveSlides: PitchDeckSlideV2[] = Array.isArray(deck.slides)
    ? (deck.slides as PitchDeckSlideV2[])
    : [];
  const idx = liveSlides.findIndex((s) => s.id === slideId);
  if (idx === -1) {
    return NextResponse.json({ success: false, message: 'Slide not found' }, { status: 404 });
  }

  const body = await req.json();
  const target = liveSlides[idx];
  const updated: PitchDeckSlideV2 = { ...target };

  if (body.blocks !== undefined) {
    // Re-use the deck-wide allowlist gate by wrapping in a fake-slide array;
    // the gate inspects block types only, slide shape doesn't matter.
    try {
      assertBlocksAllowedForRole([{ ...target, blocks: body.blocks }], (session.user as { role?: string }).role);
    } catch (e) {
      if (e instanceof BlockGateError) {
        return NextResponse.json({ success: false, message: e.message }, { status: 403 });
      }
      throw e;
    }
    updated.blocks = body.blocks;
  }
  if (body.notes !== undefined) updated.notes = body.notes;
  if (body.label !== undefined) updated.label = body.label;
  if (body.pageSettings !== undefined) updated.pageSettings = body.pageSettings;
  if (body.draft !== undefined) {
    if (body.draft && body.draft.blocks !== undefined) {
      try {
        assertBlocksAllowedForRole([{ ...target, blocks: body.draft.blocks }], (session.user as { role?: string }).role);
      } catch (e) {
        if (e instanceof BlockGateError) {
          return NextResponse.json({ success: false, message: e.message }, { status: 403 });
        }
        throw e;
      }
    }
    updated.draft = body.draft;
  }
  if (body.surveyFieldBlocks !== undefined) updated.surveyFieldBlocks = body.surveyFieldBlocks;

  const nextSlides = [...liveSlides];
  nextSlides[idx] = updated;

  await db.update(pitchDecks)
    .set({ slides: nextSlides, formatVersion: 2, updatedAt: new Date() })
    .where(eq(pitchDecks.id, deck.id));

  return NextResponse.json({ success: true, data: { slide: updated } });
}
