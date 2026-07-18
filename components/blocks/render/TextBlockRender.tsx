'use client';

import { TextBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface TextBlockRenderProps {
  block: TextBlock;
}

export function TextBlockRender({ block }: TextBlockRenderProps) {
  const alignmentClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }[block.alignment || 'left'];

  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;

  const sizeClass = hasCustomFontSize
    ? 'leading-relaxed'
    : {
        sm: 'text-sm leading-relaxed',
        base: 'text-base md:text-lg leading-relaxed',
        lg: 'text-lg leading-relaxed',
        xl: 'text-xl leading-relaxed',
      }[block.size || 'base'];

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

  // Support two text-block shapes:
  //   (a) canonical: { content: string }
  //   (b) LLM-authored: { heading?: string, body?: string } — used by older
  //       MCP template output and other AI-generated decks.
  //       When `heading` is present we render it as a real <h2> above the
  //       body so it has semantic weight + the theme's heading font; flat
  //       concatenation loses visual hierarchy.
  const raw = (block as unknown as { content?: unknown; heading?: unknown; body?: unknown });
  const hasLegacyHeading = typeof raw.heading === 'string' && raw.heading.trim().length > 0;
  const bodyContent = (() => {
    if (typeof raw.content === 'string') return raw.content;
    if (typeof raw.body === 'string') return raw.body;
    return '';
  })();
  const bodyHasHtml = bodyContent.includes('<') || bodyContent.includes('&');
  const headingContent = hasLegacyHeading ? (raw.heading as string) : '';
  const headingHasHtml = headingContent.includes('<') || headingContent.includes('&');

  return (
    <div className={responsiveClasses}>
      {hasLegacyHeading && (
        headingHasHtml ? (
          <h2
            data-editable-field="heading"
            className={`${alignmentClass} text-3xl md:text-4xl font-bold ${block.style?.color ? '' : 'text-foreground'}`}
            dangerouslySetInnerHTML={{ __html: headingContent }}
          />
        ) : (
          <h2
            data-editable-field="heading"
            className={`${alignmentClass} text-3xl md:text-4xl font-bold ${block.style?.color ? '' : 'text-foreground'}`}
          >
            {headingContent}
          </h2>
        )
      )}
      {bodyContent && (bodyHasHtml ? (
        <div
          data-editable-field="content"
          className={`${alignmentClass} ${sizeClass} ${block.style?.color ? '' : 'text-foreground'} whitespace-pre-wrap`}
          dangerouslySetInnerHTML={{ __html: bodyContent }}
        />
      ) : (
        <p data-editable-field="content" className={`${alignmentClass} ${sizeClass} ${block.style?.color ? '' : 'text-foreground'} whitespace-pre-wrap`}>
          {bodyContent}
        </p>
      ))}
    </div>
  );
}
