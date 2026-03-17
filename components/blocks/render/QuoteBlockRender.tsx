'use client';

import { QuoteBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface QuoteBlockRenderProps {
  block: QuoteBlock;
}

export function QuoteBlockRender({ block }: QuoteBlockRenderProps) {
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
      <blockquote className={`border-l-4 border-primary pl-6 italic text-lg md:text-xl ${block.style?.color ? '' : 'text-muted-foreground'}`}>
        <p className="mb-4">&ldquo;{block.content}&rdquo;</p>
        {(block.author || block.citation) && (
          <footer className={`text-base not-italic font-medium ${block.style?.color ? '' : 'text-foreground'}`}>
            {block.author && <cite className="not-italic">— {block.author}</cite>}
            {block.citation && <span className="text-muted-foreground">, {block.citation}</span>}
          </footer>
        )}
      </blockquote>
    </div>
  );
}
