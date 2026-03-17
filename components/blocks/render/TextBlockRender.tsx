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

  const sizeClass = {
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

  const hasHtml = block.content.includes('<');

  return (
    <div className={responsiveClasses}>
      {hasHtml ? (
        <div
          className={`${alignmentClass} ${sizeClass} ${block.style?.color ? '' : 'text-foreground'} whitespace-pre-wrap`}
          dangerouslySetInnerHTML={{ __html: block.content }}
        />
      ) : (
        <p className={`${alignmentClass} ${sizeClass} ${block.style?.color ? '' : 'text-foreground'} whitespace-pre-wrap`}>
          {block.content}
        </p>
      )}
    </div>
  );
}
