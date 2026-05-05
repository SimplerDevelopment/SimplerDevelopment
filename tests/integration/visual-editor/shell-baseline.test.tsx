/**
 * VisualEditorShell — pre-refactor baseline.
 *
 * The shell is ~3800 LOC of mixed concerns (left/right panels, layers tree,
 * content/style sub-panels, postMessage bridge wiring, drag-and-drop, copy/
 * paste, image picker, template library). This spec pins the user-visible
 * contract before we extract those sections so the refactor can land without
 * changing observable behavior.
 *
 * The shell mounts an iframe and a postMessage parent hook. We mock the
 * heavy children (MediaPicker, BrandingProfileSelector, GoogleFontPicker,
 * StyleSettings, etc.) so jsdom can render the layers panel + right pane
 * shells without a running server.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Block } from '@/types/blocks';

// ── Mock heavy children + iframe-driven hook ──────────────────────────────────

vi.mock('@/lib/visual-editor/useVisualEditorParent', () => ({
  useVisualEditorParent: () => ({
    iframeRef: { current: null },
    iframeReady: false,
    customComponents: [],
    sendBlocksUpdate: vi.fn(),
    sendSelectBlock: vi.fn(),
    sendHoverBlock: vi.fn(),
    handleIframeLoad: vi.fn(),
    sendUndo: vi.fn(),
    sendRedo: vi.fn(),
    undoRedoState: { canUndo: false, canRedo: false },
    sendExternalDragStart: vi.fn(),
    sendExternalDragMove: vi.fn(),
    sendExternalDragEnd: vi.fn(),
    sendExternalDragCancel: vi.fn(),
    sendCustomCodeUpdate: vi.fn(),
  }),
}));

vi.mock('@/components/admin/MediaPicker', () => ({
  default: () => <div data-testid="media-picker-mock" />,
}));

vi.mock('@/components/portal/BrandingProfileSelector', () => ({
  default: () => <div data-testid="branding-profile-selector-mock" />,
}));

vi.mock('@/components/blocks/visual/StyleSettings', () => ({
  StyleSettings: () => <div data-testid="style-settings-mock" />,
}));

vi.mock('@/components/blocks/visual/StyleVariantsButton', () => ({
  StyleVariantsButton: () => <div data-testid="style-variants-mock" />,
}));

vi.mock('@/components/blocks/visual/GoogleFontPicker', () => ({
  GoogleFontPicker: () => <div data-testid="font-picker-mock" />,
}));

vi.mock('@/components/blocks/SaveAsTemplateModal', () => ({
  SaveAsTemplateModal: () => <div data-testid="save-as-template-mock" />,
}));

vi.mock('@/components/blocks/TemplateLibrary', () => ({
  TemplateLibrary: () => <div data-testid="template-library-mock" />,
}));

vi.mock('@/components/portal/IconPicker', () => ({
  IconPicker: () => <div data-testid="icon-picker-mock" />,
}));

vi.mock('@/components/portal/visual-editor/HtmlRenderEditor', () => ({
  HtmlRenderEditor: () => <div data-testid="html-render-editor-mock" />,
  ImagePickerModal: () => <div data-testid="image-picker-modal-mock" />,
}));

import { VisualEditorShell } from '@/components/portal/VisualEditorShell';

const baseProps = {
  iframeSrc: 'about:blank',
  viewport: 'desktop' as const,
  onBlocksChange: vi.fn(),
  onSelectBlock: vi.fn(),
  onAddBlock: vi.fn(),
  onDeleteBlock: vi.fn(),
  onUpdateBlock: vi.fn(),
};

const sampleBlocks: Block[] = [
  { id: 'b-heading', type: 'heading', order: 1, content: 'Welcome', level: 2 } as Block,
  { id: 'b-text', type: 'text', order: 2, content: 'Some paragraph text.', size: 'base', alignment: 'left' } as Block,
  { id: 'b-image', type: 'image', order: 3, url: 'https://example.com/x.jpg', alt: 'Alt' } as Block,
];

describe('VisualEditorShell — baseline contract', () => {
  it('renders the layers panel with each top-level block label', () => {
    render(
      <VisualEditorShell
        {...baseProps}
        blocks={sampleBlocks}
        selectedBlockId={null}
      />,
    );
    // Layers tab is the default left tab
    const layersTab = screen.getByRole('button', { name: /Layers/i });
    expect(layersTab).toBeInTheDocument();
    // Every top-level block surfaces a row in the tree (truncated to 20 chars)
    expect(screen.getByText(/Welcome/i)).toBeInTheDocument();
    expect(screen.getByText(/Some paragraph text/i)).toBeInTheDocument();
    // Image has no content/title — falls through to the type label
    expect(screen.getAllByText(/image/i).length).toBeGreaterThan(0);
  });

  it('renders the iframe preview at the editor src', () => {
    const { container } = render(
      <VisualEditorShell
        {...baseProps}
        blocks={sampleBlocks}
        selectedBlockId={null}
      />,
    );
    const iframe = container.querySelector('iframe[title="Visual Editor"]');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe('about:blank');
  });

  it('switches the left tab to the block picker on Add Block click', () => {
    render(
      <VisualEditorShell
        {...baseProps}
        blocks={sampleBlocks}
        selectedBlockId={null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Add Block/i }));
    expect(screen.getByPlaceholderText(/Search blocks\.\.\./i)).toBeInTheDocument();
  });

  it('shows a "Click a block to edit" hint when nothing is selected', () => {
    render(
      <VisualEditorShell
        {...baseProps}
        blocks={sampleBlocks}
        selectedBlockId={null}
      />,
    );
    expect(screen.getByText(/Click a block to edit/i)).toBeInTheDocument();
  });

  it('renders the content/style tabs when a block is selected', () => {
    render(
      <VisualEditorShell
        {...baseProps}
        blocks={sampleBlocks}
        selectedBlockId={'b-heading'}
      />,
    );
    expect(screen.getByRole('button', { name: 'Content' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Style' })).toBeInTheDocument();
  });

  it('renders a zoom indicator that defaults to 100%', () => {
    render(
      <VisualEditorShell
        {...baseProps}
        blocks={sampleBlocks}
        selectedBlockId={null}
      />,
    );
    expect(screen.getByTitle('Reset zoom')).toHaveTextContent('100%');
  });

  it('hides side panels in preview mode', () => {
    const { container } = render(
      <VisualEditorShell
        {...baseProps}
        blocks={sampleBlocks}
        selectedBlockId={null}
        previewMode
      />,
    );
    expect(screen.queryByRole('button', { name: /Layers/i })).not.toBeInTheDocument();
    expect(container.querySelector('iframe[title="Visual Editor"]')).not.toBeNull();
  });

  it('toggles left panel collapse via the chevron handle', () => {
    const onLeftCollapsedChange = vi.fn();
    const { container } = render(
      <VisualEditorShell
        {...baseProps}
        blocks={sampleBlocks}
        selectedBlockId={null}
        onLeftCollapsedChange={onLeftCollapsedChange}
      />,
    );
    const collapseBtn = container.querySelector('button[title="Collapse panel"]');
    expect(collapseBtn).not.toBeNull();
    fireEvent.click(collapseBtn!);
    expect(onLeftCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('shows an empty-state hint when no blocks exist', () => {
    render(
      <VisualEditorShell
        {...baseProps}
        blocks={[]}
        selectedBlockId={null}
      />,
    );
    expect(screen.getByText(/No blocks yet/i)).toBeInTheDocument();
  });
});
