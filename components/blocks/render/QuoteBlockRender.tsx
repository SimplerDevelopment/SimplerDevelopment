'use client';

import { QuoteBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface QuoteBlockRenderProps {
  block: QuoteBlock;
}

export function QuoteBlockRender({ block }: QuoteBlockRenderProps) {
  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;

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
    <div className={`py-8 my-8 ${responsiveClasses}`}>
      <blockquote className={`border-l-4 border-primary pl-6 italic ${hasCustomFontSize ? '' : 'text-lg md:text-xl'} ${block.style?.color ? '' : 'text-muted-foreground'}`}>
        {block.content.includes('<')
          ? <div data-editable-field="content" className="mb-4" style={getElementCSS(block.elementStyles, 'quoteText')} dangerouslySetInnerHTML={{ __html: `\u201C${block.content}\u201D` }} />
          : <p data-editable-field="content" className="mb-4" style={getElementCSS(block.elementStyles, 'quoteText')}>&ldquo;{block.content}&rdquo;</p>
        }
        {(block.author || block.citation) && (
          <footer className={`${hasCustomFontSize ? '' : 'text-base'} not-italic font-medium ${block.style?.color ? '' : 'text-foreground'}`}>
            {block.author && <cite data-editable-field="author" className="not-italic" style={getElementCSS(block.elementStyles, 'author')}>— {block.author}</cite>}
            {block.citation && <span className="text-muted-foreground">, {block.citation}</span>}
          </footer>
        )}
      </blockquote>
    </div>
  );
}
