'use client';

import { HeroBlock } from '@/types/blocks';

interface HeroBlockPreviewProps {
  block: HeroBlock;
  isSelected: boolean;
  onChange: (updates: Partial<HeroBlock>) => void;
}

export function HeroBlockPreview({ block, isSelected, onChange }: HeroBlockPreviewProps) {
  return (
    <div className="py-8 my-8 px-6">
      <div className="bg-gradient-to-r from-primary/20 to-purple-500/20 rounded-lg py-20 px-4 text-center min-h-[60vh] flex items-center justify-center">
        <div className="max-w-4xl mx-auto">
          {(block.subtitle || isSelected) && (
            <input
              type="text"
              value={block.subtitle || ''}
              onChange={(e) => onChange({ subtitle: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="text-primary font-semibold mb-4 uppercase tracking-wide w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 text-center"
              placeholder="Subtitle (optional)"
            />
          )}

          <input
            type="text"
            value={block.title}
            onChange={(e) => onChange({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="font-display text-5xl md:text-7xl font-bold mb-6 tracking-wide w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground"
            placeholder="Hero Title"
          />

          {(block.description || isSelected) && (
            <textarea
              value={block.description || ''}
              onChange={(e) => onChange({ description: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="text-xl md:text-2xl mb-8 max-w-2xl mx-auto w-full bg-transparent border-none focus:outline-none focus:border border-primary/50 rounded text-center text-muted-foreground resize-none"
              placeholder="Description (optional)"
              rows={2}
            />
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {(block.ctaText || isSelected) && (
              <button
                type="button"
                className="px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium text-lg hover:bg-primary/90 transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                {block.ctaText || 'Primary CTA'}
              </button>
            )}

            {(block.secondaryCtaText || isSelected) && (
              <button
                type="button"
                className="px-6 py-3 border border-primary text-primary rounded-md font-medium text-lg hover:bg-primary/10 transition-colors"
                onClick={(e) => e.preventDefault()}
              >
                {block.secondaryCtaText || 'Secondary CTA'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
