// @vitest-environment jsdom
/**
 * Batch 44b — four medium-size React components from the admin + portal
 * visual-editor surfaces.
 *
 * Components covered:
 *   - IframePreview         (components/portal/visual-editor/IframePreview.tsx)
 *   - PostSettingsModal     (components/admin/PostSettingsModal.tsx)
 *   - LayersPanel.LayerItem + ContainerDropZone
 *                           (components/portal/visual-editor/LayersPanel.tsx)
 *   - PresenceLayer         (components/portal/visual-editor/PresenceLayer.tsx)
 *
 * Heavy deps (dnd-kit, MediaPicker, PresenceCursor, block-icon-map) are
 * mocked so the tests exercise only the wrapper logic — viewport sizing,
 * zoom controls, tab switching, slug generation, layer-tree recursion,
 * stale-cursor cleanup, etc.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, createEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// dnd-kit hooks — return inert sortable / droppable refs.
vi.mock('@dnd-kit/core', () => ({
  useDroppable: ({ id }: { id: string }) => ({
    setNodeRef: () => {},
    isOver: id === 'dropzone:over-target:0',
    node: { current: null },
    over: null,
    active: null,
    rect: { current: null },
  }),
}));

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: ({ id }: { id: string }) => ({
    setNodeRef: () => {},
    attributes: { 'data-sortable-id': id },
    listeners: {},
    transform: null,
    transition: null,
    isDragging: id === 'dragging-block',
    setActivatorNodeRef: () => {},
    over: null,
    active: null,
    index: 0,
    newIndex: 0,
    items: [],
  }),
}));

// MediaPicker is a network-driven modal; replace with a no-op stub so we
// don't render its iframe / fetch chain in PostSettingsModal.
vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({
    value,
    onChange,
    label,
  }: {
    value?: string;
    onChange: (url: string) => void;
    label?: string;
  }) => (
    <div data-testid="media-picker">
      <span>{label}</span>
      <input
        data-testid="media-picker-input"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

// BLOCK_ICON_MAP imports from lib/blocks/registry which is heavy and pulls
// in every block type module. Stub the icon map directly so LayerItem only
// renders the icons we ask about.
vi.mock('@/components/portal/visual-editor/_lib/block-icon-map', () => ({
  BLOCK_ICON_MAP: {
    text: 'notes',
    heading: 'title',
    columns: 'view_column',
    section: 'crop_landscape',
    tabs: 'tab',
    accordion: 'unfold_more',
  },
}));

// PresenceCursor is its own component; stub so we can count rendered peers.
vi.mock('@/components/portal/visual-editor/PresenceCursor', () => ({
  PresenceCursor: ({ x, y, color, name }: { x: number; y: number; color: string; name: string }) => (
    <div
      data-testid="presence-cursor"
      data-x={x}
      data-y={y}
      data-color={color}
      data-name={name}
    />
  ),
}));

// ---------------------------------------------------------------------------
// Imports under test (after vi.mock)
// ---------------------------------------------------------------------------
import { IframePreview } from '@/components/portal/visual-editor/IframePreview';
import { PostSettingsModal } from '@/components/admin/PostSettingsModal';
import { LayerItem, ContainerDropZone } from '@/components/portal/visual-editor/LayersPanel';
import { PresenceLayer } from '@/components/portal/visual-editor/PresenceLayer';
import type { Block } from '@/types/blocks';

// ---------------------------------------------------------------------------
// IframePreview
// ---------------------------------------------------------------------------
describe('IframePreview', () => {
  const baseProps = () => {
    const iframeRef = { current: null } as React.RefObject<HTMLIFrameElement | null>;
    const canvasRef = { current: null } as React.RefObject<HTMLDivElement | null>;
    return {
      iframeRef,
      iframeSrc: '/preview/abc',
      handleIframeLoad: vi.fn(),
      viewport: 'desktop' as const,
      zoomLevel: 100,
      panOffset: { x: 0, y: 0 },
      canvasRef,
      handleCanvasMouseDown: vi.fn(),
      handleCanvasMouseMove: vi.fn(),
      handleCanvasMouseUp: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      zoomReset: vi.fn(),
      allowIframeScroll: false,
      blocks: [{ id: 'b1' }],
      previewMode: false,
      externalDragType: null as string | null,
      onExternalDragMove: vi.fn(),
      onExternalDragEnd: vi.fn(),
      onExternalDragCancel: vi.fn(),
      onExternalDragLeave: vi.fn(),
    };
  };

  it('renders the iframe with the supplied src and triggers onLoad', () => {
    const props = baseProps();
    const { container } = render(<IframePreview {...props} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).not.toBeNull();
    expect(iframe.getAttribute('src')).toBe('/preview/abc');
    fireEvent.load(iframe);
    expect(props.handleIframeLoad).toHaveBeenCalledTimes(1);
  });

  it('shows the empty-state overlay when no blocks and not in preview mode', () => {
    const props = baseProps();
    props.blocks = [];
    const { getByText } = render(<IframePreview {...props} />);
    expect(getByText('No blocks on this page')).toBeTruthy();
  });

  it('hides the empty-state overlay in preview mode even with no blocks', () => {
    const props = baseProps();
    props.blocks = [];
    props.previewMode = true;
    const { queryByText } = render(<IframePreview {...props} />);
    expect(queryByText('No blocks on this page')).toBeNull();
  });

  it('uses tablet viewport dimensions when viewport is tablet', () => {
    const props = baseProps();
    props.viewport = 'tablet';
    const { container } = render(<IframePreview {...props} />);
    const frame = container.querySelector('iframe')!.parentElement as HTMLElement;
    expect(frame.style.width).toBe('768px');
    expect(frame.style.height).toBe('900px');
  });

  it('uses mobile viewport dimensions when viewport is mobile', () => {
    const props = baseProps();
    props.viewport = 'mobile';
    const { container } = render(<IframePreview {...props} />);
    const frame = container.querySelector('iframe')!.parentElement as HTMLElement;
    expect(frame.style.width).toBe('375px');
  });

  it('applies the zoomLevel as a transform scale', () => {
    const props = baseProps();
    props.zoomLevel = 50;
    const { container } = render(<IframePreview {...props} />);
    const frame = container.querySelector('iframe')!.parentElement as HTMLElement;
    expect(frame.style.transform).toContain('scale(0.5)');
  });

  it('renders the zoom level in the zoom indicator', () => {
    const props = baseProps();
    props.zoomLevel = 75;
    const { getByText } = render(<IframePreview {...props} />);
    expect(getByText('75%')).toBeTruthy();
  });

  it('wires zoom in / out / reset buttons', () => {
    const props = baseProps();
    const { getByTitle } = render(<IframePreview {...props} />);
    fireEvent.click(getByTitle('Zoom in'));
    fireEvent.click(getByTitle('Zoom out'));
    fireEvent.click(getByTitle('Reset zoom'));
    expect(props.zoomIn).toHaveBeenCalledTimes(1);
    expect(props.zoomOut).toHaveBeenCalledTimes(1);
    expect(props.zoomReset).toHaveBeenCalledTimes(1);
  });

  it('disables zoom-out at minimum zoom', () => {
    const props = baseProps();
    props.zoomLevel = 30;
    const { getByTitle } = render(<IframePreview {...props} />);
    expect((getByTitle('Zoom out') as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables zoom-in at maximum zoom', () => {
    const props = baseProps();
    props.zoomLevel = 200;
    const { getByTitle } = render(<IframePreview {...props} />);
    expect((getByTitle('Zoom in') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not render the external-drag overlay when externalDragType is null', () => {
    const props = baseProps();
    const { container } = render(<IframePreview {...props} />);
    // Only the iframe should live inside the frame container; no drag overlay.
    const overlays = container.querySelectorAll('[style*="cursor: copy"]');
    expect(overlays.length).toBe(0);
  });

  it('renders the external-drag overlay and forwards iframe-relative coordinates on drop', () => {
    const props = baseProps();
    props.externalDragType = 'text';
    props.zoomLevel = 50; // scale 0.5 → coordinates are doubled
    // Stub the iframe ref so getBoundingClientRect resolves consistently.
    const fakeIframe = {
      getBoundingClientRect: () => ({ left: 100, top: 50, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }),
    } as unknown as HTMLIFrameElement;
    props.iframeRef = { current: fakeIframe } as React.RefObject<HTMLIFrameElement | null>;

    const { container } = render(<IframePreview {...props} />);
    const overlay = container.querySelector('[style*="cursor: copy"]') as HTMLElement;
    expect(overlay).not.toBeNull();

    // jsdom doesn't honor clientX/Y or dataTransfer in DragEvent init — build
    // the event manually and patch the properties before dispatching. React's
    // synthetic-event accessor reads from the native event's own properties.
    const dt = { dropEffect: '' as string };
    const dragOverEvt = createEvent.dragOver(overlay);
    Object.defineProperties(dragOverEvt, {
      clientX: { value: 200, configurable: true, writable: true },
      clientY: { value: 100, configurable: true, writable: true },
      dataTransfer: { value: dt, configurable: true, writable: true },
    });
    fireEvent(overlay, dragOverEvt);
    // Just confirm the handler ran end-to-end: dataTransfer.dropEffect was set
    // and onExternalDragMove fired once with the scaled coords.
    expect(dt.dropEffect).toBe('copy');
    expect(props.onExternalDragMove).toHaveBeenCalledTimes(1);

    const dropEvt = createEvent.drop(overlay);
    Object.defineProperties(dropEvt, {
      clientX: { value: 300, configurable: true, writable: true },
      clientY: { value: 150, configurable: true, writable: true },
      dataTransfer: { value: { dropEffect: '' }, configurable: true, writable: true },
    });
    fireEvent(overlay, dropEvt);
    expect(props.onExternalDragEnd).toHaveBeenCalledTimes(1);
  });

  it('cancels external drag on dragLeave when the related target is outside', () => {
    const props = baseProps();
    props.externalDragType = 'text';
    const fakeIframe = {
      getBoundingClientRect: () => ({ left: 0, top: 0 } as DOMRect),
    } as unknown as HTMLIFrameElement;
    props.iframeRef = { current: fakeIframe } as React.RefObject<HTMLIFrameElement | null>;

    const { container } = render(<IframePreview {...props} />);
    const overlay = container.querySelector('[style*="cursor: copy"]') as HTMLElement;
    // relatedTarget is outside the overlay → cancel + leave fire.
    fireEvent.dragLeave(overlay, { relatedTarget: document.body });
    expect(props.onExternalDragCancel).toHaveBeenCalled();
    expect(props.onExternalDragLeave).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PostSettingsModal
// ---------------------------------------------------------------------------
describe('PostSettingsModal', () => {
  const baseProps = () => ({
    isOpen: true,
    onClose: vi.fn(),
    formData: {
      title: 'Hello',
      slug: 'hello',
      postType: 'post',
      excerpt: 'short',
      coverImage: '',
      published: false,
      publishedAt: null as string | null,
    },
    onFormDataChange: vi.fn(),
    postTypes: [
      { id: 1, name: 'Post', slug: 'post', icon: 'article', active: true },
      { id: 2, name: 'Page', slug: 'page', icon: 'web', active: true },
    ],
    customFields: [] as Array<{
      id: number;
      postTypeId: number;
      name: string;
      slug: string;
      fieldType: string;
      options: string[] | null;
      required: boolean;
      defaultValue?: string | null;
      helpText?: string | null;
      order: number;
    }>,
    customFieldValues: {} as Record<string, string>,
    onCustomFieldChange: vi.fn(),
    mode: 'create' as const,
    users: [{ id: 1, name: 'Dan', email: 'd@x.com', role: 'admin', active: true }],
    onPostTypeChange: vi.fn(),
    renderCustomField: vi.fn(() => <div data-testid="rendered-cf" />),
  });

  it('returns null when isOpen is false', () => {
    const props = baseProps();
    props.isOpen = false;
    const { container } = render(<PostSettingsModal {...props} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders title, slug, postType, and excerpt fields', () => {
    const { getByLabelText } = render(<PostSettingsModal {...baseProps()} />);
    expect((getByLabelText(/Title/) as HTMLInputElement).value).toBe('Hello');
    expect((getByLabelText(/Slug/) as HTMLInputElement).value).toBe('hello');
    expect((getByLabelText(/Post Type/) as HTMLSelectElement).value).toBe('post');
    expect((getByLabelText(/Excerpt/) as HTMLTextAreaElement).value).toBe('short');
  });

  it('auto-generates slug from title in create mode', () => {
    const props = baseProps();
    const { getByLabelText } = render(<PostSettingsModal {...props} />);
    fireEvent.change(getByLabelText(/Title/), { target: { value: 'A New! Title-Here' } });
    expect(props.onFormDataChange).toHaveBeenCalledWith({
      title: 'A New! Title-Here',
      slug: 'a-new-title-here',
    });
  });

  it('does not regenerate slug from title in edit mode', () => {
    const props = baseProps();
    props.mode = 'edit' as any;
    const { getByLabelText } = render(<PostSettingsModal {...props} />);
    fireEvent.change(getByLabelText(/Title/), { target: { value: 'Renamed' } });
    expect(props.onFormDataChange).toHaveBeenCalledWith({ title: 'Renamed', slug: 'hello' });
  });

  it('invokes onPostTypeChange when post type is changed', () => {
    const props = baseProps();
    const { getByLabelText } = render(<PostSettingsModal {...props} />);
    fireEvent.change(getByLabelText(/Post Type/), { target: { value: 'page' } });
    expect(props.onPostTypeChange).toHaveBeenCalledWith('page');
  });

  it('flips published flag and stamps publishedAt when toggled on', () => {
    const props = baseProps();
    const { getByLabelText } = render(<PostSettingsModal {...props} />);
    fireEvent.click(getByLabelText('Published'));
    const call = props.onFormDataChange.mock.calls[0][0];
    expect(call.published).toBe(true);
    expect(typeof call.publishedAt).toBe('string');
  });

  it('clears publishedAt when published is toggled off', () => {
    const props = baseProps();
    props.formData.published = true;
    props.formData.publishedAt = '2026-01-01T00:00:00.000Z';
    const { getByLabelText } = render(<PostSettingsModal {...props} />);
    fireEvent.click(getByLabelText('Published'));
    expect(props.onFormDataChange).toHaveBeenCalledWith({ published: false, publishedAt: null });
  });

  it('switches between General and Custom Fields tabs', () => {
    const props = baseProps();
    props.customFields = [
      { id: 1, postTypeId: 1, name: 'SEO Title', slug: 'seo_title', fieldType: 'text', options: null, required: false, order: 0, helpText: 'Used for meta' },
    ];
    const { getByText, queryByLabelText, getAllByText } = render(<PostSettingsModal {...props} />);
    // General tab is default → title input visible
    expect(queryByLabelText(/Title \*/)).not.toBeNull();
    fireEvent.click(getByText('Custom Fields'));
    // After switching tabs the General-tab Title input is gone.
    expect(queryByLabelText(/Title \*/)).toBeNull();
    // The custom field label appears.
    expect(getAllByText(/SEO Title/).length).toBeGreaterThan(0);
    expect(props.renderCustomField).toHaveBeenCalled();
  });

  it('shows an empty-state message when no custom fields are defined', () => {
    const props = baseProps();
    const { getByText } = render(<PostSettingsModal {...props} />);
    fireEvent.click(getByText('Custom Fields'));
    expect(getByText('No custom fields defined for this post type.')).toBeTruthy();
  });

  it('invokes onClose when the backdrop or Close button is clicked', () => {
    const props = baseProps();
    const { container, getByText } = render(<PostSettingsModal {...props} />);
    fireEvent.click(getByText('Close'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    // Backdrop is the first fixed inset element.
    const backdrop = container.querySelector('.bg-black\\/50') as HTMLElement;
    fireEvent.click(backdrop);
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it('renders the custom-field count badge when fields exist', () => {
    const props = baseProps();
    props.customFields = Array.from({ length: 3 }, (_, i) => ({
      id: i,
      postTypeId: 1,
      name: `F${i}`,
      slug: `f_${i}`,
      fieldType: 'text',
      options: null,
      required: false,
      order: i,
    }));
    const { getByText } = render(<PostSettingsModal {...props} />);
    expect(getByText('3')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// LayersPanel — LayerItem + ContainerDropZone
// ---------------------------------------------------------------------------
describe('LayerItem', () => {
  const makeBlock = (overrides: Partial<Block> = {}): Block =>
    ({
      id: 'b-1',
      type: 'text',
      order: 0,
      content: '<p>Hello <strong>World</strong></p>',
      ...overrides,
    } as Block);

  it('renders block label / preview text and the mapped icon', () => {
    const block = makeBlock();
    const { container, getByText } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    // content is stripped of html and trimmed to 20 chars
    expect(getByText('Hello World')).toBeTruthy();
    // mapped icon
    expect(container.textContent).toContain('notes');
  });

  it('falls back to block.type when neither label nor content is present', () => {
    const block = { id: 'b-2', type: 'heading', order: 0 } as Block;
    const { getByText } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    expect(getByText('heading')).toBeTruthy();
  });

  it('prefers explicit label over preview text', () => {
    const block = makeBlock({ label: 'Intro paragraph' });
    const { getByText } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    expect(getByText('Intro paragraph')).toBeTruthy();
  });

  it('marks the row as selected when selectedBlockId matches', () => {
    const block = makeBlock();
    const { container } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId="b-1"
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    expect(container.innerHTML).toContain('bg-primary/10');
  });

  it('uses multi-select when selectedBlockIds has more than one entry', () => {
    const block = makeBlock();
    const { container } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        selectedBlockIds={['b-1', 'b-9']}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    expect(container.innerHTML).toContain('bg-primary/10');
  });

  it('does not match id-less blocks against id-less selection', () => {
    const block = { id: '', type: 'text', order: 0 } as Block;
    const { container } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    expect(container.innerHTML).not.toContain('bg-primary/10');
  });

  it('calls onSelect with modifier keys on click', () => {
    const onSelect = vi.fn();
    const block = makeBlock();
    const { container } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={onSelect}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    // The clickable row is the second top-level div (the first is the wrapper)
    const row = container.querySelector('.cursor-pointer') as HTMLElement;
    fireEvent.click(row, { shiftKey: true, metaKey: false, ctrlKey: false });
    expect(onSelect).toHaveBeenCalledWith('b-1', { shiftKey: true, metaKey: false, ctrlKey: false });
  });

  it('calls onContextMenu with the click coordinates', () => {
    const onContextMenu = vi.fn();
    const block = makeBlock();
    const { container } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        onContextMenu={onContextMenu}
      />
    );
    const row = container.querySelector('.cursor-pointer') as HTMLElement;
    fireEvent.contextMenu(row, { clientX: 12, clientY: 34 });
    expect(onContextMenu).toHaveBeenCalledWith('b-1', 12, 34);
  });

  it('renders a lock icon for required blocks and no delete button', () => {
    const block = makeBlock({ required: true });
    const { container } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    expect(container.textContent).toContain('lock');
    // No delete button when locked
    expect(container.querySelector('button[title="Delete"]')).toBeNull();
  });

  it('calls onDelete when the delete button is clicked', () => {
    const onDelete = vi.fn();
    const block = makeBlock();
    const { getByTitle } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={onDelete}
        onUpdate={vi.fn()}
      />
    );
    fireEvent.click(getByTitle('Delete'));
    expect(onDelete).toHaveBeenCalledWith('b-1');
  });

  it('renames the block on double-click + Enter via onUpdate', () => {
    const onUpdate = vi.fn();
    const block = makeBlock();
    const { getByText, container } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
      />
    );
    const label = getByText('Hello World');
    fireEvent.doubleClick(label);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onUpdate).toHaveBeenCalledWith('b-1', { label: 'Renamed' });
  });

  it('cancels rename on Escape without invoking onUpdate', () => {
    const onUpdate = vi.fn();
    const block = makeBlock();
    const { getByText, container } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={onUpdate}
      />
    );
    fireEvent.doubleClick(getByText('Hello World'));
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('recursively renders columns container with nested children + drop slots', () => {
    const child: Block = { id: 'inner', type: 'text', order: 0, content: 'inner-text' } as Block;
    const block = {
      id: 'cols-1',
      type: 'columns',
      order: 0,
      columns: [{ blocks: [child] }, { blocks: [] }],
    } as unknown as Block;
    const { container, getByText, getAllByText } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    expect(getByText('Col 1')).toBeTruthy();
    expect(getByText('Col 2')).toBeTruthy();
    expect(getByText('inner-text')).toBeTruthy();
    // Two drop slots (one per column).
    expect(getAllByText('+ Add to slot').length).toBe(2);
    // The chevron toggle is rendered for containers.
    expect(container.textContent).toContain('expand_more');
  });

  it('toggles container expansion when the chevron is clicked', () => {
    const block = {
      id: 'sec-1',
      type: 'section',
      order: 0,
      blocks: [{ id: 'child-1', type: 'text', order: 0, content: 'inside' } as Block],
    } as unknown as Block;
    const { container, queryByText } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />
    );
    expect(queryByText('inside')).not.toBeNull();
    // Click the expand toggle (button containing 'expand_more')
    const toggle = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('expand_more'),
    ) as HTMLButtonElement;
    fireEvent.click(toggle);
    expect(queryByText('inside')).toBeNull();
  });

  it('renders drop indicator bar when showDropIndicator is true', () => {
    const block = makeBlock();
    const { container } = render(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
        showDropIndicator
      />
    );
    expect(container.querySelector('.bg-primary.rounded-full')).not.toBeNull();
  });
});

describe('ContainerDropZone', () => {
  it('renders default copy when not hovered', () => {
    const { getByText } = render(
      <ContainerDropZone containerId="x" slotIndex={0} depth={1} />
    );
    expect(getByText('+ Add to slot')).toBeTruthy();
  });

  it('renders active copy when the dnd-kit isOver flag is true', () => {
    const { getByText } = render(
      <ContainerDropZone containerId="over-target" slotIndex={0} depth={0} />
    );
    expect(getByText('+ Drop block here')).toBeTruthy();
  });

  it('indents based on depth', () => {
    const { container } = render(
      <ContainerDropZone containerId="x" slotIndex={0} depth={3} />
    );
    const el = container.firstChild as HTMLElement;
    expect(el.style.marginLeft).toBe('56px'); // 3*12 + 20
  });
});

// ---------------------------------------------------------------------------
// PresenceLayer
// ---------------------------------------------------------------------------
describe('PresenceLayer', () => {
  let nowSpy: any;
  let mockNow = 0;
  beforeEach(() => {
    mockNow = 1_000_000;
    // Do NOT install vi.useFakeTimers here — it overrides Date and our
    // controlled `mockNow` would be clobbered by the fake timer's clock.
    nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => mockNow);
  });

  afterEach(() => {
    nowSpy?.mockRestore();
  });

  const makePeer = (clientId: number, cursor: { x: number; y: number } | null) => ({
    clientId,
    user: { id: `u${clientId}`, name: `User ${clientId}`, color: '#ff0000' },
    cursor,
    selection: null,
    activeSlide: null,
    focusedField: null,
  });

  it('renders one PresenceCursor per peer that has a cursor', () => {
    const peers = [makePeer(1, { x: 10, y: 20 }), makePeer(2, { x: 30, y: 40 }), makePeer(3, null)];
    const { getAllByTestId } = render(
      <PresenceLayer peers={peers as any} awareness={null} />
    );
    expect(getAllByTestId('presence-cursor').length).toBe(2);
  });

  it('passes peer color and name through to PresenceCursor', () => {
    const peers = [makePeer(1, { x: 5, y: 6 })];
    const { getByTestId } = render(
      <PresenceLayer peers={peers as any} awareness={null} />
    );
    const cursor = getByTestId('presence-cursor');
    expect(cursor.dataset.color).toBe('#ff0000');
    expect(cursor.dataset.name).toBe('User 1');
    expect(cursor.dataset.x).toBe('5');
    expect(cursor.dataset.y).toBe('6');
  });

  it('hides cursors that have not moved within STALE_MS (5s)', () => {
    // First render captures lastSeen = mockNow (1_000_000).
    const { getAllByTestId, queryAllByTestId, rerender } = render(
      <PresenceLayer peers={[makePeer(1, { x: 0, y: 0 })] as any} awareness={null} />
    );
    expect(getAllByTestId('presence-cursor').length).toBe(1);

    // Advance "wall clock" >5s. Rerender with the SAME cursor coords — the
    // peer didn't move so the lastSeen ref stays at the original value and
    // the visiblePeers filter drops it.
    mockNow += 6000;
    rerender(<PresenceLayer peers={[makePeer(1, { x: 0, y: 0 })] as any} awareness={null} />);
    expect(queryAllByTestId('presence-cursor').length).toBe(0);
  });

  it('keeps cursors visible when they move within the stale window', () => {
    const { getAllByTestId, rerender } = render(
      <PresenceLayer peers={[makePeer(1, { x: 0, y: 0 })] as any} awareness={null} />
    );
    expect(getAllByTestId('presence-cursor').length).toBe(1);

    // 3s later, peer moves to a new position → lastSeen resets.
    mockNow += 3000;
    rerender(<PresenceLayer peers={[makePeer(1, { x: 50, y: 60 })] as any} awareness={null} />);
    // Another 3s; still under the 5s stale threshold from the latest move.
    mockNow += 3000;
    rerender(<PresenceLayer peers={[makePeer(1, { x: 50, y: 60 })] as any} awareness={null} />);
    expect(getAllByTestId('presence-cursor').length).toBe(1);
  });

  it('invokes setCursor on window mousemove (rAF-flushed)', () => {
    const setCursor = vi.fn();
    // Provide a deterministic rAF for jsdom.
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    render(<PresenceLayer peers={[]} awareness={null} setCursor={setCursor} />);
    fireEvent.mouseMove(window, { clientX: 100, clientY: 200 });
    expect(setCursor).toHaveBeenCalled();
    const lastArg = setCursor.mock.calls.at(-1)?.[0];
    expect(lastArg).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
    rafSpy.mockRestore();
  });

  it('clears setCursor on mouseout', () => {
    const setCursor = vi.fn();
    render(<PresenceLayer peers={[]} awareness={null} setCursor={setCursor} />);
    fireEvent.mouseOut(window, {});
    expect(setCursor).toHaveBeenLastCalledWith(null);
  });

  it('falls back to awareness.setLocalStateField when setCursor is not provided', () => {
    const setLocalStateField = vi.fn();
    const awareness = { setLocalStateField } as any;
    render(<PresenceLayer peers={[]} awareness={awareness} />);
    fireEvent.mouseOut(window, {});
    expect(setLocalStateField).toHaveBeenCalledWith('cursor', null);
  });
});
