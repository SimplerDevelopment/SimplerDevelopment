'use client';

import { DividerBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface DividerBlockPreviewProps {
  block: DividerBlock;
  isSelected: boolean;
  onChange: (updates: Partial<DividerBlock>) => void;
}

export function DividerBlockPreview({ block, isSelected, onChange }: DividerBlockPreviewProps) {
  const styleClasses = {
    solid: 'border-solid',
    dashed: 'border-dashed',
    dotted: 'border-dotted',
  };

  const style = typeof block.style === 'object' ? block.style : {};

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

  return (
    <div className="px-6">
      <hr className={`my-8 ${style.borderColor ? '' : 'border-border'} ${styleClasses[block.lineStyle || 'solid']} ${responsiveClasses}`} />
    </div>
  );
}
