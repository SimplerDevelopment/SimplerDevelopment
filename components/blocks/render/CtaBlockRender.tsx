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

  // Authors can override the default gradient via the style sidebar — pass
  // backgroundColor / customCSS / padding through to the wrapping section so
  // a cta block can render as a full-bleed branded band (matches cardiff.co's
  // "Ready to borrow better?" pattern). Without this, every cta block on the
  // site would be locked to the tiny `bg-primary/10` strip.
  const wrapperStyle: React.CSSProperties = { ...gradientStyle };
  if (style.backgroundColor) wrapperStyle.backgroundColor = style.backgroundColor;
  if (style.background) wrapperStyle.background = style.background as string;
  if (style.paddingTop) wrapperStyle.paddingTop = style.paddingTop as string;
  if (style.paddingBottom) wrapperStyle.paddingBottom = style.paddingBottom as string;
  if (style.paddingLeft) wrapperStyle.paddingLeft = style.paddingLeft as string;
  if (style.paddingRight) wrapperStyle.paddingRight = style.paddingRight as string;
  if (style.color) wrapperStyle.color = style.color as string;
  // customCSS is a string of `key: value; key2: value2;` — let the renderer
  // splice it onto the element via a style tag attribute. The cleanest way to
  // do this in React is via `data-` attribute + dangerouslySetInnerHTML for
  // class-scoped styles, but for cta-level overrides we can parse the simple
  // declarations into the styleObject directly.
  if (typeof style.customCSS === 'string' && style.customCSS.trim()) {
    for (const decl of style.customCSS.split(';')) {
      const idx = decl.indexOf(':');
      if (idx < 0) continue;
      const prop = decl.slice(0, idx).trim();
      const val = decl.slice(idx + 1).trim();
      if (!prop || !val) continue;
      // Convert kebab-case to camelCase for React style keys
      const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      (wrapperStyle as Record<string, string>)[camel] = val;
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
    <section className={`relative overflow-hidden ${backgroundClass} ${responsiveClasses}`} style={wrapperStyle}>
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
