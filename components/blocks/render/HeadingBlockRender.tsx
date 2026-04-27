'use client';

import React from 'react';
import { HeadingBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface HeadingBlockRenderProps {
  block: HeadingBlock;
}

export function HeadingBlockRender({ block }: HeadingBlockRenderProps) {
  const alignmentClass = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }[block.alignment || 'left'];

  const style = typeof block.style === 'object' ? block.style : {};
  const hasCustomFontSize = !!style.fontSize;
  const hasCustomFontWeight = !!style.fontWeight;

  const sizeClasses = {
    1: 'text-4xl md:text-5xl',
    2: 'text-3xl md:text-4xl',
    3: 'text-2xl md:text-3xl',
    4: 'text-xl md:text-2xl',
    5: 'text-lg md:text-xl',
    6: 'text-base md:text-lg',
  }[block.level];

  const weightClasses = {
    1: 'font-extrabold',
    2: 'font-extrabold',
    3: 'font-bold',
    4: 'font-bold',
    5: 'font-semibold',
    6: 'font-semibold',
  }[block.level];

  const headingClasses = `${hasCustomFontSize ? '' : sizeClasses} ${hasCustomFontWeight ? '' : weightClasses}`.trim();

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

  const className = `${alignmentClass} ${headingClasses} ${block.style?.color ? '' : 'text-foreground'}`;
  const tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

  const hasHtml = block.content.includes('<');

  return (
    <div className={responsiveClasses}>
      {hasHtml
        ? React.createElement(tag, { className, 'data-editable-field': 'content', dangerouslySetInnerHTML: { __html: block.content } })
        : React.createElement(tag, { className, 'data-editable-field': 'content' }, block.content)
      }
    </div>
  );
}
