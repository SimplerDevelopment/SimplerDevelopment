'use client';

import { TimelineBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { sanitizeRichHtml } from '@/lib/security/sanitize-html';

interface TimelineBlockRenderProps {
  block: TimelineBlock;
}

export function TimelineBlockRender({ block }: TimelineBlockRenderProps) {
  const lineColor = block.lineColor || 'rgba(207,161,34,0.3)';
  const numberColor = block.numberColor || 'rgba(207,161,34,0.12)';
  const nodeColor = block.nodeColor || 'transparent';
  const layout = block.layout || 'alternating';

  return (
    <div>
      {/* Header */}
      {(block.overline || block.title || block.subtitle) && (
        <div className="text-center mb-16">
          {block.overline && (
            <p
              className="text-sm tracking-[0.3em] uppercase mb-4"
              style={getElementCSS(block.elementStyles, 'overline')}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.overline) }}
            />
          )}
          {block.title && (
            <h2
              data-editable-field="title"
              className="text-4xl md:text-5xl font-light mb-4"
              style={getElementCSS(block.elementStyles, 'title')}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.title) }}
            />
          )}
          {block.subtitle && (
            <p
              className="max-w-2xl mx-auto"
              style={getElementCSS(block.elementStyles, 'subtitle')}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.subtitle) }}
            />
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="relative max-w-5xl mx-auto">
        {/* Vertical connecting line */}
        <div
          className="absolute left-6 lg:left-1/2 top-0 bottom-0 w-[2px] -translate-x-1/2"
          style={{
            background: `linear-gradient(to bottom, transparent, ${lineColor}, transparent)`,
          }}
        />

        <div className="space-y-0">
          {(block.steps || []).map((rawStep, i) => {
            // Alias support — LLM-authored decks often emit { label, body }
            // instead of { title, description } and omit ids. Canonical
            // fields win; fall back to aliases and backfill a stable key.
            const step = rawStep as typeof rawStep & { label?: string; body?: string };
            const stepTitle = step.title ?? step.label ?? '';
            const stepDescription = step.description ?? step.body ?? '';
            const stepKey = step.id ?? `step-${i}`;
            const isRight = layout === 'alternating' ? i % 2 === 1 : false;
            const num = step.number || String(i + 1).padStart(2, '0');

            return (
              <div key={stepKey} className="relative py-12 lg:py-16">
                {/* Large ghost number */}
                <div
                  className={`hidden lg:block absolute top-6 font-serif text-7xl lg:text-8xl leading-none select-none ${
                    isRight ? 'left-[calc(50%+2rem)]' : 'right-[calc(50%+2rem)]'
                  }`}
                  style={{ color: numberColor, fontFamily: 'inherit' }}
                >
                  {num}
                </div>

                {/* Mobile number */}
                <div
                  className="lg:hidden absolute left-0 top-10 font-serif text-6xl leading-none select-none"
                  style={{ color: numberColor }}
                >
                  {num}
                </div>

                {/* Timeline node */}
                <div
                  className="absolute left-6 lg:left-1/2 top-[3.5rem] w-3 h-3 -translate-x-1/2 rounded-full z-10"
                  style={{
                    backgroundColor: nodeColor,
                    border: `2px solid ${lineColor}`,
                  }}
                />

                {/* Content */}
                <div
                  className={`ml-16 lg:ml-0 lg:w-[42%] ${
                    isRight
                      ? 'lg:ml-auto lg:pl-16'
                      : 'lg:mr-auto lg:pr-16 lg:text-right'
                  }`}
                >
                  <h3
                    className="text-2xl mb-3"
                    style={getElementCSS(block.elementStyles, 'stepTitle')}
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(stepTitle) }}
                  />
                  <p
                    className="text-sm leading-relaxed"
                    style={getElementCSS(block.elementStyles, 'stepDescription')}
                    dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(stepDescription) }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
