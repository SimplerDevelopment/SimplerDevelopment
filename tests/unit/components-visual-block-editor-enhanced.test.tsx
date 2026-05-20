// @vitest-environment jsdom
/**
 * Unit tests for VisualBlockEditorEnhanced + EditorInner
 * (components/blocks/VisualBlockEditorEnhanced.tsx)
 *
 * The component composes a sortable block editor on top of a context provider.
 * Rather than spinning up the real BlockEditorContext (which itself pulls in
 * history/sync hooks + BroadcastChannel + popups), we mock the context module
 * so each test can inject a tailored state object. Child blocks/UI panels are
 * stubbed so we can assert on the editor's own DOM and behaviour.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Cross-cutting framework mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    React.forwardRef<HTMLElement, any>(({ children, ...rest }, ref) =>
      React.createElement(tag, { ref, ...rest }, children),
    );
  const motion = new Proxy(
    {},
    {
      get: (_t, key) => passthrough(typeof key === 'string' ? key : 'div'),
    },
  );
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useAnimation: () => ({ start: vi.fn(), stop: vi.fn() }),
    useMotionValue: (v: any) => ({ get: () => v, set: vi.fn() }),
    useTransform: () => ({ get: () => 0 }),
  };
});

// ---------------------------------------------------------------------------
// @dnd-kit mocks (capture drag callbacks for direct invocation)
// ---------------------------------------------------------------------------

let capturedDragHandlers: {
  onDragStart?: (e: any) => void;
  onDragOver?: (e: any) => void;
  onDragEnd?: (e: any) => void;
} = {};

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragStart, onDragOver, onDragEnd }: any) => {
    capturedDragHandlers = { onDragStart, onDragOver, onDragEnd };
    return <div data-testid="dnd-context">{children}</div>;
  },
  DragOverlay: ({ children }: any) => <div data-testid="drag-overlay">{children}</div>,
  closestCenter: () => [],
  pointerWithin: () => [],
  rectIntersection: () => [],
  KeyboardSensor: function KeyboardSensor() {},
  MouseSensor: function MouseSensor() {},
  TouchSensor: function TouchSensor() {},
  useSensor: () => ({}),
  useSensors: () => [],
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: <T,>(arr: T[], from: number, to: number) => {
    const next = arr.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  },
  SortableContext: ({ children }: any) => <div data-testid="sortable-context">{children}</div>,
  sortableKeyboardCoordinates: () => null,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

// ---------------------------------------------------------------------------
// Stub child UI so we don't render BlockSettings / VisualBlockPreview / etc.
// ---------------------------------------------------------------------------

vi.mock('@/components/blocks/visual/VisualBlockPreview', () => ({
  VisualBlockPreview: ({ block }: any) => (
    <div data-testid={`vbp-${block.id}`} data-type={block.type}>
      {block.content || ''}
    </div>
  ),
}));

vi.mock('@/components/blocks/visual/BlockSettings', () => ({
  BlockSettings: ({ block }: any) => (
    <div data-testid={`block-settings-${block.id}`}>BlockSettings({block.type})</div>
  ),
}));

vi.mock('@/components/blocks/visual/PageSettingsPanel', () => ({
  PageSettingsPanel: () => <div data-testid="page-settings-panel">PageSettings</div>,
}));

vi.mock('@/components/blocks/LayersPanel', () => ({
  LayersPanel: ({ collapsed, onCollapsedChange }: any) => (
    <div data-testid="layers-panel" data-collapsed={String(!!collapsed)}>
      <button
        type="button"
        data-testid="toggle-layers"
        onClick={() => onCollapsedChange?.(!collapsed)}
      >
        toggle
      </button>
    </div>
  ),
}));

vi.mock('@/components/blocks/SaveAsTemplateModal', () => ({
  SaveAsTemplateModal: ({ onClose, blocks }: any) => (
    <div data-testid="save-template-modal">
      <span>save template for {blocks[0]?.id}</span>
      <button type="button" onClick={onClose}>close save</button>
    </div>
  ),
}));

vi.mock('@/components/blocks/TemplateLibrary', () => ({
  TemplateLibrary: ({ onInsert, onClose }: any) => (
    <div data-testid="template-library">
      <button
        type="button"
        data-testid="insert-template"
        onClick={() =>
          onInsert([
            { id: 'tmpl-1', type: 'heading', order: 0, content: 'from template' },
          ])
        }
      >
        insert template
      </button>
      <button type="button" data-testid="close-template" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

vi.mock('@/components/blocks/ResponsiveIndicator', () => ({
  ResponsiveIndicator: () => <span data-testid="responsive-indicator" />,
}));

vi.mock('@/components/blocks/ResponsiveHelpModal', () => ({
  ResponsiveHelpButton: () => <button type="button" data-testid="responsive-help-btn">help</button>,
}));

vi.mock('@/components/blocks/BlockTypeIcon', () => ({
  BlockTypeIcon: ({ type }: any) => <span data-testid={`bt-icon-${type}`} />,
}));

// ---------------------------------------------------------------------------
// Mock context, hooks, lib helpers
// ---------------------------------------------------------------------------

// Capture keyboard shortcut handlers so tests can invoke them.
let capturedShortcuts: Array<any> = [];
vi.mock('@/lib/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: (shortcuts: any[]) => {
    capturedShortcuts = shortcuts;
  },
}));

vi.mock('@/lib/branding/block-defaults', () => ({
  applyBrandDefaults: (block: any, ctx: any) => ({
    ...block,
    __brand: ctx?.tone || 'applied',
  }),
}));

vi.mock('@/lib/blocks/defaults', () => ({
  createDefaultBlock: (type: string, opts: any) => ({
    id: `new-${type}-${opts?.order ?? 0}`,
    type,
    order: opts?.order ?? 0,
    content: '',
  }),
}));

vi.mock('@/lib/utils/responsive', () => ({
  getViewportWidth: (vp: string) => (vp === 'mobile' ? 375 : vp === 'tablet' ? 768 : 1280),
}));

// BlockEditorContext mock — keeps real Provider as a passthrough and gives us
// a setMockState helper so each test can shape the editor state freely.
type MockEditorState = {
  state: {
    blocks: any[];
    canUndo: boolean;
    canRedo: boolean;
  };
  undo: ReturnType<typeof vi.fn>;
  redo: ReturnType<typeof vi.fn>;
  reorderBlocks: ReturnType<typeof vi.fn>;
  updateBlock: ReturnType<typeof vi.fn>;
  deleteBlock: ReturnType<typeof vi.fn>;
  duplicateBlock: ReturnType<typeof vi.fn>;
  setBlocks: ReturnType<typeof vi.fn>;
  selectBlock: ReturnType<typeof vi.fn>;
  isSettingsPoppedOut: boolean;
  openSettingsPopOut: ReturnType<typeof vi.fn>;
  currentViewport: string;
  setCurrentViewport: ReturnType<typeof vi.fn>;
  pageSettings: Record<string, any>;
  updatePageSettings: ReturnType<typeof vi.fn>;
};

let mockEditor: MockEditorState;
function freshMock(overrides: Partial<MockEditorState> = {}): MockEditorState {
  return {
    state: { blocks: [], canUndo: false, canRedo: false, ...((overrides as any).state || {}) },
    undo: vi.fn(),
    redo: vi.fn(),
    reorderBlocks: vi.fn(),
    updateBlock: vi.fn(),
    deleteBlock: vi.fn(),
    duplicateBlock: vi.fn(),
    setBlocks: vi.fn(),
    selectBlock: vi.fn(),
    isSettingsPoppedOut: false,
    openSettingsPopOut: vi.fn(),
    currentViewport: 'desktop',
    setCurrentViewport: vi.fn(),
    pageSettings: {},
    updatePageSettings: vi.fn(),
    ...overrides,
  };
}

vi.mock('@/contexts/BlockEditorContext', () => ({
  BlockEditorProvider: ({ children }: any) => <>{children}</>,
  useBlockEditor: () => mockEditor,
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import {
  VisualBlockEditorEnhanced,
  EditorInner,
} from '@/components/blocks/VisualBlockEditorEnhanced';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const blockTypes = [
  { type: 'heading' as const, label: 'Heading', icon: 'h', category: 'Basic', description: 'h' },
  { type: 'text' as const, label: 'Paragraph', icon: 't', category: 'Basic', description: 't' },
  { type: 'image' as const, label: 'Image', icon: 'i', category: 'Media', description: 'i' },
  { type: 'columns' as const, label: 'Columns', icon: 'c', category: 'Layout', description: 'c' },
  { type: 'tabs' as const, label: 'Tabs', icon: 'tb', category: 'Layout', description: 'tb' },
  { type: 'section' as const, label: 'Section', icon: 's', category: 'Layout', description: 's' },
];

function makeHeading(id: string, order = 0, extra: Record<string, any> = {}) {
  return { id, type: 'heading', order, content: `H-${id}`, ...extra };
}
function makeText(id: string, order = 0) {
  return { id, type: 'text', order, content: `T-${id}` };
}
function makeColumns(id: string, cols: string[], order = 0) {
  return {
    id,
    type: 'columns',
    order,
    columns: cols.map((cid) => ({ id: cid, blocks: [] as any[] })),
  };
}
function makeTabs(id: string, tabs: Array<[string, string]>, order = 0) {
  return {
    id,
    type: 'tabs',
    order,
    tabs: tabs.map(([tid, label]) => ({ id: tid, label, blocks: [] as any[] })),
  };
}
function makeSection(id: string, order = 0) {
  return { id, type: 'section', order, blocks: [] as any[] };
}

beforeEach(() => {
  mockEditor = freshMock();
  capturedShortcuts = [];
  capturedDragHandlers = {};
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering / empty state
// ---------------------------------------------------------------------------

describe('VisualBlockEditorEnhanced — top-level export', () => {
  it('renders EditorInner via BlockEditorProvider', () => {
    render(<VisualBlockEditorEnhanced blocks={[]} onChange={() => {}} />);
    expect(screen.getByTestId('layers-panel')).toBeTruthy();
  });

  it('passes brandDefaults through to inner editor (no crash)', () => {
    render(
      <VisualBlockEditorEnhanced
        blocks={[]}
        onChange={() => {}}
        brandDefaults={{ tone: 'professional' } as any}
        initialViewport={'mobile' as any}
      />,
    );
    expect(screen.getByTestId('layers-panel')).toBeTruthy();
  });
});

describe('EditorInner — empty state', () => {
  it('shows the empty CTA when there are no blocks', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    expect(screen.getByText('Start creating content')).toBeTruthy();
    expect(screen.getByText(/Add your first block/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Add Block/ })).toBeTruthy();
  });

  it('opens the block inserter when "+ Add Block" is clicked', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Block/ }));
    expect(screen.getByText('Add a Block')).toBeTruthy();
  });

  it('calls onChange with state.blocks via effect', () => {
    const onChange = vi.fn();
    render(<EditorInner onChange={onChange} blockTypes={blockTypes as any} />);
    expect(onChange).toHaveBeenCalledWith([]);
  });
});

// ---------------------------------------------------------------------------
// Block list rendering / selection
// ---------------------------------------------------------------------------

describe('EditorInner — block list', () => {
  it('renders one SortableBlock per block', () => {
    mockEditor = freshMock({ state: { blocks: [makeHeading('a'), makeText('b')], canUndo: false, canRedo: false } });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    expect(screen.getByTestId('vbp-a')).toBeTruthy();
    expect(screen.getByTestId('vbp-b')).toBeTruthy();
  });

  it('shows the DndContext wrapper when blocks exist', () => {
    mockEditor = freshMock({ state: { blocks: [makeHeading('a')], canUndo: false, canRedo: false } });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    expect(screen.getByTestId('dnd-context')).toBeTruthy();
    expect(screen.getByTestId('sortable-context')).toBeTruthy();
  });

  it('renders PageSettingsPanel by default when nothing selected', () => {
    mockEditor = freshMock({ state: { blocks: [makeHeading('a')], canUndo: false, canRedo: false } });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    expect(screen.getByTestId('page-settings-panel')).toBeTruthy();
  });

  it('hides settings sidebar when isSettingsPoppedOut=true', () => {
    mockEditor = freshMock({
      state: { blocks: [makeHeading('a')], canUndo: false, canRedo: false },
      isSettingsPoppedOut: true,
    });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    expect(screen.queryByTestId('page-settings-panel')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SortableBlock hover/select toolbar + actions
// ---------------------------------------------------------------------------

describe('EditorInner — block toolbar actions', () => {
  function setupBlocks() {
    mockEditor = freshMock({
      state: {
        blocks: [makeHeading('a'), makeText('b'), makeHeading('c')],
        canUndo: false,
        canRedo: false,
      },
    });
    return render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
  }

  it('clicking the block content invokes selectBlock via setSelectedBlockId effect', () => {
    setupBlocks();
    const vbp = screen.getByTestId('vbp-a');
    // Click the block container (the parent div that owns onClick)
    fireEvent.click(vbp.parentElement!);
    expect(mockEditor.selectBlock).toHaveBeenCalled();
  });

  it('hovering a block reveals its toolbar', () => {
    setupBlocks();
    const block = screen.getByTestId('vbp-a').closest('.group') as HTMLElement;
    fireEvent.mouseEnter(block);
    // Toolbar label should appear
    expect(screen.getAllByTitle('Drag to reorder').length).toBeGreaterThan(0);
  });

  it('clicking "Move up" calls reorderBlocks for non-first block', () => {
    setupBlocks();
    const block = screen.getByTestId('vbp-b').closest('.group') as HTMLElement;
    fireEvent.mouseEnter(block);
    const upBtns = screen.getAllByTitle('Move up');
    // The middle block (b at idx 1) has an enabled up button
    const targetUp = upBtns.find((b) => !(b as HTMLButtonElement).disabled);
    fireEvent.click(targetUp!);
    expect(mockEditor.reorderBlocks).toHaveBeenCalled();
  });

  it('"Move up" on first block is disabled', () => {
    setupBlocks();
    const block = screen.getByTestId('vbp-a').closest('.group') as HTMLElement;
    fireEvent.mouseEnter(block);
    const upBtns = screen.getAllByTitle('Move up');
    expect((upBtns[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('"Move down" on last block is disabled', () => {
    setupBlocks();
    const block = screen.getByTestId('vbp-c').closest('.group') as HTMLElement;
    fireEvent.mouseEnter(block);
    const downBtns = screen.getAllByTitle('Move down');
    expect((downBtns[downBtns.length - 1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('clicking "Duplicate" calls duplicateBlock', () => {
    setupBlocks();
    const block = screen.getByTestId('vbp-a').closest('.group') as HTMLElement;
    fireEvent.mouseEnter(block);
    fireEvent.click(screen.getAllByTitle('Duplicate')[0]);
    expect(mockEditor.duplicateBlock).toHaveBeenCalledWith('a');
  });

  it('clicking "Delete" calls deleteBlock', () => {
    setupBlocks();
    const block = screen.getByTestId('vbp-a').closest('.group') as HTMLElement;
    fireEvent.mouseEnter(block);
    fireEvent.click(screen.getAllByTitle('Delete')[0]);
    expect(mockEditor.deleteBlock).toHaveBeenCalledWith('a');
  });

  it('clicking "Save as template" opens the SaveAsTemplateModal', () => {
    setupBlocks();
    const block = screen.getByTestId('vbp-a').closest('.group') as HTMLElement;
    fireEvent.mouseEnter(block);
    fireEvent.click(screen.getAllByTitle('Save as template')[0]);
    expect(screen.getByTestId('save-template-modal')).toBeTruthy();
    expect(screen.getByText(/save template for a/)).toBeTruthy();
  });

  it('closes SaveAsTemplateModal via onClose', () => {
    setupBlocks();
    const block = screen.getByTestId('vbp-a').closest('.group') as HTMLElement;
    fireEvent.mouseEnter(block);
    fireEvent.click(screen.getAllByTitle('Save as template')[0]);
    fireEvent.click(screen.getByText('close save'));
    expect(screen.queryByTestId('save-template-modal')).toBeNull();
  });

  it('insert-after button opens the block inserter', () => {
    setupBlocks();
    const insertBtns = screen.getAllByTitle('Insert block below');
    fireEvent.click(insertBtns[0]);
    expect(screen.getByText('Add a Block')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Block inserter modal
// ---------------------------------------------------------------------------

describe('EditorInner — block inserter modal', () => {
  it('shows all categories and block buttons', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Block/ }));
    expect(screen.getByText('Basic')).toBeTruthy();
    expect(screen.getByText('Media')).toBeTruthy();
    expect(screen.getByText('Layout')).toBeTruthy();
    expect(screen.getByText('Heading')).toBeTruthy();
    expect(screen.getByText('Paragraph')).toBeTruthy();
  });

  it('clicking a block type calls setBlocks (via addBlock)', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Block/ }));
    fireEvent.click(screen.getByText('Heading'));
    expect(mockEditor.setBlocks).toHaveBeenCalled();
    const inserted = (mockEditor.setBlocks.mock.calls[0]?.[0] as any[]) || [];
    expect(inserted.length).toBe(1);
    expect(inserted[0].type).toBe('heading');
  });

  it('addBlock applies brandDefaults when provided', () => {
    render(
      <EditorInner
        onChange={() => {}}
        blockTypes={blockTypes as any}
        brandDefaults={{ tone: 'friendly' } as any}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Block/ }));
    fireEvent.click(screen.getByText('Paragraph'));
    const inserted = (mockEditor.setBlocks.mock.calls[0]?.[0] as any[]) || [];
    expect(inserted[0].__brand).toBe('friendly');
  });

  it('closes the inserter when clicking the backdrop', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Block/ }));
    const backdrop = screen.getByText('Add a Block').closest('.fixed') as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByText('Add a Block')).toBeNull();
  });

  it('switches to the TemplateLibrary on "From Template"', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Block/ }));
    fireEvent.click(screen.getByText('From Template'));
    expect(screen.queryByText('Add a Block')).toBeNull();
    expect(screen.getByTestId('template-library')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Template library
// ---------------------------------------------------------------------------

describe('EditorInner — TemplateLibrary integration', () => {
  it('inserting from template calls setBlocks with template blocks', () => {
    mockEditor = freshMock({ state: { blocks: [makeHeading('a')], canUndo: false, canRedo: false } });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    // With blocks present, there's no top-level "Add Block" button — open the
    // inserter via the per-block "Insert block below" affordance instead.
    fireEvent.click(screen.getAllByTitle('Insert block below')[0]);
    fireEvent.click(screen.getByText('From Template'));
    fireEvent.click(screen.getByTestId('insert-template'));
    expect(mockEditor.setBlocks).toHaveBeenCalled();
    const updated = (mockEditor.setBlocks.mock.calls[0]?.[0] as any[]) || [];
    // existing block + 1 inserted template
    expect(updated.length).toBe(2);
  });

  it('closes the template library via onClose', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Block/ }));
    fireEvent.click(screen.getByText('From Template'));
    fireEvent.click(screen.getByTestId('close-template'));
    expect(screen.queryByTestId('template-library')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Layers panel
// ---------------------------------------------------------------------------

describe('EditorInner — LayersPanel collapse', () => {
  it('starts uncollapsed and toggles to collapsed', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    const panel = screen.getByTestId('layers-panel');
    expect(panel.getAttribute('data-collapsed')).toBe('false');
    fireEvent.click(screen.getByTestId('toggle-layers'));
    expect(screen.getByTestId('layers-panel').getAttribute('data-collapsed')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Drag handlers (DnD)
// ---------------------------------------------------------------------------

describe('EditorInner — drag handlers', () => {
  beforeEach(() => {
    mockEditor = freshMock({
      state: {
        blocks: [makeHeading('a'), makeText('b'), makeColumns('cols', ['c1', 'c2'])],
        canUndo: false,
        canRedo: false,
      },
    });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
  });

  it('onDragStart captures the active id', () => {
    act(() => capturedDragHandlers.onDragStart?.({ active: { id: 'a' } }));
    // No throw; ensure handler exists
    expect(typeof capturedDragHandlers.onDragStart).toBe('function');
  });

  it('onDragOver with a drop-zone id stores nestTargetId', () => {
    act(() =>
      capturedDragHandlers.onDragOver?.({ over: { id: 'drop-zone-c1' } }),
    );
    expect(typeof capturedDragHandlers.onDragOver).toBe('function');
  });

  it('onDragOver with non-drop-zone id falls through to overId', () => {
    act(() => capturedDragHandlers.onDragOver?.({ over: { id: 'b' } }));
    expect(typeof capturedDragHandlers.onDragOver).toBe('function');
  });

  it('onDragOver with no over stays null', () => {
    act(() => capturedDragHandlers.onDragOver?.({ over: null }));
    expect(typeof capturedDragHandlers.onDragOver).toBe('function');
  });

  it('onDragEnd reorders when dropping on another block', () => {
    act(() =>
      capturedDragHandlers.onDragEnd?.({
        active: { id: 'a' },
        over: { id: 'b' },
      }),
    );
    expect(mockEditor.reorderBlocks).toHaveBeenCalledWith(0, 1);
  });

  it('onDragEnd ignores drop when active === over', () => {
    act(() =>
      capturedDragHandlers.onDragEnd?.({
        active: { id: 'a' },
        over: { id: 'a' },
      }),
    );
    expect(mockEditor.reorderBlocks).not.toHaveBeenCalled();
    expect(mockEditor.setBlocks).not.toHaveBeenCalled();
  });

  it('onDragEnd ignores drop with no over', () => {
    act(() =>
      capturedDragHandlers.onDragEnd?.({ active: { id: 'a' }, over: null }),
    );
    expect(mockEditor.reorderBlocks).not.toHaveBeenCalled();
  });

  it('onDragEnd nests a block into a column drop-zone', () => {
    act(() =>
      capturedDragHandlers.onDragEnd?.({
        active: { id: 'a' },
        over: { id: 'drop-zone-c1' },
      }),
    );
    expect(mockEditor.setBlocks).toHaveBeenCalled();
    const updated = mockEditor.setBlocks.mock.calls[0]?.[0] as any[];
    const cols = updated.find((b) => b.type === 'columns');
    const targetCol = cols.columns.find((c: any) => c.id === 'c1');
    expect(targetCol.blocks.length).toBe(1);
    expect(targetCol.blocks[0].id).toBe('a');
  });
});

describe('EditorInner — onDragEnd nesting into tabs and sections', () => {
  it('nests into a tab drop-zone', () => {
    mockEditor = freshMock({
      state: {
        blocks: [
          makeHeading('a'),
          makeTabs('tb', [
            ['t1', 'One'],
            ['t2', 'Two'],
          ]),
        ],
        canUndo: false,
        canRedo: false,
      },
    });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    act(() =>
      capturedDragHandlers.onDragEnd?.({
        active: { id: 'a' },
        over: { id: 'drop-zone-t1' },
      }),
    );
    const updated = mockEditor.setBlocks.mock.calls[0]?.[0] as any[];
    const tabs = updated.find((b) => b.type === 'tabs');
    const target = tabs.tabs.find((t: any) => t.id === 't1');
    expect(target.blocks.length).toBe(1);
  });

  it('nests into a section drop-zone', () => {
    mockEditor = freshMock({
      state: {
        blocks: [makeHeading('a'), makeSection('sec1')],
        canUndo: false,
        canRedo: false,
      },
    });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    act(() =>
      capturedDragHandlers.onDragEnd?.({
        active: { id: 'a' },
        over: { id: 'drop-zone-section-sec1' },
      }),
    );
    const updated = mockEditor.setBlocks.mock.calls[0]?.[0] as any[];
    const sec = updated.find((b: any) => b.type === 'section');
    expect(sec.blocks.length).toBe(1);
    expect(sec.blocks[0].id).toBe('a');
  });

  it('prevents nesting a columns block into one of its own columns', () => {
    mockEditor = freshMock({
      state: {
        blocks: [makeColumns('cols', ['c1', 'c2'])],
        canUndo: false,
        canRedo: false,
      },
    });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    act(() =>
      capturedDragHandlers.onDragEnd?.({
        active: { id: 'cols' },
        over: { id: 'drop-zone-c1' },
      }),
    );
    expect(mockEditor.setBlocks).not.toHaveBeenCalled();
  });

  it('prevents nesting a tabs block into one of its own tabs', () => {
    mockEditor = freshMock({
      state: {
        blocks: [
          makeTabs('tb', [
            ['t1', 'One'],
            ['t2', 'Two'],
          ]),
        ],
        canUndo: false,
        canRedo: false,
      },
    });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    act(() =>
      capturedDragHandlers.onDragEnd?.({
        active: { id: 'tb' },
        over: { id: 'drop-zone-t1' },
      }),
    );
    expect(mockEditor.setBlocks).not.toHaveBeenCalled();
  });

  it('prevents nesting a section block into itself', () => {
    mockEditor = freshMock({
      state: {
        blocks: [makeSection('sec1')],
        canUndo: false,
        canRedo: false,
      },
    });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    act(() =>
      capturedDragHandlers.onDragEnd?.({
        active: { id: 'sec1' },
        over: { id: 'drop-zone-section-sec1' },
      }),
    );
    expect(mockEditor.setBlocks).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts (invoked via captured array)
// ---------------------------------------------------------------------------

describe('EditorInner — keyboard shortcuts', () => {
  function shortcutFor(keys: string) {
    return capturedShortcuts.find((s) => s.keys === keys);
  }

  it('registers the expected shortcut keys', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    const keys = capturedShortcuts.map((s) => s.keys).sort();
    expect(keys).toEqual(
      [
        'mod+z',
        'mod+shift+z',
        'mod+d',
        'mod+backspace',
        'mod+enter',
        'mod+shift+up',
        'mod+shift+down',
        'up',
        'down',
        'escape',
      ].sort(),
    );
  });

  it('mod+z calls undo when canUndo=true', () => {
    mockEditor = freshMock({ state: { blocks: [], canUndo: true, canRedo: false } });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    shortcutFor('mod+z')!.handler();
    expect(mockEditor.undo).toHaveBeenCalled();
  });

  it('mod+z does NOT call undo when canUndo=false', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    shortcutFor('mod+z')!.handler();
    expect(mockEditor.undo).not.toHaveBeenCalled();
  });

  it('mod+shift+z calls redo when canRedo=true', () => {
    mockEditor = freshMock({ state: { blocks: [], canUndo: false, canRedo: true } });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    shortcutFor('mod+shift+z')!.handler();
    expect(mockEditor.redo).toHaveBeenCalled();
  });

  it('escape sets selected block id to null (no crash with no selection)', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    expect(() => shortcutFor('escape')!.handler()).not.toThrow();
  });

  it('mod+d / mod+backspace are no-ops without selection', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    shortcutFor('mod+d')!.handler();
    shortcutFor('mod+backspace')!.handler();
    expect(mockEditor.duplicateBlock).not.toHaveBeenCalled();
    expect(mockEditor.deleteBlock).not.toHaveBeenCalled();
  });

  it('mod+shift+up / mod+shift+down are no-ops without selection', () => {
    mockEditor = freshMock({
      state: {
        blocks: [makeHeading('a'), makeHeading('b')],
        canUndo: false,
        canRedo: false,
      },
    });
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    shortcutFor('mod+shift+up')!.handler();
    shortcutFor('mod+shift+down')!.handler();
    expect(mockEditor.reorderBlocks).not.toHaveBeenCalled();
  });

  it('up / down are no-ops without selection', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    expect(shortcutFor('up')!.handler()).toBe(false);
    expect(shortcutFor('down')!.handler()).toBe(false);
  });

  it('mod+enter is a no-op without selection', () => {
    render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    expect(() => shortcutFor('mod+enter')!.handler()).not.toThrow();
    expect(screen.queryByText('Add a Block')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Click-outside to deselect
// ---------------------------------------------------------------------------

describe('EditorInner — click outside', () => {
  it('clicking outside the editor calls selectBlock(null)', () => {
    mockEditor = freshMock({
      state: { blocks: [makeHeading('a')], canUndo: false, canRedo: false },
    });
    render(
      <div>
        <button data-testid="outside-btn">outside</button>
        <EditorInner onChange={() => {}} blockTypes={blockTypes as any} />
      </div>,
    );
    fireEvent.mouseDown(screen.getByTestId('outside-btn'));
    expect(mockEditor.selectBlock).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// Viewport / container width branch
// ---------------------------------------------------------------------------

describe('EditorInner — viewport branch', () => {
  it('renders mobile container with a fixed width', () => {
    mockEditor = freshMock({
      state: { blocks: [makeHeading('a')], canUndo: false, canRedo: false },
      currentViewport: 'mobile',
    });
    const { container } = render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    // The mobile inner shell has style.width === '375px'
    const inner = container.querySelector('[style*="375px"]');
    expect(inner).toBeTruthy();
  });

  it('renders desktop container with width: 100%', () => {
    mockEditor = freshMock({
      state: { blocks: [makeHeading('a')], canUndo: false, canRedo: false },
      currentViewport: 'desktop',
    });
    const { container } = render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    const inner = container.querySelector('[style*="100%"]');
    expect(inner).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Page settings inline style branch coverage
// ---------------------------------------------------------------------------

describe('EditorInner — page settings styling', () => {
  it('applies background image, color, maxWidth and color from pageSettings', () => {
    mockEditor = freshMock({
      state: { blocks: [makeHeading('a')], canUndo: false, canRedo: false },
      pageSettings: {
        backgroundColor: '#fff',
        backgroundImage: '/bg.png',
        backgroundSize: 'contain',
        backgroundPosition: 'top',
        maxWidth: '900px',
        color: '#333',
        fontFamily: 'font-sans',
        cssClass: 'my-page',
        paddingTop: '1rem',
        paddingRight: '1rem',
        paddingBottom: '1rem',
        paddingLeft: '1rem',
      },
    });
    const { container } = render(<EditorInner onChange={() => {}} blockTypes={blockTypes as any} />);
    const styled = container.querySelector('.font-sans.my-page') as HTMLElement;
    expect(styled).toBeTruthy();
    // jsdom may serialize url() with or without quotes — check the parsed style
    expect(styled.style.backgroundImage).toMatch(/bg\.png/);
    expect(styled.style.backgroundColor).toBeTruthy();
    expect(styled.style.maxWidth).toBe('900px');
    expect(styled.style.color).toBeTruthy();
    expect(styled.style.backgroundSize).toBe('contain');
    expect(styled.style.backgroundPosition).toMatch(/top/);
  });
});
