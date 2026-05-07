'use client';

import { FlipCardGridBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { useState } from 'react';
import { sanitizeRichHtml } from '@/lib/security/sanitize-html';

interface FlipCardGridBlockRenderProps {
  block: FlipCardGridBlock;
}

export function FlipCardGridBlockRender({ block }: FlipCardGridBlockRenderProps) {
  const flipTrigger = block.flipTrigger ?? 'hover';
  const flipAxis = block.flipAxis ?? 'horizontal';
  const cardHeight = block.cardHeight ?? '280px';
  const accentColor = block.accentColor ?? '#004D80';
  const columns = block.columns ?? 3;

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

  const [flippedId, setFlippedId] = useState<string | null>(null);

  const frontCardStyle = getElementCSS(block.elementStyles, 'frontCard');
  const backCardStyle = getElementCSS(block.elementStyles, 'backCard');
  const frontTitleStyle = getElementCSS(block.elementStyles, 'frontTitle');
  const frontIconStyle = getElementCSS(block.elementStyles, 'frontIcon');
  const backTextStyle = getElementCSS(block.elementStyles, 'backText');

  return (
    <section className={responsiveClasses}>
      {(block.overline || block.title || block.description) && (
        <div className="text-center mb-12 max-w-3xl mx-auto">
          {block.overline && (
            <p
              data-editable-field="overline"
              className="text-xs font-semibold tracking-[0.2em] uppercase mb-3"
              style={{ color: accentColor, ...getElementCSS(block.elementStyles, 'overline') }}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.overline) }}
            />
          )}
          {block.title && (
            <h2
              data-editable-field="title"
              className="font-heading text-3xl md:text-5xl font-bold mb-4"
              style={getElementCSS(block.elementStyles, 'title')}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.title) }}
            />
          )}
          {block.description && (
            <p
              data-editable-field="description"
              className="text-lg text-muted-foreground"
              style={getElementCSS(block.elementStyles, 'description')}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.description) }}
            />
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 ${columnsClass} gap-6`} style={{ perspective: '1500px' }}>
        {(block.cards || []).map((card) => {
          const isFlipped = flipTrigger === 'click' && flippedId === card.id;
          const rotateAxis = flipAxis === 'vertical' ? 'X' : 'Y';
          const rotateDeg = isFlipped ? 180 : 0;

          return (
            <div
              key={card.id}
              className={`group relative ${flipTrigger === 'click' ? 'cursor-pointer' : ''}`}
              style={{ height: cardHeight, perspective: '1500px' }}
              onClick={() => {
                if (flipTrigger === 'click') {
                  setFlippedId(flippedId === card.id ? null : card.id);
                }
              }}
              role={flipTrigger === 'click' ? 'button' : undefined}
              tabIndex={flipTrigger === 'click' ? 0 : undefined}
              onKeyDown={(e) => {
                if (flipTrigger === 'click' && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  setFlippedId(flippedId === card.id ? null : card.id);
                }
              }}
            >
              <div
                className={`relative w-full h-full transition-transform duration-700 ${flipTrigger === 'hover' ? (flipAxis === 'vertical' ? 'group-hover:[transform:rotateX(180deg)]' : 'group-hover:[transform:rotateY(180deg)]') : ''}`}
                style={{
                  transformStyle: 'preserve-3d',
                  transform: flipTrigger === 'click' ? `rotate${rotateAxis}(${rotateDeg}deg)` : undefined,
                }}
              >
                {/* Front face */}
                <div
                  className="absolute inset-0 rounded-xl border flex flex-col items-center justify-center p-8 text-center shadow-sm"
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E5E7EB',
                    ...frontCardStyle,
                  }}
                >
                  {card.frontImage ? (
                    <img
                      src={card.frontImage}
                      alt=""
                      className="w-20 h-20 object-contain mb-4"
                    />
                  ) : card.frontIcon ? (
                    <span
                      className="material-icons mb-4"
                      style={{
                        fontSize: '64px',
                        color: accentColor,
                        ...frontIconStyle,
                      }}
                    >
                      {card.frontIcon}
                    </span>
                  ) : null}
                  <h3
                    className="font-heading text-2xl font-bold mb-2"
                    style={frontTitleStyle}
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(card.frontTitle) }}
                  />
                  {card.frontSubtitle && (
                    <p
                      className="text-sm text-muted-foreground"
                      style={getElementCSS(block.elementStyles, 'frontSubtitle')}
                      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(card.frontSubtitle) }}
                    />
                  )}
                  {flipTrigger === 'click' && (
                    <span
                      className="material-icons absolute bottom-3 right-3 text-base opacity-40"
                      aria-hidden
                    >
                      flip_to_back
                    </span>
                  )}
                </div>

                {/* Back face */}
                <div
                  className="absolute inset-0 rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-lg"
                  style={{
                    backfaceVisibility: 'hidden',
                    WebkitBackfaceVisibility: 'hidden',
                    transform: flipAxis === 'vertical' ? 'rotateX(180deg)' : 'rotateY(180deg)',
                    backgroundColor: accentColor,
                    color: '#FFFFFF',
                    ...backCardStyle,
                  }}
                >
                  <p
                    className="text-base leading-relaxed mb-4"
                    style={backTextStyle}
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(card.backText) }}
                  />
                  {card.backLink && (
                    <a
                      href={card.backLink}
                      className="inline-flex items-center gap-2 font-semibold text-sm tracking-wider uppercase border-b border-current pb-0.5 hover:opacity-80 transition-opacity"
                      style={getElementCSS(block.elementStyles, 'backLink')}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {card.backLinkText || 'Learn More'}
                      <span className="material-icons" style={{ fontSize: '16px' }}>
                        arrow_forward
                      </span>
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
