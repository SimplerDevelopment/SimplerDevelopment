'use client';

import { EmailHeaderBlock } from '@/types/blocks';

interface EmailHeaderBlockPreviewProps {
  block: EmailHeaderBlock;
  isSelected: boolean;
  onChange: (updates: Partial<EmailHeaderBlock>) => void;
}

export function EmailHeaderBlockPreview({ block, isSelected, onChange }: EmailHeaderBlockPreviewProps) {
  const alignment = block.alignment ?? 'center';
  const alignClass = alignment === 'center' ? 'text-center' : alignment === 'right' ? 'text-right' : 'text-left';

  return (
    <div className={`px-4 py-4 ${alignClass}`}>
      {block.logoUrl ? (
        <img
          src={block.logoUrl}
          alt="Logo"
          style={{ width: block.logoWidth ?? 150, maxWidth: '100%', height: 'auto' }}
          className={alignment === 'center' ? 'mx-auto' : ''}
        />
      ) : (
        <div className={`inline-flex items-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg text-muted-foreground ${isSelected ? 'cursor-pointer hover:border-primary' : ''}`}>
          <span className="material-icons text-base">image</span>
          <span className="text-xs">Add logo URL</span>
        </div>
      )}
      {isSelected ? (
        <div className="mt-3 space-y-2 max-w-xs mx-auto">
          <input
            value={block.logoUrl ?? ''}
            onChange={(e) => onChange({ logoUrl: e.target.value })}
            placeholder="Logo image URL"
            className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
          />
          <input
            value={block.tagline ?? ''}
            onChange={(e) => onChange({ tagline: e.target.value })}
            placeholder="Tagline (optional)"
            className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
          />
        </div>
      ) : block.tagline ? (
        <p className="text-sm text-muted-foreground mt-2">{block.tagline}</p>
      ) : null}
    </div>
  );
}
