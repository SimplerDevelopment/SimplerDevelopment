// Revision history slide-over wrapper — reloads the page on revert to pick up reverted content.
'use client';

import RevisionHistory from '@/components/portal/RevisionHistory';

interface RevisionsPanelProps {
  siteId: number;
  postId: number;
  open: boolean;
  onClose: () => void;
}

export function RevisionsPanel({ siteId, postId, open, onClose }: RevisionsPanelProps) {
  return (
    <RevisionHistory
      siteId={siteId}
      postId={postId}
      open={open}
      onClose={onClose}
      onRevert={() => {
        // Reload the page to get the reverted content
        window.location.reload();
      }}
    />
  );
}
