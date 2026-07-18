'use client';

import { LogoStripBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface LogoStripBlockRenderProps {
  block: LogoStripBlock;
}

export function LogoStripBlockRender({ block }: LogoStripBlockRenderProps) {
  const columns = block.columns ?? 6;
  const grayscale = block.grayscale ?? true;
  const logoHeight = block.logoHeight ?? '40px';
  const gap = block.gap ?? 'lg';
  const alignment = block.alignment ?? 'center';

  const gapClass = { sm: 'gap-4', md: 'gap-6', lg: 'gap-10' }[gap];
  const justifyClass = { left: 'justify-start', center: 'justify-center', right: 'justify-end' }[alignment];

  // Responsive columns — collapse gracefully on smaller viewports
  const gridClass = {
    3: 'grid-cols-2 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-6',
    7: 'grid-cols-2 sm:grid-cols-4 md:grid-cols-7',
    8: 'grid-cols-2 sm:grid-cols-4 md:grid-cols-8',
  }[columns];

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
        block.responsive.fontSize,
      )
    : '';

  const overlineStyle = getElementCSS(block.elementStyles, 'overline');
  const logoStyle = getElementCSS(block.elementStyles, 'logo');

  return (
    <section className={responsiveClasses}>
      {block.overline && (
        <p
          data-editable-field="overline"
          className="text-center text-xs font-semibold tracking-[0.2em] uppercase text-muted-foreground mb-8"
          style={overlineStyle}
          dangerouslySetInnerHTML={{ __html: block.overline }}
        />
      )}

      <div className={`grid ${gridClass} ${gapClass} ${justifyClass} items-center`}>
        {(block.logos || []).map((logo) => {
          const img = (
            <img
              src={logo.imageUrl}
              alt={logo.alt}
              className={`max-w-full w-auto object-contain mx-auto transition-all duration-300 ${
                grayscale ? 'grayscale opacity-70 hover:grayscale-0 hover:opacity-100' : ''
              }`}
              style={{ height: logoHeight, maxHeight: logoHeight, ...logoStyle }}
              loading="lazy"
            />
          );
          return logo.link ? (
            <a key={logo.id} href={logo.link} className="flex items-center justify-center" aria-label={logo.alt}>
              {img}
            </a>
          ) : (
            <div key={logo.id} className="flex items-center justify-center">
              {img}
            </div>
          );
        })}
      </div>
    </section>
  );
}
