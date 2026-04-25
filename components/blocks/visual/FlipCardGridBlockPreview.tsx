'use client';

import { FlipCardGridBlock } from '@/types/blocks';
import { FlipCardGridBlockRender } from '@/components/blocks/render/FlipCardGridBlockRender';

interface FlipCardGridBlockPreviewProps {
  block: FlipCardGridBlock;
  isSelected: boolean;
  onChange: (updates: Partial<FlipCardGridBlock>) => void;
}

export function FlipCardGridBlockPreview({ block, isSelected }: FlipCardGridBlockPreviewProps) {
  if (!block.cards || block.cards.length === 0) {
    return (
      <div className="py-16 px-6 text-center border-2 border-dashed border-border rounded-lg">
        <div className="text-sm text-muted-foreground mb-2">Flip Card Grid</div>
        <div className="text-xs text-muted-foreground">
          {isSelected ? 'Add cards in the side panel to see them here.' : 'No cards yet — click to select and add cards.'}
        </div>
      </div>
    );
  }
  return <FlipCardGridBlockRender block={block} />;
}
