'use client';

import { CtaBlock } from '@/types/blocks';

interface CtaBlockPreviewProps {
  block: CtaBlock;
  isSelected: boolean;
  onChange: (updates: Partial<CtaBlock>) => void;
}

export function CtaBlockPreview({ block, isSelected, onChange }: CtaBlockPreviewProps) {
  const backgroundStyles = {
    gradient: 'bg-gradient-to-r from-primary/20 via-purple-500/20 to-pink-500/20',
    solid: 'bg-primary/10',
    none: 'bg-transparent',
  };

  return (
    <div className="py-20 my-12 px-6">
      <div className={`${backgroundStyles[block.backgroundStyle || 'gradient']} rounded-lg px-4 py-16 text-center relative overflow-hidden`}>
        <div className="container mx-auto relative z-10">
          <input
            type="text"
            value={block.title}
            onChange={(e) => onChange({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="font-display text-4xl md:text-6xl font-bold mb-6 tracking-wide w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground"
            placeholder="CTA Title"
          />

          {(block.description || isSelected) && (
            <textarea
              value={block.description || ''}
              onChange={(e) => onChange({ description: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="text-xl md:text-2xl mb-12 max-w-3xl mx-auto w-full bg-transparent border-none focus:outline-none focus:border border-primary/50 rounded text-center text-muted-foreground resize-none"
              placeholder="Description (optional)"
              rows={2}
            />
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="button"
              className="px-6 py-3 text-lg bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
              onClick={(e) => e.preventDefault()}
            >
              {block.primaryButtonText}
            </button>

            {(block.secondaryButtonText || isSelected) && (
              <button
                type="button"
                className="px-6 py-3 text-lg border border-primary text-primary rounded-md font-medium hover:bg-primary/10 transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                {block.secondaryButtonText || 'Secondary'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
