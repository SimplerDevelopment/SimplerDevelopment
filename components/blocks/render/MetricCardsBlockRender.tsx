'use client';

import { MetricCardsBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { Icon } from '@/components/ui/Icon';
import { sanitizeRichHtml } from '@/lib/security/sanitize-html';
import { ancestorStyle, useResolvedTypography } from './typography-cascade';

interface MetricCardsBlockRenderProps {
  block: MetricCardsBlock;
}

export function MetricCardsBlockRender({ block }: MetricCardsBlockRenderProps) {
  const columns = block.columns ?? 4;
  const resolvedOverline = useResolvedTypography(block, 'overline');
  const resolvedTitle = useResolvedTypography(block, 'title');
  const resolvedDescription = useResolvedTypography(block, 'description');
  const resolvedValue = useResolvedTypography(block, 'value');
  const resolvedLabel = useResolvedTypography(block, 'label');
  // `accentColor` is block.accentColor's bare fallback chain (own > theme
  // default). It feeds BOTH a content slot (the metric value's default
  // color) and chrome (the "Case Study" CTA link/arrow) today, so it stays
  // ancestor-UNAWARE here — cascading ancestor typography into the link
  // chrome would be an over-application the spec explicitly excludes
  // (buttons/CTAs are chrome). Ancestor color is instead folded in
  // separately, per CONTENT slot, below (VEQA-032 step 3b).
  const accentColor = block.accentColor ?? '#004D80';
  // Overline is `data-editable-field` user content (not a decorative pill),
  // so — like the metric value — its accentColor-driven color also gets the
  // ancestor cascade slotted beneath block.accentColor and above the theme
  // default: item(n/a, block-level only) > block(block.accentColor) >
  // ancestor > '#004D80'.
  const ancestorOverlineColor = resolvedOverline.color.source === 'ancestor' ? resolvedOverline.color.value : undefined;
  const overlineColor = block.accentColor ?? ancestorOverlineColor ?? '#004D80';
  // Same fold-in for the metric value's color, consumed per-metric below
  // alongside `metric.accentColor` (the item tier) — see `valueColor`.
  const ancestorValueColor = resolvedValue.color.source === 'ancestor' ? resolvedValue.color.value : undefined;

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

  // Optional widths for cards that pair a side-pinned logo with constrained
  // label width. Both are CSS-unit strings. Exposed as CSS variables so
  // post-level customCss can also reference them (`var(--mc-logo-col-width)`).
  const sectionVars: React.CSSProperties = {};
  if (block.logoColumnWidth) {
    (sectionVars as Record<string, string>)['--mc-logo-col-width'] = block.logoColumnWidth;
  }
  if (block.labelMaxWidth) {
    (sectionVars as Record<string, string>)['--mc-label-max-width'] = block.labelMaxWidth;
  }
  // Heading column (value + label) gets its right padding reserved when a
  // logoColumnWidth is set. Preserves legacy spacing when unset.
  const headingColPadStyle: React.CSSProperties = block.logoColumnWidth
    ? { paddingRight: block.logoColumnWidth }
    : {};
  const labelMaxWidthStyle: React.CSSProperties = block.labelMaxWidth
    ? { maxWidth: block.labelMaxWidth }
    : {};

  return (
    <section className={responsiveClasses} style={sectionVars}>
      {(block.overline || block.title || block.description) && (
        <div className="text-center mb-12 max-w-3xl mx-auto">
          {block.overline && (
            <p
              data-editable-field="overline"
              className="text-xs font-semibold tracking-[0.2em] uppercase mb-3"
              style={{ ...ancestorStyle(resolvedOverline), color: overlineColor, ...getElementCSS(block.elementStyles, 'overline') }}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.overline) }}
            />
          )}
          {block.title && (
            <h2
              data-editable-field="title"
              className="font-heading text-3xl md:text-5xl font-bold mb-4"
              style={{ ...ancestorStyle(resolvedTitle), ...getElementCSS(block.elementStyles, 'title') }}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.title) }}
            />
          )}
          {block.description && (
            <p
              data-editable-field="description"
              className="text-lg text-muted-foreground"
              style={{ ...ancestorStyle(resolvedDescription), ...getElementCSS(block.elementStyles, 'description') }}
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.description) }}
            />
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 ${columnsClass} gap-6`}>
        {(block.metrics || []).map((metric) => {
          // `chromeAccent` feeds only the CTA link/arrow below (chrome — no
          // ancestor). `valueColor` feeds only the metric value (content) and
          // folds ancestor in at the same item > block > ancestor > theme
          // position as everywhere else.
          const chromeAccent = metric.accentColor ?? accentColor;
          const valueColor = metric.accentColor ?? block.accentColor ?? ancestorValueColor ?? '#004D80';
          const cardContent = (
            <div
              className="h-full flex flex-col justify-between rounded-xl border bg-white p-7 transition-all hover:shadow-md hover:-translate-y-0.5"
              style={{ borderColor: '#E5E7EB', ...cardStyle }}
            >
              <div style={headingColPadStyle}>
                <div
                  className="font-heading font-bold leading-none tracking-tight mb-3"
                  style={{
                    fontSize: 'clamp(2.5rem, 4vw, 3.5rem)',
                    // Ancestor fontSize/fontWeight/etc. override the fallback
                    // clamp() above; `color` (below) always wins over
                    // whatever color this spread carries — it already
                    // encodes the full item/block/ancestor/theme precedence.
                    ...ancestorStyle(resolvedValue),
                    color: valueColor,
                    ...valueStyle,
                  }}
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(metric.value) }}
                />
                <div
                  className="text-[11px] font-semibold tracking-[0.15em] uppercase text-gray-600 leading-snug"
                  style={{ ...labelMaxWidthStyle, ...ancestorStyle(resolvedLabel), ...labelStyle }}
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(metric.label) }}
                />
              </div>

              {(metric.institution || metric.institutionLogo) && (
                <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-3" style={institutionStyle}>
                  {metric.institutionLogo && (
                    <img decoding="async" loading="lazy"
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
                    style={{ color: chromeAccent, ...linkStyle }}
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
