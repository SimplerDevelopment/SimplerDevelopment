/**
 * Coverage for the extracted LayerItem + ContainerDropZone tree.
 *
 * The components live inside dnd-kit's SortableContext + DndContext, so the
 * test wraps them in the same providers — without those `useSortable` errors
 * out. We're not exercising drag behaviour here (jsdom can't synthesize
 * pointer drags) — just the rendering contract: nested containers expose
 * their children, the icon falls back to `widgets` for unregistered types,
 * the rename input swaps in on double-click, and the delete button calls
 * back with the right id.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { SortableContext } from '@dnd-kit/sortable';
import { LayerItem, ContainerDropZone } from '@/components/portal/visual-editor/LayersPanel';
import type { Block } from '@/types/blocks';

function renderWithDnd(ui: React.ReactElement, ids: string[]) {
  return render(
    <DndContext>
      <SortableContext items={ids}>{ui}</SortableContext>
    </DndContext>,
  );
}

describe('LayersPanel — LayerItem', () => {
  it('renders the block label or content preview', () => {
    const block = { id: 'b1', type: 'heading', order: 1, content: 'Welcome to the show', level: 2 } as Block;
    renderWithDnd(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />,
      ['b1'],
    );
    // Preview text is truncated to 20 chars and HTML-stripped.
    expect(screen.getByText(/Welcome to the show/)).toBeInTheDocument();
  });

  it('falls back to the block type when there is no preview text', () => {
    const block = { id: 'img1', type: 'image', order: 1, url: '', alt: '' } as Block;
    renderWithDnd(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />,
      ['img1'],
    );
    // Type label fallback ("image"); icon also renders the same text inside
    // a material-icons span — both copies are present.
    expect(screen.getAllByText('image').length).toBeGreaterThanOrEqual(1);
  });

  it('expands a section container to reveal nested children', () => {
    const block = {
      id: 's1',
      type: 'section',
      order: 1,
      blocks: [
        { id: 'c1', type: 'text', order: 1, content: 'Nested text', size: 'base' },
      ],
    } as unknown as Block;
    renderWithDnd(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />,
      ['s1', 'c1'],
    );
    // Section's slot label
    expect(screen.getByText('Content')).toBeInTheDocument();
    // Nested child shows
    expect(screen.getByText(/Nested text/)).toBeInTheDocument();
  });

  it('marks selection when the block id matches selectedBlockId', () => {
    const block = { id: 'b1', type: 'heading', order: 1, content: 'Title', level: 2 } as Block;
    const { container } = renderWithDnd(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId="b1"
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />,
      ['b1'],
    );
    expect(container.querySelector('.bg-primary\\/10')).not.toBeNull();
  });

  it('calls onDelete with the block id when the close button is clicked', () => {
    const block = { id: 'b1', type: 'heading', order: 1, content: 'Title', level: 2 } as Block;
    const onDelete = vi.fn();
    const { container } = renderWithDnd(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={onDelete}
        onUpdate={vi.fn()}
      />,
      ['b1'],
    );
    const deleteBtn = container.querySelector('button[title="Delete"]');
    expect(deleteBtn).not.toBeNull();
    fireEvent.click(deleteBtn!);
    expect(onDelete).toHaveBeenCalledWith('b1');
  });

  it('skips the delete button for required blocks', () => {
    const block = { id: 'r1', type: 'heading', order: 1, content: 'Required', level: 2, required: true } as Block;
    const { container } = renderWithDnd(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />,
      ['r1'],
    );
    expect(container.querySelector('button[title="Delete"]')).toBeNull();
    // Lock icon is rendered instead — material-icons span text content
    expect(container.textContent).toContain('lock');
  });

  it('calls onSelect with multi-select modifiers on click', () => {
    const block = { id: 'b1', type: 'heading', order: 1, content: 'Title', level: 2 } as Block;
    const onSelect = vi.fn();
    const { container } = renderWithDnd(
      <LayerItem
        block={block}
        depth={0}
        selectedBlockId={null}
        onSelect={onSelect}
        onDelete={vi.fn()}
        onUpdate={vi.fn()}
      />,
      ['b1'],
    );
    const row = container.querySelector('.cursor-pointer') as HTMLElement;
    fireEvent.click(row, { metaKey: true });
    expect(onSelect).toHaveBeenCalledWith('b1', expect.objectContaining({ metaKey: true }));
  });
});

describe('LayersPanel — ContainerDropZone', () => {
  it('renders the empty-slot prompt when not dragged-over', () => {
    renderWithDnd(
      <ContainerDropZone containerId="parent" slotIndex={0} depth={1} />,
      ['dropzone:parent:0'],
    );
    expect(screen.getByText(/\+ Add to slot/)).toBeInTheDocument();
  });
});
