'use client';

/**
 * NoteEditorPane — center pane of the knowledge IDE shell.
 *
 * Accepts a `noteId` (or null) and:
 *   - empty state: invites the user to pick or create a note
 *   - loading state: spinner
 *   - editing state: title input + MarkdownEditor + collapsible metadata strip
 *
 * Auto-saves debounced 1.5s after the last change. Exposes the underlying
 * CodeMirror EditorView via `onEditorReady` so the right-pane outline panel
 * can scroll the editor on heading click.
 *
 * Save success bumps `onSaved` so the list pane can refresh the affected
 * row (and the note title in the list updates without a full reload).
 */

import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { EditorView } from '@codemirror/view';
import MarkdownEditor from '@/components/brain/MarkdownEditor';
import { makeDataviewCodeOverride } from '@/components/brain/DataviewBlock';

interface BrainNote {
  id: number;
  title: string;
  body: string;
  tags: string[];
  meetingId: number | null;
  relationshipOverlayId: number | null;
  companyId: number | null;
  dealId: number | null;
  contactId: number | null;
  confidentialityLevel: 'standard' | 'restricted' | 'confidential';
  pinned: boolean;
  source: string;
  attachmentUrl: string | null;
  attachmentFilename: string | null;
  attachmentMimeType: string | null;
  attachmentFileSize: number | null;
  sourceUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

const AUTOSAVE_DELAY_MS = 1500;

const CONFIDENTIALITY_BADGE: Record<BrainNote['confidentialityLevel'], string> = {
  standard: 'bg-muted text-muted-foreground',
  restricted: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  confidential: 'bg-red-500/10 text-red-700 dark:text-red-300',
};

interface Props {
  noteId: number | null;
  /** Receives the underlying EditorView so the outline panel can scroll. */
  onEditorReady?: (view: EditorView | null) => void;
  /** Notifies the parent shell when a note is created or saved (for list refresh). */
  onSaved?: (note: BrainNote) => void;
  /** Fired after a successful delete; parent should clear `selectedId`. */
  onDeleted?: (noteId: number) => void;
  onTitleChange?: (title: string) => void;
  onBodyChange?: (body: string) => void;
  onCreate?: () => void;
}

export default function NoteEditorPane({
  noteId,
  onEditorReady,
  onSaved,
  onDeleted,
  onTitleChange,
  onBodyChange,
  onCreate,
}: Props) {
  const [note, setNote] = useState<BrainNote | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [metaOpen, setMetaOpen] = useState(false);

  const editorViewRef = useRef<EditorView | null>(null);

  // Reset when noteId changes (including to null).
  useEffect(() => {
    if (noteId === null) {
      setNote(null);
      setTitle('');
      setBody('');
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/portal/brain/knowledge/${noteId}`)
      .then(r => r.json().catch(() => ({})))
      .then(json => {
        if (cancelled) return;
        if (!json?.success) {
          setError(json?.message || 'Failed to load note.');
          setNote(null);
          return;
        }
        const n = json.data as BrainNote;
        setNote(n);
        setTitle(n.title);
        setBody(n.body ?? '');
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Network error');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [noteId]);

  const dirty = note !== null && (title !== note.title || body !== (note.body ?? ''));

  // Push title/body up so the list & outline can react in real time without
  // waiting for save.
  useEffect(() => { onTitleChange?.(title); }, [title, onTitleChange]);
  useEffect(() => { onBodyChange?.(body); }, [body, onBodyChange]);

  const save = useCallback(async (): Promise<boolean> => {
    if (noteId === null) return false;
    if (!title.trim()) {
      setError('Title is required.');
      return false;
    }
    setSaveState('saving');
    try {
      const r = await fetch(`/api/portal/brain/knowledge/${noteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json.message || `Save failed (${r.status}).`);
        setSaveState('error');
        return false;
      }
      const saved = json.data as BrainNote;
      setNote(saved);
      setSaveState('saved');
      setError(null);
      onSaved?.(saved);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSaveState('error');
      return false;
    }
  }, [noteId, title, body, onSaved]);

  // Debounced auto-save.
  useEffect(() => {
    if (!dirty) return;
    const handle = window.setTimeout(() => { save(); }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [title, body, dirty, save]);

  // "Saved" pip clears after 2s.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const id = window.setTimeout(() => setSaveState('idle'), 2000);
    return () => window.clearTimeout(id);
  }, [saveState]);

  const handleEditorReady = useCallback((view: EditorView | null) => {
    editorViewRef.current = view;
    onEditorReady?.(view);
  }, [onEditorReady]);

