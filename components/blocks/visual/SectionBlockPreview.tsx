'use client';

import React, { useState } from 'react';
import { SectionBlock, Block, BlockType } from '@/types/blocks';
import { VisualBlockPreview } from './VisualBlockPreview';

interface SectionBlockPreviewProps {
  block: SectionBlock;
  isSelected: boolean;
  onChange: (updates: Partial<SectionBlock>) => void;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
}

const blockTypes: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }> = [
  { type: 'heading', label: 'Heading', icon: '📝', category: 'Basic', description: 'Add a heading' },
  { type: 'text', label: 'Paragraph', icon: '📄', category: 'Basic', description: 'Add text' },
  { type: 'button', label: 'Button', icon: '🔘', category: 'Basic', description: 'Add a button' },
  { type: 'quote', label: 'Quote', icon: '💬', category: 'Basic', description: 'Add a quote' },
  { type: 'image', label: 'Image', icon: '🖼️', category: 'Media', description: 'Add an image' },
  { type: 'youtube', label: 'YouTube', icon: '📺', category: 'Media', description: 'Embed YouTube' },
  { type: 'video', label: 'Video', icon: '🎬', category: 'Media', description: 'Embed video' },
  { type: 'code', label: 'Code', icon: '💻', category: 'Media', description: 'Code block' },
  { type: 'spacer', label: 'Spacer', icon: '↕️', category: 'Layout', description: 'Vertical space' },
  { type: 'divider', label: 'Divider', icon: '➖', category: 'Layout', description: 'Horizontal line' },
  { type: 'columns', label: 'Columns', icon: '📊', category: 'Layout', description: 'Multi-column' },
  { type: 'section', label: 'Section', icon: '📦', category: 'Layout', description: 'Container wrapper' },
  { type: 'accordion', label: 'Accordion', icon: '📑', category: 'Layout', description: 'Collapsible' },
  { type: 'tabs', label: 'Tabs', icon: '🗂️', category: 'Layout', description: 'Tabbed content' },
  { type: 'hero', label: 'Hero', icon: '🎯', category: 'Components', description: 'Hero section' },
  { type: 'cta', label: 'CTA', icon: '📢', category: 'Components', description: 'Call to action' },
  { type: 'testimonial', label: 'Testimonial', icon: '⭐', category: 'Components', description: 'Testimonial' },
  { type: 'stats', label: 'Stats', icon: '📈', category: 'Components', description: 'Statistics' },
  { type: 'card-grid', label: 'Card Grid', icon: '🎴', category: 'Components', description: 'Cards' },
];

