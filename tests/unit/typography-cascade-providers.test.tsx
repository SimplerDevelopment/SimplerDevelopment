// @vitest-environment jsdom
/**
 * Unit tests for VEQA-032 step 2 — the section + columns container renderers
 * PROVIDING the typography cascade context, in both the production render
 * tree and the editor-canvas mirror.
 *
 * No leaf consumes the cascade yet (that's step 3), so these tests prove the
 * plumbing only: a probe leaf calls `useResolvedTypography` directly (the
 * same hook a real leaf will call in step 3) and we assert what it resolves
 * to when planted under real SectionBlockRender / ColumnsBlockRender trees,
 * and under the editor canvas's `ContainerBlockRenderer` mirror inside
 * `EditableBlockRenderer`.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useResolvedTypography } from '@/components/blocks/render/typography-cascade';
import type { TypographyStyleSource } from '@/components/blocks/render/typography-cascade';

// SectionBlockRender/ColumnsBlockRender eagerly pull in blog-posts /
// booking-menu render chains that touch the DB at module load — same stub
// sectionBlockRenderStaticSpacing.test.tsx uses.
vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/index', () => ({ db: {} }));
vi.mock('@/lib/actions/blog', () => ({
  getRecentPosts: async () => [],
  getPostsByCategory: async () => [],
  getPostsByTag: async () => [],
}));

// The only leaf we plant in test fixtures is 'text' — replace it with a
// probe that reports what useResolvedTypography sees, formatted as plain
// text so assertions can just read textContent. Every other leaf/container
// in these fixtures is the real, unmocked component (proven viable by
// sectionBlockRenderStaticSpacing.test.tsx, which renders SectionBlockRender
// with only the DB mocks above).
vi.mock('@/components/blocks/render/TextBlockRender', () => ({
  TextBlockRender: ({ block }: { block: TypographyStyleSource & { id: string } }) => {
    const resolved = useResolvedTypography(block);
    return (
      <div data-testid={`probe-${block.id}`}>
        {`color=${resolved.color.value ?? 'undefined'}(${resolved.color.source}) ` +
          `fontSize=${resolved.fontSize.value ?? 'undefined'}(${resolved.fontSize.source})`}
      </div>
    );
  },
}));

import { SectionBlockRender } from '@/components/blocks/render/SectionBlockRender';
import { ColumnsBlockRender } from '@/components/blocks/render/ColumnsBlockRender';
import type { SectionBlock, ColumnsBlock } from '@/types/blocks';

function textLeaf(id: string) {
  return { id, type: 'text' as const, order: 0, content: 'x' };
}

describe('SectionBlockRender (production) — provides the typography cascade', () => {
  it('a section with typography set reaches a leaf nested directly inside it', () => {
    const block: SectionBlock = {
      id: 'sec1',
      type: 'section',
      order: 0,
      style: { color: 'section-red', fontSize: 'section-16px' },
      blocks: [textLeaf('leaf1')],
    } as SectionBlock;
    render(<SectionBlockRender block={block} />);
    expect(screen.getByTestId('probe-leaf1').textContent).toBe(
      'color=section-red(ancestor) fontSize=section-16px(ancestor)'
    );
  });

  it('nested section -> columns -> leaf: the innermost ancestor (columns) wins', () => {
    const inner: ColumnsBlock = {
      id: 'cols1',
      type: 'columns',
      order: 0,
      style: { fontSize: 'column-20px' },
      columns: [{ id: 'c1', width: 100, blocks: [textLeaf('leaf2')] }],
    } as ColumnsBlock;
    const outer: SectionBlock = {
      id: 'sec2',
      type: 'section',
      order: 0,
      style: { color: 'section-red', fontSize: 'section-16px' },
      blocks: [inner],
    } as SectionBlock;
    render(<SectionBlockRender block={outer} />);
    // fontSize set by BOTH ancestors -> leaf must see the innermost (columns).
    // color only set by the outer section -> must still reach the leaf.
    expect(screen.getByTestId('probe-leaf2').textContent).toBe(
      'color=section-red(ancestor) fontSize=column-20px(ancestor)'
    );
  });

  it('a section with NO typography set mounts no provider — the leaf sees no ancestor typography', () => {
    const block: SectionBlock = {
      id: 'sec3',
      type: 'section',
      order: 0,
      blocks: [textLeaf('leaf3')],
    } as SectionBlock;
    render(<SectionBlockRender block={block} />);
    expect(screen.getByTestId('probe-leaf3').textContent).toBe(
      'color=undefined(none) fontSize=undefined(none)'
    );
  });
});

describe('ColumnsBlockRender (production) — provides the typography cascade', () => {
  it('a columns block with typography set reaches a leaf nested inside a column', () => {
    const block: ColumnsBlock = {
      id: 'cols2',
      type: 'columns',
      order: 0,
      style: { color: 'column-blue' },
      columns: [{ id: 'c1', width: 100, blocks: [textLeaf('leaf4')] }],
    } as ColumnsBlock;
    render(<ColumnsBlockRender block={block} />);
    expect(screen.getByTestId('probe-leaf4').textContent).toContain('color=column-blue(ancestor)');
  });

  it('a columns block with NO typography set mounts no provider', () => {
    const block: ColumnsBlock = {
      id: 'cols3',
      type: 'columns',
      order: 0,
      columns: [{ id: 'c1', width: 100, blocks: [textLeaf('leaf5')] }],
    } as ColumnsBlock;
    render(<ColumnsBlockRender block={block} />);
    expect(screen.getByTestId('probe-leaf5').textContent).toBe(
      'color=undefined(none) fontSize=undefined(none)'
    );
  });
});

// ---------------------------------------------------------------------------
// Editor canvas mirror: EditableBlockRenderer's `ContainerBlockRenderer`.
//
// The editor canvas can't wrap the production SectionBlockRender/
// ColumnsBlockRender with drop-zone chrome, so it hand-duplicates their
// box-model styling in a private `ContainerBlockRenderer` function (see the
// "mirrors ...BlockRender" comments in EditableBlockRenderer.tsx) — it does
// NOT delegate to the production components. For typography specifically,
// though, both trees call the exact same shared `ContainerTypography` helper
// (components/blocks/render/typography-cascade.tsx) at their respective
// call sites, so cascade behavior is identical by construction even though
// the surrounding chrome is a separate copy. The mount below proves that
// behaviorally: the editor tree resolves typography the same way production
// does for an equivalent block structure.
// ---------------------------------------------------------------------------
describe('EditableBlockRenderer (editor canvas) — mirrors provide the typography cascade', () => {
  // Deliberately NOT calling vi.resetModules(): EditableBlockRenderer must be
  // dynamically imported using the SAME `typography-cascade` module instance
  // the probe's `useResolvedTypography` (imported statically above) is bound
  // to — resetModules() would make the dynamic import re-evaluate a fresh
  // copy with a distinct `TypographyCascadeContext` object identity, so a
  // provider mounted in one instance would never be visible to a consumer
  // reading the other. Every other module used only in this describe block
  // (registry, dnd-kit, editor-mode-context, ...) has not been imported
  // anywhere earlier in this file, so doMock intercepts their first import
  // without needing a reset.
  vi.doMock('@/lib/visual-editor/protocol', () => ({ sendToParent: vi.fn() }));
  // Static-template chrome is irrelevant here (typeTemplate stays null) —
  // stub it out rather than pull its full leaf-renderer import chain.
  vi.doMock('@/components/blocks/render/BlockRenderer', () => ({
    BlockRenderer: () => null,
  }));
  vi.doMock('@/components/blocks/render/BlockStyleWrapper', () => ({
    BlockStyleWrapper: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }));
  vi.doMock('@/components/visual-editor/SelectableBlock', () => ({
    SelectableBlock: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }));
  let mockEditorState: any;
  vi.doMock('@/components/visual-editor/editor-mode-context', () => ({
    useEditorModeContext: () => mockEditorState,
  }));
  vi.doMock('@/lib/visual-editor/post-content-slot', () => ({
    PostContentSlotProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }));
  vi.doMock('@dnd-kit/core', () => ({
    DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    pointerWithin: vi.fn(),
    MouseSensor: {},
    TouchSensor: {},
    useSensor: (sensor: any, opts: any) => ({ sensor, opts }),
    useSensors: (...args: any[]) => args,
    useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
  }));
  vi.doMock('@dnd-kit/sortable', () => ({
    SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useSortable: () => ({ setNodeRef: () => {}, attributes: {}, listeners: {}, isDragging: false }),
  }));
  // Registry: every leaf renders via the real registry EXCEPT 'text', which
  // is the same probe used against the production trees above.
  vi.doMock('@/lib/visual-editor/registry', () => ({
    getBlockRegistry: () => ({
      get: (type: string) => {
        if (type === 'text') {
          return function ProbeLeaf({ block }: { block: TypographyStyleSource & { id: string } }) {
            const resolved = useResolvedTypography(block);
            return (
              <div data-testid={`probe-${block.id}`}>
                {`color=${resolved.color.value ?? 'undefined'}(${resolved.color.source}) ` +
                  `fontSize=${resolved.fontSize.value ?? 'undefined'}(${resolved.fontSize.source})`}
              </div>
            );
          };
        }
        // SortableBlock/NestedSortableBlock gate on `registry.get(type)` being
        // truthy BEFORE branching into the container path — section/columns
        // never actually render via this Component (ContainerBlockRenderer
        // takes over), but the lookup must still return something non-null.
        if (type === 'section' || type === 'columns' || type === 'tabs') {
          return function UnusedContainerPlaceholder() { return null; };
        }
        return null;
      },
    }),
  }));

  function makeEditorState(overrides: Record<string, any>) {
    return {
      active: true,
      blocks: [] as any[],
      selectedBlockId: null,
      selectedBlockIds: [],
      hoveredBlockId: null,
      externalDrag: { active: false, blockType: null, x: 0, y: 0 },
      typeTemplate: null,
      onBlockClicked: vi.fn(),
      onBlockHovered: vi.fn(),
      onBlocksReordered: vi.fn(),
      onAddBlockAfter: vi.fn(),
      onBlockResized: vi.fn(),
      onBlockStyleUpdated: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn(),
      canUndo: false,
      canRedo: false,
      ...overrides,
    };
  }

  it('nested section -> columns -> leaf resolves the innermost ancestor value, same as production', async () => {
    const { EditableBlockRenderer } = await import('@/components/blocks/render/EditableBlockRenderer');
    mockEditorState = makeEditorState({
      blocks: [
        {
          id: 'esec1',
          type: 'section',
          order: 0,
          style: { color: 'section-red', fontSize: 'section-16px' },
          blocks: [
            {
              id: 'ecols1',
              type: 'columns',
              order: 0,
              style: { fontSize: 'column-20px' },
              columns: [{ id: 'c1', width: 100, blocks: [{ id: 'eleaf1', type: 'text', order: 0, content: 'x' }] }],
            },
          ],
        },
      ],
    });
    render(<EditableBlockRenderer content={JSON.stringify({ blocks: [], version: '1.0' })} />);
    expect(screen.getByTestId('probe-eleaf1').textContent).toBe(
      'color=section-red(ancestor) fontSize=column-20px(ancestor)'
    );
  });

  it('a columns block with NO typography set mounts no provider in the editor canvas', async () => {
    const { EditableBlockRenderer } = await import('@/components/blocks/render/EditableBlockRenderer');
    mockEditorState = makeEditorState({
      blocks: [
        {
          id: 'ecols2',
          type: 'columns',
          order: 0,
          columns: [{ id: 'c1', width: 100, blocks: [{ id: 'eleaf2', type: 'text', order: 0, content: 'x' }] }],
        },
      ],
    });
    render(<EditableBlockRenderer content={JSON.stringify({ blocks: [], version: '1.0' })} />);
    expect(screen.getByTestId('probe-eleaf2').textContent).toBe(
      'color=undefined(none) fontSize=undefined(none)'
    );
  });
});
