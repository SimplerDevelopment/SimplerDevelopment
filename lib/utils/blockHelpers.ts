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
    if (block.type === 'columns') {
      for (const column of block.columns) {
        const found = findBlockById(column.blocks, blockId);
        if (found) {
          return found;
        }
      }
    }

    // If this is a tabs block, search within the tabs
    if (block.type === 'tabs') {
      for (const tab of block.tabs) {
        const found = findBlockById(tab.blocks, blockId);
        if (found) {
          return found;
        }
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
    if (block.type === 'columns') {
      for (const column of block.columns) {
        result.push(...getAllBlocks(column.blocks));
      }
    }

    // If this is a tabs block, include all nested blocks
    if (block.type === 'tabs') {
      for (const tab of block.tabs) {
        result.push(...getAllBlocks(tab.blocks));
      }
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

    return block;
  });
}
