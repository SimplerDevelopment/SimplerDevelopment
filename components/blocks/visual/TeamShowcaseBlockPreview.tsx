'use client';

import { TeamShowcaseBlock } from '@/types/blocks';
import { TeamShowcaseBlockRender } from '@/components/blocks/render/TeamShowcaseBlockRender';

interface TeamShowcaseBlockPreviewProps {
  block: TeamShowcaseBlock;
  isSelected: boolean;
  onChange: (updates: Partial<TeamShowcaseBlock>) => void;
}

export function TeamShowcaseBlockPreview({ block, isSelected }: TeamShowcaseBlockPreviewProps) {
  if (!block.members || block.members.length === 0) {
    return (
      <div className="py-16 px-6 text-center border-2 border-dashed border-border rounded-lg">
        <div className="text-sm text-muted-foreground mb-2">Team Showcase</div>
        <div className="text-xs text-muted-foreground">
          {isSelected ? 'Add team members in the side panel.' : 'No members yet — click to select and add members.'}
        </div>
      </div>
    );
  }
  return <TeamShowcaseBlockRender block={block} />;
}
