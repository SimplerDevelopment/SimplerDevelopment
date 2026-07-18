'use client';

import { TimelineBlock } from '@/types/blocks';
import { TimelineBlockRender } from '@/components/blocks/render/TimelineBlockRender';

interface TimelineBlockPreviewProps {
  block: TimelineBlock;
  isSelected: boolean;
  onChange: (updates: Partial<TimelineBlock>) => void;
}

export function TimelineBlockPreview({ block, isSelected }: TimelineBlockPreviewProps) {
  if (!block.steps || block.steps.length === 0) {
    return (
      <div className="py-16 px-6 text-center border-2 border-dashed border-border rounded-lg">
        <div className="text-sm text-muted-foreground mb-2">Timeline</div>
        <div className="text-xs text-muted-foreground">
          {isSelected ? 'Add steps in the side panel.' : 'No steps yet — click to select and add steps.'}
        </div>
      </div>
    );
  }
  return <TimelineBlockRender block={block} />;
}