export function SectionBlockPreview({ block, isSelected, onChange, selectedBlockId, onSelectBlock }: SectionBlockPreviewProps) {
  const [showBlockInserter, setShowBlockInserter] = useState(false);

  const addBlockToSection = (blockType: BlockType) => {
    const newBlock = createDefaultBlock(blockType);
    onChange({ blocks: [...block.blocks, newBlock] });
    setShowBlockInserter(false);
  };

  const updateSectionBlock = (blockId: string, updates: Partial<Block>) => {
    onChange({
      blocks: block.blocks.map((b) =>
        b.id === blockId ? { ...b, ...updates } as Block : b
      ),
    });
  };

  const deleteSectionBlock = (blockId: string) => {
    onChange({
      blocks: block.blocks.filter((b) => b.id !== blockId),
    });
  };

  // Build container styles
  const containerStyle: React.CSSProperties = {
    ...(block.backgroundColor ? { backgroundColor: block.backgroundColor } : {}),
    ...(block.backgroundImage ? {
      backgroundImage: `url(${block.backgroundImage})`,
      backgroundSize: block.backgroundSize || 'cover',
      backgroundPosition: block.backgroundPosition || 'center',
    } : {}),
    ...(block.color ? { color: block.color } : {}),
    padding: `${block.paddingTop || '1.5rem'} ${block.paddingRight || '1.5rem'} ${block.paddingBottom || '1.5rem'} ${block.paddingLeft || '1.5rem'}`,
  };

  const s = block.style;
  const innerStyle: React.CSSProperties = {
    ...(block.maxWidth ? { maxWidth: block.maxWidth, marginLeft: 'auto', marginRight: 'auto' } : {}),
  };
  const contentStyle: React.CSSProperties = {
    ...(s?.display ? { display: s.display } : {}),
    ...(s?.flexDirection ? { flexDirection: s.flexDirection } : {}),
    ...(s?.justifyContent ? { justifyContent: s.justifyContent } : {}),
    ...(s?.alignItems ? { alignItems: s.alignItems } : {}),
    ...(s?.flexWrap ? { flexWrap: s.flexWrap } : {}),
    ...(s?.gap ? { gap: s.gap } : {}),
  };

  return (
    <div
      className={`${block.fontFamily || ''} ${block.cssClass || ''} ${
        isSelected ? 'min-h-[120px]' : ''
      }`}
      style={containerStyle}
    >
      <div style={innerStyle}>
        {/* Section content */}
        {block.blocks.length > 0 ? (
          <div className={isSelected && !s?.display ? 'space-y-2' : 'space-y-0'} style={contentStyle}>
            {block.blocks.map((sectionBlock, blockIndex) => {
              const isNestedSelected = selectedBlockId === sectionBlock.id;

              return (
                <div key={sectionBlock.id} className="relative group/block">
                  <div
                    className={`${isSelected ? 'rounded border overflow-hidden' : 'overflow-hidden'} ${
                      isNestedSelected ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-border'
                    } cursor-pointer transition-all`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectBlock?.(sectionBlock.id);
                    }}
                  >
                    <VisualBlockPreview
                      block={sectionBlock}
                      isSelected={isNestedSelected}
                      onChange={(updates) => updateSectionBlock(sectionBlock.id, updates)}
                      selectedBlockId={selectedBlockId}
                      onSelectBlock={onSelectBlock}
                    />
                  </div>

                  {/* Delete button */}
                  {isSelected && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSectionBlock(sectionBlock.id);
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
            <div className="flex items-center justify-center h-24 border-2 border-dashed border-border rounded text-sm text-muted-foreground">
              Empty section — add blocks below
            </div>
          )
        )}

        {/* Add Block button */}
        {isSelected && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowBlockInserter(true);
            }}
            className="w-full mt-2 p-2 border border-dashed border-border rounded hover:border-primary hover:bg-primary/5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            + Add Block
          </button>
        )}
      </div>

      {/* Block Inserter Modal */}
      {showBlockInserter && (
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
            <div className="p-4 border-b border-border">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-foreground">Add Block to Section</h3>
                <button
                  type="button"
                  onClick={() => setShowBlockInserter(false)}
                  className="p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-accent"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-80px)]">
              {Array.from(new Set(blockTypes.map(bt => bt.category))).map(category => (
                <div key={category} className="p-4 border-b border-border last:border-0">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase mb-3 tracking-wide">{category}</h4>
                  <div className="grid grid-cols-3 gap-3">
                    {blockTypes
                      .filter(bt => bt.category === category)
                      .map(bt => (
                        <button
                          key={bt.type}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            addBlockToSection(bt.type);
                          }}
                          className="p-3 border border-border rounded-lg hover:border-primary hover:bg-primary/5 transition-all text-left group"
                        >
                          <div className="flex flex-col items-center gap-2">
                            <div className="text-2xl">{bt.icon}</div>
                            <div className="text-xs font-medium text-foreground group-hover:text-primary text-center">{bt.label}</div>
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
      return { ...base, type: 'columns', columns: [{ id: `col-${Date.now()}-1`, width: 50, blocks: [] }, { id: `col-${Date.now()}-2`, width: 50, blocks: [] }], gap: 'md' };
    case 'section':
      return { ...base, type: 'section', blocks: [] };
    case 'accordion':
      return { ...base, type: 'accordion', title: 'FAQ', items: [{ id: `item-${Date.now()}-1`, title: 'Question?', content: 'Answer.' }] };
    case 'tabs':
      return { ...base, type: 'tabs', tabs: [{ id: `tab-${Date.now()}-1`, label: 'Tab 1', blocks: [] }, { id: `tab-${Date.now()}-2`, label: 'Tab 2', blocks: [] }] };
    case 'hero':
      return { ...base, type: 'hero', title: 'Hero Title', ctaText: 'Get Started', ctaLink: '/contact' };
    case 'cta':
      return { ...base, type: 'cta', title: 'Ready?', primaryButtonText: 'Go', primaryButtonUrl: '/contact', backgroundStyle: 'gradient' };
    case 'testimonial':
      return { ...base, type: 'testimonial', quote: 'Great!', author: 'Someone' };
    case 'stats':
      return { ...base, type: 'stats', stats: [], columns: 3 };
    case 'card-grid':
      return { ...base, type: 'card-grid', title: 'Features', cards: [], columns: 3 };
    default:
      return { ...base, type: 'text', content: 'Block', alignment: 'left', size: 'base' };
  }
}
