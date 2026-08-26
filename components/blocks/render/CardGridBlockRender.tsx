'use client';

import { CardGridBlock } from '@/types/blocks';
import { Card } from '@/components/ui/Card';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { ancestorStyle, useResolvedTypography } from './typography-cascade';

interface CardGridBlockRenderProps {
  block: CardGridBlock;
}

export function CardGridBlockRender({ block }: CardGridBlockRenderProps) {
  // VEQA-032 step 3b — block-level title/description keep their existing
  // own-value guard, now resolved against elementStyles + ancestor too. The
  // per-card title/subtitle/description (rendered inside the shared <Card>
  // component, components/ui/Card.tsx) have no own-value guard today — Card
  // hardcodes text-foreground/text-primary-80/text-muted-foreground
  // unconditionally — so there's no guard to replace there; we resolve once
  // per elementKey (cards share block.style/elementStyles — CardGridBlock has
  // no per-card title/description override, only `iconColor`, which is
  // chrome) and pass `ancestorStyle(resolved)` through the existing
  // titleStyle/subtitleStyle/descriptionStyle passthrough props. Card.tsx
  // itself is untouched — inline `style` already beats its fallback classes.
  const resolvedTitle = useResolvedTypography(block, 'title');
  const resolvedDescription = useResolvedTypography(block, 'description');
  const resolvedCardTitle = useResolvedTypography(block, 'cardTitle');
  const resolvedCardSubtitle = useResolvedTypography(block, 'cardSubtitle');
  const resolvedCardDescription = useResolvedTypography(block, 'cardDescription');

  const columnsClass = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
    4: 'md:grid-cols-2 lg:grid-cols-4',
    5: 'md:grid-cols-2 lg:grid-cols-5',
    6: 'md:grid-cols-2 lg:grid-cols-6',
    7: 'md:grid-cols-2 lg:grid-cols-7',
    8: 'md:grid-cols-2 lg:grid-cols-8',
    9: 'md:grid-cols-3 lg:grid-cols-9',
    10: 'md:grid-cols-3 lg:grid-cols-10',
    11: 'md:grid-cols-3 lg:grid-cols-11',
    12: 'md:grid-cols-3 lg:grid-cols-12',
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
            <h2 data-editable-field="title" className={`font-heading ${resolvedTitle.fontSize.value ? '' : 'text-4xl md:text-5xl'} ${resolvedTitle.fontWeight.value ? '' : 'font-bold'} mb-4`} style={{ ...ancestorStyle(resolvedTitle), ...getElementCSS(block.elementStyles, 'title') }} dangerouslySetInnerHTML={{ __html: block.title }} />
          )}
          {block.description && (
            <p data-editable-field="description" className={`${resolvedDescription.fontSize.value ? '' : 'text-xl'} text-muted-foreground max-w-2xl mx-auto`} style={{ ...ancestorStyle(resolvedDescription), ...getElementCSS(block.elementStyles, 'description') }} dangerouslySetInnerHTML={{ __html: block.description }} />
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
          // Per-card iconColor override wins over the shared cardIcon element style.
          const iconStyle = {
            ...getElementCSS(block.elementStyles, 'cardIcon'),
            ...(card.iconColor ? { color: card.iconColor } : {}),
          };
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
              titleStyle={{ ...ancestorStyle(resolvedCardTitle), ...getElementCSS(block.elementStyles, 'cardTitle') }}
              subtitleStyle={{ ...ancestorStyle(resolvedCardSubtitle), ...getElementCSS(block.elementStyles, 'cardSubtitle') }}
              descriptionStyle={{ ...ancestorStyle(resolvedCardDescription), ...getElementCSS(block.elementStyles, 'cardDescription') }}
              iconStyle={iconStyle}
              linkStyle={getElementCSS(block.elementStyles, 'cardLink')}
              imageStyle={getElementCSS(block.elementStyles, 'cardImage')}
            />
          );
        })}
      </div>
    </section>
  );
}
