/**
 * Slide-draft publish helpers — pure functions over a slides array.
 *
 * Centralized so the REST endpoints (under
 * `app/api/portal/tools/pitch-decks/[id]/...publish/route.ts`) and the MCP
 * tools / approval dispatcher can share identical semantics. Today the MCP
 * tool (`lib/mcp/tools/pitch-decks.ts`) and the approvals dispatcher
 * (`lib/mcp/approvals.ts`) each inline the same function — that's fine; both
 * sites can later switch to this module for a single source of truth.
 *
 * Semantics:
 *   - `draft.pendingDelete` → slide is dropped from the array.
 *   - `draft.pendingCreate && draft.pendingDelete` → also dropped (created and
 *     deleted before publish — net no-op).
 *   - `pendingCreate` or a regular update draft → `draft.{blocks, customCss,
 *     pageSettings, notes}` are copied onto the live fields and `draft` is
 *     cleared. Missing draft fields fall back to the existing live values so
 *     a notes-only edit doesn't clobber blocks.
 *   - Slides with no `draft` are returned unchanged.
 */
import type { PitchDeckSlideV2 } from '@/lib/db/schema';

/**
 * Publish a single slide's draft. Returns the published slide, or `null` if
 * the slide should be removed (pendingDelete tombstone).
 */
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

/**
 * Publish the draft for a single slide id. Other slides pass through
 * unchanged. Returns a new slides array (a deleted-tombstone slide is omitted).
 */
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

/**
 * Publish every slide that has a draft. Slides with no draft pass through;
 * pendingDelete tombstones are removed. Returns a new slides array.
 */
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

/** Count slides on the deck that currently have a draft (any kind). */
export function countDraftSlides(slides: PitchDeckSlideV2[]): number {
  let n = 0;
  for (const s of slides) if (s.draft) n++;
  return n;
}
