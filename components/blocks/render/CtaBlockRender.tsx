'use client';

import { CtaBlock } from '@/types/blocks';
import { Button } from '@/components/ui/Button';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface CtaBlockRenderProps {
  block: CtaBlock;
}

export function CtaBlockRender({ block }: CtaBlockRenderProps) {
  const backgroundClass = {
    gradient: 'bg-gradient-to-r from-primary/20 via-purple-500/20 to-pink-500/20',
    solid: 'bg-primary/10',
    none: '',
  }[block.backgroundStyle || 'gradient'];

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
    <section className={`py-20 my-12 relative overflow-hidden ${backgroundClass} ${responsiveClasses}`}>
      <div className="container mx-auto px-4 text-center relative z-10">
        <h2 className="font-display text-4xl md:text-6xl font-bold mb-6 tracking-wide">
          {block.title}
        </h2>

        {block.description && (
          <p className="text-xl md:text-2xl text-muted-foreground mb-12 max-w-3xl mx-auto">
            {block.description}
          </p>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button href={block.primaryButtonUrl} size="lg">
            {block.primaryButtonText}
          </Button>
          {block.secondaryButtonText && block.secondaryButtonUrl && (
            <Button href={block.secondaryButtonUrl} variant="outline" size="lg">
              {block.secondaryButtonText}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
