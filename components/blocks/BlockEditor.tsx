'use client';

import { useState } from 'react';
import { Block, BlockType } from '@/types/blocks';
import { TextBlockEdit } from './edit/TextBlockEdit';
import { HeadingBlockEdit } from './edit/HeadingBlockEdit';
import { ImageBlockEdit } from './edit/ImageBlockEdit';
import { ButtonBlockEdit } from './edit/ButtonBlockEdit';
import { HeroBlockEdit } from './edit/HeroBlockEdit';
import { ServicesGridBlockEdit } from './edit/ServicesGridBlockEdit';
import { CtaBlockEdit } from './edit/CtaBlockEdit';
import { BLOCK_TYPES } from '@/lib/utils/blockIcons';
import { applyBrandDefaults, type BrandDefaultsContext } from '@/lib/branding/block-defaults';

interface BlockEditorProps {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
  /** Optional brand context for pre-filling new blocks with messaging + sentinels. */
  brandDefaults?: BrandDefaultsContext;
}

export function BlockEditor({ blocks, onChange, brandDefaults }: BlockEditorProps) {
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [showBlockPicker, setShowBlockPicker] = useState(false);

  const addBlock = (type: BlockType) => {
    let newBlock = createDefaultBlock(type, blocks.length);
    if (brandDefaults) {
      newBlock = applyBrandDefaults(newBlock, brandDefaults);
    }
    onChange([...blocks, newBlock]);
    setSelectedBlockId(newBlock.id);
    setShowBlockPicker(false);
  };

  const updateBlock = (id: string, updates: Partial<Block>) => {
    onChange(blocks.map(block => (block.id === id ? { ...block, ...updates } as Block : block)));
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
  };

  const selectedBlock = blocks.find(block => block.id === selectedBlockId);

  const categories = Array.from(new Set(BLOCK_TYPES.map(bt => bt.category)));

  return (
    <div className="flex gap-4 h-[600px]">
      {/* Blocks List */}
      <div className="flex-1 border border-border rounded-lg overflow-hidden bg-card">
        <div className="p-4 border-b border-border bg-background flex justify-between items-center">
          <h3 className="font-medium text-foreground">Content Blocks</h3>
          <button
            type="button"
            onClick={() => setShowBlockPicker(!showBlockPicker)}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            + Add Block
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100%-57px)]">
          {blocks.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="mb-4">No blocks yet. Click &quot;Add Block&quot; to get started.</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {blocks.map((block, index) => (
                <div
                  key={block.id}
                  className={`p-3 rounded border cursor-pointer transition-all ${
                    selectedBlockId === block.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedBlockId(block.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {(() => {
                        const Icon = BLOCK_TYPES.find(bt => bt.type === block.type)?.icon;
                        return Icon ? <Icon className="w-5 h-5 text-primary" /> : null;
                      })()}
                      <div>
                        <div className="text-sm font-medium">
                          {BLOCK_TYPES.find(bt => bt.type === block.type)?.label}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {getBlockPreview(block)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBlock(block.id, 'up');
                        }}
                        disabled={index === 0}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBlock(block.id, 'down');
                        }}
                        disabled={index === blocks.length - 1}
                        className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateBlock(block.id);
                        }}
                        className="p-1 text-muted-foreground hover:text-foreground"
                        title="Duplicate"
                      >
                        📋
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteBlock(block.id);
                        }}
                        className="p-1 text-red-500 hover:text-red-700"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Block Editor Panel */}
      <div className="w-96 border border-border rounded-lg overflow-hidden bg-card">
        <div className="p-4 border-b border-border bg-background">
          <h3 className="font-medium text-foreground">
            {selectedBlock ? 'Edit Block' : 'Block Settings'}
          </h3>
        </div>

        <div className="overflow-y-auto h-[calc(100%-57px)] p-4">
          {selectedBlock ? (
            <div>
              {renderBlockEdit(selectedBlock, (updates) => updateBlock(selectedBlock.id, updates))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              <p>Select a block to edit its settings</p>
            </div>
          )}
        </div>
      </div>

      {/* Block Picker Modal */}
      {showBlockPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowBlockPicker(false)}>
          <div className="bg-card border border-border rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Add Block</h3>

            {categories.map(category => (
              <div key={category} className="mb-6">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase mb-3">{category}</h4>
                <div className="grid grid-cols-3 gap-3">
                  {BLOCK_TYPES
                    .filter(bt => bt.category === category)
                    .map(blockType => {
                      const Icon = blockType.icon;
                      return (
                        <button
                          key={blockType.type}
                          type="button"
                          onClick={() => addBlock(blockType.type)}
                          className="p-4 border border-border rounded-lg hover:border-primary hover:bg-primary/10 transition-all text-center"
                        >
                          <div className="flex justify-center mb-2">
                            <Icon className="w-8 h-8 text-primary" />
                          </div>
                          <div className="text-sm font-medium">{blockType.label}</div>
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function createDefaultBlock(type: BlockType, order: number): Block {
  const id = `block-${Date.now()}`;
  const base = { id, order, type };

  switch (type) {
    case 'text':
      return { ...base, type: 'text', content: 'Enter your text here...', alignment: 'left', size: 'base' };
    case 'heading':
      return { ...base, type: 'heading', content: 'Heading', level: 2, alignment: 'left' };
    case 'image':
      return { ...base, type: 'image', url: '', alt: '', width: 'full', alignment: 'center' };
    case 'button':
      return { ...base, type: 'button', text: 'Click me', url: '', variant: 'primary', size: 'md', alignment: 'left' };
    case 'spacer':
      return { ...base, type: 'spacer', height: 'md' };
    case 'divider':
      return { ...base, type: 'divider', lineStyle: 'solid' };
    case 'hero':
      return { ...base, type: 'hero', title: 'Hero Title', ctaText: 'Get Started', ctaLink: '/contact' };
    case 'services-grid':
      return { ...base, type: 'services-grid', title: 'Our Services', services: [], columns: 3 };
    case 'cta':
      return { ...base, type: 'cta', title: 'Ready to get started?', primaryButtonText: 'Get Started', primaryButtonUrl: '/contact', backgroundStyle: 'gradient' };
    case 'card-grid':
      return { ...base, type: 'card-grid', title: 'Features', cards: [], columns: 3 };
    case 'stats':
      return { ...base, type: 'stats', stats: [], columns: 3 };
    case 'testimonial':
      return { ...base, type: 'testimonial', quote: 'Great experience!', author: 'John Doe' };
    case 'blog-posts':
      return { ...base, type: 'blog-posts', title: 'Recent Posts', limit: 3, columns: 3, showExcerpt: true };
    case 'booking':
      return { ...base, type: 'booking', slug: '', title: 'Schedule a Meeting', description: 'Pick a time that works for you', showPageTitle: true, height: '700px' };
    case 'survey':
      return { ...base, type: 'survey', slug: '', title: 'Take Our Survey', description: "We'd love to hear your feedback", showPageTitle: true, height: '700px' };
    default:
      return { ...base, type: 'text', content: 'Unknown block type', alignment: 'left', size: 'base' };
  }
}

function renderBlockEdit(block: Block, onChange: (updates: Partial<Block>) => void) {
  switch (block.type) {
    case 'text':
      return <TextBlockEdit block={block} onChange={onChange} />;
    case 'heading':
      return <HeadingBlockEdit block={block} onChange={onChange} />;
    case 'image':
      return <ImageBlockEdit block={block} onChange={onChange} />;
    case 'button':
      return <ButtonBlockEdit block={block} onChange={onChange} />;
    case 'hero':
      return <HeroBlockEdit block={block} onChange={onChange} />;
    case 'services-grid':
      return <ServicesGridBlockEdit block={block} onChange={onChange} />;
    case 'cta':
      return <CtaBlockEdit block={block} onChange={onChange} />;
    default:
      return <div className="text-muted-foreground text-sm">No editor available for this block type.</div>;
  }
}

function getBlockPreview(block: Block): string {
  switch (block.type) {
    case 'text':
      return block.content.substring(0, 50) + (block.content.length > 50 ? '...' : '');
    case 'heading':
      return block.content;
    case 'image':
      return block.alt || 'Image';
    case 'button':
      return block.text;
    case 'hero':
      return block.title;
    case 'services-grid':
      return `${block.services.length} services`;
    case 'cta':
      return block.title;
    default:
      return '';
  }
}
