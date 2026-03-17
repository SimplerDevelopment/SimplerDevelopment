import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColumnsBlock, TabsBlock, TextBlock, HeadingBlock } from '@/types/blocks';

// Mock the blog actions module to avoid DATABASE_URL requirement
vi.mock('@/lib/actions/blog', () => ({
  getAllBlogPosts: vi.fn().mockResolvedValue([]),
  getBlogPostsByCategory: vi.fn().mockResolvedValue([]),
}));

// Mock the db module to avoid DATABASE_URL requirement
vi.mock('@/lib/db', () => ({
  db: {},
}));

import { ColumnsBlockPreview } from '@/components/blocks/visual/ColumnsBlockPreview';
import { TabsBlockPreview } from '@/components/blocks/visual/TabsBlockPreview';

describe('Nested Block Selection', () => {
  describe('ColumnsBlockPreview', () => {
    const nestedText: TextBlock = {
      id: 'nested-text-1',
      type: 'text',
      content: 'Nested paragraph',
      order: 0,
      alignment: 'left',
      size: 'base',
    };

    const nestedHeading: HeadingBlock = {
      id: 'nested-heading-1',
      type: 'heading',
      content: 'Nested heading',
      order: 1,
      level: 2,
      alignment: 'left',
    };

    const columnsBlock: ColumnsBlock = {
      id: 'columns-1',
      type: 'columns',
      order: 0,
      gap: 'md',
      columns: [
        { id: 'col-1', width: 50, blocks: [nestedText] },
        { id: 'col-2', width: 50, blocks: [nestedHeading] },
      ],
    };

    it('calls onSelectBlock with nested block ID when nested block is clicked', () => {
      const onSelectBlock = vi.fn();
      const onChange = vi.fn();

      render(
        <ColumnsBlockPreview
          block={columnsBlock}
          isSelected={true}
          onChange={onChange}
          selectedBlockId={null}
          onSelectBlock={onSelectBlock}
        />
      );

      // Find the nested text content and click its wrapper
      const textContent = screen.getByText('Nested paragraph');
      // Click the closest interactive wrapper (the div with onClick)
      fireEvent.click(textContent);

      // Should select the nested block, not the parent
      expect(onSelectBlock).toHaveBeenCalledWith('nested-text-1');
    });

    it('calls onSelectBlock with correct ID for second column nested block', () => {
      const onSelectBlock = vi.fn();
      const onChange = vi.fn();

      render(
        <ColumnsBlockPreview
          block={columnsBlock}
          isSelected={true}
          onChange={onChange}
          selectedBlockId={null}
          onSelectBlock={onSelectBlock}
        />
      );

      const headingContent = screen.getByText('Nested heading');
      fireEvent.click(headingContent);

      expect(onSelectBlock).toHaveBeenCalledWith('nested-heading-1');
    });

    it('shows selection ring on selected nested block', () => {
      const onSelectBlock = vi.fn();
      const onChange = vi.fn();

      const { container } = render(
        <ColumnsBlockPreview
          block={columnsBlock}
          isSelected={true}
          onChange={onChange}
          selectedBlockId="nested-text-1"
          onSelectBlock={onSelectBlock}
        />
      );

      // The selected nested block wrapper should have ring-primary class
      const selectedWrapper = container.querySelector('.ring-primary');
      expect(selectedWrapper).not.toBeNull();
    });

    it('does not show selection ring when no nested block is selected', () => {
      const onSelectBlock = vi.fn();
      const onChange = vi.fn();

      const { container } = render(
        <ColumnsBlockPreview
          block={columnsBlock}
          isSelected={true}
          onChange={onChange}
          selectedBlockId={null}
          onSelectBlock={onSelectBlock}
        />
      );

      const selectedWrapper = container.querySelector('.ring-primary');
      expect(selectedWrapper).toBeNull();
    });

    it('stopPropagation prevents parent from receiving click', () => {
      const onSelectBlock = vi.fn();
      const onChange = vi.fn();
      const parentClickHandler = vi.fn();

      const { container } = render(
        <div onClick={parentClickHandler}>
          <ColumnsBlockPreview
            block={columnsBlock}
            isSelected={true}
            onChange={onChange}
            selectedBlockId={null}
            onSelectBlock={onSelectBlock}
          />
        </div>
      );

      const textContent = screen.getByText('Nested paragraph');
      fireEvent.click(textContent);

      // Nested block click should NOT bubble to parent
      expect(parentClickHandler).not.toHaveBeenCalled();
      // But onSelectBlock should have been called
      expect(onSelectBlock).toHaveBeenCalledWith('nested-text-1');
    });

    it('renders column editing UI when container is active via nested selection', () => {
      const onChange = vi.fn();

      render(
        <ColumnsBlockPreview
          block={columnsBlock}
          isSelected={true}
          onChange={onChange}
          selectedBlockId="nested-text-1"
          onSelectBlock={vi.fn()}
        />
      );

      // Column headers should be visible since isSelected=true
      expect(screen.getAllByText(/Column/i).length).toBeGreaterThan(0);
      // Add Block buttons should be visible
      expect(screen.getAllByText('+ Add Block').length).toBeGreaterThan(0);
    });
  });

  describe('TabsBlockPreview', () => {
    const nestedText: TextBlock = {
      id: 'tab-nested-text-1',
      type: 'text',
      content: 'Tab content paragraph',
      order: 0,
      alignment: 'left',
      size: 'base',
    };

    const tabsBlock: TabsBlock = {
      id: 'tabs-1',
      type: 'tabs',
      order: 0,
      tabs: [
        { id: 'tab-1', label: 'First Tab', blocks: [nestedText] },
        { id: 'tab-2', label: 'Second Tab', blocks: [] },
      ],
    };

    it('calls onSelectBlock with nested block ID when tab content is clicked', () => {
      const onSelectBlock = vi.fn();
      const onChange = vi.fn();

      render(
        <TabsBlockPreview
          block={tabsBlock}
          isSelected={true}
          onChange={onChange}
          selectedBlockId={null}
          onSelectBlock={onSelectBlock}
        />
      );

      const textContent = screen.getByText('Tab content paragraph');
      fireEvent.click(textContent);

      expect(onSelectBlock).toHaveBeenCalledWith('tab-nested-text-1');
    });

    it('shows selection ring on selected nested block in tab', () => {
      const onSelectBlock = vi.fn();
      const onChange = vi.fn();

      const { container } = render(
        <TabsBlockPreview
          block={tabsBlock}
          isSelected={true}
          onChange={onChange}
          selectedBlockId="tab-nested-text-1"
          onSelectBlock={onSelectBlock}
        />
      );

      const selectedWrapper = container.querySelector('.ring-primary');
      expect(selectedWrapper).not.toBeNull();
    });

    it('stopPropagation prevents parent from receiving click', () => {
      const onSelectBlock = vi.fn();
      const onChange = vi.fn();
      const parentClickHandler = vi.fn();

      render(
        <div onClick={parentClickHandler}>
          <TabsBlockPreview
            block={tabsBlock}
            isSelected={true}
            onChange={onChange}
            selectedBlockId={null}
            onSelectBlock={onSelectBlock}
          />
        </div>
      );

      const textContent = screen.getByText('Tab content paragraph');
      fireEvent.click(textContent);

      expect(parentClickHandler).not.toHaveBeenCalled();
      expect(onSelectBlock).toHaveBeenCalledWith('tab-nested-text-1');
    });
  });

  describe('Multi-level nesting', () => {
    it('handles columns inside columns (nested containers)', () => {
      const deepNestedText: TextBlock = {
        id: 'deep-nested-text',
        type: 'text',
        content: 'Deep nested content',
        order: 0,
        alignment: 'left',
        size: 'base',
      };

      const innerColumns: ColumnsBlock = {
        id: 'inner-columns',
        type: 'columns',
        order: 0,
        gap: 'md',
        columns: [
          { id: 'inner-col-1', width: 50, blocks: [deepNestedText] },
          { id: 'inner-col-2', width: 50, blocks: [] },
        ],
      };

      const outerColumns: ColumnsBlock = {
        id: 'outer-columns',
        type: 'columns',
        order: 0,
        gap: 'md',
        columns: [
          { id: 'outer-col-1', width: 50, blocks: [innerColumns] },
          { id: 'outer-col-2', width: 50, blocks: [] },
        ],
      };

      const onSelectBlock = vi.fn();
      const onChange = vi.fn();

      render(
        <ColumnsBlockPreview
          block={outerColumns}
          isSelected={true}
          onChange={onChange}
          selectedBlockId={null}
          onSelectBlock={onSelectBlock}
        />
      );

      // Click the deeply nested text
      const deepText = screen.getByText('Deep nested content');
      fireEvent.click(deepText);

      // Should select the deepest nested block
      expect(onSelectBlock).toHaveBeenCalledWith('deep-nested-text');
    });
  });

  describe('Empty container interaction', () => {
    it('renders empty column placeholder when container is selected', () => {
      const emptyColumnsBlock: ColumnsBlock = {
        id: 'empty-columns',
        type: 'columns',
        order: 0,
        gap: 'md',
        columns: [
          { id: 'col-empty-1', width: 50, blocks: [] },
          { id: 'col-empty-2', width: 50, blocks: [] },
        ],
      };

      render(
        <ColumnsBlockPreview
          block={emptyColumnsBlock}
          isSelected={true}
          onChange={vi.fn()}
          selectedBlockId={null}
          onSelectBlock={vi.fn()}
        />
      );

      // Should show empty column placeholders
      expect(screen.getAllByText('Empty column').length).toBe(2);
    });
  });
});
