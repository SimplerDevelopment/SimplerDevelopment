'use client';

import { EmailFooterBlock } from '@/types/blocks';
import { SocialIcon } from '@/lib/icons/social-icons';

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
            <a
              key={i}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={link.platform}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <SocialIcon platform={link.platform} size={16} />
            </a>
          ))}
        </div>
      )}
      {(block.showUnsubscribe !== false || block.showViewInBrowser) && (
        <p className="text-xs text-muted-foreground/50 mt-3 flex items-center justify-center gap-3">
          {block.showUnsubscribe !== false && (
            <span className="underline">Unsubscribe</span>
          )}
          {block.showViewInBrowser && (
            <span className="underline">View in browser</span>
          )}
        </p>
      )}
    </div>
  );
}
