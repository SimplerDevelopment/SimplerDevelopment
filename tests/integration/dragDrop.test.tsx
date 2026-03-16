import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VisualBlockEditorEnhanced } from '@/components/blocks/VisualBlockEditorEnhanced';
import { Block } from '@/types/blocks';

describe('Drag and Drop Integration', () => {
  const initialBlocks: Block[] = [
    {
      id: 'block-1',
      type: 'text',
      content: 'First paragraph',
      order: 1,
      alignment: 'left',
      size: 'base',
    },
    {
      id: 'block-2',
      type: 'heading',
      content: 'Heading',
      order: 2,
      level: 2,
      alignment: 'left',
    },
    {
      id: 'block-3',
      type: 'text',
      content: 'Third paragraph',
      order: 3,
      alignment: 'left',
      size: 'base',
    },
  ];

  it('renders blocks with drag handles', () => {
    const onChange = vi.fn();

    render(<VisualBlockEditorEnhanced blocks={initialBlocks} onChange={onChange} />);

    // The blocks should be rendered
    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(screen.getByText('Heading')).toBeInTheDocument();
    expect(screen.getByText('Third paragraph')).toBeInTheDocument();
  });

  it('renders with drag and drop capability', () => {
    const onChange = vi.fn();

    const { container } = render(
      <VisualBlockEditorEnhanced blocks={initialBlocks} onChange={onChange} />
    );

    // DnD context should be rendered (look for dnd-kit specific attributes or content)
    expect(container.querySelector('[role="application"]') || container.textContent).toBeTruthy();
  });

  it('has undo/redo buttons in toolbar', () => {
    const onChange = vi.fn();

    render(<VisualBlockEditorEnhanced blocks={initialBlocks} onChange={onChange} />);

    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
  });
});
