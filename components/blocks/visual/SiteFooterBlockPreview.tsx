'use client';

import { SiteFooterBlock } from '@/types/blocks';
import { SiteFooterBlockRender } from '@/components/blocks/render/SiteFooterBlockRender';

interface SiteFooterBlockPreviewProps {
  block: SiteFooterBlock;
  isSelected: boolean;
  onChange: (updates: Partial<SiteFooterBlock>) => void;
}

export function SiteFooterBlockPreview({ block, isSelected }: SiteFooterBlockPreviewProps) {
  if (!block.linkGroups || block.linkGroups.length === 0) {
    return (
      <div className="py-12 px-6 text-center border-2 border-dashed border-border rounded-lg">
        <div className="text-sm text-muted-foreground mb-2">Site Footer</div>
        <div className="text-xs text-muted-foreground">
          {isSelected ? 'Add link groups in the side panel.' : 'No link groups yet — click to select and configure.'}
        </div>
      </div>
    );
  }
  return <SiteFooterBlockRender block={block} />;
}
