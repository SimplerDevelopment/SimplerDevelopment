import { Block } from '@/types/blocks';
import { insertIntoContainer, newBlockId } from './EditableBlockRenderer.helpers';

// ─── External-drop machinery (palette drag → canvas) — VEQA-011 ─────────────
// Pure helpers behind EditableBlockRenderer's external-drag flow: hit-testing
// the cursor against container drop zones / top-level slots, creating the
// default block for the dragged type, and applying the insert. Kept out of
// the renderer so the logic is unit-testable without mounting the editor.

/**
 * Where a new block dragged in from the palette should land: either spliced
 * into the top-level `blocks` array at `index`, or appended into a
 * container's (columns/section/tabs) child array via `insertIntoContainer`.
 */
export type ExternalDropTarget =
  | { kind: 'top-level'; index: number }
  | { kind: 'container'; containerId: string; slotIndex: number };

/**
 * Hit-test the external-drag cursor position against the rendered block tree.
 *
 * Container drop zones (one per column / section / active tab — marked with
 * `data-container-drop-id="{containerId}:{slotIndex}"` by ContainerSlotDropZone)
 * are checked first via point-in-rect, so hovering over an (empty or
 * populated) container nests the new block instead of inserting it at the
 * top level. Falls back to a top-level index computed from cursor Y vs.
 * top-level block boundaries — `data-toplevel-slot` marks only the top-level
 * block wrappers (not nested blocks inside containers), so index i lines up
 * with blocks[i].
 */
export function findExternalDropTarget(
  root: HTMLElement,
  x: number,
  y: number,
  blockCount: number,
): ExternalDropTarget {
  const containerEls = root.querySelectorAll<HTMLElement>('[data-container-drop-id]');
  for (const el of containerEls) {
    const rect = el.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      const raw = el.dataset.containerDropId!;
      const sep = raw.lastIndexOf(':');
      return {
        kind: 'container',
        containerId: raw.slice(0, sep),
        slotIndex: parseInt(raw.slice(sep + 1), 10),
      };
    }
  }

  const blockEls = root.querySelectorAll<HTMLElement>('[data-toplevel-slot]');
  if (blockEls.length === 0) return { kind: 'top-level', index: 0 };

  let bestIndex = blockCount; // default: append at end
  for (let i = 0; i < blockEls.length; i++) {
    const rect = blockEls[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (y < midY) {
      bestIndex = i;
      break;
    }
  }
  return { kind: 'top-level', index: bestIndex };
}

/** Create the default block for a palette-dragged type (verbatim defaults
 *  from the original inline external-drop handler). */
export function createExternalDropBlock(blockType: string, order: number): Block {
  return {
    id: newBlockId(),
    type: blockType as Block['type'],
    order,
    content: blockType === 'text' ? 'New text block' : '',
    ...(blockType === 'heading' && { content: 'New Heading', level: 2 }),
    ...(blockType === 'button' && { text: 'Click Me', url: '#' }),
    ...(blockType === 'spacer' && { height: '40px' }),
    ...(blockType === 'divider' && {}),
    ...(blockType === 'quote' && { content: 'Quote text', author: '' }),
    ...(blockType === 'code' && { code: '', language: 'javascript' }),
    ...(blockType === 'image' && { src: '', alt: '' }),
    ...(blockType === 'columns' && { columns: [
      { id: `col-${Date.now()}-1`, width: 50, blocks: [] },
      { id: `col-${Date.now()}-2`, width: 50, blocks: [] },
    ], gap: 'md' }),
    ...(blockType === 'section' && { blocks: [] }),
  } as Block;
}

/** Apply an external drop: nest into the target container, or splice into the
 *  top-level array at the target index. Returns a new blocks array. */
export function applyExternalDrop(
  blocks: Block[],
  target: ExternalDropTarget,
  newBlock: Block,
): Block[] {
  if (target.kind === 'container') {
    return insertIntoContainer(blocks, target.containerId, target.slotIndex, newBlock);
  }
  const updated = [...blocks];
  updated.splice(target.index, 0, newBlock);
  return updated;
}
