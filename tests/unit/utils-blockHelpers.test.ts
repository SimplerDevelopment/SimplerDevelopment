import { describe, it, expect } from 'vitest';
import {
  newBlockId,
  deepCloneBlock,
  findBlockById,
  getAllBlocks,
  findBlockPath,
  removeBlockById,
  insertBlockInContainer,
  insertBlockAfter,
  updateBlockById,
} from '@/lib/utils/blockHelpers';
import type { Block } from '@/types/blocks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkText(id: string, content = 'hello'): Block {
  return { id, type: 'text', content } as unknown as Block;
}

function mkHeading(id: string, content = 'Title'): Block {
  return { id, type: 'heading', content, level: 2 } as unknown as Block;
}

function mkColumns(id: string, columns: Array<{ id: string; blocks: Block[] }>): Block {
  return {
    id,
    type: 'columns',
    columns: columns.map((c) => ({ id: c.id, width: 50, blocks: c.blocks })),
  } as unknown as Block;
}

function mkTabs(id: string, tabs: Array<{ id: string; blocks: Block[] }>): Block {
  return {
    id,
    type: 'tabs',
    tabs: tabs.map((t) => ({ id: t.id, label: 'tab', blocks: t.blocks })),
  } as unknown as Block;
}

function mkSection(id: string, blocks: Block[]): Block {
  return { id, type: 'section', blocks } as unknown as Block;
}

// ---------------------------------------------------------------------------
// newBlockId
// ---------------------------------------------------------------------------

