/** Pure helpers used across the pitch-deck editor — slide titles, icons, color math, block-id backfill. */
import type { PitchDeckSlideV2 } from '@/lib/db/schema';

/**
 * Returns the slide as it should be displayed in the editor: draft fields
 * overlay the live fields when set. The public renderer (outside the editor)
 * intentionally never calls this — it reads the live fields directly.
 *
 * Use this for any read of `blocks`, `customCss`, `pageSettings`, `notes`
 * inside the editor. Other slide-level fields (label, surveySlide, decisionSlide,
 * pathGroup, etc.) are not draftable and are pulled straight from the slide.
 */
export function getSlideView(slide: PitchDeckSlideV2): PitchDeckSlideV2 {
  const d = slide.draft;
  if (!d) return slide;
  return {
    ...slide,
    blocks: d.blocks ?? slide.blocks,
    customCss: d.customCss ?? slide.customCss,
    pageSettings: d.pageSettings ?? slide.pageSettings,
    notes: d.notes ?? slide.notes,
  };
}

/** True iff the slide has any draft state (any of the draft.* fields set). */
export function slideHasDraft(slide: PitchDeckSlideV2): boolean {
  return slide.draft != null;
}

/** True iff the slide is a draft tombstone (will disappear on publish). */
export function slideIsPendingDelete(slide: PitchDeckSlideV2): boolean {
  return slide.draft?.pendingDelete === true;
}

/** True iff the slide exists only as a draft (live fields empty). */
export function slideIsPendingCreate(slide: PitchDeckSlideV2): boolean {
  return slide.draft?.pendingCreate === true;
}

/**
 * Merge a partial set of draftable fields into a slide's `draft` overlay.
 * The live fields are left untouched. `pendingCreate` is preserved (a pending-
 * created slide that gets edited stays pending-created); `pendingDelete` is
 * cleared because any content edit implicitly cancels a queued deletion.
 *
 * `updatedAt` / `updatedBy` are caller-supplied because we don't have a userId
 * in client code. The server doesn't read them — they're advisory.
 */
export function mergeSlideDraft(
  slide: PitchDeckSlideV2,
  patch: {
    blocks?: PitchDeckSlideV2['blocks'];
    customCss?: string;
    pageSettings?: PitchDeckSlideV2['pageSettings'];
    notes?: string;
  },
): PitchDeckSlideV2 {
  const prev = slide.draft ?? {};
  const next: NonNullable<PitchDeckSlideV2['draft']> = {
    ...prev,
    ...patch,
    // any content edit clears a queued deletion
    pendingDelete: undefined,
    updatedAt: new Date().toISOString(),
  };
  return { ...slide, draft: next };
}

/** Mark a slide as pendingDelete (tombstone). Leaves live fields untouched. */
export function markSlidePendingDelete(slide: PitchDeckSlideV2): PitchDeckSlideV2 {
  return {
    ...slide,
    draft: {
      ...(slide.draft ?? {}),
      pendingDelete: true,
      updatedAt: new Date().toISOString(),
    },
  };
}

/** Clear the draft entirely (cancel a pending edit / pending delete). */
export function clearSlideDraft(slide: PitchDeckSlideV2): PitchDeckSlideV2 {
  if (!slide.draft) return slide;
  const next = { ...slide };
  delete next.draft;
  return next;
}

