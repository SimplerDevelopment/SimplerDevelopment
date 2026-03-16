'use client';

import { HeroBlock } from '@/types/blocks';
import { Button } from '@/components/ui/Button';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface HeroBlockRenderProps {
  block: HeroBlock;
}

export function HeroBlockRender({ block }: HeroBlockRenderProps) {
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
        block.responsive.visibility
      )
    : '';

  return (
    <section className={`relative min-h-[60vh] flex items-center justify-center overflow-hidden my-12 ${responsiveClasses}`}>
      {block.backgroundImage && (
        <div
          className="absolute inset-0 bg-cover bg-center -z-10"
          style={{ backgroundImage: `url(${block.backgroundImage})` }}
        >
          <div className="absolute inset-0 bg-black/50" />
        </div>
      )}

      {!block.backgroundImage && (
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-background to-background -z-10" />
      )}

      <div className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {block.subtitle && (
            <p className="text-primary font-semibold mb-4 uppercase tracking-wide">
              {block.subtitle}
            </p>
          )}

          <h1 className="font-display text-5xl md:text-7xl font-bold mb-6 tracking-wide">
            {block.title}
          </h1>

          {block.description && (
            <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              {block.description}
            </p>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {block.ctaText && block.ctaLink && (
              <Button href={block.ctaLink} size="lg">
                {block.ctaText}
              </Button>
            )}
            {block.secondaryCtaText && block.secondaryCtaLink && (
              <Button href={block.secondaryCtaLink} variant="outline" size="lg">
                {block.secondaryCtaText}
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
