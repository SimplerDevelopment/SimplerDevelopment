'use client';

import { DividerBlock } from '@/types/blocks';

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

  return (
    <div className="px-6">
      <hr className={`my-8 border-border ${styleClasses[block.lineStyle || 'solid']}`} />
    </div>
  );
}
