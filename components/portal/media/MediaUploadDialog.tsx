'use client';
// components/portal/media/MediaUploadDialog.tsx
// Extracted verbatim from app/portal/media/page.tsx for PUX-188.

import { pBtnPrimary, pBtnGhost, pInput, pSelect } from '@/components/portal/portal-ui';
import type { BrandingProfileOption } from './types';

interface MediaUploadDialogProps {
  onClose: () => void;
  dragActive: boolean;
  handleDrag: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  preview: string | null;
  selectedFile: File | null;
  selectFile: (file: File) => void;
  brandingProfiles: BrandingProfileOption[];
  uploadProfileId: string;
  setUploadProfileId: (value: string) => void;
  uploadAlt: string;
  setUploadAlt: (value: string) => void;
  uploadCaption: string;
  setUploadCaption: (value: string) => void;
  uploading: boolean;
  handleUpload: () => void;
}

export function MediaUploadDialog({
  onClose,
  dragActive,
  handleDrag,
  handleDrop,
  fileInputRef,
  preview,
  selectedFile,
  selectFile,
  brandingProfiles,
  uploadProfileId,
  setUploadProfileId,
  uploadAlt,
  setUploadAlt,
  uploadCaption,
  setUploadCaption,
  uploading,
  handleUpload,
}: MediaUploadDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-foreground">Upload Media</h2>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <span className="material-icons">close</span>
            </button>
          </div>

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
            }`}
          >
            <input ref={fileInputRef} type="file" className="hidden" onChange={e => e.target.files?.[0] && selectFile(e.target.files[0])} />
            {preview ? (
              <img src={preview} alt="Preview" className="max-h-40 mx-auto rounded-lg" />
            ) : (
              <>
                <span className="material-icons text-4xl text-muted-foreground">cloud_upload</span>
                <p className="text-sm font-medium text-foreground mt-2">
                  {selectedFile ? selectedFile.name : 'Drop files here or click to browse'}
                </p>
                {!selectedFile && <p className="text-xs text-muted-foreground mt-1">Images, videos, and documents</p>}
              </>
            )}
          </div>

          {selectedFile && (
            <>
              {brandingProfiles.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Brand</label>
                  <select
                    value={uploadProfileId}
                    onChange={e => setUploadProfileId(e.target.value)}
                    className={pSelect}
                  >
                    <option value="">No brand assigned</option>
                    {brandingProfiles.map(p => (
                      <option key={p.id} value={String(p.id)}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Alt Text</label>
                <input
                  value={uploadAlt}
                  onChange={e => setUploadAlt(e.target.value)}
                  placeholder="Describe the image"
                  className={pInput}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Caption</label>
                <textarea
                  value={uploadCaption}
                  onChange={e => setUploadCaption(e.target.value)}
                  rows={2}
                  placeholder="Optional caption"
                  className={`${pInput} resize-none`}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className={`flex-1 ${pBtnPrimary}`}
                >
                  {uploading && <span className="material-icons text-base animate-spin">refresh</span>}
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
                <button
                  onClick={onClose}
                  className={pBtnGhost}
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
