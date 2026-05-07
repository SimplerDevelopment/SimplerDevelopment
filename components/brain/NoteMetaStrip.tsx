'use client';

/**
 * Collapsible metadata strip shown beneath the note title in both the IDE
 * editor pane and the zen-mode detail page. Surfaces tags, confidentiality,
 * source URL, attachment, and timestamps; commits changes via `onPatch`.
 */

import { useState, type ReactNode } from 'react';
import TagEditor from '@/components/brain/TagEditor';
import type { BrainNote, ConfidentialityLevel } from '@/lib/brain/types';

const CONFIDENTIALITY_BADGE: Record<ConfidentialityLevel, string> = {
  standard: 'bg-muted text-muted-foreground',
  restricted: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  confidential: 'bg-red-500/10 text-red-700 dark:text-red-300',
};

interface Props {
  note: BrainNote;
  onPatch: (patch: Partial<BrainNote>) => void;
}

export default function NoteMetaStrip({ note, onPatch }: Props): ReactNode {
  const [metaOpen, setMetaOpen] = useState(false);
  return (
    <div className="border-b border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setMetaOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="material-icons text-sm">{metaOpen ? 'expand_more' : 'chevron_right'}</span>
        <span>Metadata</span>
        <span className="flex-1 text-right text-[11px] flex items-center justify-end gap-1.5 flex-wrap">
          {note.tags?.length > 0 && (
            <span>{note.tags.length} {note.tags.length === 1 ? 'tag' : 'tags'}</span>
          )}
          <span className={`px-1.5 py-0.5 rounded ${CONFIDENTIALITY_BADGE[note.confidentialityLevel]}`}>
            {note.confidentialityLevel}
          </span>
          {note.attachmentFilename && (
            <span className="inline-flex items-center gap-0.5"><span className="material-icons text-sm">attach_file</span>1</span>
          )}
        </span>
      </button>
      {metaOpen && (
        <div className="px-3 pb-3 pt-1 space-y-2 text-xs">
          <TagEditor tags={note.tags} onCommit={(tags) => onPatch({ tags })} />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground w-24">Confidentiality</span>
            <select
              value={note.confidentialityLevel}
              onChange={(e) => onPatch({ confidentialityLevel: e.target.value as ConfidentialityLevel })}
              className="text-xs px-1.5 py-0.5 rounded border border-border bg-background"
            >
              <option value="standard">standard</option>
              <option value="restricted">restricted</option>
              <option value="confidential">confidential</option>
            </select>
          </div>
          {note.sourceUrl && (
            <div className="flex items-start gap-2">
              <span className="text-muted-foreground w-24 shrink-0">Source URL</span>
              <a
                href={note.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline truncate"
              >
                {note.sourceUrl}
              </a>
            </div>
          )}
          {note.attachmentFilename && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-24">Attachment</span>
              <a
                href={note.attachmentUrl ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1"
              >
                <span className="material-icons text-sm">attach_file</span>
                {note.attachmentFilename}
              </a>
            </div>
          )}
          <div className="text-[10px] text-muted-foreground">
            Updated {new Date(note.updatedAt).toLocaleString()} · created {new Date(note.createdAt).toLocaleString()} · source {note.source}
          </div>
        </div>
      )}
    </div>
  );
}
