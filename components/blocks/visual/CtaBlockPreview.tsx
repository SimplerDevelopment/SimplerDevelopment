'use client';

import { CtaBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { RichTextEditable } from './RichTextEditable';
import { useBranding } from '@/contexts/BrandingContext';

interface CtaBlockPreviewProps {
  block: CtaBlock;
  isSelected: boolean;
  onChange: (updates: Partial<CtaBlock>) => void;
}

export function CtaBlockPreview({ block, isSelected, onChange }: CtaBlockPreviewProps) {
  const branding = useBranding();
  const bgStyle = block.backgroundStyle || 'gradient';

  // Mirror CtaBlockRender: branded gradient when available, fallback CSS only
  // when no branding context and no custom bg.
  const backgroundClass = bgStyle === 'solid' ? 'bg-primary/10'
    : bgStyle === 'none' ? 'bg-transparent'
    : '';

  const gradientStyle: React.CSSProperties = {};
  if (bgStyle === 'gradient') {
    if (branding) {
      gradientStyle.background = `linear-gradient(to right, ${branding.primaryColor}20, ${branding.secondaryColor}20, ${branding.accentColor}20)`;
    } else {
      gradientStyle.background = 'linear-gradient(to right, hsl(var(--primary) / 0.2), rgb(168 85 247 / 0.2), rgb(236 72 153 / 0.2))';
    }
  }

  return (
    <div className="py-20 my-12 px-6">
      <div className={`${backgroundClass} rounded-lg px-4 py-16 text-center relative overflow-hidden`} style={gradientStyle}>
        <div className="container mx-auto relative z-10">
          <RichTextEditable
            html={block.title}
            onChange={(html) => onChange({ title: html })}
            className="font-display text-4xl md:text-6xl font-bold mb-6 tracking-wide w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground"
            placeholder="CTA Title"
            singleLine={true}
            style={getElementCSS(block.elementStyles, 'title')}
          />

          {(block.description || isSelected) && (
            <RichTextEditable
              html={block.description || ''}
              onChange={(html) => onChange({ description: html })}
              className="text-xl md:text-2xl mb-12 max-w-3xl mx-auto w-full bg-transparent border-none focus:outline-none focus:border border-primary/50 rounded text-center text-muted-foreground resize-none"
              placeholder="Description (optional)"
              singleLine={false}
              style={getElementCSS(block.elementStyles, 'description')}
            />
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="button"
              className="px-6 py-3 text-lg bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 transition-colors"
              onClick={(e) => e.preventDefault()}
              style={getElementCSS(block.elementStyles, 'primaryButton')}
            >
              {block.primaryButtonText}
            </button>

            {(block.secondaryButtonText || isSelected) && (
              <button
                type="button"
                className="px-6 py-3 text-lg border border-primary text-primary rounded-md font-medium hover:bg-primary/10 transition-colors"
                onClick={(e) => e.preventDefault()}
                style={getElementCSS(block.elementStyles, 'secondaryButton')}
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
