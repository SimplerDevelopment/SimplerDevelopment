'use client';

import { CardGridBlock } from '@/types/blocks';
import { Card } from '@/components/ui/Card';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface CardGridBlockRenderProps {
  block: CardGridBlock;
}

export function CardGridBlockRender({ block }: CardGridBlockRenderProps) {
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
    <section className={`py-16 my-8 ${responsiveClasses}`}>
      <div className="container mx-auto px-4">
        {(block.title || block.description) && (
          <div className="text-center mb-12">
            {block.title && (
              <h2 className="font-heading text-4xl md:text-5xl font-bold mb-4">
                {block.title}
              </h2>
            )}
            {block.description && (
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                {block.description}
              </p>
            )}
          </div>
        )}

        <div className={`grid grid-cols-1 ${columnsClass} gap-8`}>
          {block.cards.map((card) => (
            <Card
              key={card.id}
              title={card.title}
              description={card.description}
              image={card.image}
              link={card.link}
              icon={card.icon}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
