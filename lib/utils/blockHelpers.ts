import { Block } from '@/types/blocks';

/**
 * Recursively find a block by ID, searching through nested structures like columns and tabs
 */
export function findBlockById(blocks: Block[], blockId: string): Block | null {
  for (const block of blocks) {
    // Check if this is the block we're looking for
    if (block.id === blockId) {
      return block;
    }

    // If this is a columns block, search within the columns
    if (block.type === 'columns' && block.columns) {
      for (const column of block.columns) {
        const found = findBlockById(column.blocks || [], blockId);
        if (found) {
          return found;
        }
      }
    }

    // If this is a tabs block, search within the tabs
    if (block.type === 'tabs' && block.tabs) {
      for (const tab of block.tabs) {
        const found = findBlockById(tab.blocks || [], blockId);
        if (found) {
          return found;
        }
      }
    }

    // If this is a section block, search within its children
    if (block.type === 'section' && block.blocks) {
      const found = findBlockById(block.blocks, blockId);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

/**
 * Get all blocks including nested ones (flattened)
 */
export function getAllBlocks(blocks: Block[]): Block[] {
  const result: Block[] = [];

  for (const block of blocks) {
    result.push(block);

    // If this is a columns block, include all nested blocks
    if (block.type === 'columns' && block.columns) {
      for (const column of block.columns) {
        result.push(...getAllBlocks(column.blocks || []));
      }
    }

    // If this is a tabs block, include all nested blocks
    if (block.type === 'tabs' && block.tabs) {
      for (const tab of block.tabs) {
        result.push(...getAllBlocks(tab.blocks || []));
      }
    }

    // If this is a section block, include all nested blocks
    if (block.type === 'section' && block.blocks) {
      result.push(...getAllBlocks(block.blocks));
    }
  }

  return result;
}

/**
 * Find which container a block lives in.
 * Returns { containerId, slotIndex, blockIndex } or null if top-level.
 */
export function findBlockPath(
  blocks: Block[],
  blockId: string,
): { containerId: string; slotIndex: number; blockIndex: number } | null {
  for (const block of blocks) {
    if (block.type === 'columns') {
      for (let si = 0; si < block.columns.length; si++) {
        const bi = block.columns[si].blocks.findIndex((b) => b.id === blockId);
        if (bi !== -1) return { containerId: block.id, slotIndex: si, blockIndex: bi };
        const nested = findBlockPath(block.columns[si].blocks, blockId);
        if (nested) return nested;
      }
    }
    if (block.type === 'tabs') {
      for (let si = 0; si < block.tabs.length; si++) {
        const bi = block.tabs[si].blocks.findIndex((b) => b.id === blockId);
        if (bi !== -1) return { containerId: block.id, slotIndex: si, blockIndex: bi };
        const nested = findBlockPath(block.tabs[si].blocks, blockId);
        if (nested) return nested;
      }
    }
    if (block.type === 'section') {
      const bi = block.blocks.findIndex((b) => b.id === blockId);
      if (bi !== -1) return { containerId: block.id, slotIndex: 0, blockIndex: bi };
      const nested = findBlockPath(block.blocks, blockId);
      if (nested) return nested;
    }
  }
  return null;
}

/**
 * Remove a block by ID from anywhere in the tree. Returns the new blocks array.
 */
export function removeBlockById(blocks: Block[], blockId: string): Block[] {
  return blocks
    .filter((b) => b.id !== blockId)
    .map((block) => {
      if (block.type === 'columns') {
        return {
          ...block,
          columns: block.columns.map((col) => ({
            ...col,
            blocks: removeBlockById(col.blocks, blockId),
          })),
        };
      }
      if (block.type === 'tabs') {
        return {
          ...block,
          tabs: block.tabs.map((tab) => ({
            ...tab,
            blocks: removeBlockById(tab.blocks, blockId),
          })),
        };
      }
      if (block.type === 'section') {
        return {
          ...block,
          blocks: removeBlockById(block.blocks, blockId),
        };
      }
      return block;
    });
}

/**
 * Insert a block into a container slot at a given index.
 * containerId is the id of the columns/tabs/section block.
 * slotIndex is which column/tab (0 for sections).
 * atIndex is the position within that slot's blocks array.
 */
export function insertBlockInContainer(
  blocks: Block[],
  containerId: string,
  slotIndex: number,
  atIndex: number,
  blockToInsert: Block,
): Block[] {
  return blocks.map((block) => {
    if (block.id === containerId) {
      if (block.type === 'columns') {
        return {
          ...block,
          columns: block.columns.map((col, i) => {
            if (i !== slotIndex) return col;
            const newBlocks = [...col.blocks];
            newBlocks.splice(atIndex, 0, blockToInsert);
            return { ...col, blocks: newBlocks };
          }),
        };
      }
      if (block.type === 'tabs') {
        return {
          ...block,
          tabs: block.tabs.map((tab, i) => {
            if (i !== slotIndex) return tab;
            const newBlocks = [...tab.blocks];
            newBlocks.splice(atIndex, 0, blockToInsert);
            return { ...tab, blocks: newBlocks };
          }),
        };
      }
      if (block.type === 'section') {
        const newBlocks = [...block.blocks];
        newBlocks.splice(atIndex, 0, blockToInsert);
        return { ...block, blocks: newBlocks };
      }
    }
    // Recurse into containers
    if (block.type === 'columns') {
      return { ...block, columns: block.columns.map((col) => ({ ...col, blocks: insertBlockInContainer(col.blocks, containerId, slotIndex, atIndex, blockToInsert) })) };
    }
    if (block.type === 'tabs') {
      return { ...block, tabs: block.tabs.map((tab) => ({ ...tab, blocks: insertBlockInContainer(tab.blocks, containerId, slotIndex, atIndex, blockToInsert) })) };
    }
    if (block.type === 'section') {
      return { ...block, blocks: insertBlockInContainer(block.blocks, containerId, slotIndex, atIndex, blockToInsert) };
    }
    return block;
  });
}

/**
 * Insert a block after a target block, searching recursively.
 */
export function insertBlockAfter(
  blocks: Block[],
  targetId: string,
  blockToInsert: Block,
): Block[] {
  const result: Block[] = [];
  for (const block of blocks) {
    if (block.id === targetId) {
      result.push(block);
      result.push(blockToInsert);
    } else {
      const updated = { ...block };
      if (block.type === 'columns') {
        (updated as typeof block).columns = block.columns.map(col => ({
          ...col,
          blocks: insertBlockAfter(col.blocks, targetId, blockToInsert),
        }));
      }
      if (block.type === 'tabs') {
        (updated as typeof block).tabs = block.tabs.map(tab => ({
          ...tab,
          blocks: insertBlockAfter(tab.blocks, targetId, blockToInsert),
        }));
      }
      if (block.type === 'section') {
        (updated as typeof block).blocks = insertBlockAfter(block.blocks, targetId, blockToInsert);
      }
      result.push(updated);
    }
  }
  return result;
}

/**
 * Update a block by ID, searching recursively through nested structures
 */
export function updateBlockById(
  blocks: Block[],
  blockId: string,
  updates: Partial<Block>
): Block[] {
  return blocks.map((block) => {
    // If this is the block we're updating, apply updates
    if (block.id === blockId) {
      return { ...block, ...updates } as Block;
    }

    // If this is a columns block, recursively update within columns
    if (block.type === 'columns') {
      return {
        ...block,
        columns: block.columns.map((column) => ({
          ...column,
          blocks: updateBlockById(column.blocks, blockId, updates),
        })),
      };
    }

    // If this is a tabs block, recursively update within tabs
    if (block.type === 'tabs') {
      return {
        ...block,
        tabs: block.tabs.map((tab) => ({
          ...tab,
          blocks: updateBlockById(tab.blocks, blockId, updates),
        })),
      };
    }

    // If this is a section block, recursively update within its children
    if (block.type === 'section') {
      return {
        ...block,
        blocks: updateBlockById(block.blocks, blockId, updates),
      };
    }

    return block;
  });
}
