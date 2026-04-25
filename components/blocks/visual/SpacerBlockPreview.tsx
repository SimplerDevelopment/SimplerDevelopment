'use client';

import { SpacerBlock } from '@/types/blocks';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface SpacerBlockPreviewProps {
  block: SpacerBlock;
  isSelected: boolean;
  onChange: (updates: Partial<SpacerBlock>) => void;
}

export function SpacerBlockPreview({ block, isSelected, onChange }: SpacerBlockPreviewProps) {
  // Match production renderer's height map exactly
  const heightClasses = {
    sm: 'h-4',
    md: 'h-8',
    lg: 'h-16',
    xl: 'h-32',
  };

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
    <div className={`p-6 ${responsiveClasses}`}>
      <div className={`${heightClasses[block.height]} bg-muted/20 border-2 border-dashed border-border rounded flex items-center justify-center`}>
        <span className="text-xs text-muted-foreground">
          Spacer ({block.height.toUpperCase()})
        </span>
      </div>
    </div>
  );
}
