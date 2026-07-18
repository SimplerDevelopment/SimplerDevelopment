/**
 * Card-level file attachments (the ones not attached to a specific comment).
 * Includes drag-drop and the file picker label.
 */
'use client';

import { FileThumb } from '../_lib/atoms';
import type { FileAttachment } from '../_lib/types';

interface Props {
  cardFiles: FileAttachment[];
  canDeleteFile: (f: FileAttachment) => boolean;
  uploadFile: (f: File, forComment?: boolean) => void;
  deleteFile: (id: number) => void;
  uploadingFile: boolean;
  isDragOver: boolean;
  setIsDragOver: (v: boolean) => void;
  handleFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function CardFiles({
  cardFiles,
  canDeleteFile,
  uploadFile,
  deleteFile,
  uploadingFile,
  isDragOver,
  setIsDragOver,
  handleFileInput,
}: Props) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Attachments {cardFiles.length > 0 && `(${cardFiles.length})`}
      </h3>
      {cardFiles.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {cardFiles.map(f => (
            <FileThumb
              key={f.id}
              file={f}
              onDelete={canDeleteFile(f) ? () => deleteFile(f.id) : undefined}
            />
          ))}
        </div>
      )}
      <label
        onDragOver={e => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setIsDragOver(false);
          Array.from(e.dataTransfer.files).forEach(f => uploadFile(f));
        }}
        className={`flex items-center gap-2 px-3 py-2.5 border border-dashed rounded-lg text-sm cursor-pointer transition-colors ${
          isDragOver
            ? 'border-primary text-primary bg-primary/5'
            : 'border-border text-muted-foreground hover:border-primary hover:text-primary'
        }`}
      >
        <span className="material-icons text-base">
          {uploadingFile ? 'refresh' : 'attach_file'}
        </span>
        {uploadingFile ? 'Uploading…' : 'Attach file or drop here'}
        <input
          type="file"
          className="hidden"
          onChange={handleFileInput}
          multiple
          disabled={uploadingFile}
        />
      </label>
    </div>
  );
}
