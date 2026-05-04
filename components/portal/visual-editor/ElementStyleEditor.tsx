'use client';

import { useState } from 'react';
import { StyleSettings } from '@/components/blocks/visual/StyleSettings';
import type { Block, BlockStyle } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import { BLOCK_ELEMENTS } from './_lib/block-elements';

/**
 * Sub-tabs for multi-element blocks (hero title vs subtitle vs CTA, etc).
 * Single-element blocks fall through to a flat StyleSettings render.
 *
 * The `_block` key is reserved for the block-level style; everything else
 * writes into `block.elementStyles[key]` so per-element CSS overrides
 * survive a round-trip through the renderer.
 */
export function ElementStyleEditor({
  block,
  onChange,
  currentViewport,
}: {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}) {
  const elements = BLOCK_ELEMENTS[block.type];
  const [activeElement, setActiveElement] = useState('_block');

  // Single-element blocks — just show StyleSettings directly
  if (!elements) {
    return (
      <StyleSettings
        block={block}
        onChange={onChange}
        currentViewport={currentViewport}
      />
    );
  }

  const isBlockLevel = activeElement === '_block';

  // Create a virtual block for element-level styling
  const elementStyle = !isBlockLevel ? (block.elementStyles?.[activeElement] || {}) : undefined;

  return (
    <div className="space-y-3">
      {/* Element sub-tabs — sticky to top of the style panel scroll area.
          Negative margins cancel the parent's p-4 so the sticky bar reaches
          edge-to-edge when pinned; internal padding restores the visual inset. */}
      <div className="sticky top-0 z-10 -mx-4 -mt-4 px-4 pt-0 pb-2 bg-background border-b border-border">
        <div className="flex flex-wrap gap-1">
          {elements.map((el) => (
            <button
              key={el.key}
              type="button"
              onClick={() => setActiveElement(el.key)}
              className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                activeElement === el.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
              }`}
            >
              {el.label}
            </button>
          ))}
        </div>
      </div>

      {isBlockLevel ? (
        <StyleSettings
          block={block}
          onChange={onChange}
          currentViewport={currentViewport}
        />
      ) : (
        <StyleSettings
          block={{ ...block, style: (elementStyle || {}) as BlockStyle } as Block}
          onChange={(updates) => {
            // StyleSettings calls onChange with { style: { ...props } }
            // Map that to elementStyles[activeElement]
            if (updates.style) {
              const newElementStyles = { ...(block.elementStyles || {}) };
              newElementStyles[activeElement] = {
                ...(newElementStyles[activeElement] || {}),
                ...updates.style,
              };
              onChange({ elementStyles: newElementStyles } as Partial<Block>);
            }
          }}
          currentViewport={currentViewport}
        />
      )}
    </div>
  );
}
