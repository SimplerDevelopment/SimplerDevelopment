'use client';

import { LogoStripBlock } from '@/types/blocks';
import { LogoStripBlockRender } from '@/components/blocks/render/LogoStripBlockRender';

interface LogoStripBlockPreviewProps {
  block: LogoStripBlock;
  isSelected: boolean;
  onChange: (updates: Partial<LogoStripBlock>) => void;
}

export function LogoStripBlockPreview({ block, isSelected }: LogoStripBlockPreviewProps) {
  if (!block.logos || block.logos.length === 0) {
    return (
      <div className="py-12 px-6 text-center border-2 border-dashed border-border rounded-lg">
        <div className="text-sm text-muted-foreground mb-2">Logo Strip</div>
        <div className="text-xs text-muted-foreground">
          {isSelected ? 'Add logos in the side panel.' : 'No logos yet — click to select and add logos.'}
        </div>
      </div>
    );
  }
  return <LogoStripBlockRender block={block} />;
}
