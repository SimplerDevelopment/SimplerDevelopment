'use client';

import { EmailFooterBlock } from '@/types/blocks';

interface EmailFooterBlockRenderProps {
  block: EmailFooterBlock;
}

export function EmailFooterBlockRender({ block }: EmailFooterBlockRenderProps) {
  return (
    <div className="border-t border-border py-6 text-center">
      {block.companyName && (
        <p className="text-sm font-semibold text-muted-foreground">{block.companyName}</p>
      )}
      {block.address && (
        <p className="text-xs text-muted-foreground/70 mt-1">{block.address}</p>
      )}
      {block.socialLinks && block.socialLinks.length > 0 && (
        <div className="flex justify-center gap-3 mt-3">
          {block.socialLinks.map((link, i) => (
            <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground">
              {link.platform}
            </a>
          ))}
        </div>
      )}
      {block.showUnsubscribe !== false && (
        <p className="text-xs text-muted-foreground/50 mt-3">
          <span className="underline">Unsubscribe</span>
        </p>
      )}
    </div>
  );
}
