// Public render-path helper for A/B testing.
//
// Bridges `lib/ab/visitor.ts` + `lib/ab/resolve.ts` so the page render
// route can stay terse: one call, get back the (possibly swapped) content
// and the AB resolution to feed into `<AbGoalTracker>`.
//
// In edit/preview mode, A/B is bypassed entirely — editors should always
// see the canonical post content, never a randomly-bucketed variant.

import { ensureVisitorId } from './visitor';
import { resolveAbContent, resolveAbContentForTarget, type AbResolution } from './resolve';
import type { PitchDeckSlide, PitchDeckSlideV2 } from '@/lib/db/schema';

export interface PostRenderInput {
  postId: number;
  content: string;
  /** Skip A/B entirely — edit/preview mode, internal previews, etc. */
  skip?: boolean;
}

export interface PostRenderOutput {
  content: string;
  ab: AbResolution | null;
  visitorId: string | null;
}

export async function applyAbToPostContent(input: PostRenderInput): Promise<PostRenderOutput> {
  if (input.skip) {
    return { content: input.content, ab: null, visitorId: null };
  }

  const { id: visitorId } = await ensureVisitorId();
  const resolved = await resolveAbContent(input.postId, visitorId, input.content);
  return { content: resolved.content, ab: resolved.ab, visitorId };
}

export interface DeckRenderInput {
  deckId: number;
  /** Original slide array on the deck. */
  slides: PitchDeckSlide[] | PitchDeckSlideV2[];
  /** Skip A/B entirely (preview, draft inspection). */
  skip?: boolean;
}

export interface DeckRenderOutput {
  slides: PitchDeckSlide[] | PitchDeckSlideV2[];
  ab: AbResolution | null;
  visitorId: string | null;
}

/**
 * Decide whether a deck should be rendered with a variant override. The
 * variant payload is shaped as the same `slides` array the deck stores —
 * just JSON-stringified through the existing `blockTreeOverride` column.
 * Falls back to the original slides on any error.
 */
export async function applyAbToDeckSlides(input: DeckRenderInput): Promise<DeckRenderOutput> {
  const original = input.slides;
  if (input.skip) return { slides: original, ab: null, visitorId: null };

  const { id: visitorId } = await ensureVisitorId();
  const resolved = await resolveAbContentForTarget(
    'deck',
    input.deckId,
    visitorId,
    JSON.stringify(original ?? []),
  );

  if (!resolved.ab || !resolved.ab.swapped) {
    return { slides: original, ab: resolved.ab, visitorId };
  }

  // Swap path — parse the variant payload back into a slide array. On any
  // shape mismatch, fall through to the live deck so a malformed variant
  // can never blank a presentation.
  let nextSlides: PitchDeckSlide[] | PitchDeckSlideV2[] = original;
  try {
    const parsed = JSON.parse(resolved.content) as unknown;
    if (Array.isArray(parsed)) {
      nextSlides = parsed as PitchDeckSlide[] | PitchDeckSlideV2[];
    }
  } catch {
    /* keep original */
  }
  return { slides: nextSlides, ab: resolved.ab, visitorId };
}
