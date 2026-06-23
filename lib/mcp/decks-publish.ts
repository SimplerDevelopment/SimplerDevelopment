/**
 * Pure helpers for promoting V2 pitch-deck slide drafts to live.
 *
 * Shared between:
 *   - `lib/mcp/tools/pitch-decks.ts` — the `decks_publish_slide` /
 *     `decks_publish_all` MCP tools.
 *   - `app/api/approve/[token]/route.ts` — the deck-approval side effect.
 *
 * Why split out: the MCP tool module pulls the entire MCP SDK plus every
 * other tool's imports. The approval route runs on Edge-adjacent Node and
 * shouldn't drag that in just to flip slide.draft → slide live.
 */
import type { PitchDeckSlideV2 } from '@/lib/db/schema';

/** Copies a single slide's `draft.*` onto its live fields and clears draft.
 *  Returns `null` if the slide should be removed (pendingDelete tombstone or
 *  pendingCreate+pendingDelete net-no-op). Returns the slide unchanged when
 *  there's no draft. */
export function publishOneSlide(slide: PitchDeckSlideV2): PitchDeckSlideV2 | null {
  const draft = slide.draft;
  if (!draft) return slide;
  if (draft.pendingCreate && draft.pendingDelete) return null;
  if (draft.pendingDelete) return null;
  const next: PitchDeckSlideV2 = {
    ...slide,
    blocks: draft.blocks ?? slide.blocks,
    customCss: draft.customCss ?? slide.customCss,
    pageSettings: draft.pageSettings ?? slide.pageSettings,
    notes: draft.notes ?? slide.notes,
  };
  delete next.draft;
  return next;
}

/** Promotes a single slide (by id) within a slides array. Slides without a
 *  matching id pass through unchanged. */
export function applyPublishToSlides(
  slides: PitchDeckSlideV2[],
  slideId: string,
): PitchDeckSlideV2[] {
  const out: PitchDeckSlideV2[] = [];
  for (const s of slides) {
    if (s.id !== slideId) {
      out.push(s);
      continue;
    }
    const published = publishOneSlide(s);
    if (published) out.push(published);
  }
  return out;
}

/** Promotes every slide with a non-null `draft` in one pass. */
export function applyPublishAllToSlides(
  slides: PitchDeckSlideV2[],
): PitchDeckSlideV2[] {
  const out: PitchDeckSlideV2[] = [];
  for (const s of slides) {
    if (!s.draft) {
      out.push(s);
      continue;
    }
    const published = publishOneSlide(s);
    if (published) out.push(published);
  }
  return out;
}
