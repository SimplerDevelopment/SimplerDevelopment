'use client';

import { useState, useRef, useEffect } from 'react';
import { Block, BlockType } from '@/types/blocks';
import { Breakpoint } from '@/types/responsive';
import { VisualBlockPreview } from './visual/VisualBlockPreview';
import { BlockSettings } from './visual/BlockSettings';

interface VisualBlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

export function VisualBlockEditor({ blocks, onChange }: VisualBlockEditorProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [showBlockInserter, setShowBlockInserter] = useState(false);
  const [insertAfterBlockId, setInsertAfterBlockId] = useState<string | null>(null);
  const [currentViewport, setCurrentViewport] = useState<Breakpoint>('desktop');
  const editorRef = useRef<HTMLDivElement>(null);

  const blockTypes: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }> = [
    { type: 'heading', label: 'Heading', icon: '📝', category: 'Basic', description: 'Add a title or heading' },
    { type: 'text', label: 'Paragraph', icon: '📄', category: 'Basic', description: 'Start with plain text' },
    { type: 'button', label: 'Button', icon: '🔘', category: 'Basic', description: 'Add a call-to-action button' },
    { type: 'quote', label: 'Quote', icon: '💬', category: 'Basic', description: 'Add a quotation' },
    { type: 'image', label: 'Image', icon: '🖼️', category: 'Media', description: 'Insert an image' },
    { type: 'youtube', label: 'YouTube', icon: '📺', category: 'Media', description: 'Embed a YouTube video' },
    { type: 'video', label: 'Video', icon: '🎬', category: 'Media', description: 'Embed a video file' },
    { type: 'code', label: 'Code', icon: '💻', category: 'Media', description: 'Display code snippet' },
    { type: 'spacer', label: 'Spacer', icon: '↕️', category: 'Layout', description: 'Add vertical space' },
    { type: 'divider', label: 'Divider', icon: '➖', category: 'Layout', description: 'Add a horizontal line' },
    { type: 'columns', label: 'Columns', icon: '📊', category: 'Layout', description: 'Display content in columns' },
    { type: 'accordion', label: 'Accordion', icon: '📑', category: 'Layout', description: 'Collapsible content sections' },
    { type: 'tabs', label: 'Tabs', icon: '🗂️', category: 'Layout', description: 'Tabbed content sections' },
    { type: 'hero', label: 'Hero', icon: '🎯', category: 'Components', description: 'Hero section with CTA' },
    { type: 'services-grid', label: 'Services', icon: '📦', category: 'Components', description: 'Grid of services' },
    { type: 'cta', label: 'Call to Action', icon: '📢', category: 'Components', description: 'CTA section' },
    { type: 'card-grid', label: 'Card Grid', icon: '🎴', category: 'Components', description: 'Grid of cards' },
    { type: 'stats', label: 'Stats', icon: '📈', category: 'Components', description: 'Statistics display' },
    { type: 'testimonial', label: 'Testimonial', icon: '⭐', category: 'Components', description: 'Customer testimonial' },
    { type: 'featured-content', label: 'Featured Content', icon: '✨', category: 'Components', description: 'Featured content with image' },
    { type: 'blog-posts', label: 'Blog Posts', icon: '📰', category: 'Components', description: 'Display blog posts' },
    { type: 'booking', label: 'Booking', icon: 'calendar_month', category: 'Interactive', description: 'Embed a booking page' },
    { type: 'survey', label: 'Survey', icon: 'assignment', category: 'Interactive', description: 'Embed a survey form' },
    { type: 'survey-results', label: 'Survey Results', icon: 'poll', category: 'Interactive', description: 'Display survey results with charts' },
  ];

  const addBlock = (type: BlockType, afterBlockId: string | null = null) => {
    const newBlock = createDefaultBlock(type, blocks.length);

    if (afterBlockId) {
      const index = blocks.findIndex(b => b.id === afterBlockId);
      const newBlocks = [...blocks];
      newBlocks.splice(index + 1, 0, newBlock);
      // Update order
      newBlocks.forEach((block, i) => {
        block.order = i;
      });
      onChange(newBlocks);
    } else {
      onChange([...blocks, newBlock]);
    }

    setSelectedBlockId(newBlock.id);
    setShowBlockInserter(false);
    setInsertAfterBlockId(null);
  };

  // Helper function to recursively find a block (including nested blocks)
  const findBlock = (blockId: string, blocksList: Block[] = blocks): Block | null => {
    for (const block of blocksList) {
      if (block.id === blockId) return block;

      // Check nested blocks in columns
      if (block.type === 'columns') {
        for (const column of block.columns) {
          const found = findBlock(blockId, column.blocks);
          if (found) return found;
        }
      }

      // Check nested blocks in tabs
      if (block.type === 'tabs') {
        for (const tab of block.tabs) {
          const found = findBlock(blockId, tab.blocks);
          if (found) return found;
        }
      }

      // Accordion items don't contain nested blocks, they have simple content strings
    }
    return null;
  };

  // Helper function to recursively update a block (including nested blocks)
  const updateBlockRecursive = (blocksList: Block[], id: string, updates: Partial<Block>): Block[] => {
    return blocksList.map(block => {
      if (block.id === id) {
        return { ...block, ...updates } as Block;
      }

      // Update nested blocks in columns
      if (block.type === 'columns') {
        return {
          ...block,
          columns: block.columns.map(column => ({
            ...column,
            blocks: updateBlockRecursive(column.blocks, id, updates),
          })),
        };
      }

      // Update nested blocks in tabs
      if (block.type === 'tabs') {
        return {
          ...block,
          tabs: block.tabs.map(tab => ({
            ...tab,
            blocks: updateBlockRecursive(tab.blocks, id, updates),
          })),
        };
      }

      // Accordion items don't contain nested blocks, they have simple content strings

      return block;
    });
  };

  const updateBlock = (id: string, updates: Partial<Block>) => {
    onChange(updateBlockRecursive(blocks, id, updates));
  };

  const deleteBlock = (id: string) => {
    onChange(blocks.filter(block => block.id !== id));
    if (selectedBlockId === id) {
      setSelectedBlockId(null);
    }
  };

  const moveBlock = (id: string, direction: 'up' | 'down') => {
    const index = blocks.findIndex(block => block.id === id);
    if (index === -1) return;

    const newBlocks = [...blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= blocks.length) return;

    [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];

    // Update order property
    newBlocks.forEach((block, i) => {
      block.order = i;
    });

    onChange(newBlocks);
  };

  const duplicateBlock = (id: string) => {
    const block = blocks.find(b => b.id === id);
    if (!block) return;

    const newBlock = { ...block, id: `block-${Date.now()}`, order: blocks.length };
    onChange([...blocks, newBlock]);
    setSelectedBlockId(newBlock.id);
  };

  // Click outside to deselect
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        setSelectedBlockId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const categories = Array.from(new Set(blockTypes.map(bt => bt.category)));
  // Check if a nested block within a container is selected
  const isNestedBlockSelected = (containerBlock: Block): boolean => {
    if (!selectedBlockId) return false;
    if (selectedBlockId === containerBlock.id) return false; // It's the container itself

    if (containerBlock.type === 'columns') {
      return containerBlock.columns.some(col =>
        col.blocks.some(b => b.id === selectedBlockId || isNestedBlockSelected(b))
      );
    }
    if (containerBlock.type === 'tabs') {
      return containerBlock.tabs.some(tab =>
        tab.blocks.some(b => b.id === selectedBlockId || isNestedBlockSelected(b))
      );
    }
    return false;
  };

  const selectedBlock = selectedBlockId ? findBlock(selectedBlockId) : null;

  return (
    <div className="relative flex gap-0" ref={editorRef}>
      {/* Editor Canvas */}
      <div
        className={`bg-background min-h-[500px] transition-all ${
          selectedBlock ? 'w-[calc(100%-320px)]' : 'w-full'
        }`}
        onClick={(e) => {
          // Deselect if clicking the canvas background (not on a block)
          if (e.target === e.currentTarget) {
            setSelectedBlockId(null);
          }
        }}
      >
        {blocks.length === 0 ? (
          <div className="p-16 text-center">
            <div className="mb-6">
              <span className="text-6xl">✍️</span>
            </div>
            <h3 className="text-xl font-semibold mb-2 text-foreground">Start creating content</h3>
            <p className="text-muted-foreground mb-6">Add your first block to begin</p>
            <button
              type="button"
              onClick={() => setShowBlockInserter(true)}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 font-medium"
            >
              + Add Block
            </button>
          </div>
        ) : (
          <div
            className="p-8 space-y-2"
            onClick={(e) => {
              // Deselect if clicking the padding area between blocks
              if (e.target === e.currentTarget) {
                setSelectedBlockId(null);
              }
            }}
          >
            {blocks.map((block, index) => {
              const isContainerBlock = block.type === 'columns' || block.type === 'tabs';
              const isBlockSelected = selectedBlockId === block.id;
              const hasNestedSelection = isContainerBlock && isNestedBlockSelected(block);
              // Keep container "active" (showing editing UI) when it or a child is selected
              const isBlockActive = isBlockSelected || hasNestedSelection;

              return (
              <div
                key={block.id}
                className="group relative"
                onMouseEnter={() => setHoveredBlockId(block.id)}
                onMouseLeave={() => setHoveredBlockId(null)}
              >
                {/* Block Toolbar - show for the block itself, or for container when directly selected */}
                {(isBlockSelected || hoveredBlockId === block.id) && (
                  <div className="absolute -top-10 left-0 right-0 flex items-center justify-between gap-2 bg-card border border-border rounded-t-lg px-3 py-2 shadow-lg z-10">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="font-medium">
                        {blockTypes.find(bt => bt.type === block.type)?.label || block.type}
                      </span>
                      {hasNestedSelection && !isBlockSelected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBlockId(block.id);
                          }}
                          className="ml-2 px-2 py-0.5 text-xs bg-accent hover:bg-accent/80 rounded transition-colors"
                          title="Select container"
                        >
                          Select container
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveBlock(block.id, 'up')}
                        disabled={index === 0}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBlock(block.id, 'down')}
                        disabled={index === blocks.length - 1}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <div className="w-px h-4 bg-border mx-1" />
                      <button
                        type="button"
                        onClick={() => duplicateBlock(block.id)}
                        className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded"
                        title="Duplicate"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteBlock(block.id)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}

                {/* Block Content */}
                <div
                  onClick={(e) => {
                    if (isContainerBlock) {
                      // For container blocks, select the container when clicking empty space.
                      // Nested block clicks are stopped by e.stopPropagation() in their handlers.
                      setSelectedBlockId(block.id);
                      return;
                    }
                    setSelectedBlockId(block.id);
                  }}
                  className={`rounded-lg transition-all cursor-pointer ${
                    isBlockSelected
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                      : hasNestedSelection
                      ? 'ring-2 ring-primary/40 ring-offset-2 ring-offset-background'
                      : hoveredBlockId === block.id
                      ? 'ring-2 ring-border'
                      : ''
                  }`}
                >
                  <VisualBlockPreview
                    block={block}
                    isSelected={isBlockActive}
                    onChange={(updates) => updateBlock(block.id, updates)}
                    selectedBlockId={selectedBlockId}
                    onSelectBlock={setSelectedBlockId}
                  />
                </div>

                {/* Insert Block Button */}
                <div
                  className="flex items-center justify-center py-2 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    // Deselect if clicking the insert area (not the button)
                    if (e.target === e.currentTarget) {
                      setSelectedBlockId(null);
                    }
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setInsertAfterBlockId(block.id);
                      setShowBlockInserter(true);
                    }}
                    className="p-1 bg-primary text-primary-foreground rounded-full hover:bg-primary/90 shadow-md"
                    title="Insert block below"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>
              );
            })}

            {/* Add Block at End */}
            {blocks.length > 0 && (
              <div
                className="pt-4"
                onClick={(e) => {
                  // Deselect if clicking the padding area
                  if (e.target === e.currentTarget) {
                    setSelectedBlockId(null);
                  }
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setInsertAfterBlockId(null);
                    setShowBlockInserter(true);
                  }}
                  className="w-full p-4 border-2 border-dashed border-border rounded-lg text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  + Add Block
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings Sidebar */}
      {selectedBlock && (
        <div className="w-80 bg-white dark:bg-gray-900 border-l border-border overflow-y-auto sticky top-0 h-screen">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">
                {blockTypes.find(bt => bt.type === selectedBlock.type)?.label || 'Block'} Settings
              </h3>
              <button
                type="button"
                onClick={() => setSelectedBlockId(null)}
                className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
                title="Close settings"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Block Type Indicator */}
              <div className="pb-4 border-b border-border">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Block Type</p>
                <p className="text-sm font-medium text-foreground">
                  {blockTypes.find(bt => bt.type === selectedBlock.type)?.label || selectedBlock.type}
                </p>
              </div>

              {/* Settings will be rendered here based on block type */}
              <BlockSettings
                block={selectedBlock}
                onChange={(updates) => updateBlock(selectedBlock.id, updates)}
                currentViewport={currentViewport}
              />
            </div>
          </div>
        </div>
      )}

      {/* Block Inserter Modal */}
      {showBlockInserter && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => {
            setShowBlockInserter(false);
            setInsertAfterBlockId(null);
          }}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-border rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-border bg-white dark:bg-gray-900">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-foreground">Add a Block</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowBlockInserter(false);
                    setInsertAfterBlockId(null);
                  }}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(80vh-100px)] bg-white dark:bg-gray-900">
              {categories.map(category => (
                <div key={category} className="p-6 border-b border-border last:border-0 bg-white dark:bg-gray-900">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase mb-4 tracking-wide">{category}</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {blockTypes
                      .filter(bt => bt.category === category)
                      .map(blockType => (
                        <button
                          key={blockType.type}
                          type="button"
                          onClick={() => addBlock(blockType.type, insertAfterBlockId)}
                          className="p-4 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left group bg-white dark:bg-gray-900"
                        >
                          <div className="flex items-start gap-3">
                            <div className="text-2xl flex-shrink-0">{blockType.icon}</div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-foreground group-hover:text-primary mb-1">
                                {blockType.label}
                              </div>
                              <div className="text-xs text-muted-foreground line-clamp-2">
                                {blockType.description}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function createDefaultBlock(type: BlockType, order: number): Block {
  const id = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const base = { id, order, type };

  switch (type) {
    case 'text':
      return { ...base, type: 'text', content: 'Start writing or type / to insert a block...', alignment: 'left', size: 'base' };
    case 'heading':
      return { ...base, type: 'heading', content: 'Write your heading...', level: 2, alignment: 'left' };
    case 'image':
      return { ...base, type: 'image', url: '', alt: '', width: 'full', alignment: 'center' };
    case 'button':
      return { ...base, type: 'button', text: 'Click me', url: '', variant: 'primary', size: 'md', alignment: 'left' };
    case 'quote':
      return { ...base, type: 'quote', content: 'Add a memorable quote...', author: '', citation: '' };
    case 'code':
      return { ...base, type: 'code', code: '// Enter your code here...', language: 'javascript' };
    case 'video':
      return { ...base, type: 'video', url: '', caption: '', autoplay: false, controls: true };
    case 'youtube':
      return { ...base, type: 'youtube', url: '', caption: '' };
    case 'spacer':
      return { ...base, type: 'spacer', height: 'md' };
    case 'divider':
      return { ...base, type: 'divider', lineStyle: 'solid' };
    case 'columns':
      return { ...base, type: 'columns', columns: [
        { id: `col-${Date.now()}-1`, width: 50, blocks: [] },
        { id: `col-${Date.now()}-2`, width: 50, blocks: [] }
      ], gap: 'md' };
    case 'accordion':
      return { ...base, type: 'accordion', title: 'Frequently Asked Questions', items: [
        { id: `item-${Date.now()}-1`, title: 'First question?', content: 'Answer to the first question.' },
        { id: `item-${Date.now()}-2`, title: 'Second question?', content: 'Answer to the second question.' }
      ]};
    case 'tabs':
      return { ...base, type: 'tabs', tabs: [
        { id: `tab-${Date.now()}-1`, label: 'Tab 1', blocks: [] },
        { id: `tab-${Date.now()}-2`, label: 'Tab 2', blocks: [] }
      ]};
    case 'hero':
      return { ...base, type: 'hero', title: 'Hero Title', subtitle: 'Subtitle', description: 'Description', ctaText: 'Get Started', ctaLink: '/contact' };
    case 'services-grid':
      return { ...base, type: 'services-grid', title: 'Our Services', services: [], columns: 3 };
    case 'cta':
      return { ...base, type: 'cta', title: 'Ready to get started?', description: 'Join thousands of satisfied customers', primaryButtonText: 'Get Started', primaryButtonUrl: '/contact', backgroundStyle: 'gradient' };
    case 'card-grid':
      return { ...base, type: 'card-grid', title: 'Features', cards: [], columns: 3 };
    case 'stats':
      return { ...base, type: 'stats', title: 'By the numbers', stats: [], columns: 3 };
    case 'testimonial':
      return { ...base, type: 'testimonial', quote: 'This is an amazing product!', author: 'John Doe', role: 'CEO', company: 'Company Inc' };
    case 'featured-content':
      return { ...base, type: 'featured-content', title: 'Featured Content', description: 'Description of the featured content', imagePosition: 'right', buttonText: 'Learn More', buttonUrl: '/learn-more' };
    case 'blog-posts':
      return { ...base, type: 'blog-posts', title: 'Latest Posts', limit: 3, columns: 3, showExcerpt: true };
    case 'survey-results':
      return { ...base, type: 'survey-results', surveySlug: '', title: 'Survey Results', description: 'See what our customers are saying', chartType: 'bar', showResponseCount: true, showTextResponses: true, textResponseLimit: 5, layout: 'stacked' };
    default:
      return { ...base, type: 'text', content: 'Unknown block type', alignment: 'left', size: 'base' };
  }
}
