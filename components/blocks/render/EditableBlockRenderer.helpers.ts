import { Block } from '@/types/blocks';

// ─── Pure block-tree helpers used by EditableBlockRenderer ──────────────────
// Extracted verbatim from EditableBlockRenderer.tsx — no logic changes.

export type UndoRedoAction = 'undo' | 'redo' | null;

/**
 * Resolves a keydown event to an undo/redo action, or null. Pure so the
 * chord-matching (PUX-126) can be unit tested without simulating DOM focus
 * or postMessage — see EditableBlockRenderer's keydown handler, which
 * forwards the result to the parent (IFRAME_MESSAGES.REQUEST_UNDO /
 * REQUEST_REDO) instead of calling editor.undo()/redo() directly, so the
 * same keydown works whether the browser's keyboard-focus context is on the
 * parent shell or inside this iframe.
 */
export function matchUndoRedoChord(e: { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): UndoRedoAction {
  if (!(e.metaKey || e.ctrlKey)) return null;
  if (e.key.toLowerCase() !== 'z') return null;
  return e.shiftKey ? 'redo' : 'undo';
}

export function hasPostContentPlaceholder(blocks: Block[]): boolean {
  for (const b of blocks) {
    if (b?.type === 'post-content') return true;
    if (b?.type === 'columns' && Array.isArray(b.columns)) {
      for (const c of b.columns) if (Array.isArray(c?.blocks) && hasPostContentPlaceholder(c.blocks)) return true;
    }
    if (b?.type === 'tabs' && Array.isArray(b.tabs)) {
      for (const t of b.tabs) if (Array.isArray(t?.blocks) && hasPostContentPlaceholder(t.blocks)) return true;
    }
    if (b?.type === 'section' && Array.isArray(b.blocks) && hasPostContentPlaceholder(b.blocks)) return true;
  }
  return false;
}

export function removeBlock(blocks: Block[], blockId: string): Block[] {
  return blocks.filter(b => b.id !== blockId).map(b => {
    if (b.type === 'columns') return { ...b, columns: b.columns.map(c => ({ ...c, blocks: removeBlock(c.blocks, blockId) })) };
    if (b.type === 'tabs') return { ...b, tabs: b.tabs.map(t => ({ ...t, blocks: removeBlock(t.blocks, blockId) })) };
    if (b.type === 'section') return { ...b, blocks: removeBlock(b.blocks, blockId) };
    return b;
  });
}

export function findBlock(blocks: Block[], blockId: string): Block | null {
  for (const b of blocks) {
    if (b.id === blockId) return b;
    if (b.type === 'columns') for (const c of b.columns) { const f = findBlock(c.blocks, blockId); if (f) return f; }
    if (b.type === 'tabs') for (const t of b.tabs) { const f = findBlock(t.blocks, blockId); if (f) return f; }
    if (b.type === 'section') { const f = findBlock(b.blocks, blockId); if (f) return f; }
  }
  return null;
}

export function newBlockId() {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function deepCloneBlock(block: Block): Block {
  const clone = { ...block, id: newBlockId() };
  if (clone.type === 'columns') {
    clone.columns = clone.columns.map(c => ({ ...c, id: newBlockId(), blocks: c.blocks.map(deepCloneBlock) }));
  }
  if (clone.type === 'tabs') {
    clone.tabs = clone.tabs.map(t => ({ ...t, id: newBlockId(), blocks: t.blocks.map(deepCloneBlock) }));
  }
  if (clone.type === 'section') {
    clone.blocks = clone.blocks.map(deepCloneBlock);
  }
  return clone as Block;
}

export function allBlockIds(blocks: Block[] | undefined | null): string[] {
  const ids: string[] = [];
  if (!Array.isArray(blocks)) return ids;
  for (const b of blocks) {
    if (!b || typeof b !== 'object') continue;
    if (b.id) ids.push(b.id);
    if (b.type === 'columns' && Array.isArray(b.columns)) {
      b.columns.forEach(c => { if (Array.isArray(c?.blocks)) ids.push(...allBlockIds(c.blocks)); });
    }
    if (b.type === 'tabs' && Array.isArray(b.tabs)) {
      b.tabs.forEach(t => { if (Array.isArray(t?.blocks)) ids.push(...allBlockIds(t.blocks)); });
    }
    if (b.type === 'section' && Array.isArray(b.blocks)) ids.push(...allBlockIds(b.blocks));
  }
  return ids;
}

export function insertNearBlock(blocks: Block[], targetId: string, position: 'before' | 'after', blockToInsert: Block): Block[] {
  const result: Block[] = [];
  for (const b of blocks) {
    if (b.id === targetId) {
      if (position === 'before') { result.push(blockToInsert); result.push(b); }
      else { result.push(b); result.push(blockToInsert); }
    } else {
      const updated = { ...b };
      if (b.type === 'columns') {
        (updated as typeof b).columns = b.columns.map(c => ({ ...c, blocks: insertNearBlock(c.blocks, targetId, position, blockToInsert) }));
      }
      if (b.type === 'tabs') {
        (updated as typeof b).tabs = b.tabs.map(t => ({ ...t, blocks: insertNearBlock(t.blocks, targetId, position, blockToInsert) }));
      }
      if (b.type === 'section') {
        (updated as typeof b).blocks = insertNearBlock(b.blocks, targetId, position, blockToInsert);
      }
      result.push(updated);
    }
  }
  return result;
}

export function insertIntoContainer(blocks: Block[], containerId: string, slotIndex: number, blockToInsert: Block): Block[] {
  return blocks.map(b => {
    if (b.id === containerId) {
      if (b.type === 'columns') {
        return { ...b, columns: b.columns.map((c, i) => i === slotIndex ? { ...c, blocks: [...c.blocks, blockToInsert] } : c) };
      }
      if (b.type === 'tabs') {
        return { ...b, tabs: b.tabs.map((t, i) => i === slotIndex ? { ...t, blocks: [...t.blocks, blockToInsert] } : t) };
      }
      if (b.type === 'section') {
        return { ...b, blocks: [...b.blocks, blockToInsert] };
      }
    }
    if (b.type === 'columns') return { ...b, columns: b.columns.map(c => ({ ...c, blocks: insertIntoContainer(c.blocks, containerId, slotIndex, blockToInsert) })) };
    if (b.type === 'tabs') return { ...b, tabs: b.tabs.map(t => ({ ...t, blocks: insertIntoContainer(t.blocks, containerId, slotIndex, blockToInsert) })) };
    if (b.type === 'section') return { ...b, blocks: insertIntoContainer(b.blocks, containerId, slotIndex, blockToInsert) };
    return b;
  });
}
