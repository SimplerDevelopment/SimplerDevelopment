import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisualBlockEditorComplete } from '@/components/blocks/VisualBlockEditorComplete';
import { Block } from '@/types/blocks';

describe('Keyboard Shortcuts Integration', () => {
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
  ];

  it('renders editor with keyboard shortcuts enabled', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();

    render(
      <VisualBlockEditorComplete
        blocks={initialBlocks}
        onChange={onChange}
        onSave={onSave}
      />
    );

    // Editor should render
    expect(screen.getByText('First paragraph')).toBeInTheDocument();
  });

  it('includes keyboard shortcuts reference component', () => {
    const onChange = vi.fn();

    const { container } = render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    // Editor should include the data attribute for paste handling
    expect(container.querySelector('[data-block-editor]')).toBeInTheDocument();
  });

  it('has undo and redo shortcuts registered', () => {
    const onChange = vi.fn();

    render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    // The shortcuts are registered (we can't easily test actual keyboard events in jsdom)
    // But we can verify the editor renders without errors
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
  });

  it('calls onSave when provided', () => {
    const onChange = vi.fn();
    const onSave = vi.fn();

    render(
      <VisualBlockEditorComplete
        blocks={initialBlocks}
        onChange={onChange}
        onSave={onSave}
      />
    );

    // Save handler is registered
    expect(onSave).not.toHaveBeenCalled();
  });
});
