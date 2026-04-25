'use client';

import { SocialLinksBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface SocialLinksBlockRenderProps {
  block: SocialLinksBlock;
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  twitter: 'X (Twitter)',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

export function SocialLinksBlockRender({ block }: SocialLinksBlockRenderProps) {
  const alignment = block.alignment ?? 'center';
  const alignClass = alignment === 'center' ? 'justify-center' : alignment === 'right' ? 'justify-end' : 'justify-start';

  return (
    <div
      className={`flex flex-wrap gap-3 ${alignClass} py-2`}
      style={getElementCSS(block.elementStyles, 'icon')}
    >
      {(block.links ?? []).map((link, i) => (
        <a
          key={i}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          style={getElementCSS(block.elementStyles, 'link')}
        >
          {PLATFORM_LABELS[link.platform] ?? link.platform}
        </a>
      ))}
    </div>
  );
}
