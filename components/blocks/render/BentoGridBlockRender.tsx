'use client';

import { BentoGridBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface BentoGridBlockRenderProps {
  block: BentoGridBlock;
}

export function BentoGridBlockRender({ block }: BentoGridBlockRenderProps) {
  const darkBg = block.darkBg || '#0a1628';
  const lightBorder = block.lightBorder || '#e8f0fe';
  const accentColor = block.accentColor || '#cfa122';
  const cards = block.cards || [];
  const cols = block.columns || 2;

  // Group cards into rows based on columns setting
  const rows: typeof cards[] = [];
  for (let i = 0; i < cards.length; i += cols) {
    rows.push(cards.slice(i, i + cols));
  }

  return (
    <div className="py-16">
      {/* Header */}
      {(block.overline || block.title || block.subtitle) && (
        <div className="mb-16 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div>
            {block.overline && (
              <>
                <div className="w-10 h-[2px] mb-6" style={{ background: `linear-gradient(to right, ${accentColor}, ${accentColor}cc)` }} />
                <p
                  className="text-sm tracking-[0.3em] uppercase mb-4"
                  style={getElementCSS(block.elementStyles, 'overline')}
                  dangerouslySetInnerHTML={{ __html: block.overline }}
                />
              </>
            )}
            {block.title && (
              <h2
                data-editable-field="title"
                className="text-4xl md:text-5xl lg:text-6xl font-light leading-tight"
                style={getElementCSS(block.elementStyles, 'title')}
                dangerouslySetInnerHTML={{ __html: block.title }}
              />
            )}
          </div>
          {block.subtitle && (
            <p
              className="max-w-md leading-relaxed text-[15px] lg:pb-2"
              style={getElementCSS(block.elementStyles, 'subtitle')}
              dangerouslySetInnerHTML={{ __html: block.subtitle }}
            />
          )}
        </div>
      )}

      {/* Bento rows */}
      <div className="space-y-5">
        {rows.map((row, rowIdx) => (
          <div
            key={rowIdx}
            className="grid grid-cols-1 md:grid-cols-12 gap-5"
          >
            {row.map((card) => {
              const isDark = card.variant === 'dark';
              const span = card.span || 6;
              const colSpan = `md:col-span-${span}`;

              return (
                <a
                  key={card.id}
                  href={card.link || '#'}
                  className={`group relative block overflow-hidden rounded-sm transition-all duration-500 ${colSpan} ${
                    isDark
                      ? 'hover:shadow-2xl hover:shadow-black/20'
                      : 'hover:shadow-xl hover:shadow-black/5'
                  }`}
                  style={{
                    gridColumn: `span ${span} / span ${span}`,
                    backgroundColor: isDark ? darkBg : '#ffffff',
                    ...(isDark ? {} : { border: `1px solid ${lightBorder}` }),
                  }}
                >
                  {/* Left accent bar */}
                  <div
                    className={`absolute left-0 top-0 bottom-0 w-[3px] transition-all duration-500 ${
                      isDark
                        ? 'opacity-30 group-hover:opacity-100'
                        : 'opacity-0 group-hover:opacity-60'
                    }`}
                    style={{ backgroundColor: accentColor }}
                  />

                  <div className="relative z-10 p-8 lg:p-10 flex flex-col h-full min-h-[340px] lg:min-h-[380px]">
                    {/* Title + lead */}
                    <div className="mb-auto">
                      <h3
                        className={`text-2xl lg:text-3xl mb-3 transition-colors duration-300 ${
                          isDark
                            ? 'group-hover:opacity-90'
                            : 'group-hover:opacity-80'
                        }`}
                        style={{
                          fontFamily: 'inherit',
                          color: isDark ? '#ffffff' : darkBg,
                          ...getElementCSS(block.elementStyles, 'cardTitle'),
                          ...getElementCSS(block.elementStyles, isDark ? 'cardTitleDark' : 'cardTitleLight'),
                        }}
                      >
                        {card.title}
                      </h3>

                      {card.lead && (
                        <p
                          className="text-[15px] italic leading-relaxed max-w-sm"
                          style={{
                            color: isDark ? 'rgba(255,255,255,0.6)' : '#64748b',
                            ...getElementCSS(block.elementStyles, 'cardLead'),
                            ...getElementCSS(block.elementStyles, isDark ? 'cardLeadDark' : 'cardLeadLight'),
                          }}
                        >
                          &ldquo;{card.lead}&rdquo;
                        </p>
                      )}
                    </div>

                    {/* Items as two-column dot list */}
                    <div className="mt-8">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 mb-8">
                        {(card.items || []).map((item, idx) => (
                          <div key={idx} className="flex items-start gap-2.5">
                            <div
                              className="w-1.5 h-1.5 rounded-full mt-[7px] shrink-0"
                              style={{ backgroundColor: isDark ? `${accentColor}80` : `${accentColor}66` }}
                            />
                            <span
                              className="text-sm leading-snug"
                              style={{
                                color: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(30,41,59,0.7)',
                              }}
                            >
                              {item}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Link text */}
                      {card.linkText && (
                        <div
                          className="flex items-center gap-2 text-sm transition-all duration-300 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
                          style={{ color: isDark ? accentColor : `${accentColor}dd` }}
                        >
                          <span className="tracking-wide">{card.linkText}</span>
                          <svg className="w-4 h-4 group-hover:translate-x-1.5 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 8.25L21 12m0 0l-3.75 3.75M21 12H3" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
