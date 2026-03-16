'use client';

import { TabsBlock, Block, BlockType } from '@/types/blocks';
import { useState } from 'react';
import { VisualBlockPreview } from './VisualBlockPreview';

interface TabsBlockPreviewProps {
  block: TabsBlock;
  isSelected: boolean;
  onChange: (updates: Partial<TabsBlock>) => void;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
}

export function TabsBlockPreview({ block, isSelected, onChange, selectedBlockId, onSelectBlock }: TabsBlockPreviewProps) {
  const [activeTabId, setActiveTabId] = useState(block.tabs[0]?.id);
  const [showBlockInserter, setShowBlockInserter] = useState(false);

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
  ];

  const addTab = () => {
    const newTab = {
      id: `tab-${Date.now()}`,
      label: 'New Tab',
      blocks: [],
    };
    onChange({
      tabs: [...block.tabs, newTab],
    });
    setActiveTabId(newTab.id);
  };

  const updateTab = (id: string, updates: Partial<typeof block.tabs[0]>) => {
    onChange({
      tabs: block.tabs.map(tab => (tab.id === id ? { ...tab, ...updates } : tab)),
    });
  };

  const removeTab = (id: string) => {
    const newTabs = block.tabs.filter(tab => tab.id !== id);
    onChange({ tabs: newTabs });
    if (activeTabId === id && newTabs.length > 0) {
      setActiveTabId(newTabs[0].id);
    }
  };

  const addBlockToTab = (tabId: string, blockType: BlockType) => {
    const newBlock = createDefaultBlock(blockType);

    onChange({
      tabs: block.tabs.map(tab =>
        tab.id === tabId
          ? { ...tab, blocks: [...tab.blocks, newBlock] }
          : tab
      ),
    });

    setShowBlockInserter(false);
  };

  const updateTabBlock = (tabId: string, blockId: string, updates: Partial<Block>) => {
    onChange({
      tabs: block.tabs.map(tab =>
        tab.id === tabId
          ? {
              ...tab,
              blocks: tab.blocks.map(b => (b.id === blockId ? { ...b, ...updates } as Block : b)),
            }
          : tab
      ),
    });
  };

  const deleteTabBlock = (tabId: string, blockId: string) => {
    onChange({
      tabs: block.tabs.map(tab =>
        tab.id === tabId
          ? { ...tab, blocks: tab.blocks.filter(b => b.id !== blockId) }
          : tab
      ),
    });
  };

  const activeTab = block.tabs.find(tab => tab.id === activeTabId);

  return (
    <div className="p-6">
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Tab Headers */}
        <div className="flex border-b border-border bg-muted/30">
          {block.tabs.map((tab) => (
            <div key={tab.id} className="relative group">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveTabId(tab.id);
                }}
                className={`px-4 py-3 font-medium transition-colors border-b-2 ${
                  activeTabId === tab.id
                    ? 'border-primary text-primary bg-background'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <input
                  type="text"
                  value={tab.label}
                  onChange={(e) => {
                    e.stopPropagation();
                    updateTab(tab.id, { label: e.target.value });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-transparent border-none focus:outline-none focus:border-b border-primary min-w-[80px]"
                  placeholder="Tab Label"
                />
              </button>

              {isSelected && block.tabs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(tab.id);
                  }}
                  className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove tab"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {isSelected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                addTab();
              }}
              className="px-4 py-3 text-muted-foreground hover:text-foreground transition-colors"
              title="Add tab"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>

        {/* Tab Content */}
        <div className="p-6 bg-card min-h-[200px]">
          {activeTab && activeTab.blocks.length > 0 ? (
            <div className={isSelected ? "space-y-2" : "space-y-0"}>
              {activeTab.blocks.map((tabBlock) => {
                const isNestedBlockSelected = selectedBlockId === tabBlock.id;
                return (
                  <div key={tabBlock.id} className="relative group/block">
                    <div
                      className={isSelected ? "rounded border border-border bg-card overflow-hidden" : "overflow-hidden"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectBlock) {
                          onSelectBlock(tabBlock.id);
                        }
                      }}
                    >
                      <VisualBlockPreview
                        block={tabBlock}
                        isSelected={isNestedBlockSelected}
                        onChange={(updates) => updateTabBlock(activeTab.id, tabBlock.id, updates)}
                        selectedBlockId={selectedBlockId}
                        onSelectBlock={onSelectBlock}
                      />
                    </div>

                    {isSelected && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTabBlock(activeTab.id, tabBlock.id);
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded opacity-0 group-hover/block:opacity-100 transition-opacity z-10"
                        title="Delete block"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            isSelected && (
              <div className="text-center text-muted-foreground py-8">
                <p className="mb-2">This tab is empty</p>
                <p className="text-sm">Click the button below to add blocks</p>
              </div>
            )
          )}

          {/* Add Block to Tab Button */}
          {isSelected && activeTab && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowBlockInserter(true);
              }}
              className="w-full mt-4 p-2 border border-dashed border-border rounded hover:border-primary hover:bg-primary/5 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              + Add Block
            </button>
          )}
        </div>
      </div>

      {/* Block Inserter Modal */}
      {showBlockInserter && activeTab && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={(e) => {
            e.stopPropagation();
            setShowBlockInserter(false);
          }}
        >
          <div
            className="bg-white dark:bg-gray-900 border border-border rounded-lg max-w-2xl w-full max-h-[70vh] overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border bg-white dark:bg-gray-900">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-foreground">Add Block to Tab</h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowBlockInserter(false);
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[calc(70vh-80px)] bg-white dark:bg-gray-900">
              {Array.from(new Set(blockTypes.map(bt => bt.category))).map(category => (
                <div key={category} className="p-4 border-b border-border last:border-0 bg-white dark:bg-gray-900">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase mb-3 tracking-wide">{category}</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {blockTypes
                      .filter(bt => bt.category === category)
                      .map(blockType => (
                        <button
                          key={blockType.type}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addBlockToTab(activeTab.id, blockType.type);
                          }}
                          className="p-3 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left group bg-white dark:bg-gray-900"
                        >
                          <div className="flex flex-col items-center gap-2">
                            <div className="text-2xl">{blockType.icon}</div>
                            <div className="text-xs font-medium text-foreground group-hover:text-primary text-center">
                              {blockType.label}
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

function createDefaultBlock(type: BlockType): Block {
  const id = `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const order = 0;
  const base = { id, order, type };

  switch (type) {
    case 'text':
      return { ...base, type: 'text', content: 'Start writing...', alignment: 'left', size: 'base' };
    case 'heading':
      return { ...base, type: 'heading', content: 'Heading', level: 2, alignment: 'left' };
    case 'image':
      return { ...base, type: 'image', url: '', alt: '', width: 'full', alignment: 'center' };
    case 'button':
      return { ...base, type: 'button', text: 'Click me', url: '', variant: 'primary', size: 'md', alignment: 'left' };
    case 'quote':
      return { ...base, type: 'quote', content: 'Add a quote...', author: '', citation: '' };
    case 'code':
      return { ...base, type: 'code', code: '// Code here...', language: 'javascript' };
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
    default:
      return { ...base, type: 'text', content: 'Block', alignment: 'left', size: 'base' };
  }
}
