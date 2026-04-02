'use client';

import { FeaturedContentBlock } from '@/types/blocks';
import Link from 'next/link';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { useBranding } from '@/contexts/BrandingContext';

interface FeaturedContentBlockRenderProps {
  block: FeaturedContentBlock;
}

export function FeaturedContentBlockRender({ block }: FeaturedContentBlockRenderProps) {
  const branding = useBranding();
  const bs = branding?.buttonStyle;
  const btnRadius = bs?.borderRadius || branding?.borderRadius;

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
            <h2 data-editable-field="title" className="text-3xl md:text-4xl font-bold mb-4" style={getElementCSS(block.elementStyles, 'title')} dangerouslySetInnerHTML={{ __html: block.title }} />
            {block.description && (
              <p data-editable-field="description" className="text-lg text-muted-foreground mb-6" style={getElementCSS(block.elementStyles, 'description')} dangerouslySetInnerHTML={{ __html: block.description }} />
            )}

            {block.stats && block.stats.length > 0 && (
              <div className="grid grid-cols-2 gap-6 mb-6">
                {block.stats.map((stat) => (
                  <div key={stat.id}>
                    <div className="text-3xl font-bold text-primary mb-1" style={getElementCSS(block.elementStyles, 'statValue')}>
                      {stat.value}
                    </div>
                    <div className="text-sm text-muted-foreground" style={getElementCSS(block.elementStyles, 'statLabel')}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {block.buttonText && block.buttonUrl && (
              <Link
                href={block.buttonUrl}
                className={`inline-flex items-center justify-center bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors ${!btnRadius ? 'rounded-md' : ''}`}
                style={{ ...getElementCSS(block.elementStyles, 'button'), ...(bs?.primaryBg ? { backgroundColor: bs.primaryBg } : {}), ...(bs?.primaryText ? { color: bs.primaryText } : {}), ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
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
                className={`w-full h-auto shadow-lg ${!branding?.borderRadius ? 'rounded-lg' : ''}`}
                style={branding?.borderRadius ? { borderRadius: branding.borderRadius } : undefined}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