export function isColorDark(hex: string): boolean {
  const clean = hex.replace('#', '');
  if (clean.length < 6) return false;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

/**
 * Older AI-generated decks wrote block payloads without `id` fields. The visual
 * editor selects blocks by id, so id-less blocks are unclickable and dnd-kit logs
 * sortable-id warnings. Walk the block tree on load and assign stable ids to
 * anything missing one.
 */
export function backfillBlockIds<T extends { id?: string; type?: string }>(blocks: T[] | undefined, seedPath = 'b'): T[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.map((b, i) => {
    const next: Record<string, unknown> = { ...b };
    if (!next.id) next.id = `${seedPath}-${i}-${Math.random().toString(36).slice(2, 8)}`;
    const nodeId = String(next.id);
    if (Array.isArray((next as { columns?: unknown }).columns)) {
      next.columns = ((next as { columns: Array<{ blocks?: unknown[] }> }).columns).map((c, ci) => ({
        ...c,
        blocks: backfillBlockIds((c.blocks as T[]) ?? [], `${nodeId}-c${ci}`),
      }));
    }
    if (Array.isArray((next as { tabs?: unknown }).tabs)) {
      next.tabs = ((next as { tabs: Array<{ blocks?: unknown[] }> }).tabs).map((t, ti) => ({
        ...t,
        blocks: backfillBlockIds((t.blocks as T[]) ?? [], `${nodeId}-t${ti}`),
      }));
    }
    if (next.type === 'section' && Array.isArray((next as { blocks?: unknown }).blocks)) {
      next.blocks = backfillBlockIds((next as { blocks: T[] }).blocks, `${nodeId}-s`);
    }
    return next as T;
  });
}

export function normalizeDeckBlockIds<D extends { slides?: Array<{ blocks?: unknown[] }> }>(deck: D): D {
  if (!deck?.slides) return deck;
  return {
    ...deck,
    slides: deck.slides.map((s, si) => ({
      ...s,
      blocks: backfillBlockIds((s.blocks as Array<{ id?: string; type?: string }>) ?? [], `slide${si}`),
    })),
  } as D;
}

/** Extract a display title from a slide's blocks (reads the draft view). */
export function getSlideTitle(slide: PitchDeckSlideV2): string {
  if (slide.label) return slide.label;
  const view = getSlideView(slide);
  for (const block of view.blocks) {
    if (block.type === 'hero' && 'title' in block) return (block as { title: string }).title;
    if (block.type === 'heading' && 'content' in block) return (block as { content: string }).content;
    if (block.type === 'cta' && 'title' in block) return (block as { title: string }).title;
  }
  return 'Untitled';
}

/** Get an icon for a slide based on its first block (reads the draft view). */
export function getSlideIcon(slide: PitchDeckSlideV2): string {
  if (slide.decisionSlide) return 'fork_right';
  if (slide.surveySlide) return 'assignment';
  const view = getSlideView(slide);
  if (!view.blocks.length) return 'edit_note';
  const first = view.blocks[0].type;
  const iconMap: Record<string, string> = {
    hero: 'title', heading: 'notes', stats: 'bar_chart', 'card-grid': 'grid_view',
    testimonial: 'format_quote', cta: 'campaign', image: 'image', text: 'article',
    columns: 'view_column', 'services-grid': 'apps', 'featured-content': 'featured_play_list',
  };
  return iconMap[first] || 'edit_note';
}

/** Get the icon for a survey field type. */
export function getSurveyFieldIcon(type: string): string {
  const map: Record<string, string> = {
    text: 'short_text', textarea: 'notes', email: 'email', phone: 'phone',
    url: 'link', number: 'tag', date: 'calendar_today', select: 'arrow_drop_down_circle',
    radio: 'radio_button_checked', checkbox: 'check_box', toggle: 'toggle_on',
    rating: 'star', slider: 'tune', heading: 'title',
  };
  return map[type] || 'help_outline';
}

/** Path-group color palette + lookup. */
export const PATH_GROUP_COLORS = [
  { bg: 'bg-blue-500/10', text: 'text-blue-500', dot: 'bg-blue-500', border: 'border-blue-500/20' },
  { bg: 'bg-emerald-500/10', text: 'text-emerald-500', dot: 'bg-emerald-500', border: 'border-emerald-500/20' },
  { bg: 'bg-amber-500/10', text: 'text-amber-500', dot: 'bg-amber-500', border: 'border-amber-500/20' },
  { bg: 'bg-purple-500/10', text: 'text-purple-500', dot: 'bg-purple-500', border: 'border-purple-500/20' },
  { bg: 'bg-rose-500/10', text: 'text-rose-500', dot: 'bg-rose-500', border: 'border-rose-500/20' },
  { bg: 'bg-cyan-500/10', text: 'text-cyan-500', dot: 'bg-cyan-500', border: 'border-cyan-500/20' },
] as const;

export function getPathGroupColor(pathGroup: string, allGroups: string[]): typeof PATH_GROUP_COLORS[number] {
  const idx = allGroups.indexOf(pathGroup);
  return PATH_GROUP_COLORS[idx >= 0 ? idx % PATH_GROUP_COLORS.length : 0];
}
