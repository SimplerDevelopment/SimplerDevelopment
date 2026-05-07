'use client';

import { useState, type ReactNode } from 'react';

interface Props {
  tags: string[];
  onCommit: (tags: string[]) => void;
}

export default function TagEditor({ tags, onCommit }: Props): ReactNode {
  const [draft, setDraft] = useState('');
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground w-24 shrink-0 mt-1">Tags</span>
      <div className="flex-1 flex flex-wrap items-center gap-1">
        {tags.map(t => (
          <span
            key={t}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] rounded-full bg-muted/60 text-foreground"
          >
            {t}
            <button
              type="button"
              onClick={() => onCommit(tags.filter(x => x !== t))}
              className="opacity-60 hover:opacity-100"
              aria-label={`remove ${t}`}
            >
              <span className="material-icons text-[14px]">close</span>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              const v = draft.trim();
              if (!tags.includes(v)) onCommit([...tags, v]);
              setDraft('');
            } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
              onCommit(tags.slice(0, -1));
            }
          }}
          placeholder="add tag…"
          className="text-xs px-1.5 py-0.5 rounded border border-transparent bg-transparent focus:border-border focus:bg-background min-w-[80px] flex-1 outline-none"
        />
      </div>
    </div>
  );
}
