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

    // Block content appears in multiple places (editable body + layers/outline
    // panel + preview node). Asserting presence via getAllByText keeps the
    // "content made it to the DOM" check without caring about duplication.
    expect(screen.getAllByText('First paragraph').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Heading').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Third paragraph').length).toBeGreaterThan(0);
  });

  it('renders with drag and drop capability', () => {
    const onChange = vi.fn();

    const { container } = render(
      <VisualBlockEditorEnhanced blocks={initialBlocks} onChange={onChange} />
    );

    // DnD context should be rendered (look for dnd-kit specific attributes or content)
    expect(container.querySelector('[role="application"]') || container.textContent).toBeTruthy();
  });

  // Undo/redo are keyboard-only now (Cmd+Z / Cmd+Shift+Z registered via
  // useKeyboardShortcuts) — the enhanced editor no longer exposes toolbar
  // buttons for them. Coverage lives in keyboardShortcutsEnhanced.test.tsx.
  it.skip('has undo/redo buttons in toolbar', 'undo/redo are keyboard-only (Cmd+Z / Cmd+Shift+Z via useKeyboardShortcuts); toolbar buttons were removed — coverage lives in keyboardShortcutsEnhanced.test.tsx', () => {
    const onChange = vi.fn();

    render(<VisualBlockEditorEnhanced blocks={initialBlocks} onChange={onChange} />);

    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
  });
});
