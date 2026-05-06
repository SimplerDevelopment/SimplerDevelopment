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
import NoteActionButtons from '@/components/brain/NoteActionButtons';
import NoteMetaStrip from '@/components/brain/NoteMetaStrip';
import type { BrainNote } from '@/lib/brain/types';

const AUTOSAVE_DELAY_MS = 1500;

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
        <NoteActionButtons note={note} onPatch={patchMeta} onDelete={handleDelete} />
      </div>

      <NoteMetaStrip note={note} onPatch={patchMeta} />

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

