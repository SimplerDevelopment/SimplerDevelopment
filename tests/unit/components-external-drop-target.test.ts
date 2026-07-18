// @vitest-environment jsdom
/**
 * Unit tests for the pure external-drop helpers extracted from
 * EditableBlockRenderer (VEQA-011): `findExternalDropTarget` (container
 * hit-test + top-level Y fallback), `createExternalDropBlock`, and
 * `applyExternalDrop`. DOM geometry is stubbed via getBoundingClientRect
 * mocks so each hit-test case is deterministic under jsdom.
 */

import { describe, it, expect } from 'vitest';
import {
  findExternalDropTarget,
  createExternalDropBlock,
  applyExternalDrop,
  type ExternalDropTarget,
} from '@/components/blocks/render/externalDropTarget';
import type { Block } from '@/types/blocks';

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function containerZone(root: HTMLElement, dropId: string, r: DOMRect) {
  const el = document.createElement('div');
  el.setAttribute('data-container-drop-id', dropId);
  el.getBoundingClientRect = () => r;
  root.appendChild(el);
  return el;
}

function topLevelSlot(root: HTMLElement, index: number, r: DOMRect) {
  const el = document.createElement('div');
  el.setAttribute('data-toplevel-slot', String(index));
  el.getBoundingClientRect = () => r;
  root.appendChild(el);
  return el;
}

function makeRoot() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  return root;
}

// ---------------------------------------------------------------------------
// findExternalDropTarget
// ---------------------------------------------------------------------------

describe('findExternalDropTarget', () => {
  it('returns a container target when the cursor is inside a container drop zone', () => {
    const root = makeRoot();
    containerZone(root, 'sec1:0', rect(10, 10, 100, 40));
    topLevelSlot(root, 0, rect(0, 0, 300, 200));

    const target = findExternalDropTarget(root, 50, 30, 1);
    expect(target).toEqual({ kind: 'container', containerId: 'sec1', slotIndex: 0 });
    root.remove();
  });

  it('parses the slot index from the LAST colon so container ids containing colons survive', () => {
    const root = makeRoot();
    containerZone(root, 'block:weird:id:2', rect(0, 0, 50, 50));

    const target = findExternalDropTarget(root, 10, 10, 0);
    expect(target).toEqual({ kind: 'container', containerId: 'block:weird:id', slotIndex: 2 });
    root.remove();
  });

  it('prefers the first matching container zone when zones overlap', () => {
    const root = makeRoot();
    containerZone(root, 'outer:0', rect(0, 0, 200, 200));
    containerZone(root, 'inner:1', rect(50, 50, 50, 50));

    const target = findExternalDropTarget(root, 60, 60, 0);
    expect(target).toEqual({ kind: 'container', containerId: 'outer', slotIndex: 0 });
    root.remove();
  });

  it('falls back to top-level index 0 when cursor is above the first block midpoint', () => {
    const root = makeRoot();
    containerZone(root, 'sec1:0', rect(500, 500, 50, 50)); // far away — no hit
    topLevelSlot(root, 0, rect(0, 100, 300, 100)); // mid = 150
    topLevelSlot(root, 1, rect(0, 200, 300, 100)); // mid = 250

    const target = findExternalDropTarget(root, 10, 120, 2);
    expect(target).toEqual({ kind: 'top-level', index: 0 });
    root.remove();
  });

  it('falls back to a middle top-level index based on cursor Y', () => {
    const root = makeRoot();
    topLevelSlot(root, 0, rect(0, 0, 300, 100)); // mid = 50
    topLevelSlot(root, 1, rect(0, 100, 300, 100)); // mid = 150

    const target = findExternalDropTarget(root, 10, 120, 2);
    expect(target).toEqual({ kind: 'top-level', index: 1 });
    root.remove();
  });

  it('appends at the end when cursor is below every block midpoint', () => {
    const root = makeRoot();
    topLevelSlot(root, 0, rect(0, 0, 300, 100));
    topLevelSlot(root, 1, rect(0, 100, 300, 100));

    const target = findExternalDropTarget(root, 10, 9999, 2);
    expect(target).toEqual({ kind: 'top-level', index: 2 });
    root.remove();
  });

  it('returns top-level index 0 when there are no slots at all', () => {
    const root = makeRoot();
    const target = findExternalDropTarget(root, 10, 10, 0);
    expect(target).toEqual({ kind: 'top-level', index: 0 });
    root.remove();
  });

  it('misses a container zone when the cursor is outside its rect', () => {
    const root = makeRoot();
    containerZone(root, 'sec1:0', rect(0, 0, 50, 50));
    topLevelSlot(root, 0, rect(0, 0, 300, 200)); // mid = 100

    const target = findExternalDropTarget(root, 200, 10, 1);
    expect(target).toEqual({ kind: 'top-level', index: 0 });
    root.remove();
  });
});

