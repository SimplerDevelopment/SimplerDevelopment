'use client';

import type { DeckNextSlideBlock, DeckJumpToBlock } from '@/types/blocks';

const sizeClasses = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-3 text-base',
  lg: 'px-8 py-4 text-lg',
};

const alignClasses = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

function variantInlineStyles(variant: string = 'primary'): React.CSSProperties {
  switch (variant) {
    case 'secondary':
      return {
        backgroundColor: 'var(--slide-accent, var(--accent, #60a5fa))',
        color: 'var(--slide-bg, var(--background, #0f172a))',
      };
    case 'outline':
      return {
        backgroundColor: 'transparent',
        color: 'var(--slide-primary, var(--primary, #2563eb))',
        border: '2px solid var(--slide-primary, var(--primary, #2563eb))',
      };
    default:
      return {
        backgroundColor: 'var(--slide-primary, var(--primary, #2563eb))',
        color: 'var(--slide-bg, var(--primary-foreground, #ffffff))',
      };
  }
}

export function DeckNextSlideBlockRender({ block }: { block: DeckNextSlideBlock }) {
  const size = sizeClasses[block.size || 'md'];
  const align = alignClasses[block.alignment || 'center'];
  const style = variantInlineStyles(block.variant);
  const iconLeft = block.icon && (block.iconPosition || 'left') === 'left';
  const iconRight = block.icon && block.iconPosition === 'right';

  return (
    <div className={`flex ${align} my-4`}>
      <button
        type="button"
        data-deck-action="next-slide"
        className={`inline-flex items-center gap-2 rounded-lg font-semibold transition-all hover:opacity-90 cursor-pointer ${size}`}
        style={style}
      >
        {iconLeft && <span className="material-icons text-[1.1em]">{block.icon}</span>}
        {block.text || 'Next'}
        {iconRight && <span className="material-icons text-[1.1em]">{block.icon}</span>}
        {!block.icon && <span className="material-icons text-[1.1em]">arrow_forward</span>}
      </button>
    </div>
  );
}

export function DeckJumpToBlockRender({ block }: { block: DeckJumpToBlock }) {
  const size = sizeClasses[block.size || 'md'];
  const align = alignClasses[block.alignment || 'center'];
  const style = variantInlineStyles(block.variant);
  const iconLeft = block.icon && (block.iconPosition || 'left') === 'left';
  const iconRight = block.icon && block.iconPosition === 'right';

  return (
    <div className={`flex ${align} my-4`}>
      <button
        type="button"
        data-deck-action="jump-to"
        data-deck-target={block.targetSlide}
        className={`inline-flex items-center gap-2 rounded-lg font-semibold transition-all hover:opacity-90 cursor-pointer ${size}`}
        style={style}
      >
        {iconLeft && <span className="material-icons text-[1.1em]">{block.icon}</span>}
        {block.text || `Go to Slide ${block.targetSlide}`}
        {iconRight && <span className="material-icons text-[1.1em]">{block.icon}</span>}
      </button>
    </div>
  );
}
