'use client';

import type { ReactNode } from 'react';
// components/portal/media/MediaDetail.tsx
// Extracted verbatim from app/portal/media/page.tsx for PUX-188.

import { formatBytes } from '@/lib/utils/bytes';
import { pBtnPrimary, pBtnGhost, pInput } from '@/components/portal/portal-ui';
import type { MediaItem, MediaVersionEntry } from './types';

interface MediaDetailProps {
  variant?: 'modal' | 'panel';
  extra?: ReactNode;
  detail: MediaItem;
  onClose: () => void;
  editMode: boolean;
  setEditMode: (value: boolean) => void;
  editAlt: string;
  setEditAlt: (value: string) => void;
  editCaption: string;
  setEditCaption: (value: string) => void;
  savingDetail: boolean;
  handleSaveDetail: () => void;
  copyUrl: (url: string) => void;
  replaceInputRef: React.RefObject<HTMLInputElement | null>;
  replacing: boolean;
  handleReplaceFile: (file: File) => void;
  handleDeleteMedia: () => void;
  versionsOpen: boolean;
  setVersionsOpen: (value: boolean) => void;
  versions: MediaVersionEntry[];
  loadVersions: (mediaId: number) => void;
  handleRestoreVersion: (versionId: number) => void;
}

export function MediaDetail({
  detail,
  onClose,
  editMode,
  setEditMode,
  editAlt,
  setEditAlt,
  editCaption,
  setEditCaption,
  savingDetail,
  handleSaveDetail,
  copyUrl,
  replaceInputRef,
  replacing,
  handleReplaceFile,
  handleDeleteMedia,
  versionsOpen,
  setVersionsOpen,
  versions,
  loadVersions,
  handleRestoreVersion,
  variant = 'modal',
  extra,
}: MediaDetailProps) {
  // PUX-188: under the portal-redesign flag the same body renders as a side
  // panel beside the grid instead of a full-screen dialog; `extra` is the
  // "Used on n pages" block. Modal markup is byte-identical to before.
  const body = (
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-foreground">Media Details</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <span className="material-icons">close</span>
            </button>
          </div>

          <div className="bg-muted rounded-xl p-4 flex items-center justify-center">
            {detail.mimeType.startsWith('image/') ? (
              <img src={detail.url} alt={detail.alt || detail.filename} className="max-h-80 rounded-lg" />
            ) : detail.mimeType.startsWith('video/') ? (
              <video src={detail.url} controls className="max-h-80 rounded-lg" />
            ) : (
              <span className="material-icons text-6xl text-muted-foreground">description</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            <div><span className="font-medium">Filename:</span> {detail.filename}</div>
            <div><span className="font-medium">Type:</span> {detail.mimeType}</div>
            <div><span className="font-medium">Size:</span> {formatBytes(detail.fileSize)}</div>
            {detail.width && detail.height && <div><span className="font-medium">Dimensions:</span> {detail.width} x {detail.height}</div>}
            <div><span className="font-medium">Uploaded:</span> {new Date(detail.createdAt).toLocaleDateString()}</div>
            {detail.brandingProfileName && <div><span className="font-medium">Brand:</span> {detail.brandingProfileName}</div>}
          </div>

          {editMode ? (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Alt Text</label>
                <input
                  value={editAlt}
                  onChange={e => setEditAlt(e.target.value)}
                  className={pInput}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Caption</label>
                <textarea
                  value={editCaption}
                  onChange={e => setEditCaption(e.target.value)}
                  rows={2}
                  className={`${pInput} resize-none`}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveDetail}
                  disabled={savingDetail}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {savingDetail ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditMode(false)}
                  className="px-4 py-2 text-sm text-foreground border border-border rounded-lg hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              {detail.alt && <p><span className="font-medium">Alt:</span> {detail.alt}</p>}
              {detail.caption && <p><span className="font-medium">Caption:</span> {detail.caption}</p>}
            </div>
          )}

          <div className="flex gap-2 pt-3 border-t border-border flex-wrap">
            <input
              ref={replaceInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleReplaceFile(f);
                if (replaceInputRef.current) replaceInputRef.current.value = '';
              }}
            />
            <button
              onClick={() => copyUrl(detail.url)}
              className={pBtnPrimary}
            >
              <span className="material-icons text-base">content_copy</span>
              Copy URL
            </button>
            <button
              onClick={() => replaceInputRef.current?.click()}
              disabled={replacing}
              className={pBtnGhost}
            >
              <span className="material-icons text-base">{replacing ? 'refresh' : 'upload_file'}</span>
              {replacing ? 'Replacing…' : 'Replace File'}
            </button>
            {!editMode && (
              <button
                onClick={() => setEditMode(true)}
                className={pBtnGhost}
              >
                Edit Metadata
              </button>
            )}
            <button
              onClick={handleDeleteMedia}
              className="ml-auto px-4 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 transition-colors"
            >
              Delete
            </button>
          </div>

          <div className="pt-3 border-t border-border">
            <button
              onClick={() => {
                const next = !versionsOpen;
                setVersionsOpen(next);
                if (next) loadVersions(detail.id);
              }}
              className="flex items-center gap-1.5 text-sm text-foreground hover:text-primary transition-colors"
            >
              <span className="material-icons text-base">{versionsOpen ? 'expand_less' : 'expand_more'}</span>
              Version history{detail.version ? ` (current: v${detail.version})` : ''}
            </button>
            {versionsOpen && (
              <div className="mt-3 space-y-2">
                {versions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No prior versions yet. Replace the file to start a history.</p>
                ) : (
                  versions.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-border bg-background">
                      <span className="material-icons text-base text-muted-foreground">history</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">v{v.version} · {v.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(v.fileSize)} · {new Date(v.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noopener"
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        View
                      </a>
                      <button
                        onClick={() => handleRestoreVersion(v.id)}
                        className={`${pBtnGhost} text-xs px-2 py-1`}
                      >
                        Restore
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          {extra}
        </div>
  );
  return variant === 'panel' ? (
    <aside className="max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-border bg-card lg:sticky lg:top-6" aria-label="Media details">{body}</aside>
  ) : (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>{body}</div>
    </div>
  );
}
