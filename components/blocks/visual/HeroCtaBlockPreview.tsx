'use client';

import { HeroCtaBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { RichTextEditable } from './RichTextEditable';
import { useBranding } from '@/contexts/BrandingContext';

interface HeroCtaBlockPreviewProps {
  block: HeroCtaBlock;
  isSelected: boolean;
  onChange: (updates: Partial<HeroCtaBlock>) => void;
}

/**
 * Editor-canvas preview for the unified `hero-cta` block (VEQA-067). Mirrors
 * `HeroBlockPreview`/`CtaBlockPreview` — same edit affordances, keyed off
 * `block.layout` instead of a separate component per legacy type.
 */
export function HeroCtaBlockPreview({ block, isSelected, onChange }: HeroCtaBlockPreviewProps) {
  const branding = useBranding();

  if (block.layout === 'banner') {
    const bgStyle = block.backgroundStyle || 'gradient';
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
              placeholder="Title"
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
                {block.primaryButtonText || 'Primary Button'}
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

  // layout === 'hero'
  const hasBackground = !!block.backgroundImage;
  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomBg = !!(style.backgroundColor || style.backgroundGradient || style.backgroundImage);

  const bgStyle: React.CSSProperties = hasBackground
    ? {
        backgroundImage: `url(${block.backgroundImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : !hasCustomBg && branding
      ? { background: `linear-gradient(to bottom, ${branding.primaryColor}1a, ${branding.backgroundColor}, ${branding.backgroundColor})` }
      : {};

  const fallbackGradientClass = !hasBackground && !hasCustomBg && !branding
    ? 'bg-gradient-to-b from-primary/10 via-background to-background'
    : '';

  return (
    <div className="py-8 my-8 px-6">
      <div
        className={`${fallbackGradientClass} rounded-lg py-20 px-4 text-center min-h-[60vh] flex items-center justify-center`}
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
            placeholder="Title"
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
            {(block.primaryButtonText || isSelected) && (
              <button
                type="button"
                className="px-6 py-3 bg-primary text-primary-foreground rounded-md font-medium text-lg hover:bg-primary/90 transition-colors"
                onClick={(e) => e.preventDefault()}
                style={getElementCSS(block.elementStyles, 'primaryButton')}
              >
                {block.primaryButtonText || 'Primary Button'}
              </button>
            )}

            {(block.secondaryButtonText || isSelected) && (
              <button
                type="button"
                className="px-6 py-3 border border-primary text-primary rounded-md font-medium text-lg hover:bg-primary/10 transition-colors"
                onClick={(e) => e.preventDefault()}
                style={getElementCSS(block.elementStyles, 'secondaryButton')}
              >
                {block.secondaryButtonText || 'Secondary Button'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
