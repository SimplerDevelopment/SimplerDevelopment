'use client';

import { SpacerBlock } from '@/types/blocks';

interface SpacerBlockPreviewProps {
  block: SpacerBlock;
  isSelected: boolean;
  onChange: (updates: Partial<SpacerBlock>) => void;
}

export function SpacerBlockPreview({ block, isSelected, onChange }: SpacerBlockPreviewProps) {
  const heightClasses = {
    sm: 'h-8',
    md: 'h-16',
    lg: 'h-24',
    xl: 'h-32',
  };

  return (
    <div className="p-6">
      <div className={`${heightClasses[block.height]} bg-muted/20 border-2 border-dashed border-border rounded flex items-center justify-center`}>
        <span className="text-xs text-muted-foreground">
          Spacer ({block.height.toUpperCase()})
        </span>
      </div>
    </div>
  );
}
