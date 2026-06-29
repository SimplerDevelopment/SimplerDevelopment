/**
 * Slide Edit Optimizer
 *
 * Classifies edit prompts and minimizes AI payloads to reduce token usage.
 * Style-only edits send ~85% fewer tokens by stripping content.
 * Content-only edits send ~75% fewer tokens by stripping styles.
 * Structural edits send the full slide (no optimization).
 */

import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import type { Block } from '@/types/blocks';

// ─── Edit Type Classification ────────────────────────────────────────────────

export type EditType = 'style' | 'content' | 'structural' | 'full';

const STYLE_KEYWORDS = [
  'bigger', 'smaller', 'larger', 'font', 'color', 'colour', 'size', 'padding',
  'margin', 'spacing', 'bold', 'italic', 'background', 'border', 'radius',
  'shadow', 'opacity', 'width', 'height', 'align', 'center', 'left', 'right',
  'gradient', 'rounded', 'underline', 'uppercase', 'lowercase', 'weight',
  'gap', 'thick', 'thin', 'narrow', 'wide', 'icon size', 'icons bigger',
  'icons smaller', 'make it pop', 'more contrast', 'darker', 'lighter',
  'brighter', 'muted', 'transparent', 'line-height', 'letter-spacing',
];

const CONTENT_KEYWORDS = [
  'change the text', 'change the title', 'change the heading',
  'rewrite', 'update the text', 'update the title', 'rename',
  'say ', 'write ', 'replace the text', 'edit the text',
  'change description', 'update description', 'fix the typo',
  'shorten', 'make it more concise', 'expand', 'elaborate',
  'translate', 'rephrase', 'tone', 'formal', 'casual',
  'add a subtitle', 'change subtitle', 'update the copy',
  'change the button text', 'update speaker notes',
];

const STRUCTURAL_KEYWORDS = [
  'add a ', 'add new ', 'remove the ', 'delete the ', 'remove a ',
  'split ', 'merge ', 'reorder', 'move the ', 'swap ',
  'new card', 'new section', 'new block', 'another column',
  'add column', 'remove column', 'add a row', 'add stats',
  'add testimonial', 'add image', 'convert to', 'change layout',
  'restructure', 'reorganize',
];

export function classifyEdit(prompt: string): EditType {
  const lower = prompt.toLowerCase().trim();

  let styleScore = 0;
  let contentScore = 0;
  let structuralScore = 0;

  for (const kw of STYLE_KEYWORDS) {
    if (lower.includes(kw)) styleScore++;
  }
  for (const kw of CONTENT_KEYWORDS) {
    if (lower.includes(kw)) contentScore++;
  }
  for (const kw of STRUCTURAL_KEYWORDS) {
    if (lower.includes(kw)) structuralScore++;
  }

  // Structural always wins if detected — it needs full context
  if (structuralScore > 0 && structuralScore >= contentScore && structuralScore >= styleScore) {
    return 'structural';
  }

  // Pure style (no content keywords matched)
  if (styleScore > 0 && contentScore === 0 && structuralScore === 0) {
    return 'style';
  }

  // Pure content (no style keywords matched)
  if (contentScore > 0 && styleScore === 0 && structuralScore === 0) {
    return 'content';
  }

  // Both style and content matched — send as full
  if (styleScore > 0 && contentScore > 0) {
    return 'full';
  }

  // No keywords matched — default to full for safety
  return 'full';
}

// ─── Payload Minimization ────────────────────────────────────────────────────