  const editorExtraComponents = useMemo(
    () => ({ code: makeDataviewCodeOverride() }),
    [],
  );

  // ── Patch helpers for the metadata strip ──────────────────────────────
  async function patchMeta(patch: Partial<BrainNote>) {
    if (noteId === null) return;
    const r = await fetch(`/api/portal/brain/knowledge/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok && json.success) {
      const saved = json.data as BrainNote;
      setNote(saved);
      onSaved?.(saved);
    } else {
      setError(json.message || 'Update failed.');
    }
  }

  async function handleDelete() {
    if (noteId === null || !note) return;
    if (!confirm(`Delete "${note.title}"? This can't be undone.`)) return;
    const r = await fetch(`/api/portal/brain/knowledge/${noteId}`, { method: 'DELETE' });
    const json = await r.json().catch(() => ({}));
    if (r.ok && json.success) {
      onDeleted?.(noteId);
    } else {
      setError(json.message || 'Delete failed.');
    }
  }

  // ── Render ───────────────────────────────────────────────────────────
  if (noteId === null) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <span className="material-icons text-5xl text-muted-foreground/50 block mb-3">menu_book</span>
          <h3 className="text-base font-semibold text-foreground mb-1">No note selected</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Pick a note from the left, or start a new one.
          </p>
          {onCreate && (
            <button
              type="button"
              onClick={onCreate}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <span className="material-icons text-base">add</span>
              New note
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    );
  }

  if (!note) {
    return (
      <div className="h-full flex items-center justify-center p-8 text-center">
        <div>
          <span className="material-icons text-3xl text-destructive block mb-2">error</span>
          <div className="text-sm text-destructive">{error ?? 'Note not found.'}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header: title + actions */}
      <div className="border-b border-border px-3 py-2 flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled"
          aria-label="Note title"
          className="flex-1 min-w-0 text-lg font-semibold bg-transparent border-0 px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary/40 rounded"
        />
        <SaveStatus state={saveState} dirty={dirty} />
        <button
          type="button"
          onClick={() => patchMeta({ pinned: !note.pinned })}
          title={note.pinned ? 'Unpin' : 'Pin'}
          className={`h-8 w-8 inline-flex items-center justify-center rounded-md border border-border transition-colors ${
            note.pinned ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'text-muted-foreground hover:bg-accent'
          }`}
        >
          <span className="material-icons text-base">push_pin</span>
        </button>
        <Link
          href={`/portal/brain/knowledge/${note.id}`}
          title="Zen mode (focused single-pane view)"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent"
        >
          <span className="material-icons text-base">open_in_full</span>
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          title="Delete note"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <span className="material-icons text-base">delete</span>
        </button>
      </div>

      {/* Metadata strip — collapsible */}
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
            {/* Tags */}
            <TagEditor tags={note.tags} onCommit={(tags) => patchMeta({ tags })} />
            {/* Confidentiality */}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground w-24">Confidentiality</span>
              <select
                value={note.confidentialityLevel}
                onChange={(e) => patchMeta({ confidentialityLevel: e.target.value as BrainNote['confidentialityLevel'] })}
                className="text-xs px-1.5 py-0.5 rounded border border-border bg-background"
              >
                <option value="standard">standard</option>
                <option value="restricted">restricted</option>
                <option value="confidential">confidential</option>
              </select>
            </div>
            {/* Source URL */}
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
            {/* Attachment */}
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

      {error && (
        <div className="bg-destructive/10 border-b border-destructive/30 px-3 py-1.5 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Editor — fills remaining space */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <MarkdownEditor
          value={body}
          onChange={setBody}
          onSave={() => { save(); }}
          onEditorReady={handleEditorReady}
          extraComponents={editorExtraComponents}
          minHeight={300}
          defaultMode="split"
          storageKey="brain.editor.shell.mode"
          className="h-full"
        />
      </div>
    </div>
  );
}

function SaveStatus({
  state,
  dirty,
}: {
  state: 'idle' | 'saving' | 'saved' | 'error';
  dirty: boolean;
}): ReactNode {
  if (state === 'saving') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <span className="material-icons animate-spin text-sm">progress_activity</span>
        Saving
      </span>
    );
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <span className="material-icons text-sm">check_circle</span>
        Saved
      </span>
    );
  }
  if (state === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <span className="material-icons text-sm">error</span>
        Error
      </span>
    );
  }
  if (dirty) {
    return <span className="text-xs text-muted-foreground">●</span>;
  }
  return null;
}

function TagEditor({
  tags,
  onCommit,
}: {
  tags: string[];
  onCommit: (tags: string[]) => void;
}): ReactNode {
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
