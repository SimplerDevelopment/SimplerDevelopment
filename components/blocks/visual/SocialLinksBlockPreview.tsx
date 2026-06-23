'use client';

import { SocialLinksBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { SocialIcon } from '@/lib/icons/social-icons';

interface SocialLinksBlockPreviewProps {
  block: SocialLinksBlock;
  isSelected: boolean;
  onChange: (updates: Partial<SocialLinksBlock>) => void;
}

const PLATFORMS = ['facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'tiktok'] as const;

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  twitter: 'X (Twitter)',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

export function SocialLinksBlockPreview({ block, isSelected, onChange }: SocialLinksBlockPreviewProps) {
  const alignment = block.alignment ?? 'center';
  const links = block.links ?? [];

  const addLink = () => {
    const unused = PLATFORMS.find(p => !links.some(l => l.platform === p));
    if (!unused) return;
    onChange({ links: [...links, { platform: unused, url: '' }] });
  };

  const removeLink = (index: number) => {
    onChange({ links: links.filter((_, i) => i !== index) });
  };

  const updateLink = (index: number, field: 'platform' | 'url', value: string) => {
    const updated = [...links];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ links: updated });
  };

  const alignClass = alignment === 'center' ? 'justify-center' : alignment === 'right' ? 'justify-end' : 'justify-start';

  const iconSize = block.iconSize ?? 24;

  if (!isSelected) {
    return (
      <div
        className={`flex flex-wrap gap-3 ${alignClass} py-2`}
        style={getElementCSS(block.elementStyles, 'icon')}
      >
        {links.map((link, i) => (
          <span
            key={i}
            className="text-muted-foreground p-1 inline-flex items-center gap-1.5"
            style={getElementCSS(block.elementStyles, 'link')}
          >
            <SocialIcon platform={link.platform} size={iconSize} />
            <span className="sr-only">{PLATFORM_LABELS[link.platform] ?? link.platform}</span>
          </span>
        ))}
        {links.length === 0 && (
          <p className="text-center text-muted-foreground text-xs py-2">Click to add social links</p>
        )}
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className={`flex flex-wrap gap-3 ${alignClass}`}>
        {links.map((link, i) => (
          <div key={i} className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-1.5 text-sm">
            <select
              value={link.platform}
              onChange={(e) => updateLink(i, 'platform', e.target.value)}
              className="bg-transparent border-none text-xs font-medium focus:outline-none"
            >
              {PLATFORMS.map(p => (
                <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>
              ))}
            </select>
            <input
              value={link.url}
              onChange={(e) => updateLink(i, 'url', e.target.value)}
              placeholder="https://..."
              className="bg-transparent border-none text-xs w-32 focus:outline-none"
            />
            <button onClick={() => removeLink(i)} className="text-muted-foreground hover:text-destructive">
              <span className="material-icons text-sm">close</span>
            </button>
          </div>
        ))}
        {links.length < PLATFORMS.length && (
          <button onClick={addLink} className="flex items-center gap-1 text-xs text-primary hover:underline">
            <span className="material-icons text-sm">add</span> Add
          </button>
        )}
      </div>
      {links.length === 0 && (
        <p className="text-center text-muted-foreground text-xs py-2">Click to add social links</p>
      )}
    </div>
  );
}
