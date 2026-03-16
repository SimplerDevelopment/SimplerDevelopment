'use client';

import { SpacerBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface SpacerBlockRenderProps {
  block: SpacerBlock;
}

export function SpacerBlockRender({ block }: SpacerBlockRenderProps) {
  const heightClass = {
    sm: 'h-4',
    md: 'h-8',
    lg: 'h-16',
    xl: 'h-32',
  }[block.height];

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
        block.responsive.visibility
      )
    : '';

  return <div className={`${heightClass} ${responsiveClasses}`} />;
}
