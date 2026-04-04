'use client';

import { ServicesGridBlock } from '@/types/blocks';
import { Card } from '@/components/ui/Card';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface ServicesGridBlockRenderProps {
  block: ServicesGridBlock;
}

export function ServicesGridBlockRender({ block }: ServicesGridBlockRenderProps) {
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
    <section className={`py-16 ${responsiveClasses}`}>
        {(block.title || block.description) && (
          <div className="text-center mb-12">
            {block.title && (
              <h2 data-editable-field="title" className="font-heading text-4xl md:text-5xl font-bold mb-4" style={getElementCSS(block.elementStyles, 'title')} dangerouslySetInnerHTML={{ __html: block.title }} />
            )}
            {block.description && (
              <p data-editable-field="description" className="text-xl text-muted-foreground max-w-2xl mx-auto" style={getElementCSS(block.elementStyles, 'description')} dangerouslySetInnerHTML={{ __html: block.description }} />
            )}
          </div>
        )}

        <div className={`grid grid-cols-1 ${columnsClass} gap-8`}>
          {(block.services || []).map((service) => (
            <Card
              key={service.id}
              title={service.title}
              description={service.description}
              image={service.image}
              link={service.link}
              icon={service.icon}
              titleStyle={getElementCSS(block.elementStyles, 'serviceTitle')}
              descriptionStyle={getElementCSS(block.elementStyles, 'serviceDescription')}
              iconStyle={getElementCSS(block.elementStyles, 'serviceIcon')}
              linkStyle={getElementCSS(block.elementStyles, 'serviceLink')}
              imageStyle={getElementCSS(block.elementStyles, 'serviceImage')}
            />
          ))}
        </div>
    </section>
  );
}
