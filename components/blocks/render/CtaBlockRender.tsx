'use client';

import { CtaBlock } from '@/types/blocks';
import { Button } from '@/components/ui/Button';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { useBranding } from '@/contexts/BrandingContext';

interface CtaBlockRenderProps {
  block: CtaBlock;
}

export function CtaBlockRender({ block }: CtaBlockRenderProps) {
  const branding = useBranding();

  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;
  const hasCustomFontWeight = !!style.fontWeight;

  // Use branding colors for gradient when available
  const bgStyle = block.backgroundStyle || 'gradient';
  const backgroundClass = bgStyle === 'solid' ? 'bg-primary/10'
    : bgStyle === 'none' ? ''
    : ''; // gradient handled via inline style when branding available

  const gradientStyle: React.CSSProperties = {};
  if (bgStyle === 'gradient') {
    if (branding) {
      gradientStyle.background = `linear-gradient(to right, ${branding.primaryColor}20, ${branding.secondaryColor}20, ${branding.accentColor}20)`;
    } else {
      gradientStyle.background = 'linear-gradient(to right, hsl(var(--primary) / 0.2), rgb(168 85 247 / 0.2), rgb(236 72 153 / 0.2))';
    }
  }

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

  return (
    <section className={`relative overflow-hidden ${backgroundClass} ${responsiveClasses}`} style={gradientStyle}>
      <div className="container mx-auto px-4 text-center relative z-10">
        <h2 data-editable-field="title" className={`font-display ${hasCustomFontSize ? '' : 'text-4xl md:text-6xl'} ${hasCustomFontWeight ? '' : 'font-bold'} mb-6 tracking-wide`} style={getElementCSS(block.elementStyles, 'title')} dangerouslySetInnerHTML={{ __html: block.title }} />

        {block.description && (
          <p data-editable-field="description" className={`${hasCustomFontSize ? '' : 'text-xl md:text-2xl'} text-muted-foreground mb-12 max-w-3xl mx-auto`} style={getElementCSS(block.elementStyles, 'description')} dangerouslySetInnerHTML={{ __html: block.description }} />
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button href={block.primaryButtonUrl} size="lg" style={getElementCSS(block.elementStyles, 'primaryButton')}>
            {block.primaryButtonText}
          </Button>
          {block.secondaryButtonText && block.secondaryButtonUrl && (
            <Button href={block.secondaryButtonUrl} variant="outline" size="lg" style={getElementCSS(block.elementStyles, 'secondaryButton')}>
              {block.secondaryButtonText}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
