'use client';

import { EmailHeaderBlock } from '@/types/blocks';

interface EmailHeaderBlockRenderProps {
  block: EmailHeaderBlock;
}

export function EmailHeaderBlockRender({ block }: EmailHeaderBlockRenderProps) {
  const alignment = block.alignment ?? 'center';
  const alignClass = alignment === 'center' ? 'text-center' : alignment === 'right' ? 'text-right' : 'text-left';

  return (
    <div className={`py-4 ${alignClass}`}>
      {block.logoUrl && (
        <img
          src={block.logoUrl}
          alt="Logo"
          style={{ width: block.logoWidth ?? 150, maxWidth: '100%', height: 'auto' }}
          className={alignment === 'center' ? 'mx-auto' : ''}
        />
      )}
      {block.tagline && (
        <p className="text-sm text-muted-foreground mt-2">{block.tagline}</p>
      )}
    </div>
  );
}
