'use client';

import { QuoteBlock } from '@/types/blocks';
import { ContentEditable } from './ContentEditable';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface QuoteBlockPreviewProps {
  block: QuoteBlock;
  isSelected: boolean;
  onChange: (updates: Partial<QuoteBlock>) => void;
}

export function QuoteBlockPreview({ block, isSelected, onChange }: QuoteBlockPreviewProps) {
  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;

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

  const quoteStyle = getElementCSS(block.elementStyles, 'quoteText');

  return (
    <div className={`py-8 my-8 px-6 ${responsiveClasses}`}>
      <blockquote className={`border-l-4 border-primary pl-6 italic ${hasCustomFontSize ? '' : 'text-lg md:text-xl'} ${block.style?.color ? '' : 'text-muted-foreground'}`}>
        <div className="mb-4 flex" style={quoteStyle}>
          <span aria-hidden="true">“</span>
          <ContentEditable
            html={block.content}
            onChange={(content) => onChange({ content })}
            className="focus:outline-none flex-1"
            placeholder="Enter your quote..."
          />
          <span aria-hidden="true">”</span>
        </div>
        {(block.author || block.citation) && (
          <footer className={`${hasCustomFontSize ? '' : 'text-base'} not-italic font-medium ${block.style?.color ? '' : 'text-foreground'}`}>
            {block.author && <cite className="not-italic" style={getElementCSS(block.elementStyles, 'author')}>— {block.author}</cite>}
            {block.citation && <span className="text-muted-foreground">, {block.citation}</span>}
          </footer>
        )}
      </blockquote>
    </div>
  );
}
