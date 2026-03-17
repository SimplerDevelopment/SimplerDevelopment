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

  const headingClasses = {
    1: 'text-4xl md:text-5xl font-extrabold',
    2: 'text-3xl md:text-4xl font-extrabold',
    3: 'text-2xl md:text-3xl font-bold',
    4: 'text-xl md:text-2xl font-bold',
    5: 'text-lg md:text-xl font-semibold',
    6: 'text-base md:text-lg font-semibold',
  }[block.level];

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

  const className = `${alignmentClass} ${headingClasses} ${block.style?.color ? '' : 'text-foreground'} mt-10 mb-4 first:mt-0`;
  const tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

  return (
    <div className={responsiveClasses}>
      {React.createElement(tag, { className }, block.content)}
    </div>
  );
}
