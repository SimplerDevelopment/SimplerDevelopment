'use client';

import { MetricCardsBlock } from '@/types/blocks';
import { MetricCardsBlockRender } from '@/components/blocks/render/MetricCardsBlockRender';

interface MetricCardsBlockPreviewProps {
  block: MetricCardsBlock;
  isSelected: boolean;
  onChange: (updates: Partial<MetricCardsBlock>) => void;
}

export function MetricCardsBlockPreview({ block, isSelected }: MetricCardsBlockPreviewProps) {
  if (!block.metrics || block.metrics.length === 0) {
    return (
      <div className="py-16 px-6 text-center border-2 border-dashed border-border rounded-lg">
        <div className="text-sm text-muted-foreground mb-2">Metric Cards</div>
        <div className="text-xs text-muted-foreground">
          {isSelected ? 'Add metrics in the side panel.' : 'No metrics yet — click to select and add metrics.'}
        </div>
      </div>
    );
  }
  return <MetricCardsBlockRender block={block} />;
}
