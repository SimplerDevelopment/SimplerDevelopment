'use client';

import { FeaturedContentBlock } from '@/types/blocks';
import Link from 'next/link';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface FeaturedContentBlockRenderProps {
  block: FeaturedContentBlock;
}

export function FeaturedContentBlockRender({ block }: FeaturedContentBlockRenderProps) {
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
    <section className={`py-16 my-8 ${responsiveClasses}`}>
      <div className="container mx-auto px-4">
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
          block.imagePosition === 'right' ? '' : 'lg:grid-flow-dense'
        }`}>
          {/* Content */}
          <div className={block.imagePosition === 'right' ? 'lg:col-start-1' : 'lg:col-start-2'}>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              {block.title}
            </h2>
            {block.description && (
              <p className="text-lg text-muted-foreground mb-6">
                {block.description}
              </p>
            )}

            {block.stats && block.stats.length > 0 && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                {block.stats.map((stat) => (
                  <div key={stat.id}>
                    <div className="text-3xl font-bold text-primary mb-1">
                      {stat.value}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {block.buttonText && block.buttonUrl && (
              <Link
                href={block.buttonUrl}
                className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {block.buttonText} →
              </Link>
            )}
          </div>

          {/* Image */}
          {block.imageUrl && (
            <div className={block.imagePosition === 'right' ? 'lg:col-start-2' : 'lg:col-start-1'}>
              <img
                src={block.imageUrl}
                alt={block.title}
                className="w-full h-auto rounded-lg shadow-lg"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