/** Strip content from blocks, keep only IDs, types, and styles */
function stripBlockContent(block: Block): Record<string, unknown> {
  const b = block as unknown as Record<string, unknown>;
  const minimal: Record<string, unknown> = {
    id: b.id,
    type: b.type,
    order: b.order,
  };

  // Keep style-related fields
  if (b.style) minimal.style = b.style;
  if (b.elementStyles) minimal.elementStyles = b.elementStyles;

  // Keep structural info for context (column widths, card count, etc.)
  if (b.columns && typeof b.columns === 'number') minimal.columns = b.columns;
  if (b.iconSize) minimal.iconSize = b.iconSize;
  if (b.alignment) minimal.alignment = b.alignment;
  if (b.size) minimal.size = b.size;
  if (b.level) minimal.level = b.level;
  if (b.variant) minimal.variant = b.variant;
  if (b.width) minimal.width = b.width;
  if (b.height) minimal.height = b.height;

  // For card-grid, keep card count and IDs but strip descriptions
  if (b.type === 'card-grid' && Array.isArray(b.cards)) {
    minimal.cards = (b.cards as Array<Record<string, unknown>>).map(c => ({
      id: c.id,
      icon: c.icon,
    }));
  }

  // For columns, recurse into child blocks
  if (b.type === 'columns' && Array.isArray(b.columns)) {
    minimal.columns = (b.columns as Array<Record<string, unknown>>).map(col => ({
      id: col.id,
      width: col.width,
      blocks: Array.isArray(col.blocks)
        ? (col.blocks as Block[]).map(stripBlockContent)
        : [],
    }));
  }

  // For section, recurse into child blocks
  if (b.type === 'section' && Array.isArray(b.blocks)) {
    minimal.blocks = (b.blocks as Block[]).map(stripBlockContent);
    if (b.backgroundColor) minimal.backgroundColor = b.backgroundColor;
    if (b.paddingTop) minimal.paddingTop = b.paddingTop;
    if (b.paddingBottom) minimal.paddingBottom = b.paddingBottom;
    if (b.paddingLeft) minimal.paddingLeft = b.paddingLeft;
    if (b.paddingRight) minimal.paddingRight = b.paddingRight;
    if (b.maxWidth) minimal.maxWidth = b.maxWidth;
  }

  return minimal;
}

/** Strip styles from blocks, keep only IDs, types, and content */
function stripBlockStyles(block: Block): Record<string, unknown> {
  const b = block as unknown as Record<string, unknown>;
  const minimal: Record<string, unknown> = { ...b };

  // Remove style objects
  delete minimal.style;
  delete minimal.elementStyles;

  // For section/columns, recurse
  if (b.type === 'section' && Array.isArray(b.blocks)) {
    minimal.blocks = (b.blocks as Block[]).map(stripBlockStyles);
  }
  if (b.type === 'columns' && Array.isArray(b.columns)) {
    minimal.columns = (b.columns as Array<Record<string, unknown>>).map(col => ({
      ...col,
      blocks: Array.isArray(col.blocks)
        ? (col.blocks as Block[]).map(stripBlockStyles)
        : col.blocks,
    }));
  }

  return minimal;
}

export interface MinimizedPayload {
  slide: Record<string, unknown>;
  systemAddendum: string;
  userPrefix: string;
  maxTokens: number;
  skipAdjacentSlides: boolean;
}

export function minimizePayload(
  slide: PitchDeckSlideV2,
  editType: EditType,
): MinimizedPayload {
  const fullSize = JSON.stringify(slide).length;

  switch (editType) {
    case 'style': {
      const minimized = {
        id: slide.id,
        label: slide.label,
        blocks: slide.blocks.map(stripBlockContent),
      };
      return {
        slide: minimized,
        systemAddendum: `
# Response Mode: STYLE PATCH
The user is making a style-only change. Return a JSON patch — NOT the full slide.
Response format:
{
  "patches": [
    { "id": "block-id", "style": { ...changed properties only... } },
    { "id": "block-id", "elementStyles": { "elementName": { ...changed properties only... } } }
  ]
}
Only include blocks whose styles actually change. Omit unchanged blocks entirely.
Do NOT include any content fields (title, content, description, etc.) — only style changes.`,
        userPrefix: 'Slide structure (content stripped, styles only):',
        maxTokens: 2048,
        skipAdjacentSlides: true,
      };
    }

    case 'content': {
      const minimized = {
        id: slide.id,
        label: slide.label,
        blocks: slide.blocks.map(stripBlockStyles),
        notes: slide.notes,
      };
      return {
        slide: minimized,
        systemAddendum: `
# Response Mode: CONTENT PATCH
The user is making a content-only change. Return a JSON patch — NOT the full slide.
Response format:
{
  "patches": [
    { "id": "block-id", "content": "new text" },
    { "id": "block-id", "title": "new title", "description": "new desc" }
  ],
  "label": "Updated Label (only if changed)",
  "notes": "Updated notes (only if changed)"
}
Only include blocks whose content actually changes. Omit unchanged blocks entirely.
Do NOT include any style fields — only content changes.`,
        userPrefix: 'Slide content (styles stripped):',
        maxTokens: 4096,
        skipAdjacentSlides: false,
      };
    }

    case 'structural':
    case 'full':
    default: {
      return {
        slide: slide as unknown as Record<string, unknown>,
        systemAddendum: '',
        userPrefix: 'Current slide:',
        maxTokens: Math.max(4096, Math.min(16384, Math.ceil(fullSize / 2) + 2048)),
        skipAdjacentSlides: false,
      };
    }
  }
}

