'use client';

import { HeroBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { RichTextEditable } from './RichTextEditable';

interface HeroBlockPreviewProps {
  block: HeroBlock;
  isSelected: boolean;
  onChange: (updates: Partial<HeroBlock>) => void;
}

export function HeroBlockPreview({ block, isSelected, onChange }: HeroBlockPreviewProps) {
  const hasBackground = !!block.backgroundImage;

  const bgStyle: React.CSSProperties = hasBackground
    ? {
        backgroundImage: `url(${block.backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {};

  return (
    <div className="py-8 my-8 px-6">
      <div
        className={`${hasBackground ? '' : 'bg-gradient-to-r from-primary/20 to-purple-500/20'} rounded-lg py-20 px-4 text-center min-h-[60vh] flex items-center justify-center`}
        style={bgStyle}
      >
        <div className="max-w-4xl mx-auto">
          {(block.subtitle || isSelected) && (
            <RichTextEditable
              html={block.subtitle || ''}
              onChange={(html) => onChange({ subtitle: html })}
              className="text-primary font-semibold mb-4 uppercase tracking-wide w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 text-center"
              placeholder="Subtitle (optional)"
              singleLine={true}
              style={getElementCSS(block.elementStyles, 'subtitle')}
            />
          )}

          <RichTextEditable
            html={block.title}
            onChange={(html) => onChange({ title: html })}
            className={`font-display text-5xl md:text-7xl font-bold mb-6 tracking-wide w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center ${hasBackground ? 'text-white' : 'text-foreground'}`}
            placeholder="Hero Title"
            singleLine={true}
            style={getElementCSS(block.elementStyles, 'title')}
          />

          {(block.description || isSelected) && (
            <RichTextEditable
              html={block.description || ''}
              onChange={(html) => onChange({ description: html })}
              className={`text-xl md:text-2xl mb-8 max-w-2xl mx-auto w-full bg-transparent border-none focus:outline-none focus:border border-primary/50 rounded text-center resize-none ${hasBackground ? 'text-white/80' : 'text-muted-foreground'}`}
              placeholder="Description (optional)"
              singleLine={false}
              style={getElementCSS(block.elementStyles, 'description')}
            />
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {(block.ctaText || isSelected) && (
              <button
                type="button"
                className="px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium text-lg hover:bg-primary/90 transition-colors"
                onClick={(e) => e.preventDefault()}
                style={getElementCSS(block.elementStyles, 'cta')}
              >
                {block.ctaText || 'Primary CTA'}
              </button>
            )}

            {(block.secondaryCtaText || isSelected) && (
              <button
                type="button"
                className="px-6 py-3 border border-primary text-primary rounded-md font-medium text-lg hover:bg-primary/10 transition-colors"
                onClick={(e) => e.preventDefault()}
                style={getElementCSS(block.elementStyles, 'secondaryCta')}
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
