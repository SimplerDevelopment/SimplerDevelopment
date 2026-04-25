'use client';

import { BentoGridBlock } from '@/types/blocks';
import { BentoGridBlockRender } from '@/components/blocks/render/BentoGridBlockRender';

interface BentoGridBlockPreviewProps {
  block: BentoGridBlock;
  isSelected: boolean;
  onChange: (updates: Partial<BentoGridBlock>) => void;
}

export function BentoGridBlockPreview({ block, isSelected }: BentoGridBlockPreviewProps) {
  if (!block.cards || block.cards.length === 0) {
    return (
      <div className="py-16 px-6 text-center border-2 border-dashed border-border rounded-lg">
        <div className="text-sm text-muted-foreground mb-2">Bento Grid</div>
        <div className="text-xs text-muted-foreground">
          {isSelected ? 'Add cards in the side panel.' : 'No cards yet — click to select and add cards.'}
        </div>
      </div>
    );
  }
  return <BentoGridBlockRender block={block} />;
}
