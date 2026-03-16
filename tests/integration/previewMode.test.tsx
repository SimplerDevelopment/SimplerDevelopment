import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisualBlockEditorComplete } from '@/components/blocks/VisualBlockEditorComplete';
import { Block } from '@/types/blocks';

describe('Preview Mode Integration', () => {
  const initialBlocks: Block[] = [
    {
      id: 'block-1',
      type: 'heading',
      content: 'Test Heading',
      order: 1,
      level: 1,
      alignment: 'left',
    },
    {
      id: 'block-2',
      type: 'text',
      content: 'Test paragraph content',
      order: 2,
      alignment: 'left',
      size: 'base',
    },
  ];

  it('renders editor in edit mode by default', () => {
    const onChange = vi.fn();

    render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    // Should show "Edit Mode" label
    expect(screen.getByText('Edit Mode')).toBeInTheDocument();

    // Should show "Preview" button
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('shows preview button', () => {
    const onChange = vi.fn();

    render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    const previewButton = screen.getByRole('button', { name: /Preview/i });
    expect(previewButton).toBeInTheDocument();
  });

  it('toggles to preview mode when preview button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    // Click the Preview button
    const previewButton = screen.getByRole('button', { name: /Preview/i });
    await user.click(previewButton);

    // Should now show "Preview Mode" label
    expect(screen.getByText('Preview Mode')).toBeInTheDocument();

    // Button should change to "Exit Preview"
    expect(screen.getByText('Exit Preview')).toBeInTheDocument();
  });

  it('toggles back to edit mode when exit preview is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    // Enter preview mode
    const previewButton = screen.getByRole('button', { name: /Preview/i });
    await user.click(previewButton);

    // Exit preview mode
    const exitButton = screen.getByRole('button', { name: /Exit Preview/i });
    await user.click(exitButton);

    // Should be back to edit mode
    expect(screen.getByText('Edit Mode')).toBeInTheDocument();
    expect(screen.getByText('Preview')).toBeInTheDocument();
  });

  it('renders blocks in preview mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    // Enter preview mode
    const previewButton = screen.getByRole('button', { name: /Preview/i });
    await user.click(previewButton);

    // Blocks should still be visible
    expect(screen.getByText('Test Heading')).toBeInTheDocument();
    expect(screen.getByText('Test paragraph content')).toBeInTheDocument();
  });

  it('renders blocks with group class for hover interaction', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { container } = render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    // Enter preview mode
    const previewButton = screen.getByRole('button', { name: /Preview/i });
    await user.click(previewButton);

    // Blocks should be wrapped in group containers for hover
    const groupContainers = container.querySelectorAll('.group');
    expect(groupContainers.length).toBeGreaterThan(0);
  });

  it('includes block preview wrappers in preview mode', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { container } = render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    // Enter preview mode
    const previewButton = screen.getByRole('button', { name: /Preview/i });
    await user.click(previewButton);

    // Should have block-preview class
    const blockPreviews = container.querySelectorAll('.block-preview');
    expect(blockPreviews.length).toBe(initialBlocks.length);
  });

  it('maintains block data when switching modes', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <VisualBlockEditorComplete blocks={initialBlocks} onChange={onChange} />
    );

    // Enter preview mode
    const previewButton = screen.getByRole('button', { name: /Preview/i });
    await user.click(previewButton);

    // Content should still be there
    expect(screen.getByText('Test Heading')).toBeInTheDocument();

    // Exit preview mode
    const exitButton = screen.getByRole('button', { name: /Exit Preview/i });
    await user.click(exitButton);

    // Content should still be there
    expect(screen.getByText('Test Heading')).toBeInTheDocument();
  });
});
