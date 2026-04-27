'use client';

import { CardGridBlock } from '@/types/blocks';
import { Card } from '@/components/ui/Card';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface CardGridBlockRenderProps {
  block: CardGridBlock;
}

export function CardGridBlockRender({ block }: CardGridBlockRenderProps) {
  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;
  const hasCustomFontWeight = !!style.fontWeight;

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
        block.responsive.visibility,
        block.responsive.fontSize
      )
    : '';

  return (
    <section className={responsiveClasses}>
      {(block.title || block.description) && (
        <div className="text-center mb-12">
          {block.title && (
            <h2 data-editable-field="title" className={`font-heading ${hasCustomFontSize ? '' : 'text-4xl md:text-5xl'} ${hasCustomFontWeight ? '' : 'font-bold'} mb-4`} style={getElementCSS(block.elementStyles, 'title')} dangerouslySetInnerHTML={{ __html: block.title }} />
          )}
          {block.description && (
            <p data-editable-field="description" className={`${hasCustomFontSize ? '' : 'text-xl'} text-muted-foreground max-w-2xl mx-auto`} style={getElementCSS(block.elementStyles, 'description')} dangerouslySetInnerHTML={{ __html: block.description }} />
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 ${columnsClass} gap-8`}>
        {(block.cards || []).map((rawCard, i) => {
          // Alias support for LLM-authored decks that use `body` instead of
          // `description` and an optional `subtitle` between title and body.
          // Canonical fields always win when present.
          const card = rawCard as typeof rawCard & { body?: string; subtitle?: string };
          const description = card.description ?? card.body ?? '';
          const key = card.id ?? `card-${i}`;
          return (
            <Card
              key={key}
              title={card.title}
              subtitle={card.subtitle}
              description={description}
              image={card.image}
              link={card.link}
              icon={card.icon}
              iconSize={block.iconSize}
              cardStyle={getElementCSS(block.elementStyles, 'card')}
              titleStyle={getElementCSS(block.elementStyles, 'cardTitle')}
              subtitleStyle={getElementCSS(block.elementStyles, 'cardSubtitle')}
              descriptionStyle={getElementCSS(block.elementStyles, 'cardDescription')}
              iconStyle={getElementCSS(block.elementStyles, 'cardIcon')}
              linkStyle={getElementCSS(block.elementStyles, 'cardLink')}
              imageStyle={getElementCSS(block.elementStyles, 'cardImage')}
            />
          );
        })}
      </div>
    </section>
  );
}
