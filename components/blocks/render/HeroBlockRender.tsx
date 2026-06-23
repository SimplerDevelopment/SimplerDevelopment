'use client';

import { HeroBlock, Block } from '@/types/blocks';
import { Button } from '@/components/ui/Button';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { useBranding } from '@/contexts/BrandingContext';
import { HeadingBlockRender } from './HeadingBlockRender';
import { TextBlockRender } from './TextBlockRender';
import { ImageBlockRender } from './ImageBlockRender';
import { ColumnsBlockRender } from './ColumnsBlockRender';
import { LogoStripBlockRender } from './LogoStripBlockRender';
import { BlockStyleWrapper } from './BlockStyleWrapper';

interface HeroBlockRenderProps {
  block: HeroBlock;
}

export function HeroBlockRender({ block }: HeroBlockRenderProps) {
  const branding = useBranding();

  // Compatibility aliases — some LLM-authored decks (notably older MCP
  // template output) write { eyebrow, headline, subheadline } instead of
  // { subtitle, title, description }. Accept both shapes so historical decks
  // still render; canonical fields always win when present.
  const raw = block as unknown as {
    title?: string; subtitle?: string; description?: string;
    headline?: string; eyebrow?: string; subheadline?: string;
  };
  const title = raw.title ?? raw.headline ?? '';
  const subtitle = raw.subtitle ?? raw.eyebrow;
  const description = raw.description ?? raw.subheadline;

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
  // User has set any custom background on the block style? If so, BlockStyleWrapper
  // already painted it on the wrapper div — don't render the default branded
  // gradient overlay on top, or we'd cover the user's gradient with white.
  const hasCustomBg = !!(style.backgroundColor || style.backgroundGradient || style.backgroundImage);

  return (
    <section className={`relative min-h-[60vh] flex items-center justify-center overflow-hidden ${responsiveClasses}`}>
      {/* Background layer — only rendered when the user has NOT provided their own bg.
          When hasCustomBg is true, the BlockStyleWrapper around us has already applied
          backgroundColor + backgroundGradient + backgroundImage to the wrapping div. */}
      {hasBackground ? (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${block.backgroundImage})` }}
        />
      ) : !hasCustomBg ? (
        <div
          className={`absolute inset-0 z-0 ${!branding ? 'bg-gradient-to-b from-primary/10 via-background to-background' : ''}`}
          style={branding ? { background: `linear-gradient(to bottom, ${branding.primaryColor}1a, ${branding.backgroundColor}, ${branding.backgroundColor})` } : undefined}
        />
      ) : null}

      {/* Content layer */}
      <div className="relative z-10 container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {subtitle && (
            <p data-editable-field="subtitle" className={`${hasCustomFontWeight ? '' : 'font-semibold'} mb-4 uppercase tracking-wide ${hasBackground ? 'text-white/80' : 'text-primary'}`} style={getElementCSS(block.elementStyles, 'subtitle')} dangerouslySetInnerHTML={{ __html: subtitle }} />
          )}

          <h1 data-editable-field="title" className={`font-display ${hasCustomFontSize ? '' : 'text-5xl md:text-7xl'} ${hasCustomFontWeight ? '' : 'font-bold'} mb-6 tracking-wide ${hasBackground ? 'text-white' : ''}`} style={getElementCSS(block.elementStyles, 'title')} dangerouslySetInnerHTML={{ __html: title }} />

          {description && (
            <p data-editable-field="description" className={`${hasCustomFontSize ? '' : 'text-xl md:text-2xl'} mb-8 max-w-2xl mx-auto ${hasBackground ? 'text-white/80' : 'text-muted-foreground'}`} style={getElementCSS(block.elementStyles, 'description')} dangerouslySetInnerHTML={{ __html: description }} />
          )}

          <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center items-center">
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

      {/* Optional sub-blocks rendered at the bottom of the hero (e.g. trust bars). */}
      {block.blocks && block.blocks.length > 0 && (
        <div className="relative z-10 w-full hero-subblocks">
          {block.blocks.map((child) => (
            <div key={child.id} data-block-id={child.id} data-block-type={child.type}>
              <BlockStyleWrapper block={child}>
                {renderHeroChild(child)}
              </BlockStyleWrapper>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function renderHeroChild(block: Block) {
  switch (block.type) {
    case 'heading': return <HeadingBlockRender block={block} />;
    case 'text': return <TextBlockRender block={block} />;
    case 'image': return <ImageBlockRender block={block} />;
    case 'columns': return <ColumnsBlockRender block={block} />;
    case 'logo-strip': return <LogoStripBlockRender block={block} />;
    default: return null;
  }
}
