import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ColumnsBlock } from '@/types/blocks';

// Mock the blog actions module to avoid DATABASE_URL requirement
vi.mock('@/lib/actions/blog', () => ({
  getAllBlogPosts: vi.fn().mockResolvedValue([]),
  getBlogPostsByCategory: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/lib/db', () => ({
  db: {},
}));

import { ColumnsBlockPreview } from '@/components/blocks/visual/ColumnsBlockPreview';

describe('ColumnsBlockPreview', () => {
  it('renders columns with unique keys', () => {
    const mockBlock: ColumnsBlock = {
      id: 'test-columns',
      type: 'columns',
      order: 1,
      gap: 'md',
      columns: [
        {
          id: 'col-1',
          width: 50,
          blocks: [],
        },
        {
          id: 'col-2',
          width: 50,
          blocks: [],
        },
      ],
    };

    const onChange = vi.fn();

    // This should render without React key prop warnings
    const { container } = render(
      <ColumnsBlockPreview
        block={mockBlock}
        isSelected={true}
        onChange={onChange}
      />
    );

    // Verify columns are rendered
    const columns = container.querySelectorAll('[style*="width"]');
    expect(columns.length).toBeGreaterThanOrEqual(2);
  });

  it('does not render console warnings for missing keys', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn');
    const consoleErrorSpy = vi.spyOn(console, 'error');

    const mockBlock: ColumnsBlock = {
      id: 'test-columns',
      type: 'columns',
      order: 1,
      gap: 'md',
      columns: [
        {
          id: 'col-1',
          width: 50,
          blocks: [],
        },
        {
          id: 'col-2',
          width: 50,
          blocks: [],
        },
        {
          id: 'col-3',
          width: 50,
          blocks: [],
        },
      ],
    };

    const onChange = vi.fn();

    render(
      <ColumnsBlockPreview
        block={mockBlock}
        isSelected={true}
        onChange={onChange}
      />
    );

    // Check that no key-related warnings were logged
    const keyWarnings = consoleWarnSpy.mock.calls.filter(
      (call) =>
        call[0]?.includes('key') ||
        call[0]?.includes('unique') ||
        call[0]?.includes('list')
    );
    const keyErrors = consoleErrorSpy.mock.calls.filter(
      (call) =>
        call[0]?.includes('key') ||
        call[0]?.includes('unique') ||
        call[0]?.includes('list')
    );

    expect(keyWarnings.length).toBe(0);
    expect(keyErrors.length).toBe(0);

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });
});
