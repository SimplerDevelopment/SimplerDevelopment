'use client';

import { QuoteBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { ancestorStyle, useResolvedTypography } from './typography-cascade';

interface QuoteBlockRenderProps {
  block: QuoteBlock;
}

export function QuoteBlockRender({ block }: QuoteBlockRenderProps) {
  // VEQA-032 step 3a — the blockquote/footer guards below have always gated
  // on the block's OWN style (not a specific elementStyles slot — those are
  // applied separately per-node via getElementCSS below), so resolve without
  // an elementKey and keep that same block-level scope; a section/column
  // ancestor value now also suppresses the fallback. No own/ancestor value →
  // resolved.*.value is undefined and behavior is unchanged.
  const resolved = useResolvedTypography(block);
  const inlineStyle = ancestorStyle(resolved);

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
      <blockquote className={`border-l-4 border-primary pl-6 italic ${resolved.fontSize.value ? '' : 'text-lg md:text-xl'} ${resolved.color.value ? '' : 'text-muted-foreground'}`} style={inlineStyle}>
        {block.content.includes('<')
          ? <div data-editable-field="content" className="mb-4" style={getElementCSS(block.elementStyles, 'quoteText')} dangerouslySetInnerHTML={{ __html: `\u201C${block.content}\u201D` }} />
          : <p data-editable-field="content" className="mb-4" style={getElementCSS(block.elementStyles, 'quoteText')}>&ldquo;{block.content}&rdquo;</p>
        }
        {(block.author || block.citation) && (
          <footer className={`${resolved.fontSize.value ? '' : 'text-base'} not-italic font-medium ${resolved.color.value ? '' : 'text-foreground'}`} style={inlineStyle}>
            {block.author && (
              block.author.includes('<')
                ? <cite data-editable-field="author" className="not-italic" style={getElementCSS(block.elementStyles, 'author')} dangerouslySetInnerHTML={{ __html: `— ${block.author}` }} />
                : <cite data-editable-field="author" className="not-italic" style={getElementCSS(block.elementStyles, 'author')}>— {block.author}</cite>
            )}
            {block.citation && (
              block.citation.includes('<')
                ? <span data-editable-field="citation" className="text-muted-foreground" style={getElementCSS(block.elementStyles, 'citation')} dangerouslySetInnerHTML={{ __html: `, ${block.citation}` }} />
                : <span data-editable-field="citation" className="text-muted-foreground" style={getElementCSS(block.elementStyles, 'citation')}>, {block.citation}</span>
            )}
          </footer>
        )}
      </blockquote>
    </div>
  );
}
