'use client';

/**
 * DocumentMarkdownEditor — side-by-side markdown source editor + preview.
 *
 * Intentionally lightweight — does NOT pull in the heavy CodeMirror-backed
 * MarkdownEditor used by note authoring. Documents are typically shorter
 * SOP-style content and the document edit page already has a lot of UI
 * (title field, category dropdown, summary, change-notes, publish button).
 *
 * Renders a monospace textarea on the left and a live preview on the right
 * (using the shared `MarkdownView` component). Stacks vertically on narrow
 * screens.
 */

import { useCallback } from 'react';
import MarkdownView from '@/components/portal/MarkdownView';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Inline savedness indicator string, e.g. "Saved 3s ago" or "Saving…". */
  savedHint?: string;
  /** Disabled-state passthrough — applied to the textarea + preview wrapper. */
  disabled?: boolean;
}

export default function DocumentMarkdownEditor({ value, onChange, savedHint, disabled }: Props) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
    [onChange],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="material-icons text-[14px]">edit_note</span>
          Markdown source / live preview
        </span>
        {savedHint && (
          <span className="inline-flex items-center gap-1">
            <span className="material-icons text-[14px]">cloud_done</span>
            {savedHint}
          </span>
        )}
      </div>
      <div className="grid lg:grid-cols-2 gap-3">
        <textarea
          value={value}
          onChange={handleChange}
          disabled={disabled}
          spellCheck
          placeholder="# Heading

Start writing in Markdown…"
          className="min-h-[420px] w-full px-3 py-3 rounded-md border border-border bg-background text-sm font-mono leading-relaxed text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        />
        <div className="min-h-[420px] w-full px-4 py-3 rounded-md border border-border bg-muted/20 overflow-auto">
          {value.trim() ? (
            <div className="text-sm text-foreground prose-tight">
              <MarkdownView>{value}</MarkdownView>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">Live preview appears here.</p>
          )}
        </div>
      </div>
    </div>
  );
}
