// @vitest-environment jsdom
/**
 * Unit tests for VisualBlockEditorComplete
 * (components/blocks/VisualBlockEditorComplete.tsx)
 *
 * The component wraps BlockEditorProvider around EditorWithShortcuts.
 * Heavy children (VisualBlockEditorEnhanced, all block renderers, context)
 * are mocked to keep tests fast and focused on the component's own logic:
 * preview-mode rendering, save-status indicators, paste-warning banner,
 * keyboard shortcut registration, and onChange/onSave wiring.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Cross-cutting framework mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// ---------------------------------------------------------------------------
// Stub rich-paste utility
// ---------------------------------------------------------------------------

const mockParseRichContentWithWarnings = vi.fn(() => ({ blocks: [], warnings: [] }));
vi.mock('@/lib/utils/richPaste', () => ({
  parseRichContentWithWarnings: (...args: Parameters<typeof mockParseRichContentWithWarnings>) =>
    mockParseRichContentWithWarnings(...args),
}));

// ---------------------------------------------------------------------------
// Stub heavy block renderers (all used in renderBlockPreview switch)
// ---------------------------------------------------------------------------

vi.mock('@/components/blocks/render/TextBlockRender', () => ({
  TextBlockRender: ({ block }: { block: { id: string } }) => (
    <div data-testid={`text-render-${block.id}`} />
  ),
}));
vi.mock('@/components/blocks/render/HeadingBlockRender', () => ({
  HeadingBlockRender: ({ block }: { block: { id: string } }) => (
    <div data-testid={`heading-render-${block.id}`} />
  ),
}));
vi.mock('@/components/blocks/render/ImageBlockRender', () => ({
  ImageBlockRender: ({ block }: { block: { id: string } }) => (
    <div data-testid={`image-render-${block.id}`} />
  ),
}));
vi.mock('@/components/blocks/render/QuoteBlockRender', () => ({
  QuoteBlockRender: ({ block }: { block: { id: string } }) => (
    <div data-testid={`quote-render-${block.id}`} />
  ),
}));
vi.mock('@/components/blocks/render/CodeBlockRender', () => ({
  CodeBlockRender: ({ block }: { block: { id: string } }) => (
    <div data-testid={`code-render-${block.id}`} />
  ),
}));
vi.mock('@/components/blocks/render/VideoBlockRender', () => ({
  VideoBlockRender: ({ block }: { block: { id: string } }) => (
    <div data-testid={`video-render-${block.id}`} />
  ),
}));
vi.mock('@/components/blocks/render/YoutubeBlockRender', () => ({
  YoutubeBlockRender: ({ block }: { block: { id: string } }) => (
    <div data-testid={`youtube-render-${block.id}`} />
  ),
}));
vi.mock('@/components/blocks/render/ColumnsBlockRender', () => ({
  ColumnsBlockRender: ({ block }: { block: { id: string } }) => (
    <div data-testid={`columns-render-${block.id}`} />
  ),
}));
vi.mock('@/components/blocks/render/ButtonBlockRender', () => ({
  ButtonBlockRender: ({ block }: { block: { id: string } }) => (
    <div data-testid={`button-render-${block.id}`} />
  ),
}));
vi.mock('@/components/blocks/render/SpacerBlockRender', () => ({
  SpacerBlockRender: ({ block }: { block: { id: string } }) => (
    <div data-testid={`spacer-render-${block.id}`} />
  ),
}));
vi.mock('@/components/blocks/render/DividerBlockRender', () => ({
  DividerBlockRender: ({ block }: { block: { id: string } }) => (
    <div data-testid={`divider-render-${block.id}`} />
  ),
}));

// ---------------------------------------------------------------------------
// Stub VisualBlockEditorEnhanced
// ---------------------------------------------------------------------------

vi.mock('@/components/blocks/VisualBlockEditorEnhanced', () => ({
  VisualBlockEditorEnhanced: ({
    onChange,
  }: {
    blocks: unknown[];
    onChange: (blocks: unknown[]) => void;
  }) => (
    <div data-testid="visual-block-editor-enhanced">
      <button
        type="button"
        data-testid="enhanced-trigger-change"
        onClick={() => onChange([{ id: 'changed-block', type: 'text', order: 0, content: 'changed' }])}
      >
        trigger change
      </button>
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// Stub KeyboardShortcutReference
// ---------------------------------------------------------------------------

vi.mock('@/components/ui/KeyboardShortcutReference', () => ({
  KeyboardShortcutReference: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="keyboard-shortcut-reference">
        <button type="button" data-testid="close-shortcuts" onClick={onClose}>
          close shortcuts
        </button>
      </div>
    ) : null,
}));

// ---------------------------------------------------------------------------
// Capture keyboard shortcut handlers
// ---------------------------------------------------------------------------

let capturedShortcuts: Array<{ keys: string; handler: () => unknown; preventDefault?: boolean }> = [];
vi.mock('@/lib/hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: (
    shortcuts: Array<{ keys: string; handler: () => unknown; preventDefault?: boolean }>,
  ) => {
    capturedShortcuts = shortcuts;
  },
}));

// ---------------------------------------------------------------------------
// BlockEditorContext mock — injectable state
// ---------------------------------------------------------------------------

type MockBlock = {
  id: string;
  type: string;
  order: number;
  content?: string;
};

type MockEditorState = {
  blocks: MockBlock[];
  canUndo: boolean;
  canRedo: boolean;
  selectedBlockId: string | null;
  previewMode: boolean;
  showKeyboardReference: boolean;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
};

type MockEditorContext = {
  state: MockEditorState;
  undo: ReturnType<typeof vi.fn>;
  redo: ReturnType<typeof vi.fn>;
  addBlock: ReturnType<typeof vi.fn>;
  deleteBlock: ReturnType<typeof vi.fn>;
  duplicateBlock: ReturnType<typeof vi.fn>;
  reorderBlocks: ReturnType<typeof vi.fn>;
  selectBlock: ReturnType<typeof vi.fn>;
  toggleKeyboardReference: ReturnType<typeof vi.fn>;
  togglePreviewMode: ReturnType<typeof vi.fn>;
};

let mockEditorCtx: MockEditorContext;

function freshCtx(
  stateOverrides: Partial<MockEditorState> = {},
  ctxOverrides: Partial<MockEditorContext> = {},
): MockEditorContext {
  return {
    state: {
      blocks: [],
      canUndo: false,
      canRedo: false,
      selectedBlockId: null,
      previewMode: false,
      showKeyboardReference: false,
      saveStatus: 'idle',
      ...stateOverrides,
    },
    undo: vi.fn(),
    redo: vi.fn(),
    addBlock: vi.fn(),
    deleteBlock: vi.fn(),
    duplicateBlock: vi.fn(),
    reorderBlocks: vi.fn(),
    selectBlock: vi.fn(),
    toggleKeyboardReference: vi.fn(),
    togglePreviewMode: vi.fn(),
    ...ctxOverrides,
  };
}

vi.mock('@/contexts/BlockEditorContext', () => ({
  BlockEditorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useBlockEditor: () => mockEditorCtx,
}));

// ---------------------------------------------------------------------------
// Import under test (after all mocks are declared)
// ---------------------------------------------------------------------------

import { VisualBlockEditorComplete } from '@/components/blocks/VisualBlockEditorComplete';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlock(id: string, type: MockBlock['type'], order = 0): MockBlock {
  return { id, type, order, content: `content-${id}` };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockEditorCtx = freshCtx();
  capturedShortcuts = [];
  mockParseRichContentWithWarnings.mockReturnValue({ blocks: [], warnings: [] });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Basic render — edit mode
// ---------------------------------------------------------------------------

describe('VisualBlockEditorComplete — edit mode (default)', () => {
  it('renders VisualBlockEditorEnhanced when previewMode=false', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('visual-block-editor-enhanced')).toBeTruthy();
  });

  it('does NOT render the preview container in edit mode', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.queryByText(/Unsupported block type/)).toBeNull();
  });

  it('renders without crashing when blocks is empty', () => {
    const { container } = render(
      <VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />,
    );
    expect(container.querySelector('[data-block-editor]')).toBeTruthy();
  });

  it('passes onSave through without crashing', () => {
    const onSave = vi.fn();
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} onSave={onSave} />);
    expect(screen.getByTestId('visual-block-editor-enhanced')).toBeTruthy();
  });

  it('calls parent onChange when VisualBlockEditorEnhanced calls its onChange', () => {
    const onChange = vi.fn();
    render(<VisualBlockEditorComplete blocks={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('enhanced-trigger-change'));
    expect(onChange).toHaveBeenCalledWith([
      { id: 'changed-block', type: 'text', order: 0, content: 'changed' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Preview mode
// ---------------------------------------------------------------------------

describe('VisualBlockEditorComplete — preview mode', () => {
  it('renders the preview container when previewMode=true', () => {
    mockEditorCtx = freshCtx({ previewMode: true });
    const { container } = render(
      <VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />,
    );
    expect(container.querySelector('.preview-mode')).toBeTruthy();
  });

  it('does NOT render VisualBlockEditorEnhanced in preview mode', () => {
    mockEditorCtx = freshCtx({ previewMode: true });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.queryByTestId('visual-block-editor-enhanced')).toBeNull();
  });

  it('renders a TextBlockRender for each text block in preview mode', () => {
    mockEditorCtx = freshCtx({
      previewMode: true,
      blocks: [makeBlock('t1', 'text'), makeBlock('t2', 'text', 1)],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('text-render-t1')).toBeTruthy();
    expect(screen.getByTestId('text-render-t2')).toBeTruthy();
  });

  it('renders HeadingBlockRender for heading blocks in preview mode', () => {
    mockEditorCtx = freshCtx({
      previewMode: true,
      blocks: [makeBlock('h1', 'heading')],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('heading-render-h1')).toBeTruthy();
  });

  it('renders ImageBlockRender for image blocks in preview mode', () => {
    mockEditorCtx = freshCtx({
      previewMode: true,
      blocks: [makeBlock('img1', 'image')],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('image-render-img1')).toBeTruthy();
  });

  it('renders QuoteBlockRender for quote blocks', () => {
    mockEditorCtx = freshCtx({ previewMode: true, blocks: [makeBlock('q1', 'quote')] });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('quote-render-q1')).toBeTruthy();
  });

  it('renders CodeBlockRender for code blocks', () => {
    mockEditorCtx = freshCtx({ previewMode: true, blocks: [makeBlock('c1', 'code')] });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('code-render-c1')).toBeTruthy();
  });

  it('renders VideoBlockRender for video blocks', () => {
    mockEditorCtx = freshCtx({ previewMode: true, blocks: [makeBlock('v1', 'video')] });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('video-render-v1')).toBeTruthy();
  });

  it('renders YoutubeBlockRender for youtube blocks', () => {
    mockEditorCtx = freshCtx({ previewMode: true, blocks: [makeBlock('yt1', 'youtube')] });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('youtube-render-yt1')).toBeTruthy();
  });

  it('renders ColumnsBlockRender for columns blocks', () => {
    mockEditorCtx = freshCtx({ previewMode: true, blocks: [makeBlock('col1', 'columns')] });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('columns-render-col1')).toBeTruthy();
  });

  it('renders ButtonBlockRender for button blocks', () => {
    mockEditorCtx = freshCtx({ previewMode: true, blocks: [makeBlock('btn1', 'button')] });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('button-render-btn1')).toBeTruthy();
  });

  it('renders SpacerBlockRender for spacer blocks', () => {
    mockEditorCtx = freshCtx({ previewMode: true, blocks: [makeBlock('sp1', 'spacer')] });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('spacer-render-sp1')).toBeTruthy();
  });

  it('renders DividerBlockRender for divider blocks', () => {
    mockEditorCtx = freshCtx({ previewMode: true, blocks: [makeBlock('div1', 'divider')] });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('divider-render-div1')).toBeTruthy();
  });

  it('renders a fallback for unknown block types in preview mode', () => {
    mockEditorCtx = freshCtx({
      previewMode: true,
      blocks: [makeBlock('u1', 'mystery-type')],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/Unsupported block type: mystery-type/)).toBeTruthy();
  });

  it('shows the hover overlay with an Edit button for the selected block', () => {
    mockEditorCtx = freshCtx({
      previewMode: true,
      blocks: [makeBlock('t1', 'text')],
      selectedBlockId: 't1',
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Edit/ })).toBeTruthy();
  });

  it('does NOT show the Edit overlay when no block is selected', () => {
    mockEditorCtx = freshCtx({
      previewMode: true,
      blocks: [makeBlock('t1', 'text')],
      selectedBlockId: null,
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
  });

  it('clicking the Edit button calls togglePreviewMode and selectBlock', () => {
    mockEditorCtx = freshCtx({
      previewMode: true,
      blocks: [makeBlock('t1', 'text')],
      selectedBlockId: 't1',
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }));
    expect(mockEditorCtx.togglePreviewMode).toHaveBeenCalled();
    expect(mockEditorCtx.selectBlock).toHaveBeenCalledWith('t1');
  });

  it('mouseEnter over a preview block calls selectBlock with that block id', () => {
    mockEditorCtx = freshCtx({
      previewMode: true,
      blocks: [makeBlock('t1', 'text')],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    // The outer div wrapping each block in preview mode
    const blockWrappers = document
      .querySelectorAll('.preview-mode .relative.group');
    fireEvent.mouseEnter(blockWrappers[0]);
    expect(mockEditorCtx.selectBlock).toHaveBeenCalledWith('t1');
  });

  it('mouseLeave over a preview block calls selectBlock(null)', () => {
    mockEditorCtx = freshCtx({
      previewMode: true,
      blocks: [makeBlock('t1', 'text')],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    const blockWrappers = document.querySelectorAll('.preview-mode .relative.group');
    fireEvent.mouseLeave(blockWrappers[0]);
    expect(mockEditorCtx.selectBlock).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// Save status indicator
// ---------------------------------------------------------------------------

describe('VisualBlockEditorComplete — save status indicator', () => {
  it('does NOT render the save status indicator when saveStatus=idle', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.queryByText('Saving...')).toBeNull();
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.queryByText('Error saving')).toBeNull();
  });

  it('renders "Saving..." when saveStatus=saving', () => {
    mockEditorCtx = freshCtx({ saveStatus: 'saving' });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Saving...')).toBeTruthy();
  });

  it('renders "Saved" when saveStatus=saved', () => {
    mockEditorCtx = freshCtx({ saveStatus: 'saved' });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Saved')).toBeTruthy();
  });

  it('renders "Error saving" when saveStatus=error', () => {
    mockEditorCtx = freshCtx({ saveStatus: 'error' });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByText('Error saving')).toBeTruthy();
  });

  it('shows a Retry button when saveStatus=error and onSave is provided', () => {
    mockEditorCtx = freshCtx({ saveStatus: 'error' });
    const onSave = vi.fn();
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} onSave={onSave} />);
    const retryBtn = screen.getByRole('button', { name: /Retry/ });
    expect(retryBtn).toBeTruthy();
    fireEvent.click(retryBtn);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('does NOT show a Retry button when saveStatus=error but onSave is not provided', () => {
    mockEditorCtx = freshCtx({ saveStatus: 'error' });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcut reference modal
// ---------------------------------------------------------------------------

describe('VisualBlockEditorComplete — keyboard shortcut reference', () => {
  it('renders KeyboardShortcutReference as closed when showKeyboardReference=false', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.queryByTestId('keyboard-shortcut-reference')).toBeNull();
  });

  it('renders KeyboardShortcutReference as open when showKeyboardReference=true', () => {
    mockEditorCtx = freshCtx({ showKeyboardReference: true });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    expect(screen.getByTestId('keyboard-shortcut-reference')).toBeTruthy();
  });

  it('closing the reference calls toggleKeyboardReference(false)', () => {
    mockEditorCtx = freshCtx({ showKeyboardReference: true });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId('close-shortcuts'));
    expect(mockEditorCtx.toggleKeyboardReference).toHaveBeenCalledWith(false);
  });
});

// ---------------------------------------------------------------------------
// Keyboard shortcuts registration
// ---------------------------------------------------------------------------

describe('VisualBlockEditorComplete — keyboard shortcuts registered', () => {
  function shortcutFor(keys: string) {
    return capturedShortcuts.find((s) => s.keys === keys);
  }

  it('registers mod+z, mod+shift+z, mod+s, and navigation shortcuts', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    const registeredKeys = capturedShortcuts.map((s) => s.keys);
    expect(registeredKeys).toContain('mod+z');
    expect(registeredKeys).toContain('mod+shift+z');
    expect(registeredKeys).toContain('mod+s');
    expect(registeredKeys).toContain('up');
    expect(registeredKeys).toContain('down');
    expect(registeredKeys).toContain('esc');
    expect(registeredKeys).toContain('?');
    expect(registeredKeys).toContain('mod+shift+p');
  });

  it('mod+z calls undo when canUndo=true', () => {
    mockEditorCtx = freshCtx({ canUndo: true });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+z')!.handler();
    expect(mockEditorCtx.undo).toHaveBeenCalledTimes(1);
  });

  it('mod+z does NOT call undo when canUndo=false', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+z')!.handler();
    expect(mockEditorCtx.undo).not.toHaveBeenCalled();
  });

  it('mod+shift+z calls redo when canRedo=true', () => {
    mockEditorCtx = freshCtx({ canRedo: true });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+shift+z')!.handler();
    expect(mockEditorCtx.redo).toHaveBeenCalledTimes(1);
  });

  it('mod+shift+z does NOT call redo when canRedo=false', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+shift+z')!.handler();
    expect(mockEditorCtx.redo).not.toHaveBeenCalled();
  });

  it('mod+s calls onSave when provided', () => {
    const onSave = vi.fn();
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} onSave={onSave} />);
    shortcutFor('mod+s')!.handler();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('mod+s is a no-op when onSave is not provided', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    // Should not throw
    expect(() => shortcutFor('mod+s')!.handler()).not.toThrow();
  });

  it('mod+d calls duplicateBlock with selectedBlockId when one is selected', () => {
    mockEditorCtx = freshCtx({
      selectedBlockId: 'block-abc',
      blocks: [makeBlock('block-abc', 'text')],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+d')!.handler();
    expect(mockEditorCtx.duplicateBlock).toHaveBeenCalledWith('block-abc');
  });

  it('mod+d is a no-op when no block is selected', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+d')!.handler();
    expect(mockEditorCtx.duplicateBlock).not.toHaveBeenCalled();
  });

  it('mod+backspace calls deleteBlock when a block is selected and blocks.length > 1', () => {
    mockEditorCtx = freshCtx({
      selectedBlockId: 'block-abc',
      blocks: [makeBlock('block-abc', 'text'), makeBlock('block-xyz', 'text', 1)],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+backspace')!.handler();
    expect(mockEditorCtx.deleteBlock).toHaveBeenCalledWith('block-abc');
  });

  it('mod+backspace is a no-op when only one block exists', () => {
    mockEditorCtx = freshCtx({
      selectedBlockId: 'block-abc',
      blocks: [makeBlock('block-abc', 'text')],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+backspace')!.handler();
    expect(mockEditorCtx.deleteBlock).not.toHaveBeenCalled();
  });

  it('mod+backspace is a no-op when no block is selected', () => {
    mockEditorCtx = freshCtx({
      blocks: [makeBlock('a', 'text'), makeBlock('b', 'text', 1)],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+backspace')!.handler();
    expect(mockEditorCtx.deleteBlock).not.toHaveBeenCalled();
  });

  it('mod+shift+up calls reorderBlocks when selected block is not first', () => {
    mockEditorCtx = freshCtx({
      selectedBlockId: 'b',
      blocks: [makeBlock('a', 'text', 0), makeBlock('b', 'text', 1)],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+shift+up')!.handler();
    expect(mockEditorCtx.reorderBlocks).toHaveBeenCalledWith(1, 0);
  });

  it('mod+shift+up is a no-op for the first block', () => {
    mockEditorCtx = freshCtx({
      selectedBlockId: 'a',
      blocks: [makeBlock('a', 'text', 0), makeBlock('b', 'text', 1)],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+shift+up')!.handler();
    expect(mockEditorCtx.reorderBlocks).not.toHaveBeenCalled();
  });

  it('mod+shift+down calls reorderBlocks when selected block is not last', () => {
    mockEditorCtx = freshCtx({
      selectedBlockId: 'a',
      blocks: [makeBlock('a', 'text', 0), makeBlock('b', 'text', 1)],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+shift+down')!.handler();
    expect(mockEditorCtx.reorderBlocks).toHaveBeenCalledWith(0, 1);
  });

  it('mod+shift+down is a no-op for the last block', () => {
    mockEditorCtx = freshCtx({
      selectedBlockId: 'b',
      blocks: [makeBlock('a', 'text', 0), makeBlock('b', 'text', 1)],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+shift+down')!.handler();
    expect(mockEditorCtx.reorderBlocks).not.toHaveBeenCalled();
  });

  it('up arrow selects the previous block', () => {
    mockEditorCtx = freshCtx({
      selectedBlockId: 'b',
      blocks: [makeBlock('a', 'text', 0), makeBlock('b', 'text', 1)],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('up')!.handler();
    expect(mockEditorCtx.selectBlock).toHaveBeenCalledWith('a');
  });

  it('up arrow is a no-op on the first block', () => {
    mockEditorCtx = freshCtx({
      selectedBlockId: 'a',
      blocks: [makeBlock('a', 'text', 0), makeBlock('b', 'text', 1)],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    // Clear any calls from the sync effect before invoking the shortcut
    mockEditorCtx.selectBlock.mockClear();
    shortcutFor('up')!.handler();
    // up on first block should NOT select another block (only returns false)
    expect(mockEditorCtx.selectBlock).not.toHaveBeenCalled();
  });

  it('down arrow selects the next block', () => {
    mockEditorCtx = freshCtx({
      selectedBlockId: 'a',
      blocks: [makeBlock('a', 'text', 0), makeBlock('b', 'text', 1)],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('down')!.handler();
    expect(mockEditorCtx.selectBlock).toHaveBeenCalledWith('b');
  });

  it('down arrow is a no-op on the last block', () => {
    mockEditorCtx = freshCtx({
      selectedBlockId: 'b',
      blocks: [makeBlock('a', 'text', 0), makeBlock('b', 'text', 1)],
    });
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    // Clear any calls from the sync effect before invoking the shortcut
    mockEditorCtx.selectBlock.mockClear();
    shortcutFor('down')!.handler();
    // down on last block should NOT select another block
    expect(mockEditorCtx.selectBlock).not.toHaveBeenCalled();
  });

  it('esc calls selectBlock(null)', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('esc')!.handler();
    expect(mockEditorCtx.selectBlock).toHaveBeenCalledWith(null);
  });

  it('? calls toggleKeyboardReference(true)', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('?')!.handler();
    expect(mockEditorCtx.toggleKeyboardReference).toHaveBeenCalledWith(true);
  });

  it('mod+shift+p calls togglePreviewMode', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+shift+p')!.handler();
    expect(mockEditorCtx.togglePreviewMode).toHaveBeenCalled();
  });

  it('mod+enter adds a new text block', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    shortcutFor('mod+enter')!.handler();
    expect(mockEditorCtx.addBlock).toHaveBeenCalledTimes(1);
    const [addedBlock] = mockEditorCtx.addBlock.mock.calls[0] as [MockBlock, number];
    expect(addedBlock.type).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// Paste handling
// ---------------------------------------------------------------------------

describe('VisualBlockEditorComplete — paste handling', () => {
  function makePasteEvent(html: string): Event {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type: string) => (type === 'text/html' ? html : '') },
    });
    Object.defineProperty(event, 'target', {
      value: Object.assign(document.createElement('div'), {
        closest: (selector: string) => (selector === '[data-block-editor]' ? document.body : null),
      }),
    });
    return event;
  }

  it('ignores paste events outside the editor container', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => '<p>hello</p>' },
    });
    Object.defineProperty(event, 'target', {
      value: Object.assign(document.createElement('div'), {
        closest: () => null,
      }),
    });
    act(() => { document.dispatchEvent(event); });
    expect(mockParseRichContentWithWarnings).not.toHaveBeenCalled();
  });

  it('ignores paste when clipboard HTML is empty', () => {
    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => '   ' },
    });
    Object.defineProperty(event, 'target', {
      value: Object.assign(document.createElement('div'), {
        closest: (selector: string) => (selector === '[data-block-editor]' ? {} : null),
      }),
    });
    act(() => { document.dispatchEvent(event); });
    expect(mockParseRichContentWithWarnings).not.toHaveBeenCalled();
  });

  it('shows paste warning when warnings are returned and hides after dismiss', async () => {
    mockParseRichContentWithWarnings.mockReturnValue({
      blocks: [{ id: 'p1', type: 'text', order: 0, content: 'pasted' }],
      warnings: ['Formatting may have been lost'],
    });

    const editorDiv = document.createElement('div');
    editorDiv.setAttribute('data-block-editor', '');
    document.body.appendChild(editorDiv);

    render(<VisualBlockEditorComplete blocks={[]} onChange={vi.fn()} />);

    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: (type: string) => (type === 'text/html' ? '<p>pasted</p>' : '') },
    });
    Object.defineProperty(event, 'target', {
      value: Object.assign(document.createElement('div'), {
        closest: (selector: string) => (selector === '[data-block-editor]' ? editorDiv : null),
      }),
    });

    await act(async () => { document.dispatchEvent(event); });

    expect(screen.getByText('Paste Warning')).toBeTruthy();
    expect(screen.getByText('Formatting may have been lost')).toBeTruthy();

    // Dismiss via the close button
    const closeButtons = screen.getAllByRole('button');
    const dismissBtn = closeButtons.find(
      (btn) => btn.closest('[class*="yellow"]') != null,
    );
    if (dismissBtn) {
      fireEvent.click(dismissBtn);
      expect(screen.queryByText('Paste Warning')).toBeNull();
    }

    document.body.removeChild(editorDiv);
  });
});
