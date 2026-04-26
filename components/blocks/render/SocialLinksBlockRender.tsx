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
  const iconSize = block.iconSize ?? 24;

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
          aria-label={PLATFORM_LABELS[link.platform] ?? link.platform}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 inline-flex items-center gap-1.5"
          style={getElementCSS(block.elementStyles, 'link')}
        >
          <span
            className="material-icons"
            style={{ fontSize: iconSize }}
            aria-hidden="true"
          >
            {link.platform}
          </span>
          <span className="sr-only">{PLATFORM_LABELS[link.platform] ?? link.platform}</span>
        </a>
      ))}
    </div>
  );
}
