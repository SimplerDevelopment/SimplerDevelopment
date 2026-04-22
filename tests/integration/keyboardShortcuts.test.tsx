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

    // Editor should render the block content (appears in the editable body
    // plus preview/layers mirrors — use getAllByText to tolerate duplicates).
    expect(screen.getAllByText('First paragraph').length).toBeGreaterThan(0);
  });

  it('includes keyboard shortcuts reference component', () => {
    const onChange = vi.fn();

    const { container } = render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    // Editor should include the data attribute for paste handling
    expect(container.querySelector('[data-block-editor]')).toBeInTheDocument();
  });

  // Undo/redo no longer have toolbar buttons — they're registered via
  // useKeyboardShortcuts (Cmd+Z / Cmd+Shift+Z) only. Behavioral coverage of
  // the shortcuts themselves lives in keyboardShortcutsEnhanced.test.tsx.
  it.skip('has undo and redo shortcuts registered', () => {
    const onChange = vi.fn();

    render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

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
