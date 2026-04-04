'use client';

import { StatsBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface StatsBlockRenderProps {
  block: StatsBlock;
}

export function StatsBlockRender({ block }: StatsBlockRenderProps) {
  const columnsClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
  }[block.columns || 3];

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
    <div className={`py-16 ${responsiveClasses}`}>
      {block.title && (
        <h2 data-editable-field="title" className="text-3xl md:text-4xl font-bold text-center mb-12" style={getElementCSS(block.elementStyles, 'title')} dangerouslySetInnerHTML={{ __html: block.title }} />
      )}

      <div className={`grid grid-cols-1 ${columnsClass} gap-8`}>
        {(block.stats || []).map((stat) => (
          <div key={stat.id} className="text-center">
            <div className="text-4xl md:text-5xl font-bold text-primary mb-2" style={getElementCSS(block.elementStyles, 'statValue')}>
              {stat.value}
            </div>
            <div className="text-lg text-muted-foreground" style={getElementCSS(block.elementStyles, 'statLabel')}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
