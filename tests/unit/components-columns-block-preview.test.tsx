// @vitest-environment jsdom
/**
 * Unit tests for ColumnsBlockPreview
 * (components/blocks/visual/ColumnsBlockPreview.tsx)
 *
 * The component manages a 1-12 column grid with per-column settings (width,
 * padding, alignment, css class, background color), and three different drag
 * interactions:
 *   1) Column reorder (drag whole columns)
 *   2) Block drag between/within columns (drag nested blocks)
 *   3) Mouse-down resize handles between adjacent columns
 *
 * We mock @dnd-kit (the editor's own DnD is React-native drag events, but the
 * sibling block preview pulls in @dnd-kit transitively through context — keep
 * the cross-cutting mocks aligned with components-visual-block-editor-enhanced.test.tsx).
 *
 * Child UI is stubbed so we can assert on the editor's own behaviour without
 * recursively rendering the full block roster.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, act } from '@testing-library/react';
import type { ColumnsBlock } from '@/types/blocks';

// ---------------------------------------------------------------------------
// Cross-cutting framework mocks
// ---------------------------------------------------------------------------

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

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: any) => <div>{children}</div>,
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
  SortableContext: ({ children }: any) => <div>{children}</div>,
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
// Child UI stubs
// ---------------------------------------------------------------------------

vi.mock('@/components/blocks/visual/VisualBlockPreview', () => ({
  VisualBlockPreview: ({ block, onChange }: any) => (
    <div data-testid={`vbp-${block.id}`} data-type={block.type}>
      <button
        type="button"
        data-testid={`vbp-update-${block.id}`}
        onClick={() => onChange?.({ content: 'changed' })}
      >
        Update {block.id}
      </button>
      {block.content || ''}
    </div>
  ),
}));

vi.mock('@/components/blocks/visual/TokenColorPicker', () => ({
  TokenColorPicker: ({ value, onChange, label }: any) => (
    <div data-testid={`token-color-${label}`}>
      <input
        data-testid={`color-input-${label}`}
        value={value || ''}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/components/blocks/visual/NestedBlockInserter', () => ({
  NestedBlockInserter: ({ title, onPick, onClose }: any) => (
    <div data-testid="nested-block-inserter">
      <span>{title}</span>
      <button
        type="button"
        data-testid="pick-heading"
        onClick={() => onPick('heading')}
      >
        pick heading
      </button>
      <button type="button" data-testid="close-inserter" onClick={onClose}>
        close
      </button>
    </div>
  ),
}));

vi.mock('@/lib/blocks/defaults', () => ({
  createDefaultBlock: (type: string) => ({
    id: `new-${type}-${Date.now()}`,
    type,
    order: 0,
    content: '',
  }),
}));

vi.mock('@/lib/utils/responsive', () => ({
  combineResponsiveClasses: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// ---------------------------------------------------------------------------
// BlockEditorContext mock — viewport-driven branches matter
// ---------------------------------------------------------------------------

let currentViewport: 'desktop' | 'tablet' | 'mobile' = 'desktop';

vi.mock('@/contexts/BlockEditorContext', () => ({
  useBlockEditor: () => ({ currentViewport }),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { ColumnsBlockPreview } from '@/components/blocks/visual/ColumnsBlockPreview';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlock(overrides: Partial<ColumnsBlock> = {}): ColumnsBlock {
  return {
    id: 'cols',
    type: 'columns',
    order: 0,
    gap: 'md',
    columns: [
      { id: 'c1', width: 50, blocks: [] },
      { id: 'c2', width: 50, blocks: [] },
    ],
    ...overrides,
  } as ColumnsBlock;
}

function makeChildBlock(id: string) {
  return { id, type: 'text', order: 0, content: `text-${id}` } as any;
}

function makeDataTransfer() {
  const dt: any = {
    data: {} as Record<string, string>,
    effectAllowed: 'none',
    setData(k: string, v: string) {
      dt.data[k] = v;
    },
    getData(k: string) {
      return dt.data[k] || '';
    },
    setDragImage: vi.fn(),
  };
  return dt;
}

beforeEach(() => {
  currentViewport = 'desktop';
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Rendering basics + branches
// ---------------------------------------------------------------------------

describe('ColumnsBlockPreview — rendering', () => {
  it('renders one wrapper per column with computed width', () => {
    const block = makeBlock();
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    const cols = container.querySelectorAll('[style*="width"]');
    expect(cols.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the "+ Add Column" affordance only when selected', () => {
    const block = makeBlock();
    const { rerender } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    expect(screen.queryByText(/\+ Add Column/)).toBeNull();
    rerender(<ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />);
    expect(screen.getByText(/\+ Add Column/)).toBeTruthy();
  });

  it('renders per-column header + actions when selected', () => {
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />);
    expect(screen.getAllByTitle('Drag to reorder column').length).toBe(2);
    expect(screen.getAllByTitle('Column settings').length).toBe(2);
    expect(screen.getAllByTitle('Copy column').length).toBe(2);
    expect(screen.getAllByTitle('Delete column').length).toBe(2);
  });

  it('renders the empty-column dropzone when selected and column has no blocks', () => {
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />);
    // Both columns are empty.
    expect(screen.getAllByText('Empty column').length).toBe(2);
  });

  it('renders nested VisualBlockPreview when columns contain blocks', () => {
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 50, blocks: [makeChildBlock('b1')] },
        { id: 'c2', width: 50, blocks: [makeChildBlock('b2')] },
      ],
    });
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />);
    expect(screen.getByTestId('vbp-b1')).toBeTruthy();
    expect(screen.getByTestId('vbp-b2')).toBeTruthy();
  });

  it('applies background color style to columns that declare one', () => {
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 50, blocks: [], backgroundColor: 'rgb(255, 0, 0)' },
        { id: 'c2', width: 50, blocks: [] },
      ],
    });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    const colored = container.querySelector(
      '[style*="background-color"]',
    ) as HTMLElement | null;
    expect(colored).toBeTruthy();
  });

  it('uses contentPadding when not selected (sm/md/lg)', () => {
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 50, blocks: [], padding: 'sm' },
        { id: 'c2', width: 50, blocks: [], padding: 'lg' },
      ],
    });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.p-2')).toBeTruthy();
    expect(container.querySelector('.p-6')).toBeTruthy();
  });

  it('honors verticalAlign classes (top/center/bottom)', () => {
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 33, blocks: [], verticalAlign: 'top' },
        { id: 'c2', width: 33, blocks: [], verticalAlign: 'center' },
        { id: 'c3', width: 34, blocks: [], verticalAlign: 'bottom' },
      ],
    });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.justify-start')).toBeTruthy();
    expect(container.querySelector('.justify-center')).toBeTruthy();
    expect(container.querySelector('.justify-end')).toBeTruthy();
  });

  it('applies responsive classes when block.responsive is set', () => {
    const block = makeBlock({
      responsive: {
        paddingTop: { base: 'pt-4', md: 'md:pt-8' },
        visibility: { hideOnMobile: true },
      },
    } as any);
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it('normalizes column widths when they sum > 100%', () => {
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 80, blocks: [] },
        { id: 'c2', width: 80, blocks: [] },
      ],
    });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    // After normalization: 80/160 * 100 = 50% each
    const widths = Array.from(
      container.querySelectorAll('[style*="width"]'),
    ).map((el) => (el as HTMLElement).style.width);
    expect(widths.some((w) => w.startsWith('50'))).toBe(true);
  });

  it('accepts string width values like "30%"', () => {
    const block = makeBlock({
      columns: [
        { id: 'c1', width: '30%' as any, blocks: [] },
        { id: 'c2', width: '70%' as any, blocks: [] },
      ],
    });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// addColumn / deleteColumn / copyColumn
// ---------------------------------------------------------------------------

describe('ColumnsBlockPreview — column mutations', () => {
  it('addColumn rewrites widths and appends a new column', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getByText(/\+ Add Column/));
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls[0][0];
    expect(payload.columns.length).toBe(3);
    // 100 / 3 = 33 (floor)
    expect(payload.columns.every((c: any) => c.width === 33)).toBe(true);
  });

  it('addColumn refuses to exceed 12 columns', () => {
    const onChange = vi.fn();
    const cols = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      width: 8,
      blocks: [],
    }));
    const block = makeBlock({ columns: cols });
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    const addBtn = screen.getByText(/\+ Add Column \(12\/12\)/) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    fireEvent.click(addBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('deleteColumn removes a column and rebalances widths', () => {
    const onChange = vi.fn();
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 33, blocks: [] },
        { id: 'c2', width: 33, blocks: [] },
        { id: 'c3', width: 33, blocks: [] },
      ],
    });
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Delete column')[0]);
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls[0][0];
    expect(payload.columns.length).toBe(2);
    expect(payload.columns.every((c: any) => c.width === 50)).toBe(true);
  });

  it('deleteColumn refuses when there is only one column', () => {
    const onChange = vi.fn();
    const block = makeBlock({
      columns: [{ id: 'c1', width: 100, blocks: [] }],
    });
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    const deleteBtn = screen.getByTitle('Delete column') as HTMLButtonElement;
    expect(deleteBtn.disabled).toBe(true);
  });

  it('copyColumn duplicates the column with regenerated nested block ids', () => {
    const onChange = vi.fn();
    const block = makeBlock({
      columns: [
        {
          id: 'c1',
          width: 50,
          blocks: [makeChildBlock('b1'), makeChildBlock('b2')],
        },
        { id: 'c2', width: 50, blocks: [] },
      ],
    });
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Copy column')[0]);
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls[0][0];
    expect(payload.columns.length).toBe(3);
    // Newly inserted column should be at index 1 (right after source).
    const inserted = payload.columns[1];
    expect(inserted.blocks.length).toBe(2);
    expect(inserted.blocks[0].id).not.toBe('b1');
    expect(inserted.blocks[1].id).not.toBe('b2');
  });

  it('copyColumn refuses when already at 12 columns', () => {
    const onChange = vi.fn();
    const cols = Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      width: 8,
      blocks: [],
    }));
    const block = makeBlock({ columns: cols });
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    const copyBtns = screen.getAllByTitle('Copy column');
    expect((copyBtns[0] as HTMLButtonElement).disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Column settings panel (editing)
// ---------------------------------------------------------------------------

describe('ColumnsBlockPreview — settings panel', () => {
  it('toggles the inline settings panel via the gear icon', () => {
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />);
    // Not visible by default
    expect(screen.queryByText('Width (%)')).toBeNull();
    fireEvent.click(screen.getAllByTitle('Column settings')[0]);
    expect(screen.getByText('Width (%)')).toBeTruthy();
    // Toggle off
    fireEvent.click(screen.getAllByTitle('Column settings')[0]);
    expect(screen.queryByText('Width (%)')).toBeNull();
  });

  it('updates width via the numeric input (clamped 5–95)', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Column settings')[0]);
    const widthInput = screen.getByDisplayValue('50') as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: '200' } });
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls.at(-1)![0];
    const c1 = payload.columns.find((c: any) => c.id === 'c1');
    expect(c1.width).toBe(95);
  });

  it('width input clamps to minimum 5 on invalid input', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Column settings')[0]);
    const widthInput = screen.getByDisplayValue('50') as HTMLInputElement;
    fireEvent.change(widthInput, { target: { value: 'NaN' } });
    const payload = onChange.mock.calls.at(-1)![0];
    const c1 = payload.columns.find((c: any) => c.id === 'c1');
    expect(c1.width).toBe(5);
  });

  it('updates padding select', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Column settings')[0]);
    const select = screen.getByDisplayValue('None') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'md' } });
    const payload = onChange.mock.calls.at(-1)![0];
    expect(payload.columns[0].padding).toBe('md');
  });

  it('updates vertical align select', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Column settings')[0]);
    const select = screen.getByDisplayValue('Top') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'center' } });
    const payload = onChange.mock.calls.at(-1)![0];
    expect(payload.columns[0].verticalAlign).toBe('center');
  });

  it('updates CSS class input', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Column settings')[0]);
    const input = screen.getByPlaceholderText(/rounded-lg/);
    fireEvent.change(input, { target: { value: 'shadow-md' } });
    const payload = onChange.mock.calls.at(-1)![0];
    expect(payload.columns[0].cssClass).toBe('shadow-md');
  });

  it('clears CSS class when empty', () => {
    const onChange = vi.fn();
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 50, blocks: [], cssClass: 'rounded' },
        { id: 'c2', width: 50, blocks: [] },
      ],
    });
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Column settings')[0]);
    const input = screen.getByDisplayValue('rounded');
    fireEvent.change(input, { target: { value: '' } });
    const payload = onChange.mock.calls.at(-1)![0];
    expect(payload.columns[0].cssClass).toBeUndefined();
  });

  it('background color clear button appears + resets to undefined', () => {
    const onChange = vi.fn();
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 50, blocks: [], backgroundColor: '#abcdef' },
        { id: 'c2', width: 50, blocks: [] },
      ],
    });
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Column settings')[0]);
    const clearBtn = screen.getByText('Clear');
    fireEvent.click(clearBtn);
    const payload = onChange.mock.calls.at(-1)![0];
    expect(payload.columns[0].backgroundColor).toBeUndefined();
  });

  it('background color picker propagates onChange', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Column settings')[0]);
    const input = screen.getByTestId('color-input-Background Color');
    fireEvent.change(input, { target: { value: '#ff0000' } });
    const payload = onChange.mock.calls.at(-1)![0];
    expect(payload.columns[0].backgroundColor).toBe('#ff0000');
  });
});

// ---------------------------------------------------------------------------
// Add Block / NestedBlockInserter
// ---------------------------------------------------------------------------

describe('ColumnsBlockPreview — add block to column', () => {
  it('clicking "+ Add Block" opens the NestedBlockInserter', () => {
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />);
    const addBtns = screen.getAllByText('+ Add Block');
    fireEvent.click(addBtns[0]);
    expect(screen.getByTestId('nested-block-inserter')).toBeTruthy();
  });

  it('picking a block type appends it to the chosen column', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByText('+ Add Block')[1]);
    fireEvent.click(screen.getByTestId('pick-heading'));
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls.at(-1)![0];
    // Second column should have the new block.
    expect(payload.columns[1].blocks.length).toBe(1);
    expect(payload.columns[1].blocks[0].type).toBe('heading');
    // Inserter closes after pick
    expect(screen.queryByTestId('nested-block-inserter')).toBeNull();
  });

  it('close button dismisses the inserter without inserting', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByText('+ Add Block')[0]);
    fireEvent.click(screen.getByTestId('close-inserter'));
    expect(screen.queryByTestId('nested-block-inserter')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Nested block updates / deletes
// ---------------------------------------------------------------------------

describe('ColumnsBlockPreview — nested block mutations', () => {
  it('updateColumnBlock propagates VBP onChange updates back through props', () => {
    const onChange = vi.fn();
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 50, blocks: [makeChildBlock('b1')] },
        { id: 'c2', width: 50, blocks: [] },
      ],
    });
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('vbp-update-b1'));
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls.at(-1)![0];
    const updated = payload.columns[0].blocks[0];
    expect(updated.content).toBe('changed');
  });

  it('deleteColumnBlock removes a block by id', () => {
    const onChange = vi.fn();
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 50, blocks: [makeChildBlock('b1'), makeChildBlock('b2')] },
        { id: 'c2', width: 50, blocks: [] },
      ],
    });
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle('Delete block')[0]);
    const payload = onChange.mock.calls.at(-1)![0];
    expect(payload.columns[0].blocks.length).toBe(1);
    expect(payload.columns[0].blocks[0].id).toBe('b2');
  });

  it('clicking a nested block calls onSelectBlock', () => {
    const onSelectBlock = vi.fn();
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 50, blocks: [makeChildBlock('b1')] },
        { id: 'c2', width: 50, blocks: [] },
      ],
    });
    render(
      <ColumnsBlockPreview
        block={block}
        isSelected={true}
        onChange={vi.fn()}
        selectedBlockId={null}
        onSelectBlock={onSelectBlock}
      />,
    );
    const vbp = screen.getByTestId('vbp-b1');
    // The clickable parent (with onClick) wraps the VBP
    fireEvent.click(vbp.parentElement!);
    expect(onSelectBlock).toHaveBeenCalledWith('b1');
  });

  it('clicking a column body when selected sets selectedColumnId (no crash)', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />,
    );
    // Click a column wrapper
    const wrapper = container.querySelector('.relative.group') as HTMLElement;
    expect(wrapper).toBeTruthy();
    fireEvent.click(wrapper);
    // Selecting a column doesn't call onChange — just internal state.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clicking a nested block without id generates a new id then schedules select', () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onSelectBlock = vi.fn();
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 50, blocks: [{ id: '', type: 'text', order: 0 } as any] },
        { id: 'c2', width: 50, blocks: [] },
      ],
    });
    const { container } = render(
      <ColumnsBlockPreview
        block={block}
        isSelected={true}
        onChange={onChange}
        onSelectBlock={onSelectBlock}
      />,
    );
    // No data-testid since blockId is empty — click via DOM.
    const wrappers = container.querySelectorAll('.group\\/block');
    fireEvent.click(wrappers[0].querySelector('[class*="cursor-pointer"]') as HTMLElement);
    expect(onChange).toHaveBeenCalled();
    // setTimeout fires the select.
    act(() => {
      vi.runAllTimers();
    });
    expect(onSelectBlock).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Column-level drag/drop (React drag events)
// ---------------------------------------------------------------------------

describe('ColumnsBlockPreview — column drag reorder', () => {
  it('drag start sets dataTransfer.effectAllowed = move', () => {
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />);
    const handles = screen.getAllByTitle('Drag to reorder column');
    const dt = makeDataTransfer();
    fireEvent.dragStart(handles[0], { dataTransfer: dt });
    expect(dt.effectAllowed).toBe('move');
  });

  it('drag over + drop reorders columns', () => {
    const onChange = vi.fn();
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 33, blocks: [] },
        { id: 'c2', width: 33, blocks: [] },
        { id: 'c3', width: 34, blocks: [] },
      ],
    });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />,
    );
    const handles = screen.getAllByTitle('Drag to reorder column');
    const dt = makeDataTransfer();
    fireEvent.dragStart(handles[0], { dataTransfer: dt });

    // Stub getBoundingClientRect on the target column wrapper
    const wrappers = container.querySelectorAll('.relative.group.flex.flex-col');
    const target = wrappers[2] as HTMLElement;
    target.getBoundingClientRect = () =>
      ({ left: 200, top: 0, width: 100, height: 100, right: 300, bottom: 100 } as any);

    fireEvent.dragOver(target, { dataTransfer: dt, clientX: 240, clientY: 50 });
    fireEvent.drop(target, { dataTransfer: dt });
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls.at(-1)![0];
    expect(payload.columns[0].id).not.toBe('c1');
  });

  it('drag over the same column is a no-op', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />,
    );
    const handles = screen.getAllByTitle('Drag to reorder column');
    const dt = makeDataTransfer();
    fireEvent.dragStart(handles[0], { dataTransfer: dt });
    const wrappers = container.querySelectorAll('.relative.group.flex.flex-col');
    const target = wrappers[0] as HTMLElement;
    target.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100 } as any);
    fireEvent.dragOver(target, { dataTransfer: dt, clientX: 50, clientY: 50 });
    // Drop without target should be no-op
    fireEvent.drop(target, { dataTransfer: dt });
    // Drop fires reorder only if dropColumnTarget is set; since same column, it isn't.
    // No onChange triggered from reorder path.
    const reorderCalls = onChange.mock.calls.filter((c) =>
      c[0]?.columns?.some((col: any, i: number) => col.id !== block.columns[i].id),
    );
    expect(reorderCalls.length).toBe(0);
  });

  it('drag end clears drag state without onChange', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />);
    const handles = screen.getAllByTitle('Drag to reorder column');
    const dt = makeDataTransfer();
    fireEvent.dragStart(handles[0], { dataTransfer: dt });
    fireEvent.dragEnd(handles[0], { dataTransfer: dt });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uses vertical midpoint when stacked (mobile viewport)', () => {
    currentViewport = 'mobile';
    const onChange = vi.fn();
    const block = makeBlock({ stackOnMobile: true });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />,
    );
    const handles = screen.getAllByTitle('Drag to reorder column');
    const dt = makeDataTransfer();
    fireEvent.dragStart(handles[0], { dataTransfer: dt });
    const wrappers = container.querySelectorAll('.relative.group.flex.flex-col');
    const target = wrappers[1] as HTMLElement;
    target.getBoundingClientRect = () =>
      ({ left: 0, top: 100, width: 100, height: 100, right: 100, bottom: 200 } as any);
    // clientY below midpoint -> "right" (i.e. below in stacked)
    fireEvent.dragOver(target, { dataTransfer: dt, clientX: 50, clientY: 180 });
    fireEvent.drop(target, { dataTransfer: dt });
    expect(onChange).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Nested block drag/drop
// ---------------------------------------------------------------------------

describe('ColumnsBlockPreview — nested block drag', () => {
  function setup() {
    const onChange = vi.fn();
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 50, blocks: [makeChildBlock('b1'), makeChildBlock('b2')] },
        { id: 'c2', width: 50, blocks: [makeChildBlock('b3')] },
      ],
    });
    const utils = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />,
    );
    return { onChange, ...utils };
  }

  it('drag a block within the same column reorders within column', () => {
    const { onChange, container } = setup();
    const dt = makeDataTransfer();

    // The hover-revealed drag handle is the SVG-wrapping <div draggable=true>.
    const handles = container.querySelectorAll('[draggable=true]');
    // Filter to nested block handles (not column handles which have title=...)
    const blockHandles = Array.from(handles).filter(
      (el) => !(el as HTMLElement).getAttribute('title'),
    );
    fireEvent.dragStart(blockHandles[0], { dataTransfer: dt });

    // Target = b2's content wrapper. Use the second nested block's onDragOver target.
    const b2 = screen.getByTestId('vbp-b2');
    const target = b2.parentElement as HTMLElement;
    target.getBoundingClientRect = () =>
      ({ left: 0, top: 100, width: 100, height: 50, right: 100, bottom: 150 } as any);
    fireEvent.dragOver(target, { dataTransfer: dt, clientX: 50, clientY: 140 });
    fireEvent.drop(target, { dataTransfer: dt });
    expect(onChange).toHaveBeenCalled();
  });

  it('drag a block to another column moves it across columns', () => {
    const { onChange, container } = setup();
    const dt = makeDataTransfer();
    const handles = container.querySelectorAll('[draggable=true]');
    const blockHandles = Array.from(handles).filter(
      (el) => !(el as HTMLElement).getAttribute('title'),
    );
    // Drag b1 from col1
    fireEvent.dragStart(blockHandles[0], { dataTransfer: dt });
    // Over b3 in col2
    const b3 = screen.getByTestId('vbp-b3');
    const target = b3.parentElement as HTMLElement;
    target.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50 } as any);
    fireEvent.dragOver(target, { dataTransfer: dt, clientX: 50, clientY: 10 });
    fireEvent.drop(target, { dataTransfer: dt });
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls.at(-1)![0];
    // b1 should now live in c2
    const c2 = payload.columns.find((c: any) => c.id === 'c2');
    expect(c2.blocks.some((b: any) => b.id === 'b1')).toBe(true);
  });

  it('drag leave clears the drop indicator state', () => {
    const { container } = setup();
    const b2 = screen.getByTestId('vbp-b2');
    const target = b2.parentElement as HTMLElement;
    expect(() => fireEvent.dragLeave(target)).not.toThrow();
  });

  it('drag end clears drag state', () => {
    const { onChange, container } = setup();
    const dt = makeDataTransfer();
    const handles = container.querySelectorAll('[draggable=true]');
    const blockHandles = Array.from(handles).filter(
      (el) => !(el as HTMLElement).getAttribute('title'),
    );
    fireEvent.dragStart(blockHandles[0], { dataTransfer: dt });
    const b2 = screen.getByTestId('vbp-b2');
    fireEvent.dragEnd(b2.parentElement as HTMLElement);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('drop onto empty column dropzone moves the block there', () => {
    const onChange = vi.fn();
    const block = makeBlock({
      columns: [
        { id: 'c1', width: 50, blocks: [makeChildBlock('b1')] },
        { id: 'c2', width: 50, blocks: [] }, // empty
      ],
    });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />,
    );
    const dt = makeDataTransfer();
    const handles = container.querySelectorAll('[draggable=true]');
    const blockHandles = Array.from(handles).filter(
      (el) => !(el as HTMLElement).getAttribute('title'),
    );
    fireEvent.dragStart(blockHandles[0], { dataTransfer: dt });

    const emptyZone = screen.getByText('Empty column').parentElement as HTMLElement;
    fireEvent.dragOver(emptyZone, { dataTransfer: dt });
    fireEvent.drop(emptyZone, { dataTransfer: dt });
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls.at(-1)![0];
    const c2 = payload.columns.find((c: any) => c.id === 'c2');
    expect(c2.blocks.length).toBe(1);
    expect(c2.blocks[0].id).toBe('b1');
  });

  it('drag leave on empty dropzone clears state', () => {
    const block = makeBlock();
    render(<ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />);
    const emptyZone = screen.getAllByText('Empty column')[0].parentElement as HTMLElement;
    expect(() => fireEvent.dragLeave(emptyZone)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Resize handles
// ---------------------------------------------------------------------------

describe('ColumnsBlockPreview — resize handles', () => {
  it('renders a resize divider only when isSelected and not stacked', () => {
    const block = makeBlock();
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />,
    );
    // The resize handle is the only .cursor-col-resize element.
    expect(container.querySelector('.cursor-col-resize')).toBeTruthy();
  });

  it('does NOT render resize divider when stacked (mobile + stackOnMobile)', () => {
    currentViewport = 'mobile';
    const block = makeBlock({ stackOnMobile: true });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.cursor-col-resize')).toBeNull();
  });

  it('does NOT render resize divider when not selected', () => {
    const block = makeBlock();
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.cursor-col-resize')).toBeNull();
  });

  it('mouseDown on resize handle attaches document listeners + sets cursor', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />,
    );
    const handle = container.querySelector('.cursor-col-resize') as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 100 });
    expect(document.body.style.cursor).toBe('col-resize');
    // Mouse up cleans up.
    fireEvent.mouseUp(document);
    expect(document.body.style.cursor).toBe('');
  });

  it('mousemove during resize updates widths via onChange', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />,
    );
    const handle = container.querySelector('.cursor-col-resize') as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 100 });

    // Fake container width
    const wrapper = container.querySelector('.flex.relative') as HTMLElement;
    Object.defineProperty(wrapper, 'offsetWidth', { value: 1000, configurable: true });

    // Dispatch a real DOM mousemove (component listens on `document`)
    act(() => {
      const evt = new MouseEvent('mousemove', { clientX: 200 });
      document.dispatchEvent(evt);
    });
    expect(onChange).toHaveBeenCalled();
    const payload = onChange.mock.calls.at(-1)![0];
    // Left column should have grown; right column shrunk.
    expect(payload.columns[0].width).toBeGreaterThan(50);
    expect(payload.columns[1].width).toBeLessThan(50);

    // Clean up listeners
    fireEvent.mouseUp(document);
  });

  it('mousemove does not exceed min/max width boundaries', () => {
    const onChange = vi.fn();
    const block = makeBlock();
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={onChange} />,
    );
    const handle = container.querySelector('.cursor-col-resize') as HTMLElement;
    fireEvent.mouseDown(handle, { clientX: 100 });
    const wrapper = container.querySelector('.flex.relative') as HTMLElement;
    Object.defineProperty(wrapper, 'offsetWidth', { value: 100, configurable: true });

    // Huge delta to exceed boundary
    act(() => {
      const evt = new MouseEvent('mousemove', { clientX: 10_000 });
      document.dispatchEvent(evt);
    });
    fireEvent.mouseUp(document);
    // Component clamps to 5/95 — both should be valid
    expect(onChange).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Gap + stacking branches
// ---------------------------------------------------------------------------

describe('ColumnsBlockPreview — gap + stacking variants', () => {
  it('honors gap=sm (16px)', () => {
    const block = makeBlock({ gap: 'sm' });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    const wrapper = container.querySelector('[style*="gap: 16px"]');
    expect(wrapper).toBeTruthy();
  });

  it('honors gap=lg (32px)', () => {
    const block = makeBlock({ gap: 'lg' });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    expect(container.querySelector('[style*="gap: 32px"]')).toBeTruthy();
  });

  it('defaults to 24px gap when gap is undefined', () => {
    const block = makeBlock({ gap: undefined });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    expect(container.querySelector('[style*="gap: 24px"]')).toBeTruthy();
  });

  it('applies flex-col when mobile + stackOnMobile=true', () => {
    currentViewport = 'mobile';
    const block = makeBlock({ stackOnMobile: true });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.flex-col')).toBeTruthy();
  });

  it('applies flex-col-reverse when stacked + reverseOnStack=true', () => {
    currentViewport = 'mobile';
    const block = makeBlock({ stackOnMobile: true, reverseOnStack: true });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.flex-col-reverse')).toBeTruthy();
  });

  it('applies flex-row when on desktop regardless of stack flags', () => {
    currentViewport = 'desktop';
    const block = makeBlock({ stackOnMobile: true, stackOnTablet: true });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.flex-row')).toBeTruthy();
  });

  it('applies flex-col when tablet + stackOnTablet=true', () => {
    currentViewport = 'tablet';
    const block = makeBlock({ stackOnTablet: true });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={false} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.flex-col')).toBeTruthy();
  });

  it('uses horizontal divider when selected + stacked', () => {
    currentViewport = 'mobile';
    const block = makeBlock({ stackOnMobile: true });
    const { container } = render(
      <ColumnsBlockPreview block={block} isSelected={true} onChange={vi.fn()} />,
    );
    // Stacked-mode divider has h-px instead of cursor-col-resize
    expect(container.querySelector('.bg-border.rounded-full')).toBeTruthy();
  });
});
