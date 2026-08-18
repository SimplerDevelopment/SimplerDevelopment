'use client';

import { NavigationBlock } from '@/types/blocks';
import { NavigationBlockRender } from '@/components/blocks/render/NavigationBlockRender';

interface NavigationBlockPreviewProps {
  block: NavigationBlock;
  isSelected: boolean;
  onChange: (updates: Partial<NavigationBlock>) => void;
}

// Delegates straight to the production renderer (same approach as
// SiteFooterBlockPreview) — the block has no authored content of its own to
// mock up here. This legacy editor surface (VisualBlockEditor/Enhanced)
// doesn't thread a `siteId` through block previews (see ProductGridBlockPreview
// for the same gap on a commerce block), so the nav renders with an empty
// item list until the block is viewed somewhere siteId is known — the portal
// iframe editor and the live site both provide it.
export function NavigationBlockPreview({ block, isSelected }: NavigationBlockPreviewProps) {
  return (
    <div className="relative">
      <NavigationBlockRender block={block} />
      {isSelected && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full pt-1 text-center text-xs text-muted-foreground">
          Menu items are managed in this site&apos;s Navigation manager.
        </div>
      )}
    </div>
  );
}