describe('newBlockId', () => {
  it('returns a string with the expected prefix', () => {
    const id = newBlockId();
    expect(typeof id).toBe('string');
    expect(id.startsWith('block-')).toBe(true);
  });

  it('embeds a numeric timestamp segment', () => {
    const id = newBlockId();
    const parts = id.split('-');
    expect(parts.length).toBeGreaterThanOrEqual(3);
    expect(Number.isNaN(Number(parts[1]))).toBe(false);
  });

  it('produces unique ids on rapid successive calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) ids.add(newBlockId());
    expect(ids.size).toBe(200);
  });

  it('keeps the random suffix to a constrained length', () => {
    const id = newBlockId();
    const suffix = id.split('-')[2];
    // slice(2, 11) yields up to 9 chars
    expect(suffix.length).toBeLessThanOrEqual(9);
    expect(suffix.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// deepCloneBlock
// ---------------------------------------------------------------------------

describe('deepCloneBlock', () => {
  it('clones a leaf block with a new id', () => {
    const original = mkText('text-1', 'hello');
    const clone = deepCloneBlock(original);
    expect(clone.id).not.toBe(original.id);
    expect((clone as { content: string }).content).toBe('hello');
  });

  it('does not mutate the original block', () => {
    const original = mkText('text-1', 'hello');
    const originalId = original.id;
    deepCloneBlock(original);
    expect(original.id).toBe(originalId);
  });

  it('clones a columns block giving every column and child a new id', () => {
    const child = mkText('child-1');
    const original = mkColumns('cols-1', [{ id: 'col-a', blocks: [child] }]);
    const clone = deepCloneBlock(original) as unknown as {
      id: string;
      columns: Array<{ id: string; blocks: Block[] }>;
    };
    expect(clone.id).not.toBe('cols-1');
    expect(clone.columns[0].id).not.toBe('col-a');
    expect(clone.columns[0].blocks[0].id).not.toBe('child-1');
  });

  it('clones a tabs block giving every tab and child a new id', () => {
    const child = mkText('child-2');
    const original = mkTabs('tabs-1', [{ id: 'tab-a', blocks: [child] }]);
    const clone = deepCloneBlock(original) as unknown as {
      id: string;
      tabs: Array<{ id: string; blocks: Block[] }>;
    };
    expect(clone.id).not.toBe('tabs-1');
    expect(clone.tabs[0].id).not.toBe('tab-a');
    expect(clone.tabs[0].blocks[0].id).not.toBe('child-2');
  });

  it('clones a section block giving children new ids', () => {
    const child = mkText('child-3');
    const original = mkSection('sec-1', [child]);
    const clone = deepCloneBlock(original) as unknown as {
      id: string;
      blocks: Block[];
    };
    expect(clone.id).not.toBe('sec-1');
    expect(clone.blocks[0].id).not.toBe('child-3');
  });

  it('clones deeply-nested mixed structures', () => {
    const leaf = mkText('leaf');
    const inner = mkColumns('inner-cols', [{ id: 'inner-col', blocks: [leaf] }]);
    const outer = mkSection('outer-sec', [inner]);

    const cloned = deepCloneBlock(outer) as unknown as {
      blocks: Array<{ columns: Array<{ blocks: Block[] }>; id: string }>;
    };
    expect(cloned.blocks[0].id).not.toBe('inner-cols');
    expect(cloned.blocks[0].columns[0].blocks[0].id).not.toBe('leaf');
  });
});

// ---------------------------------------------------------------------------
// findBlockById
// ---------------------------------------------------------------------------

describe('findBlockById', () => {
  it('returns null for an empty array', () => {
    expect(findBlockById([], 'nope')).toBeNull();
  });

  it('finds a top-level block', () => {
    const blocks = [mkText('a'), mkText('b')];
    expect(findBlockById(blocks, 'b')?.id).toBe('b');
  });

  it('returns null when block is missing', () => {
    const blocks = [mkText('a')];
    expect(findBlockById(blocks, 'missing')).toBeNull();
  });

  it('finds a block nested inside columns', () => {
    const inner = mkText('deep');
    const blocks = [mkColumns('cols', [{ id: 'c1', blocks: [inner] }])];
    expect(findBlockById(blocks, 'deep')?.id).toBe('deep');
  });

  it('finds a block nested inside tabs', () => {
    const inner = mkText('tabby');
    const blocks = [mkTabs('tabs', [{ id: 't1', blocks: [inner] }])];
    expect(findBlockById(blocks, 'tabby')?.id).toBe('tabby');
  });

  it('finds a block nested inside section', () => {
    const inner = mkText('secret');
    const blocks = [mkSection('sec', [inner])];
    expect(findBlockById(blocks, 'secret')?.id).toBe('secret');
  });

  it('finds blocks in deeply nested structures', () => {
    const deep = mkText('deep');
    const blocks = [
      mkSection('sec', [mkColumns('cols', [{ id: 'col', blocks: [mkTabs('tabs', [{ id: 'tab', blocks: [deep] }])] }])]),
    ];
    expect(findBlockById(blocks, 'deep')?.id).toBe('deep');
  });

  it('handles columns with no blocks array gracefully', () => {
    const malformed = {
      id: 'cols',
      type: 'columns',
      columns: [{ id: 'col', width: 50 }],
    } as unknown as Block;
    expect(findBlockById([malformed], 'whatever')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getAllBlocks
// ---------------------------------------------------------------------------

describe('getAllBlocks', () => {
  it('returns an empty array when given no blocks', () => {
    expect(getAllBlocks([])).toEqual([]);
  });

  it('returns top-level blocks unchanged when no nesting', () => {
    const blocks = [mkText('a'), mkText('b')];
    expect(getAllBlocks(blocks).map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('flattens columns children', () => {
    const blocks = [mkColumns('cols', [{ id: 'c1', blocks: [mkText('x'), mkText('y')] }])];
    const ids = getAllBlocks(blocks).map((b) => b.id);
    expect(ids).toContain('cols');
    expect(ids).toContain('x');
    expect(ids).toContain('y');
  });

  it('flattens tabs children', () => {
    const blocks = [mkTabs('tabs', [{ id: 't1', blocks: [mkText('z')] }])];
    expect(getAllBlocks(blocks).map((b) => b.id)).toEqual(['tabs', 'z']);
  });

  it('flattens section children', () => {
    const blocks = [mkSection('sec', [mkText('p'), mkText('q')])];
    expect(getAllBlocks(blocks).map((b) => b.id)).toEqual(['sec', 'p', 'q']);
  });

  it('flattens deeply nested structures', () => {
    const blocks = [
      mkSection('sec', [
        mkColumns('cols', [{ id: 'col', blocks: [mkTabs('tabs', [{ id: 't', blocks: [mkText('leaf')] }])] }]),
      ]),
    ];
    const ids = getAllBlocks(blocks).map((b) => b.id);
    expect(ids).toEqual(['sec', 'cols', 'tabs', 'leaf']);
  });
});

// ---------------------------------------------------------------------------
// findBlockPath
// ---------------------------------------------------------------------------

describe('findBlockPath', () => {
  it('returns null for top-level blocks (no container)', () => {
    const blocks = [mkText('a')];
    expect(findBlockPath(blocks, 'a')).toBeNull();
  });

  it('returns null when block is absent entirely', () => {
    const blocks = [mkColumns('cols', [{ id: 'c1', blocks: [mkText('x')] }])];
    expect(findBlockPath(blocks, 'ghost')).toBeNull();
  });

  it('finds path inside a columns block', () => {
    const blocks = [
      mkColumns('cols', [
        { id: 'c1', blocks: [mkText('x'), mkText('y')] },
        { id: 'c2', blocks: [mkText('z')] },
      ]),
    ];
    expect(findBlockPath(blocks, 'y')).toEqual({ containerId: 'cols', slotIndex: 0, blockIndex: 1 });
    expect(findBlockPath(blocks, 'z')).toEqual({ containerId: 'cols', slotIndex: 1, blockIndex: 0 });
  });

  it('finds path inside a tabs block', () => {
    const blocks = [
      mkTabs('tabs', [
        { id: 't1', blocks: [mkText('a')] },
        { id: 't2', blocks: [mkText('b'), mkText('c')] },
      ]),
    ];
    expect(findBlockPath(blocks, 'c')).toEqual({ containerId: 'tabs', slotIndex: 1, blockIndex: 1 });
  });

  it('finds path inside a section block with slotIndex 0', () => {
    const blocks = [mkSection('sec', [mkText('only')])];
    expect(findBlockPath(blocks, 'only')).toEqual({ containerId: 'sec', slotIndex: 0, blockIndex: 0 });
  });

  it('recursively finds path inside nested containers', () => {
    const blocks = [
      mkSection('outer-sec', [
        mkColumns('inner-cols', [{ id: 'inner-col', blocks: [mkText('leaf')] }]),
      ]),
    ];
    expect(findBlockPath(blocks, 'leaf')).toEqual({
      containerId: 'inner-cols',
      slotIndex: 0,
      blockIndex: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// removeBlockById
// ---------------------------------------------------------------------------

describe('removeBlockById', () => {
  it('removes a top-level block', () => {
    const blocks = [mkText('a'), mkText('b'), mkText('c')];
    const result = removeBlockById(blocks, 'b');
    expect(result.map((b) => b.id)).toEqual(['a', 'c']);
  });

  it('returns the same blocks if id is not present', () => {
    const blocks = [mkText('a'), mkText('b')];
    const result = removeBlockById(blocks, 'missing');
    expect(result.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('removes a block nested inside columns', () => {
    const blocks = [mkColumns('cols', [{ id: 'c1', blocks: [mkText('x'), mkText('y')] }])];
    const result = removeBlockById(blocks, 'x') as unknown as Array<{
      columns: Array<{ blocks: Block[] }>;
    }>;
    expect(result[0].columns[0].blocks.map((b) => b.id)).toEqual(['y']);
  });

  it('removes a block nested inside tabs', () => {
    const blocks = [mkTabs('tabs', [{ id: 't1', blocks: [mkText('x'), mkText('y')] }])];
    const result = removeBlockById(blocks, 'y') as unknown as Array<{
      tabs: Array<{ blocks: Block[] }>;
    }>;
    expect(result[0].tabs[0].blocks.map((b) => b.id)).toEqual(['x']);
  });

  it('removes a block nested inside a section', () => {
    const blocks = [mkSection('sec', [mkText('p'), mkText('q')])];
    const result = removeBlockById(blocks, 'p') as unknown as Array<{ blocks: Block[] }>;
    expect(result[0].blocks.map((b) => b.id)).toEqual(['q']);
  });

  it('does not affect siblings of the same id at a deeper level', () => {
    const blocks = [mkText('keep'), mkSection('sec', [mkText('drop')])];
    const result = removeBlockById(blocks, 'drop');
    expect(result.map((b) => b.id)).toEqual(['keep', 'sec']);
    expect(
      (result[1] as unknown as { blocks: Block[] }).blocks.map((b) => b.id),
    ).toEqual([]);
  });

  it('returns a new array (immutability)', () => {
    const blocks = [mkText('a')];
    const result = removeBlockById(blocks, 'a');
    expect(result).not.toBe(blocks);
  });
});

// ---------------------------------------------------------------------------
// insertBlockInContainer
// ---------------------------------------------------------------------------

describe('insertBlockInContainer', () => {
  it('inserts into a columns container at the given slot/index', () => {
    const blocks = [mkColumns('cols', [{ id: 'c1', blocks: [mkText('x')] }])];
    const inserted = mkText('new');
    const result = insertBlockInContainer(blocks, 'cols', 0, 1, inserted) as unknown as Array<{
      columns: Array<{ blocks: Block[] }>;
    }>;
    expect(result[0].columns[0].blocks.map((b) => b.id)).toEqual(['x', 'new']);
  });

  it('inserts at index 0 (beginning) of a column slot', () => {
    const blocks = [mkColumns('cols', [{ id: 'c1', blocks: [mkText('x')] }])];
    const inserted = mkText('new');
    const result = insertBlockInContainer(blocks, 'cols', 0, 0, inserted) as unknown as Array<{
      columns: Array<{ blocks: Block[] }>;
    }>;
    expect(result[0].columns[0].blocks.map((b) => b.id)).toEqual(['new', 'x']);
  });

  it('only inserts into the targeted slot of columns', () => {
    const blocks = [
      mkColumns('cols', [
        { id: 'c1', blocks: [mkText('a')] },
        { id: 'c2', blocks: [mkText('b')] },
      ]),
    ];
    const inserted = mkText('new');
    const result = insertBlockInContainer(blocks, 'cols', 1, 0, inserted) as unknown as Array<{
      columns: Array<{ blocks: Block[] }>;
    }>;
    expect(result[0].columns[0].blocks.map((b) => b.id)).toEqual(['a']);
    expect(result[0].columns[1].blocks.map((b) => b.id)).toEqual(['new', 'b']);
  });

  it('inserts into a tabs container at the given slot/index', () => {
    const blocks = [mkTabs('tabs', [{ id: 't1', blocks: [mkText('x')] }])];
    const inserted = mkText('new');
    const result = insertBlockInContainer(blocks, 'tabs', 0, 1, inserted) as unknown as Array<{
      tabs: Array<{ blocks: Block[] }>;
    }>;
    expect(result[0].tabs[0].blocks.map((b) => b.id)).toEqual(['x', 'new']);
  });

  it('inserts into a section container', () => {
    const blocks = [mkSection('sec', [mkText('a')])];
    const inserted = mkText('new');
    const result = insertBlockInContainer(blocks, 'sec', 0, 1, inserted) as unknown as Array<{
      blocks: Block[];
    }>;
    expect(result[0].blocks.map((b) => b.id)).toEqual(['a', 'new']);
  });

  it('recurses into nested containers to find target', () => {
    const blocks = [mkSection('outer', [mkSection('inner', [mkText('x')])])];
    const inserted = mkText('new');
    const result = insertBlockInContainer(blocks, 'inner', 0, 1, inserted) as unknown as Array<{
      blocks: Array<{ blocks: Block[] }>;
    }>;
    expect(result[0].blocks[0].blocks.map((b) => b.id)).toEqual(['x', 'new']);
  });

  it('returns a new array (does not mutate input)', () => {
    const blocks = [mkSection('sec', [mkText('a')])];
    const result = insertBlockInContainer(blocks, 'sec', 0, 0, mkText('new'));
    expect(result).not.toBe(blocks);
  });

  it('inserts at an out-of-range index by appending at end', () => {
    const blocks = [mkSection('sec', [mkText('a')])];
    const result = insertBlockInContainer(blocks, 'sec', 0, 99, mkText('new')) as unknown as Array<{
      blocks: Block[];
    }>;
    expect(result[0].blocks.map((b) => b.id)).toEqual(['a', 'new']);
  });

  it('leaves blocks untouched when containerId not present', () => {
    const blocks = [mkSection('sec', [mkText('a')])];
    const result = insertBlockInContainer(blocks, 'missing', 0, 0, mkText('new')) as unknown as Array<{
      blocks: Block[];
    }>;
    expect(result[0].blocks.map((b) => b.id)).toEqual(['a']);
  });
});

// ---------------------------------------------------------------------------
// insertBlockAfter
// ---------------------------------------------------------------------------

describe('insertBlockAfter', () => {
  it('inserts a block after a top-level target', () => {
    const blocks = [mkText('a'), mkText('b')];
    const result = insertBlockAfter(blocks, 'a', mkText('new'));
    expect(result.map((b) => b.id)).toEqual(['a', 'new', 'b']);
  });

  it('inserts at the end when target is the last block', () => {
    const blocks = [mkText('a'), mkText('b')];
    const result = insertBlockAfter(blocks, 'b', mkText('new'));
    expect(result.map((b) => b.id)).toEqual(['a', 'b', 'new']);
  });

  it('returns the blocks unchanged when target id is missing', () => {
    const blocks = [mkText('a'), mkText('b')];
    const result = insertBlockAfter(blocks, 'missing', mkText('new'));
    expect(result.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('inserts after a target nested inside columns', () => {
    const blocks = [mkColumns('cols', [{ id: 'c1', blocks: [mkText('x'), mkText('y')] }])];
    const result = insertBlockAfter(blocks, 'x', mkText('new')) as unknown as Array<{
      columns: Array<{ blocks: Block[] }>;
    }>;
    expect(result[0].columns[0].blocks.map((b) => b.id)).toEqual(['x', 'new', 'y']);
  });

  it('inserts after a target nested inside tabs', () => {
    const blocks = [mkTabs('tabs', [{ id: 't1', blocks: [mkText('x')] }])];
    const result = insertBlockAfter(blocks, 'x', mkText('new')) as unknown as Array<{
      tabs: Array<{ blocks: Block[] }>;
    }>;
    expect(result[0].tabs[0].blocks.map((b) => b.id)).toEqual(['x', 'new']);
  });

  it('inserts after a target nested inside a section', () => {
    const blocks = [mkSection('sec', [mkText('a'), mkText('b')])];
    const result = insertBlockAfter(blocks, 'a', mkText('new')) as unknown as Array<{
      blocks: Block[];
    }>;
    expect(result[0].blocks.map((b) => b.id)).toEqual(['a', 'new', 'b']);
  });

  it('preserves container structure when inserting deeply', () => {
    const blocks = [
      mkSection('outer', [mkColumns('inner-cols', [{ id: 'c1', blocks: [mkText('x')] }])]),
    ];
    const result = insertBlockAfter(blocks, 'x', mkText('new')) as unknown as Array<{
      blocks: Array<{ columns: Array<{ blocks: Block[] }> }>;
    }>;
    expect(result[0].blocks[0].columns[0].blocks.map((b) => b.id)).toEqual(['x', 'new']);
  });

  it('returns a new array (immutability)', () => {
    const blocks = [mkText('a')];
    const result = insertBlockAfter(blocks, 'a', mkText('new'));
    expect(result).not.toBe(blocks);
  });
});

// ---------------------------------------------------------------------------
// updateBlockById
// ---------------------------------------------------------------------------

describe('updateBlockById', () => {
  it('applies partial updates to a top-level block', () => {
    const blocks = [mkText('a', 'old')];
    const result = updateBlockById(blocks, 'a', { content: 'new' } as Partial<Block>);
    expect((result[0] as unknown as { content: string }).content).toBe('new');
  });

  it('preserves untouched fields when applying a partial update', () => {
    const blocks = [mkHeading('h1', 'Hello')];
    const result = updateBlockById(blocks, 'h1', { content: 'Updated' } as Partial<Block>);
    expect((result[0] as unknown as { content: string }).content).toBe('Updated');
    expect((result[0] as unknown as { level: number }).level).toBe(2);
  });

  it('leaves blocks untouched when id is missing', () => {
    const blocks = [mkText('a', 'keep')];
    const result = updateBlockById(blocks, 'missing', { content: 'x' } as Partial<Block>);
    expect((result[0] as unknown as { content: string }).content).toBe('keep');
  });

  it('updates a block nested inside columns', () => {
    const blocks = [mkColumns('cols', [{ id: 'c1', blocks: [mkText('inner', 'old')] }])];
    const result = updateBlockById(blocks, 'inner', { content: 'new' } as Partial<Block>) as unknown as Array<{
      columns: Array<{ blocks: Array<{ content: string }> }>;
    }>;
    expect(result[0].columns[0].blocks[0].content).toBe('new');
  });

  it('updates a block nested inside tabs', () => {
    const blocks = [mkTabs('tabs', [{ id: 't1', blocks: [mkText('inner', 'old')] }])];
    const result = updateBlockById(blocks, 'inner', { content: 'new' } as Partial<Block>) as unknown as Array<{
      tabs: Array<{ blocks: Array<{ content: string }> }>;
    }>;
    expect(result[0].tabs[0].blocks[0].content).toBe('new');
  });

  it('updates a block nested inside a section', () => {
    const blocks = [mkSection('sec', [mkText('inner', 'old')])];
    const result = updateBlockById(blocks, 'inner', { content: 'new' } as Partial<Block>) as unknown as Array<{
      blocks: Array<{ content: string }>;
    }>;
    expect(result[0].blocks[0].content).toBe('new');
  });

  it('updates a deeply nested block', () => {
    const blocks = [
      mkSection('outer', [
        mkColumns('cols', [{ id: 'c1', blocks: [mkTabs('tabs', [{ id: 't1', blocks: [mkText('deep', 'old')] }])] }]),
      ]),
    ];
    const result = updateBlockById(blocks, 'deep', { content: 'fresh' } as Partial<Block>);
    const updated = (result[0] as unknown as {
      blocks: Array<{
        columns: Array<{
          blocks: Array<{ tabs: Array<{ blocks: Array<{ content: string }> }> }>;
        }>;
      }>;
    }).blocks[0].columns[0].blocks[0].tabs[0].blocks[0];
    expect(updated.content).toBe('fresh');
  });

  it('returns a new array (immutability)', () => {
    const blocks = [mkText('a')];
    const result = updateBlockById(blocks, 'a', { content: 'x' } as Partial<Block>);
    expect(result).not.toBe(blocks);
  });

  it('handles an empty update partial', () => {
    const blocks = [mkText('a', 'hello')];
    const result = updateBlockById(blocks, 'a', {} as Partial<Block>);
    expect((result[0] as unknown as { content: string }).content).toBe('hello');
  });
});
