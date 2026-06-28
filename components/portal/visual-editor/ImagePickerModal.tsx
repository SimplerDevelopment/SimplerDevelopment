'use client';

// ─── ImagePickerModal — opens when an iframe img is clicked for swap ───────
// Reuses the standard MediaPicker. Renders in a small modal so the author
// can pick without leaving the visual editor. Pre-populates with the
// currently displayed image so they see what they're replacing.

import React from 'react';
import MediaPicker from '@/components/admin/MediaPicker';

export function ImagePickerModal({
  target,
  mediaApi,
  onSelect,
  onClose,
}: {
  target: { blockId: string; field: string; currentValue: string };
  mediaApi: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Select image"
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="relative w-full max-w-2xl rounded-lg border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">image</span>
            <h2 className="text-sm font-semibold text-foreground">Replace image</h2>
            <code className="text-[11px] text-muted-foreground hidden md:inline">{target.field}</code>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent"
            title="Close (Esc)"
          >
            <span className="material-icons text-sm">close</span>
            Close
          </button>
        </header>
        <div className="p-4">
          <MediaPicker
            value={target.currentValue}
            onChange={(url) => onSelect(url)}
            mimeTypeFilter="image"
            label=""
            apiEndpoint={mediaApi}
          />
        </div>
      </div>
    </div>
  );
}
