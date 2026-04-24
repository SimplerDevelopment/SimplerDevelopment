'use client';

import { MetricCardsBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { Icon } from '@/components/ui/Icon';

interface MetricCardsBlockRenderProps {
  block: MetricCardsBlock;
}

export function MetricCardsBlockRender({ block }: MetricCardsBlockRenderProps) {
  const columns = block.columns ?? 4;
  const accentColor = block.accentColor ?? '#004D80';

  const columnsClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
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

  const cardStyle = getElementCSS(block.elementStyles, 'card');
  const valueStyle = getElementCSS(block.elementStyles, 'value');
  const labelStyle = getElementCSS(block.elementStyles, 'label');
  const institutionStyle = getElementCSS(block.elementStyles, 'institution');
  const linkStyle = getElementCSS(block.elementStyles, 'link');

  return (
    <section className={`py-16 ${responsiveClasses}`}>
      {(block.overline || block.title || block.description) && (
        <div className="text-center mb-12 max-w-3xl mx-auto">
          {block.overline && (
            <p
              data-editable-field="overline"
              className="text-xs font-semibold tracking-[0.2em] uppercase mb-3"
              style={{ color: accentColor, ...getElementCSS(block.elementStyles, 'overline') }}
              dangerouslySetInnerHTML={{ __html: block.overline }}
            />
          )}
          {block.title && (
            <h2
              data-editable-field="title"
              className="font-heading text-3xl md:text-5xl font-bold mb-4"
              style={getElementCSS(block.elementStyles, 'title')}
              dangerouslySetInnerHTML={{ __html: block.title }}
            />
          )}
          {block.description && (
            <p
              data-editable-field="description"
              className="text-lg text-muted-foreground"
              style={getElementCSS(block.elementStyles, 'description')}
              dangerouslySetInnerHTML={{ __html: block.description }}
            />
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 ${columnsClass} gap-6`}>
        {(block.metrics || []).map((metric) => {
          const cardContent = (
            <div
              className="h-full flex flex-col justify-between rounded-xl border bg-white p-7 transition-all hover:shadow-md hover:-translate-y-0.5"
              style={{ borderColor: '#E5E7EB', ...cardStyle }}
            >
              <div>
                <div
                  className="font-heading font-bold leading-none tracking-tight mb-3"
                  style={{
                    color: accentColor,
                    fontSize: 'clamp(2.5rem, 4vw, 3.5rem)',
                    ...valueStyle,
                  }}
                  dangerouslySetInnerHTML={{ __html: metric.value }}
                />
                <div
                  className="text-[11px] font-semibold tracking-[0.15em] uppercase text-gray-600 leading-snug"
                  style={labelStyle}
                  dangerouslySetInnerHTML={{ __html: metric.label }}
                />
              </div>

              {(metric.institution || metric.institutionLogo) && (
                <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-3" style={institutionStyle}>
                  {metric.institutionLogo && (
                    <img
                      src={metric.institutionLogo}
                      alt={metric.institution || ''}
                      className="h-8 w-auto object-contain"
                    />
                  )}
                  {metric.institution && (
                    <span className="text-xs text-gray-500 font-medium">
                      {metric.institution}
                    </span>
                  )}
                </div>
              )}

              {metric.link && (
                <div className="mt-4">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase"
                    style={{ color: accentColor, ...linkStyle }}
                  >
                    {metric.linkText || 'Case Study'}
                    <Icon name="arrow_forward" size={14} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              )}
            </div>
          );

          return metric.link ? (
            <a key={metric.id} href={metric.link} className="group block h-full">
              {cardContent}
            </a>
          ) : (
            <div key={metric.id} className="group h-full">
              {cardContent}
            </div>
          );
        })}
      </div>
    </section>
  );
}
