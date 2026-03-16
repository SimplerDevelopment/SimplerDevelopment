'use client';

import { TextBlock } from '@/types/blocks';
import { ContentEditable } from './ContentEditable';
import { combineResponsiveClasses } from '@/lib/utils/responsive';

interface TextBlockPreviewProps {
  block: TextBlock;
  isSelected: boolean;
  onChange: (updates: Partial<TextBlock>) => void;
}

export function TextBlockPreview({ block, isSelected, onChange }: TextBlockPreviewProps) {
  const sizeClasses = {
    sm: 'text-sm',
    base: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
  };

  const alignmentClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

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
    <div className={`p-6 ${responsiveClasses}`}>
      <ContentEditable
        html={block.content}
        onChange={(content) => onChange({ content })}
        className={`prose dark:prose-invert max-w-none focus:outline-none ${
          sizeClasses[block.size || 'base']
        } ${alignmentClasses[block.alignment || 'left']}`}
        placeholder="Start writing..."
      />
    </div>
  );
}
