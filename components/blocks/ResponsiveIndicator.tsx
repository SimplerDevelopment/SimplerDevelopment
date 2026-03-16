'use client';

import { Block } from '@/types/blocks';

interface ResponsiveIndicatorProps {
  block: Block;
}

export function ResponsiveIndicator({ block }: ResponsiveIndicatorProps) {
  // Check if block has any responsive settings configured
  const hasResponsiveSettings = block.responsive && (
    block.responsive.paddingTop ||
    block.responsive.paddingBottom ||
    block.responsive.paddingLeft ||
    block.responsive.paddingRight ||
    block.responsive.marginTop ||
    block.responsive.marginBottom ||
    block.responsive.marginLeft ||
    block.responsive.marginRight ||
    block.responsive.visibility ||
    block.responsive.fontSize
  );

  // Check for column stacking settings
  const hasStackingSettings =
    block.type === 'columns' && (
      block.stackOnMobile !== undefined ||
      block.stackOnTablet !== undefined
    );

  if (!hasResponsiveSettings && !hasStackingSettings) {
    return null;
  }

  return (
    <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
      <div
        className="flex items-center gap-1 px-2 py-1 bg-primary/90 text-primary-foreground rounded text-xs font-medium shadow-sm"
        title="This block has responsive settings configured"
      >
        <svg
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
          />
        </svg>
        <span>Responsive</span>
      </div>
    </div>
  );
}
