'use client';

import React, { useState } from 'react';
import { SectionBlock, Block, BlockType } from '@/types/blocks';
import { VisualBlockPreview } from './VisualBlockPreview';
import { NestedBlockInserter } from './NestedBlockInserter';
import { createDefaultBlock } from '@/lib/blocks/defaults';

interface SectionBlockPreviewProps {
  block: SectionBlock;
  isSelected: boolean;
  onChange: (updates: Partial<SectionBlock>) => void;
  selectedBlockId?: string | null;
  onSelectBlock?: (id: string | null) => void;
}

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

  // Mirror SectionBlockRender: block.style overrides legacy direct fields,
  // gradient layers above the image, borders/shadows are honored.
  const s = block.style;
  const bgColor = s?.backgroundColor || block.backgroundColor;
  const color = s?.color || block.color;

  const bgLayers: string[] = [];
  if (s?.backgroundGradient) bgLayers.push(s.backgroundGradient);
  const resolvedBgImage = s?.backgroundImage || block.backgroundImage;
  if (resolvedBgImage) bgLayers.push(`url(${resolvedBgImage})`);
  const bgImageStyle: React.CSSProperties = bgLayers.length
    ? {
        backgroundImage: bgLayers.join(', '),
        backgroundSize: s?.backgroundSize || block.backgroundSize || 'cover',
        backgroundPosition: s?.backgroundPosition || block.backgroundPosition || 'center',
        ...(s?.backgroundRepeat ? { backgroundRepeat: s.backgroundRepeat } : {}),
      }
    : {};

  const containerStyle: React.CSSProperties = {
    ...(bgColor ? { backgroundColor: bgColor } : {}),
    ...bgImageStyle,
    ...(color ? { color } : {}),
    padding: `${block.paddingTop || '1.5rem'} ${block.paddingRight || '1.5rem'} ${block.paddingBottom || '1.5rem'} ${block.paddingLeft || '1.5rem'}`,
    // Borders + shadow + opacity (mirror renderer)
    ...(s?.borderWidth ? { borderWidth: s.borderWidth } : {}),
    ...(s?.borderColor ? { borderColor: s.borderColor } : {}),
    ...(s?.borderStyle ? { borderStyle: s.borderStyle as React.CSSProperties['borderStyle'] } : {}),
    ...(s?.borderRadius ? { borderRadius: s.borderRadius } : {}),
    ...(s?.boxShadow ? { boxShadow: s.boxShadow } : {}),
    ...(s?.opacity ? { opacity: s.opacity } : {}),
    position: 'relative',
    ...(block.splitColor ? { overflow: 'hidden' } : {}),
  };

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
      {/* Diagonal split overlay — mirrors SectionBlockRender */}
      {block.splitColor && (
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: block.splitColor,
            clipPath: block.splitClipPath || 'polygon(55% 0, 100% 0, 100% 100%, 45% 100%)',
          }}
        />
      )}
      <div className="relative z-10" style={innerStyle}>
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

      {/* Block Inserter Modal — sources full 47-block roster from registry */}
      {showBlockInserter && (
        <NestedBlockInserter
          title="Add Block to Section"
          onPick={(type) => addBlockToSection(type)}
          onClose={() => setShowBlockInserter(false)}
          compact
        />
      )}
    </div>
  );
}