// ─── Patch Merging ───────────────────────────────────────────────────────────

interface StylePatch {
  id: string;
  style?: Record<string, unknown>;
  elementStyles?: Record<string, Record<string, unknown>>;
}

interface ContentPatch {
  id: string;
  [key: string]: unknown;
}

/** Deep-merge style patches into the original slide blocks */
function applyStylePatches(slide: PitchDeckSlideV2, patches: StylePatch[]): PitchDeckSlideV2 {
  const patchMap = new Map(patches.map(p => [p.id, p]));

  function patchBlock(block: Block): Block {
    const b = block as unknown as Record<string, unknown>;
    const patch = patchMap.get(b.id as string);

    const updated = { ...b };
    if (patch) {
      if (patch.style) {
        updated.style = { ...(b.style as Record<string, unknown> || {}), ...patch.style };
      }
      if (patch.elementStyles) {
        const existing = (b.elementStyles || {}) as Record<string, Record<string, unknown>>;
        const merged: Record<string, Record<string, unknown>> = { ...existing };
        for (const [key, val] of Object.entries(patch.elementStyles)) {
          merged[key] = { ...(existing[key] || {}), ...val };
        }
        updated.elementStyles = merged;
      }
    }

    // Recurse into nested blocks
    if (updated.type === 'section' && Array.isArray(updated.blocks)) {
      updated.blocks = (updated.blocks as Block[]).map(patchBlock);
    }
    if (updated.type === 'columns' && Array.isArray(updated.columns)) {
      updated.columns = (updated.columns as Array<Record<string, unknown>>).map(col => ({
        ...col,
        blocks: Array.isArray(col.blocks)
          ? (col.blocks as Block[]).map(patchBlock)
          : col.blocks,
      }));
    }

    return updated as unknown as Block;
  }

  return {
    ...slide,
    blocks: slide.blocks.map(patchBlock),
  };
}

/** Deep-merge content patches into the original slide blocks */
function applyContentPatches(
  slide: PitchDeckSlideV2,
  patches: ContentPatch[],
  newLabel?: string,
  newNotes?: string,
): PitchDeckSlideV2 {
  const patchMap = new Map(patches.map(p => [p.id, p]));

  function patchBlock(block: Block): Block {
    const b = block as unknown as Record<string, unknown>;
    const patch = patchMap.get(b.id as string);

    const updated = { ...b };
    if (patch) {
      // Merge all content fields from the patch (excluding id)
      for (const [key, val] of Object.entries(patch)) {
        if (key !== 'id' && key !== 'style' && key !== 'elementStyles') {
          updated[key] = val;
        }
      }
    }

    // Recurse
    if (updated.type === 'section' && Array.isArray(updated.blocks)) {
      updated.blocks = (updated.blocks as Block[]).map(patchBlock);
    }
    if (updated.type === 'columns' && Array.isArray(updated.columns)) {
      updated.columns = (updated.columns as Array<Record<string, unknown>>).map(col => ({
        ...col,
        blocks: Array.isArray(col.blocks)
          ? (col.blocks as Block[]).map(patchBlock)
          : col.blocks,
      }));
    }

    return updated as unknown as Block;
  }

  return {
    ...slide,
    blocks: slide.blocks.map(patchBlock),
    label: newLabel || slide.label,
    notes: newNotes !== undefined ? newNotes : slide.notes,
  };
}

/** Apply AI response to original slide based on edit type */
export function applyPatchResponse(
  originalSlide: PitchDeckSlideV2,
  parsed: unknown,
  editType: EditType,
): PitchDeckSlideV2 {
  const response = parsed as Record<string, unknown>;

  if (editType === 'style' && Array.isArray(response.patches)) {
    return applyStylePatches(originalSlide, response.patches as StylePatch[]);
  }

  if (editType === 'content' && Array.isArray(response.patches)) {
    return applyContentPatches(
      originalSlide,
      response.patches as ContentPatch[],
      response.label as string | undefined,
      response.notes as string | undefined,
    );
  }

  // For structural/full edits, the response IS the full slide — return as-is
  // (validated by the existing validateSlideResponse)
  return null as unknown as PitchDeckSlideV2;
}

/** Check if a parsed response is a patch format (has "patches" array) */
export function isPatchResponse(parsed: unknown): boolean {
  return (
    typeof parsed === 'object' &&
    parsed !== null &&
    'patches' in parsed &&
    Array.isArray((parsed as Record<string, unknown>).patches)
  );
}
