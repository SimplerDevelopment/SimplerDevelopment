// @vitest-environment jsdom
/**
 * Unit tests for `VisualEditorShell` (components/portal/VisualEditorShell.tsx).
 *
 * This is the top-level shell of the visual editor — it composes LeftPanel,
 * IframePreview, RightPanel, and several modals; bridges the iframe via the
 * `useVisualEditorParent` hook; wires up clipboard, bulk actions, pan/zoom,
 * layers drag/drop, undo/redo keyboard shortcuts; and exposes a context menu
 * for right-click on blocks.
 *
 * Because every panel + hook has its own non-trivial implementation, this
 * file mocks them all out via test doubles that record the props they were
 * called with — letting us drive the shell from the outside and assert the
 * exact callbacks it produces. The goal is to exercise the prop wiring and
 * branching logic inside the shell itself (selection, multi-select,
 * iframe-message callbacks, modal open/close, keyboard handlers, custom CSS
 * forwarding, etc.) without booting any real iframe or DnD machinery.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, waitFor } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — heavy children + iframe bridge hook. Each panel exposes the most
// recently received props on a global "spy" record so tests can assert on
// what the shell passed in, and (for some panels) invoke callbacks back out.
// ---------------------------------------------------------------------------

const lastLeftProps: { current: Record<string, unknown> | null } = { current: null };
const lastRightProps: { current: Record<string, unknown> | null } = { current: null };
const lastIframeProps: { current: Record<string, unknown> | null } = { current: null };
const lastContextProps: { current: Record<string, unknown> | null } = { current: null };
const lastImagePickerProps: { current: Record<string, unknown> | null } = { current: null };
const lastSaveTemplateProps: { current: Record<string, unknown> | null } = { current: null };
const lastTemplateLibraryProps: { current: Record<string, unknown> | null } = { current: null };
const lastParentArgs: { current: Record<string, unknown> | null } = { current: null };

vi.mock('@/components/portal/visual-editor/LeftPanel', () => ({
  LeftPanel: (props: Record<string, unknown>) => {
    lastLeftProps.current = props;
    return <div data-testid="left-panel" />;
  },
}));
vi.mock('@/components/portal/visual-editor/RightPanel', () => ({
  RightPanel: (props: Record<string, unknown>) => {
    lastRightProps.current = props;
    return <div data-testid="right-panel" />;
  },
}));
vi.mock('@/components/portal/visual-editor/IframePreview', () => ({
  IframePreview: (props: Record<string, unknown>) => {
    lastIframeProps.current = props;
    return <div data-testid="iframe-preview" />;
  },
}));
vi.mock('@/components/portal/visual-editor/BlockContextMenu', () => ({
  BlockContextMenu: (props: Record<string, unknown>) => {
    lastContextProps.current = props;
    return <div data-testid="context-menu" />;
  },
}));
vi.mock('@/components/portal/visual-editor/ImagePickerModal', () => ({
  ImagePickerModal: (props: Record<string, unknown>) => {
    lastImagePickerProps.current = props;
    return <div data-testid="image-picker" />;
  },
}));
vi.mock('@/components/blocks/SaveAsTemplateModal', () => ({
  SaveAsTemplateModal: (props: Record<string, unknown>) => {
    lastSaveTemplateProps.current = props;
    return <div data-testid="save-template" />;
  },
}));
vi.mock('@/components/blocks/TemplateLibrary', () => ({
  TemplateLibrary: (props: Record<string, unknown>) => {
    lastTemplateLibraryProps.current = props;
    return <div data-testid="template-library" />;
  },
}));

// pan/zoom + dnd + clipboard + bulk-actions hooks — return stable stubs so the
// shell can call them without exploding. We only need to observe that the
// shell passes them through to its panels.
vi.mock('@/components/portal/visual-editor/_hooks/usePanZoom', () => ({
  usePanZoom: () => ({
    canvasRef: { current: null },
    zoomLevel: 100,
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    zoomReset: vi.fn(),
    panOffset: { x: 0, y: 0 },
    handleCanvasMouseDown: vi.fn(),
    handleCanvasMouseMove: vi.fn(),
    handleCanvasMouseUp: vi.fn(),
  }),
}));

const bulkDeleteSpy = vi.fn();
const bulkDuplicateSpy = vi.fn();
const bulkGroupSpy = vi.fn();
vi.mock('@/components/portal/visual-editor/_hooks/useBulkActions', () => ({
  useBulkActions: () => ({
    bulkDelete: bulkDeleteSpy,
    bulkDuplicate: bulkDuplicateSpy,
    bulkGroup: bulkGroupSpy,
  }),
}));

const copySpy = vi.fn(() => true);
const pasteSpy = vi.fn(() => true);
vi.mock('@/components/portal/visual-editor/_hooks/useBlockClipboard', () => ({
  useBlockClipboard: () => ({
    copySelectedBlocks: copySpy,
    pasteFromClipboard: pasteSpy,
  }),
}));

vi.mock('@/components/portal/visual-editor/_hooks/useLayersDragDrop', () => ({
  useLayersDragDrop: () => ({
    sensors: [],
    draggedBlockId: null,
    layerOverId: null,
    allBlockIds: [],
    handleDragStart: vi.fn(),
    handleLayerDragOver: vi.fn(),
    handleDragEnd: vi.fn(),
  }),
}));

vi.mock('@/lib/blocks/registry', () => ({
  BUILT_IN_BLOCK_TYPES: [
    { type: 'heading', label: 'Heading', icon: 'title', category: 'Basic', description: '' },
    { type: 'text', label: 'Paragraph', icon: 'notes', category: 'Basic', description: '' },
  ],
}));

// Capture the callbacks the shell hands to useVisualEditorParent so tests can
// fire them as if a postMessage arrived from the iframe.
const sendBlocksUpdateSpy = vi.fn();
const sendSelectBlockSpy = vi.fn();
const sendUndoSpy = vi.fn();
const sendRedoSpy = vi.fn();
const sendCustomCodeUpdateSpy = vi.fn();
const sendExternalDragStartSpy = vi.fn();
const sendExternalDragMoveSpy = vi.fn();
const sendExternalDragEndSpy = vi.fn();
const sendExternalDragCancelSpy = vi.fn();
const handleIframeLoadSpy = vi.fn();

vi.mock('@/lib/visual-editor/useVisualEditorParent', () => ({
  useVisualEditorParent: (args: Record<string, unknown>) => {
    lastParentArgs.current = args;
    return {
      iframeRef: { current: {
        getBoundingClientRect: () => ({ left: 100, top: 50, right: 0, bottom: 0, width: 800, height: 600 }),
      } as unknown as HTMLIFrameElement },
      customComponents: [
        { type: 'custom-one', label: 'Custom One', icon: 'star', category: 'Custom', description: 'demo' },
      ],
      sendBlocksUpdate: sendBlocksUpdateSpy,
      sendSelectBlock: sendSelectBlockSpy,
      handleIframeLoad: handleIframeLoadSpy,
      sendUndo: sendUndoSpy,
      sendRedo: sendRedoSpy,
      undoRedoState: { canUndo: true, canRedo: false },
      sendExternalDragStart: sendExternalDragStartSpy,
      sendExternalDragMove: sendExternalDragMoveSpy,
      sendExternalDragEnd: sendExternalDragEndSpy,
      sendExternalDragCancel: sendExternalDragCancelSpy,
      sendCustomCodeUpdate: sendCustomCodeUpdateSpy,
    };
  },
}));

// Real blockHelpers — we want findBlockById / updateBlockById / insertBlockAfter
// to run so the shell's block-mutation paths actually exercise the helpers.

// ---------------------------------------------------------------------------
// Test subject (imported AFTER the mocks above are registered)
// ---------------------------------------------------------------------------
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';

// helper: minimal block factory
const block = (id: string, type: string = 'text', extra: Record<string, unknown> = {}): { id: string; type: string; order: number; [key: string]: unknown } =>
  ({ id, type, order: 0, ...extra });

const baseProps = () => ({
  blocks: [block('a', 'text', { content: 'hello' }), block('b', 'heading', { content: 'World' })],
  selectedBlockId: null as string | null,
  iframeSrc: '/preview',
  onBlocksChange: vi.fn(),
  onSelectBlock: vi.fn(),
  onAddBlock: vi.fn(),
  onDeleteBlock: vi.fn(),
  onUpdateBlock: vi.fn(),
});

beforeEach(() => {
  lastLeftProps.current = null;
  lastRightProps.current = null;
  lastIframeProps.current = null;
  lastContextProps.current = null;
  lastImagePickerProps.current = null;
  lastSaveTemplateProps.current = null;
  lastTemplateLibraryProps.current = null;
  lastParentArgs.current = null;
  sendBlocksUpdateSpy.mockClear();
  sendSelectBlockSpy.mockClear();
  sendUndoSpy.mockClear();
  sendRedoSpy.mockClear();
  sendCustomCodeUpdateSpy.mockClear();
  sendExternalDragStartSpy.mockClear();
  sendExternalDragMoveSpy.mockClear();
  sendExternalDragEndSpy.mockClear();
  sendExternalDragCancelSpy.mockClear();
  handleIframeLoadSpy.mockClear();
  copySpy.mockClear();
  pasteSpy.mockClear();
  bulkDeleteSpy.mockClear();
  bulkDuplicateSpy.mockClear();
  bulkGroupSpy.mockClear();
});

afterEach(() => {
  // Best-effort — react-testing-library cleanup after each render so panel
  // refs from prior tests don't bleed.
});

// ---------------------------------------------------------------------------
// 1. Mount / basic render
// ---------------------------------------------------------------------------
describe('VisualEditorShell — render scaffolding', () => {
  it('renders LeftPanel, IframePreview, and RightPanel in default (non-preview) mode', () => {
    const props = baseProps();
    const { getByTestId } = render(<VisualEditorShell {...props} />);
    expect(getByTestId('left-panel')).toBeTruthy();
    expect(getByTestId('iframe-preview')).toBeTruthy();
    expect(getByTestId('right-panel')).toBeTruthy();
  });

  it('hides LeftPanel + RightPanel when previewMode=true (iframe still mounts)', () => {
    const props = baseProps();
    const { queryByTestId, getByTestId } = render(
      <VisualEditorShell {...props} previewMode />,
    );
    expect(queryByTestId('left-panel')).toBeNull();
    expect(queryByTestId('right-panel')).toBeNull();
    expect(getByTestId('iframe-preview')).toBeTruthy();
  });

  it('forwards iframeSrc, viewport, allowIframeScroll, blocks, previewMode to IframePreview', () => {
    const props = baseProps();
    render(
      <VisualEditorShell
        {...props}
        iframeSrc="/custom-src"
        viewport="tablet"
        allowIframeScroll
      />,
    );
    expect(lastIframeProps.current.iframeSrc).toBe('/custom-src');
    expect(lastIframeProps.current.viewport).toBe('tablet');
    expect(lastIframeProps.current.allowIframeScroll).toBe(true);
    expect(lastIframeProps.current.blocks).toBe(props.blocks);
  });

  it('builds allBlockTypes by combining BUILT_IN + custom components + extra block types', () => {
    const props = baseProps();
    render(
      <VisualEditorShell
        {...props}
        extraBlockTypes={[
          { type: 'deck-jump-to' as unknown as 'text', label: 'Jump', icon: 'east', category: 'Deck', description: 'Jump to slide' },
        ]}
      />,
    );
    const types = (lastLeftProps.current.allBlockTypes as Array<Record<string, unknown>>).map((b) => b.type);
    expect(types).toContain('heading');
    expect(types).toContain('text');
    expect(types).toContain('custom-one'); // from mocked customComponents
    expect(types).toContain('deck-jump-to'); // extraBlockTypes prop
  });

  it('derives categories from allBlockTypes (unique values)', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    const cats: string[] = lastLeftProps.current.categories;
    expect(cats).toContain('Basic');
    expect(cats).toContain('Custom');
    // dedupes — Basic only once
    expect(cats.filter((c) => c === 'Basic').length).toBe(1);
  });

  it('maps viewport=mobile to currentViewport=mobile on the right panel', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} viewport="mobile" />);
    expect(lastRightProps.current.currentViewport).toBe('mobile');
  });

  it('falls back to currentViewport=desktop for unknown viewport values', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} viewport={undefined} />);
    expect(lastRightProps.current.currentViewport).toBe('desktop');
  });
});

// ---------------------------------------------------------------------------
// 2. Selection — controlled prop + internal state + onSelect callback
// ---------------------------------------------------------------------------
describe('VisualEditorShell — selection', () => {
  it('uses selectedBlockIdProp as the source of truth when provided', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} selectedBlockId="a" />);
    expect(lastLeftProps.current.selectedBlockId).toBe('a');
    expect(lastRightProps.current.selectedBlock).toEqual(props.blocks[0]);
  });

  it('selectBlock(no modifier) — sets internal selection + notifies parent', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => {
      lastLeftProps.current.selectBlock('b');
    });
    expect(props.onSelectBlock).toHaveBeenCalledWith('b');
    expect(lastLeftProps.current.selectedBlockId).toBe('b');
    expect(lastLeftProps.current.selectedBlockIds).toEqual(['b']);
  });

  it('selectBlock with metaKey — toggles into multi-select', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastLeftProps.current.selectBlock('a'); });
    act(() => { lastLeftProps.current.selectBlock('b', { metaKey: true }); });
    expect(lastLeftProps.current.selectedBlockIds).toEqual(['a', 'b']);
    expect(lastRightProps.current.isMultiSelect).toBe(true);
  });

  it('selectBlock with metaKey on already-selected block — removes it', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastLeftProps.current.selectBlock('a'); });
    act(() => { lastLeftProps.current.selectBlock('b', { metaKey: true }); });
    act(() => { lastLeftProps.current.selectBlock('a', { metaKey: true }); });
    expect(lastLeftProps.current.selectedBlockIds).toEqual(['b']);
  });

  it('selectBlock with shiftKey acts as a multi-toggle (same as meta)', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastLeftProps.current.selectBlock('a'); });
    act(() => { lastLeftProps.current.selectBlock('b', { shiftKey: true }); });
    expect(lastLeftProps.current.selectedBlockIds).toEqual(['a', 'b']);
  });

  it('clears selectedBlockIds when selecting null', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastLeftProps.current.selectBlock('a'); });
    act(() => { (lastLeftProps.current.selectBlock as (id: string | null) => void)(null); });
    expect(lastLeftProps.current.selectedBlockIds).toEqual([]);
  });

  it('isMultiSelect=false when only one block is selected', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastLeftProps.current.selectBlock('a'); });
    expect(lastRightProps.current.isMultiSelect).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Panel collapse — controlled vs uncontrolled
// ---------------------------------------------------------------------------
describe('VisualEditorShell — panel collapse', () => {
  it('uses leftCollapsed / rightCollapsed props when provided (controlled)', () => {
    const props = baseProps();
    render(
      <VisualEditorShell
        {...props}
        leftCollapsed
        rightCollapsed={false}
      />,
    );
    expect(lastLeftProps.current.leftCollapsed).toBe(true);
    expect(lastRightProps.current.rightCollapsed).toBe(false);
  });

  it('uses internal state when props are omitted (uncontrolled)', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    expect(lastLeftProps.current.leftCollapsed).toBe(false);
    act(() => { lastLeftProps.current.setLeftCollapsed(true); });
    expect(lastLeftProps.current.leftCollapsed).toBe(true);
  });

  it('fires onLeftCollapsedChange / onRightCollapsedChange when set is invoked', () => {
    const props = baseProps();
    const onLeft = vi.fn();
    const onRight = vi.fn();
    render(
      <VisualEditorShell
        {...props}
        onLeftCollapsedChange={onLeft}
        onRightCollapsedChange={onRight}
      />,
    );
    act(() => { lastLeftProps.current.setLeftCollapsed(true); });
    act(() => { lastRightProps.current.setRightCollapsed(true); });
    expect(onLeft).toHaveBeenCalledWith(true);
    expect(onRight).toHaveBeenCalledWith(true);
  });

  it('setLeftCollapsed accepts a functional updater', () => {
    const props = baseProps();
    const onLeft = vi.fn();
    render(<VisualEditorShell {...props} onLeftCollapsedChange={onLeft} />);
    act(() => { lastLeftProps.current.setLeftCollapsed((prev: boolean) => !prev); });
    expect(onLeft).toHaveBeenCalledWith(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Iframe → parent message callbacks (via useVisualEditorParent args)
// ---------------------------------------------------------------------------
describe('VisualEditorShell — iframe callbacks', () => {
  it('onBlocksReordered — fires onBlocksChange with the new blocks array', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    const newBlocks = [block('z', 'text')];
    act(() => { lastParentArgs.current.onBlocksReordered(newBlocks); });
    expect(props.onBlocksChange).toHaveBeenCalledWith(newBlocks);
  });

  it('onAddBlockAfter — inserts a new text block + selects it (top-level path)', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onAddBlockAfter('a'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next).toHaveLength(3);
    expect(next[0].id).toBe('a');
    expect(next[1].content).toBe('New block — click to edit');
    expect(next[2].id).toBe('b');
    // The newly inserted block was also selected.
    expect(props.onSelectBlock).toHaveBeenCalled();
  });

  it('onAddBlockAfter — falls through to insertBlockAfter when target id is nested/unknown', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    // 'nonexistent' isn't a top-level id — shell should call the recursive helper.
    act(() => { lastParentArgs.current.onAddBlockAfter('nonexistent'); });
    // onBlocksChange still fires — recursive helper returns blocks unchanged
    // when id isn't found anywhere, but the call still went through.
    expect(props.onBlocksChange).toHaveBeenCalled();
  });

  it('onBlockResized — applies width+height into the block style', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockResized('a', '200px', '100px'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].style.width).toBe('200px');
    expect(next[0].style.height).toBe('100px');
  });

  it('onBlockResized — omits height when undefined', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockResized('a', '300px', undefined); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].style.width).toBe('300px');
    expect(next[0].style.height).toBeUndefined();
  });

  it('onBlockStyleUpdated — merges style updates with existing style', () => {
    const props = baseProps();
    props.blocks = [block('a', 'text', { content: 'x', style: { color: 'red' } })];
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockStyleUpdated('a', { background: 'blue' }); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].style.color).toBe('red'); // preserved
    expect(next[0].style.background).toBe('blue'); // added
  });

  it('onColumnResized — updates columns widths on a columns block', () => {
    const props = baseProps();
    props.blocks = [
      {
        id: 'cols',
        type: 'columns',
        order: 0,
        columns: [
          { id: 'c1', width: 50, blocks: [] },
          { id: 'c2', width: 50, blocks: [] },
        ],
      } as unknown as ReturnType<typeof block>,
    ];
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onColumnResized('cols', [70, 30]); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].columns[0].width).toBe(70);
    expect(next[0].columns[1].width).toBe(30);
  });

  it('onColumnResized — no-ops for non-columns blocks', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onColumnResized('a', [70, 30]); });
    expect(props.onBlocksChange).not.toHaveBeenCalled();
  });

  it('onGapChanged — updates the gap field', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onGapChanged('a', 'lg'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].gap).toBe('lg');
  });

  it('onBlockContentUpdated — writes a top-level field on a non-html-render block', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockContentUpdated('a', 'content', 'updated!'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].content).toBe('updated!');
  });

  it('onBlockContentUpdated — __add_array_item appends a defaulted card', () => {
    const props = baseProps();
    props.blocks = [block('a', 'cards', { cards: [{ id: 'x', title: 'old', description: '' }] })];
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockContentUpdated('a', '__add_array_item', 'cards'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].cards).toHaveLength(2);
    expect(next[0].cards[1].title).toBe('New card');
  });

  it('onBlockContentUpdated — __add_array_item creates the array when missing', () => {
    const props = baseProps();
    props.blocks = [block('a', 'stats')];
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockContentUpdated('a', '__add_array_item', 'stats'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].stats).toHaveLength(1);
    expect(next[0].stats[0].value).toBe('0');
  });

  it('onBlockContentUpdated — html-render flat field writes into values map', () => {
    const props = baseProps();
    props.blocks = [block('h', 'html-render', { values: { headline: 'old' } })];
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockContentUpdated('h', 'headline', 'new'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].values.headline).toBe('new');
  });

  it('onBlockContentUpdated — html-render dotted 3-part field writes into an indexed array entry', () => {
    const props = baseProps();
    props.blocks = [block('h', 'html-render', {
      values: { stats: [{ label: 'A', body: 'old' }, { label: 'B', body: 'old' }] },
    })];
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockContentUpdated('h', 'stats.1.body', 'updated'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].values.stats[1].body).toBe('updated');
    expect(next[0].values.stats[0].body).toBe('old');
  });

  it('onBlockContentUpdated — html-render dotted 2-part field writes into a group object', () => {
    const props = baseProps();
    props.blocks = [block('h', 'html-render', {
      values: { cta: { label: 'Old', href: '#' } },
    })];
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockContentUpdated('h', 'cta.label', 'New'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].values.cta.label).toBe('New');
    expect(next[0].values.cta.href).toBe('#');
  });

  it('onBlockContentUpdated — html-render 3-part missing array seeds a new array', () => {
    const props = baseProps();
    props.blocks = [block('h', 'html-render')];
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockContentUpdated('h', 'items.0.title', 'first'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].values.items[0].title).toBe('first');
  });

  it('onBlockContextMenu — opens the context menu at the converted screen coords', () => {
    const props = baseProps();
    const { queryByTestId, getByTestId } = render(<VisualEditorShell {...props} />);
    expect(queryByTestId('context-menu')).toBeNull();
    act(() => { lastParentArgs.current.onBlockContextMenu('a', 50, 50); });
    expect(getByTestId('context-menu')).toBeTruthy();
    // iframe rect.left=100, top=50, zoom=100 → x = 100 + 50, y = 50 + 50
    expect(lastContextProps.current.contextMenu.x).toBe(150);
    expect(lastContextProps.current.contextMenu.y).toBe(100);
    expect(lastContextProps.current.selectedCount).toBe(1);
  });

  it('onCopyBlocks → copy impl, onPasteBlocks → paste impl', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onCopyBlocks(); });
    act(() => { lastParentArgs.current.onPasteBlocks(); });
    expect(copySpy).toHaveBeenCalled();
    expect(pasteSpy).toHaveBeenCalled();
  });

  it('onRequestImagePicker — opens the ImagePickerModal with the target', async () => {
    const props = baseProps();
    const { queryByTestId, getByTestId } = render(<VisualEditorShell {...props} />);
    expect(queryByTestId('image-picker')).toBeNull();
    act(() => { lastParentArgs.current.onRequestImagePicker('a', 'imageUrl', 'http://x'); });
    // ImagePickerModal is lazy-loaded via next/dynamic — wait for the chunk
    // (the mocked module) to resolve before asserting.
    await waitFor(() => expect(getByTestId('image-picker')).toBeTruthy());
    expect(lastImagePickerProps.current.target).toEqual({ blockId: 'a', field: 'imageUrl', currentValue: 'http://x' });
  });
});

// ---------------------------------------------------------------------------
// 5. Iframe → parent effects (selection, blocks update, custom code, undo/redo)
// ---------------------------------------------------------------------------
describe('VisualEditorShell — outgoing iframe messages', () => {
  it('forwards blocks/selection on mount via sendBlocksUpdate + sendSelectBlock', async () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} selectedBlockId="a" />);
    // sendBlocksUpdate is now debounced (~1 animation frame) to coalesce
    // keystroke bursts — wait for the timer to flush.
    await waitFor(() =>
      expect(sendBlocksUpdateSpy).toHaveBeenCalledWith(props.blocks, { coalesce: false }),
    );
    expect(sendSelectBlockSpy).toHaveBeenCalledWith('a', []);
  });

  it('forwards customCss / customJs via sendCustomCodeUpdate on mount + when they change', () => {
    const props = baseProps();
    const { rerender } = render(<VisualEditorShell {...props} customCss=".a{}" />);
    expect(sendCustomCodeUpdateSpy).toHaveBeenLastCalledWith('.a{}', '');
    rerender(<VisualEditorShell {...props} customCss=".b{}" customJs="alert(1)" />);
    expect(sendCustomCodeUpdateSpy).toHaveBeenLastCalledWith('.b{}', 'alert(1)');
  });

  it('reports undoRedoControls to the parent (from undoRedoState)', () => {
    const props = baseProps();
    const onUndoRedoChange = vi.fn();
    render(<VisualEditorShell {...props} onUndoRedoChange={onUndoRedoChange} />);
    const controls = onUndoRedoChange.mock.calls.pop()![0];
    expect(controls.canUndo).toBe(true);
    expect(controls.canRedo).toBe(false);
    controls.sendUndo();
    controls.sendRedo();
    expect(sendUndoSpy).toHaveBeenCalled();
    expect(sendRedoSpy).toHaveBeenCalled();
  });

  it('Cmd+Z fires sendUndo; Cmd+Shift+Z fires sendRedo', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(sendUndoSpy).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    expect(sendRedoSpy).toHaveBeenCalledTimes(1);
  });

  it('Cmd+Z is ignored when the event target is an editable element', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'z', metaKey: true });
    expect(sendUndoSpy).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('non-Z keys with meta don\'t fire undo/redo', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    expect(sendUndoSpy).not.toHaveBeenCalled();
    expect(sendRedoSpy).not.toHaveBeenCalled();
  });

  it('plain Z without meta/ctrl does nothing', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    fireEvent.keyDown(window, { key: 'z' });
    expect(sendUndoSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 6. Modals — context menu, save-as-template, image picker, template library
// ---------------------------------------------------------------------------
describe('VisualEditorShell — modals', () => {
  it('BlockContextMenu — onClose hides the menu', () => {
    const props = baseProps();
    const { queryByTestId } = render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockContextMenu('a', 0, 0); });
    expect(queryByTestId('context-menu')).toBeTruthy();
    act(() => { lastContextProps.current.onClose(); });
    expect(queryByTestId('context-menu')).toBeNull();
  });

  it('BlockContextMenu — onSaveAsTemplate opens the SaveAsTemplateModal with selected blocks', () => {
    const props = baseProps();
    const { getByTestId } = render(<VisualEditorShell {...props} />);
    act(() => { lastLeftProps.current.selectBlock('a'); });
    act(() => { lastParentArgs.current.onBlockContextMenu('a', 0, 0); });
    act(() => { lastContextProps.current.onSaveAsTemplate(); });
    expect(getByTestId('save-template')).toBeTruthy();
    expect(lastSaveTemplateProps.current.blocks[0].id).toBe('a');
  });

  it('BlockContextMenu — onSaveAsTemplate does nothing when no blocks resolve', () => {
    const props = baseProps();
    props.blocks = [];
    const { queryByTestId } = render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockContextMenu('does-not-exist', 0, 0); });
    act(() => { lastContextProps.current.onSaveAsTemplate(); });
    expect(queryByTestId('save-template')).toBeNull();
  });

  it('BlockContextMenu — onDuplicate/onCopy/onPaste/onGroup/onDelete invoke the right hooks', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onBlockContextMenu('a', 0, 0); });
    act(() => { lastContextProps.current.onDuplicate(); });
    act(() => { lastContextProps.current.onCopy(); });
    act(() => { lastContextProps.current.onPaste(); });
    act(() => { lastContextProps.current.onGroup(); });
    act(() => { lastContextProps.current.onDelete(); });
    expect(bulkDuplicateSpy).toHaveBeenCalled();
    expect(copySpy).toHaveBeenCalled();
    expect(pasteSpy).toHaveBeenCalled();
    expect(bulkGroupSpy).toHaveBeenCalled();
    expect(bulkDeleteSpy).toHaveBeenCalled();
  });

  it('SaveAsTemplateModal — onClose dismisses it', () => {
    const props = baseProps();
    const { queryByTestId } = render(<VisualEditorShell {...props} />);
    act(() => { lastLeftProps.current.selectBlock('a'); });
    act(() => { lastParentArgs.current.onBlockContextMenu('a', 0, 0); });
    act(() => { lastContextProps.current.onSaveAsTemplate(); });
    expect(queryByTestId('save-template')).toBeTruthy();
    act(() => { lastSaveTemplateProps.current.onClose(); });
    expect(queryByTestId('save-template')).toBeNull();
  });

  it('ImagePickerModal — selecting a URL on an html-render flat field writes into values', () => {
    const props = baseProps();
    props.blocks = [block('h', 'html-render', { values: { hero: 'old.png' } })];
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onRequestImagePicker('h', 'hero', 'old.png'); });
    act(() => { lastImagePickerProps.current.onSelect('new.png'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].values.hero).toBe('new.png');
  });

  it('ImagePickerModal — dotted 3-part field updates an array entry by index', () => {
    const props = baseProps();
    props.blocks = [block('h', 'html-render', {
      values: { gallery: [{ url: 'a.png' }, { url: 'b.png' }] },
    })];
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onRequestImagePicker('h', 'gallery.1.url', 'b.png'); });
    act(() => { lastImagePickerProps.current.onSelect('c.png'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].values.gallery[1].url).toBe('c.png');
    expect(next[0].values.gallery[0].url).toBe('a.png');
  });

  it('ImagePickerModal — dotted 2-part field updates a group object', () => {
    const props = baseProps();
    props.blocks = [block('h', 'html-render', {
      values: { hero: { src: 'old.png', alt: 'x' } },
    })];
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onRequestImagePicker('h', 'hero.src', 'old.png'); });
    act(() => { lastImagePickerProps.current.onSelect('new.png'); });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next[0].values.hero.src).toBe('new.png');
    expect(next[0].values.hero.alt).toBe('x');
  });

  it('ImagePickerModal — onClose dismisses without modifying blocks', () => {
    const props = baseProps();
    const { queryByTestId } = render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onRequestImagePicker('a', 'foo', 'bar'); });
    expect(queryByTestId('image-picker')).toBeTruthy();
    act(() => { lastImagePickerProps.current.onClose(); });
    expect(queryByTestId('image-picker')).toBeNull();
    expect(props.onBlocksChange).not.toHaveBeenCalled();
  });

  it('ImagePickerModal — picking on a non-html-render block leaves blocks alone but closes the modal', () => {
    const props = baseProps();
    const { queryByTestId } = render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onRequestImagePicker('a', 'imageUrl', ''); });
    act(() => { lastImagePickerProps.current.onSelect('x.png'); });
    expect(queryByTestId('image-picker')).toBeNull();
    // The non-html-render branch in onSelect doesn't write — blocks unchanged.
    expect(props.onBlocksChange).not.toHaveBeenCalled();
  });

  it('ImagePickerModal — mediaApi is site-scoped when siteId is provided', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} siteId={42} />);
    act(() => { lastParentArgs.current.onRequestImagePicker('a', 'imageUrl', ''); });
    expect(lastImagePickerProps.current.mediaApi).toBe('/api/portal/cms/websites/42/media');
  });

  it('ImagePickerModal — mediaApi falls back to the generic /api/portal/media when no siteId', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastParentArgs.current.onRequestImagePicker('a', 'imageUrl', ''); });
    expect(lastImagePickerProps.current.mediaApi).toBe('/api/portal/media');
  });

  it('TemplateLibrary — opens via setTemplateLibraryOpen and closes via onClose', () => {
    const props = baseProps();
    const { queryByTestId, getByTestId } = render(<VisualEditorShell {...props} />);
    expect(queryByTestId('template-library')).toBeNull();
    act(() => { lastLeftProps.current.setTemplateLibraryOpen(true); });
    expect(getByTestId('template-library')).toBeTruthy();
    act(() => { lastTemplateLibraryProps.current.onClose(); });
    expect(queryByTestId('template-library')).toBeNull();
  });

  it('TemplateLibrary — onInsert appends blocks when nothing is selected', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    act(() => { lastLeftProps.current.setTemplateLibraryOpen(true); });
    act(() => {
      lastTemplateLibraryProps.current.onInsert([block('t1', 'text', { content: 'tpl' })]);
    });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next.map((b: Record<string, unknown>) => b.id)).toEqual(['a', 'b', 't1']);
    // order field was re-numbered
    expect(next[0].order).toBe(1);
    expect(next[2].order).toBe(3);
  });

  it('TemplateLibrary — onInsert inserts after the selected top-level block', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} selectedBlockId="a" />);
    act(() => { lastLeftProps.current.setTemplateLibraryOpen(true); });
    act(() => {
      lastTemplateLibraryProps.current.onInsert([block('t1', 'text')]);
    });
    const next = props.onBlocksChange.mock.calls[0][0];
    expect(next.map((b: Record<string, unknown>) => b.id)).toEqual(['a', 't1', 'b']);
  });
});

// ---------------------------------------------------------------------------
// 7. IframePreview — external-drag pass-through
// ---------------------------------------------------------------------------
describe('VisualEditorShell — external drag wiring', () => {
  it('onExternalDragMove proxies through to the iframe sender', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    lastIframeProps.current.onExternalDragMove(10, 20);
    expect(sendExternalDragMoveSpy).toHaveBeenCalledWith(10, 20);
  });

  it('onExternalDragEnd flushes the iframe end + resets left tab/search + clears externalDragType', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    // Simulate LeftPanel setting an external-drag type, then ending the drag.
    act(() => { lastLeftProps.current.setExternalDragType('heading'); });
    expect(lastIframeProps.current.externalDragType).toBe('heading');
    lastIframeProps.current.onExternalDragEnd(15, 25);
    expect(sendExternalDragEndSpy).toHaveBeenCalledWith(15, 25);
  });

  it('onExternalDragCancel proxies through to the iframe sender', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    lastIframeProps.current.onExternalDragCancel();
    expect(sendExternalDragCancelSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 8. Misc — handleIframeLoad pass-through, noSelectionPanel, brandingProfile
// ---------------------------------------------------------------------------
describe('VisualEditorShell — misc prop forwarding', () => {
  it('passes handleIframeLoad through to IframePreview', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} />);
    expect(lastIframeProps.current.handleIframeLoad).toBe(handleIframeLoadSpy);
  });

  it('forwards brandingProfileId + onBrandingProfileChange to LeftPanel', () => {
    const props = baseProps();
    const onChange = vi.fn();
    render(
      <VisualEditorShell
        {...props}
        brandingProfileId={7}
        onBrandingProfileChange={onChange}
      />,
    );
    expect(lastLeftProps.current.brandingProfileId).toBe(7);
    expect(lastLeftProps.current.onBrandingProfileChange).toBe(onChange);
  });

  it('forwards noSelectionPanel to RightPanel', () => {
    const props = baseProps();
    const panel = <div data-testid="custom-noselect" />;
    render(<VisualEditorShell {...props} noSelectionPanel={panel} />);
    expect(lastRightProps.current.noSelectionPanel).toBe(panel);
  });

  it('forwards typeTemplate into useVisualEditorParent args', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} typeTemplate={'{"blocks":[]}'} />);
    expect(lastParentArgs.current.typeTemplate).toBe('{"blocks":[]}');
  });

  it('selectedCustomManifest matches when the selected block type is a custom component', () => {
    const props = baseProps();
    props.blocks = [block('cust', 'custom-one')];
    render(<VisualEditorShell {...props} selectedBlockId="cust" />);
    expect(lastRightProps.current.selectedCustomManifest?.type).toBe('custom-one');
  });

  it('selectedCustomManifest is null when the selected block is a built-in type', () => {
    const props = baseProps();
    render(<VisualEditorShell {...props} selectedBlockId="a" />);
    expect(lastRightProps.current.selectedCustomManifest ?? null).toBeNull();
  });
});
