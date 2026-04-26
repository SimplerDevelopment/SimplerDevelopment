'use client';

import { EmailFooterBlock } from '@/types/blocks';

interface EmailFooterBlockPreviewProps {
  block: EmailFooterBlock;
  isSelected: boolean;
  onChange: (updates: Partial<EmailFooterBlock>) => void;
}

export function EmailFooterBlockPreview({ block, isSelected, onChange }: EmailFooterBlockPreviewProps) {
  return (
    <div className="px-4 py-4 border-t border-border text-center">
      {isSelected ? (
        <div className="space-y-2 max-w-sm mx-auto">
          <input
            value={block.companyName ?? ''}
            onChange={(e) => onChange({ companyName: e.target.value })}
            placeholder="Company name"
            className="w-full text-xs border border-border rounded px-2 py-1 bg-background text-center"
          />
          <input
            value={block.address ?? ''}
            onChange={(e) => onChange({ address: e.target.value })}
            placeholder="123 Main St, City, State ZIP"
            className="w-full text-xs border border-border rounded px-2 py-1 bg-background text-center"
          />
          <label className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={block.showUnsubscribe !== false}
              onChange={(e) => onChange({ showUnsubscribe: e.target.checked })}
              className="rounded"
            />
            Show unsubscribe link
          </label>
        </div>
      ) : (
        <>
          {block.companyName && (
            <p className="text-xs font-semibold text-muted-foreground">{block.companyName}</p>
          )}
          {block.address && (
            <p className="text-xs text-muted-foreground/70 mt-0.5">{block.address}</p>
          )}
          {block.socialLinks && block.socialLinks.length > 0 && (
            <div className="flex justify-center gap-3 mt-2">
              {block.socialLinks.map((link, i) => (
                <span key={i} className="text-xs text-muted-foreground">
                  {link.platform}
                </span>
              ))}
            </div>
          )}
          {(block.showUnsubscribe !== false || block.showViewInBrowser) && (
            <p className="text-xs text-muted-foreground/50 mt-2 flex items-center justify-center gap-3">
              {block.showUnsubscribe !== false && (
                <span className="underline cursor-default">Unsubscribe</span>
              )}
              {block.showViewInBrowser && (
                <span className="underline cursor-default">View in browser</span>
              )}
            </p>
          )}
          {!block.companyName && !block.address && (!block.socialLinks || block.socialLinks.length === 0) && (
            <p className="text-xs text-muted-foreground/50">Email footer - click to edit</p>
          )}
        </>
      )}
    </div>
  );
}
