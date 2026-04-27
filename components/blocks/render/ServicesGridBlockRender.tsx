'use client';

import { ServicesGridBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface ServicesGridBlockRenderProps {
  block: ServicesGridBlock;
}

export function ServicesGridBlockRender({ block }: ServicesGridBlockRenderProps) {
  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;
  const hasCustomFontWeight = !!style.fontWeight;
  const accentColor = block.accentColor ?? '#004D80';
  const columns = block.columns ?? 3;

  const columnsClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
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
  const titleStyle = getElementCSS(block.elementStyles, 'serviceTitle');
  const descStyle = getElementCSS(block.elementStyles, 'serviceDescription');
  const iconStyle = getElementCSS(block.elementStyles, 'serviceIcon');
  const linkStyle = getElementCSS(block.elementStyles, 'serviceLink');
  const bulletStyle = getElementCSS(block.elementStyles, 'bullet');

  return (
    <section className={responsiveClasses}>
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
              className={`font-heading ${hasCustomFontSize ? '' : 'text-4xl md:text-5xl'} ${hasCustomFontWeight ? '' : 'font-bold'} mb-4`}
              style={getElementCSS(block.elementStyles, 'title')}
              dangerouslySetInnerHTML={{ __html: block.title }}
            />
          )}
          {block.description && (
            <p
              data-editable-field="description"
              className={`${hasCustomFontSize ? '' : 'text-xl'} text-muted-foreground`}
              style={getElementCSS(block.elementStyles, 'description')}
              dangerouslySetInnerHTML={{ __html: block.description }}
            />
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 ${columnsClass} gap-6`}>
        {(block.services || []).map((service) => (
          <div
            key={service.id}
            className="flex flex-col h-full rounded-xl border bg-white p-7 transition-all hover:shadow-md hover:-translate-y-0.5"
            style={{ borderColor: '#E5E7EB', ...cardStyle }}
          >
            {service.image ? (
              <img src={service.image} alt="" className="w-14 h-14 object-contain mb-4" />
            ) : service.icon ? (
              <span
                className="material-icons mb-4"
                style={{ fontSize: '44px', color: accentColor, ...iconStyle }}
                aria-hidden
              >
                {service.icon}
              </span>
            ) : null}

            <h3
              className="font-heading text-2xl font-bold mb-2"
              style={titleStyle}
              dangerouslySetInnerHTML={{ __html: service.title }}
            />

            {service.description && (
              <p
                className="text-base text-gray-600 mb-4"
                style={descStyle}
                dangerouslySetInnerHTML={{ __html: service.description }}
              />
            )}

            {service.bullets && service.bullets.length > 0 && (
              <ul className="space-y-2 mb-5 mt-auto" style={bulletStyle}>
                {service.bullets.map((bullet) => (
                  <li key={bullet.id} className="flex items-start gap-2 text-sm text-gray-700">
                    <span
                      className="material-icons shrink-0"
                      style={{ fontSize: '18px', color: accentColor, marginTop: '1px' }}
                      aria-hidden
                    >
                      {bullet.icon || 'check_circle'}
                    </span>
                    <span dangerouslySetInnerHTML={{ __html: bullet.text }} />
                  </li>
                ))}
              </ul>
            )}

            {service.link && (
              <a
                href={service.link}
                className={`inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase ${service.bullets?.length ? '' : 'mt-auto'}`}
                style={{ color: accentColor, ...linkStyle }}
              >
                {service.linkText || 'Learn More'}
                <span className="material-icons" style={{ fontSize: '14px' }} aria-hidden>
                  arrow_forward
                </span>
              </a>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
