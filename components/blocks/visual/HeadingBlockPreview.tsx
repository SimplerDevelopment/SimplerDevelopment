'use client';

import { HeadingBlock } from '@/types/blocks';
import { ContentEditable } from './ContentEditable';

interface HeadingBlockPreviewProps {
  block: HeadingBlock;
  isSelected: boolean;
  onChange: (updates: Partial<HeadingBlock>) => void;
}

export function HeadingBlockPreview({ block, isSelected, onChange }: HeadingBlockPreviewProps) {
  const levelTags = {
    1: 'h1',
    2: 'h2',
    3: 'h3',
    4: 'h4',
    5: 'h5',
    6: 'h6',
  };

  // Match typography classes from HeadingBlockRender for consistency
  const levelClasses = {
    1: 'text-4xl md:text-5xl font-bold',
    2: 'text-3xl md:text-4xl font-bold',
    3: 'text-2xl md:text-3xl font-semibold',
    4: 'text-xl md:text-2xl font-semibold',
    5: 'text-lg md:text-xl font-medium',
    6: 'text-base md:text-lg font-medium',
  };

  const alignmentClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  };

  return (
    <div className="p-6">
      <ContentEditable
        html={block.content}
        onChange={(content) => onChange({ content })}
        tagName={levelTags[block.level]}
        className={`focus:outline-none ${block.style?.color ? '' : 'text-foreground'} mb-4 ${
          levelClasses[block.level]
        } ${alignmentClasses[block.alignment || 'left']}`}
        placeholder="Write your heading..."
      />
    </div>
  );
}
