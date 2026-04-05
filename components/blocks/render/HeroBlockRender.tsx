'use client';

import { HeroBlock } from '@/types/blocks';
import { Button } from '@/components/ui/Button';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { useBranding } from '@/contexts/BrandingContext';

interface HeroBlockRenderProps {
  block: HeroBlock;
}

export function HeroBlockRender({ block }: HeroBlockRenderProps) {
  const branding = useBranding();

  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;
  const hasCustomFontWeight = !!style.fontWeight;

  // Generate responsive classes from block settings
  const responsiveClasses = block.responsive
    ? combineResponsiveClasses(
        block.responsive.paddingTop,
        block.responsive.paddingBottom,
        block.responsive.paddingLeft,
        block.responsive.paddingRight,
        block.responsive.marginTop,
        block.responsive.marginBottom,
        block.responsive.marginLeft,
        block.responsive.marginRight,
        block.responsive.visibility,
        block.responsive.fontSize
      )
    : '';

  const hasBackground = !!block.backgroundImage;

  return (
    <section className={`relative min-h-[60vh] flex items-center justify-center overflow-hidden ${responsiveClasses}`}>
      {/* Background layer */}
      {hasBackground ? (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${block.backgroundImage})` }}
        >
          <div className="absolute inset-0 bg-black/50" />
        </div>
      ) : (
        <div
          className={`absolute inset-0 z-0 ${!branding ? 'bg-gradient-to-b from-primary/10 via-background to-background' : ''}`}
          style={branding ? { background: `linear-gradient(to bottom, ${branding.primaryColor}1a, ${branding.backgroundColor}, ${branding.backgroundColor})` } : undefined}
        />
      )}

      {/* Content layer */}
      <div className="relative z-10 container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {block.subtitle && (
            <p data-editable-field="subtitle" className={`${hasCustomFontWeight ? '' : 'font-semibold'} mb-4 uppercase tracking-wide ${hasBackground ? 'text-white/80' : 'text-primary'}`} style={getElementCSS(block.elementStyles, 'subtitle')} dangerouslySetInnerHTML={{ __html: block.subtitle }} />
          )}

          <h1 data-editable-field="title" className={`font-display ${hasCustomFontSize ? '' : 'text-5xl md:text-7xl'} ${hasCustomFontWeight ? '' : 'font-bold'} mb-6 tracking-wide ${hasBackground ? 'text-white' : ''}`} style={getElementCSS(block.elementStyles, 'title')} dangerouslySetInnerHTML={{ __html: block.title }} />

          {block.description && (
            <p data-editable-field="description" className={`${hasCustomFontSize ? '' : 'text-xl md:text-2xl'} mb-8 max-w-2xl mx-auto ${hasBackground ? 'text-white/80' : 'text-muted-foreground'}`} style={getElementCSS(block.elementStyles, 'description')} dangerouslySetInnerHTML={{ __html: block.description }} />
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {block.ctaText && block.ctaLink && (
              <Button href={block.ctaLink} size="lg" style={getElementCSS(block.elementStyles, 'cta')}>
                {block.ctaText}
              </Button>
            )}
            {block.secondaryCtaText && block.secondaryCtaLink && (
              <Button href={block.secondaryCtaLink} variant="outline" size="lg" style={getElementCSS(block.elementStyles, 'secondaryCta')}>
                {block.secondaryCtaText}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