// ---------------------------------------------------------------------------
// createExternalDropBlock
// ---------------------------------------------------------------------------

describe('createExternalDropBlock', () => {
  it('creates typed defaults (heading)', () => {
    const b = createExternalDropBlock('heading', 3) as any;
    expect(b.type).toBe('heading');
    expect(b.order).toBe(3);
    expect(b.content).toBe('New Heading');
    expect(b.level).toBe(2);
    expect(b.id).toMatch(/^block-/);
  });

  it('creates a columns block with two empty 50% columns', () => {
    const b = createExternalDropBlock('columns', 0) as any;
    expect(b.columns).toHaveLength(2);
    expect(b.columns.every((c: any) => c.width === 50 && c.blocks.length === 0)).toBe(true);
    expect(b.gap).toBe('md');
  });

  it('creates a section block with an empty blocks array', () => {
    const b = createExternalDropBlock('section', 0) as any;
    expect(b.blocks).toEqual([]);
  });

  it('generates unique ids across calls', () => {
    const a = createExternalDropBlock('text', 0);
    const b = createExternalDropBlock('text', 0);
    expect(a.id).not.toBe(b.id);
  });
});

// ---------------------------------------------------------------------------
// applyExternalDrop
// ---------------------------------------------------------------------------

describe('applyExternalDrop', () => {
  const newBlock = { id: 'new', type: 'text', order: 0, content: 'n' } as Block;

  it('splices into the top-level array at the target index', () => {
    const blocks = [
      { id: 'a', type: 'text', order: 0, content: 'a' },
      { id: 'b', type: 'text', order: 1, content: 'b' },
    ] as Block[];
    const target: ExternalDropTarget = { kind: 'top-level', index: 1 };
    const updated = applyExternalDrop(blocks, target, newBlock);
    expect(updated.map((b) => b.id)).toEqual(['a', 'new', 'b']);
    // Input untouched.
    expect(blocks.map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('appends into a section container', () => {
    const blocks = [
      { id: 'sec', type: 'section', order: 0, blocks: [{ id: 'old', type: 'text', order: 0, content: 'o' }] },
    ] as Block[];
    const target: ExternalDropTarget = { kind: 'container', containerId: 'sec', slotIndex: 0 };
    const updated = applyExternalDrop(blocks, target, newBlock) as any[];
    expect(updated).toHaveLength(1);
    expect(updated[0].blocks.map((b: any) => b.id)).toEqual(['old', 'new']);
  });

  it('appends into the correct column slot', () => {
    const blocks = [
      {
        id: 'cols',
        type: 'columns',
        order: 0,
        columns: [
          { id: 'c1', width: 50, blocks: [] },
          { id: 'c2', width: 50, blocks: [] },
        ],
      },
    ] as unknown as Block[];
    const target: ExternalDropTarget = { kind: 'container', containerId: 'cols', slotIndex: 1 };
    const updated = applyExternalDrop(blocks, target, newBlock) as any[];
    expect(updated[0].columns[0].blocks).toHaveLength(0);
    expect(updated[0].columns[1].blocks.map((b: any) => b.id)).toEqual(['new']);
  });

  it('reaches containers nested inside other containers', () => {
    const blocks = [
      {
        id: 'outer',
        type: 'section',
        order: 0,
        blocks: [{ id: 'inner', type: 'section', order: 0, blocks: [] }],
      },
    ] as unknown as Block[];
    const target: ExternalDropTarget = { kind: 'container', containerId: 'inner', slotIndex: 0 };
    const updated = applyExternalDrop(blocks, target, newBlock) as any[];
    expect(updated[0].blocks[0].blocks.map((b: any) => b.id)).toEqual(['new']);
  });
});
