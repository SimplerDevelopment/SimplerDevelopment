'use client';

import { TeamFlipGridBlock } from '@/types/blocks';
import { TeamFlipGridBlockRender } from '@/components/blocks/render/TeamFlipGridBlockRender';

interface TeamFlipGridBlockPreviewProps {
  block: TeamFlipGridBlock;
  isSelected: boolean;
  onChange: (updates: Partial<TeamFlipGridBlock>) => void;
}

export function TeamFlipGridBlockPreview({ block, isSelected }: TeamFlipGridBlockPreviewProps) {
  if (!block.members || block.members.length === 0) {
    return (
      <div className="py-16 px-6 text-center border-2 border-dashed border-border rounded-lg">
        <div className="text-sm text-muted-foreground mb-2">Team Flip Grid</div>
        <div className="text-xs text-muted-foreground">
          {isSelected ? 'Add team members in the side panel.' : 'No members yet — click to select and add members.'}
        </div>
      </div>
    );
  }
  return <TeamFlipGridBlockRender block={block} />;
}
