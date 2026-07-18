/**
 * Reusable atoms used by multiple sections of the card-detail modal.
 *
 * - `FileThumb` — small thumbnail card for an attached file.
 * - `MentionTextarea` — `@`-mention auto-complete textarea with paste-to-attach.
 *
 * Lifted verbatim from the pre-refactor CardDetailModal.tsx.
 */
'use client';

import { useRef, useState } from 'react';
import { formatSize } from './format';
import type { FileAttachment, MentionUser } from './types';

export function FileThumb({
  file,
  onDelete,
}: {
  file: FileAttachment;
  onDelete?: () => void;
}) {
  const isImage = file.mimeType.startsWith('image/');
  return (
    <div className="relative group border border-border rounded-lg overflow-hidden">
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="block">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.url} alt={file.originalName} className="w-full h-20 object-cover bg-muted" />
        ) : (
          <div className="w-full h-20 flex flex-col items-center justify-center bg-muted gap-1">
            <span className="material-icons text-2xl text-muted-foreground">
              {file.mimeType === 'application/pdf' ? 'picture_as_pdf' : 'insert_drive_file'}
            </span>
          </div>
        )}
      </a>
      <div className="p-1.5 bg-card">
        <p className="text-xs text-foreground truncate">{file.originalName}</p>
        <p className="text-xs text-muted-foreground">{formatSize(file.fileSize)}</p>
      </div>
      {onDelete && (
        <button
          onClick={onDelete}
          className="absolute top-1 right-1 p-0.5 rounded bg-background/80 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <span className="material-icons text-sm">close</span>
        </button>
      )}
    </div>
  );
}

export function MentionTextarea({
  value,
  onChange,
  placeholder,
  rows = 3,
  users,
  onFilePaste,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  users: MentionUser[];
  onFilePaste?: (f: File) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [query, setQuery] = useState('');
  const [triggerStart, setTriggerStart] = useState(-1);
  const ref = useRef<HTMLTextAreaElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    const cursor = e.target.selectionStart ?? 0;
    onChange(val);
    const match = val.slice(0, cursor).match(/@(\w*)$/);
    if (match) {
      setQuery(match[1]);
      setTriggerStart(cursor - match[0].length);
      setShowMenu(true);
    } else {
      setShowMenu(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imageItem = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
    if (imageItem && onFilePaste) {
      const file = imageItem.getAsFile();
      if (file) {
        e.preventDefault();
        onFilePaste(file);
      }
    }
  }

  function pickUser(user: MentionUser) {
    const cursor = ref.current?.selectionStart ?? triggerStart + query.length + 1;
    const newVal = `${value.slice(0, triggerStart)}@${user.name} ${value.slice(cursor)}`;
    onChange(newVal);
    setShowMenu(false);
    setTimeout(() => {
      ref.current?.focus();
      const p = triggerStart + user.name.length + 2;
      ref.current?.setSelectionRange(p, p);
    }, 0);
  }

  const filtered = users
    .filter(u => !query || u.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        onBlur={() => setTimeout(() => setShowMenu(false), 150)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
      />
      {showMenu && filtered.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 bg-popover border border-border rounded-lg shadow-lg z-50 w-48 overflow-hidden">
          {filtered.map(u => (
            <button
              key={u.id}
              onMouseDown={e => {
                e.preventDefault();
                pickUser(u);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center gap-2"
            >
              <span className="material-icons text-sm text-muted-foreground">person</span>
              {u.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
