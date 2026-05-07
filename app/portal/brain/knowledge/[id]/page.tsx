'use client';

/**
 * Brain note detail / "deep work" page.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │  Back · Title (editable)             · Save · status     │
 *   ├──────────────────────────────────────┬───────────────────┤
 *   │   MarkdownEditor                     │  Outline /        │
 *   │   (full-height, body state)          │  Backlinks /      │
 *   │                                      │  Custom fields    │
 *   └──────────────────────────────────────┴───────────────────┘
 *
 * The page hosts the same MarkdownEditor used in the modal NoteForm; the
 * modal still exists for quick edits on the list page. Auto-save fires
 * 1.5s after the last change to either title or body.
 */

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
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
import NoteOutlinePanel from '@/components/brain/NoteOutlinePanel';
import NoteBacklinksPanel from '@/components/brain/NoteBacklinksPanel';
import NoteCustomFieldsPanel from '@/components/brain/NoteCustomFieldsPanel';
import NoteActionButtons from '@/components/brain/NoteActionButtons';
import NoteMetaStrip from '@/components/brain/NoteMetaStrip';
import CommandPalette from '@/components/brain/CommandPalette';
import { pushRecentNoteId } from '@/lib/brain/recent-notes';
import type { BrainNote } from '@/lib/brain/types';

type SidePanel = 'outline' | 'backlinks' | 'fields';

const AUTOSAVE_DELAY_MS = 1500;

export default function BrainNoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const noteId = parseInt(params.id, 10);

  const [note, setNote] = useState<BrainNote | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<SidePanel>('outline');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Hold the EditorView so the outline panel can call `view.dispatch` to scroll.
  // Using a ref (rather than state) prevents a re-render of the whole page
  // each time CodeMirror remounts — outline reads via the getter on click.
  const editorViewRef = useRef<EditorView | null>(null);

  const fetchNote = useCallback(async () => {
    if (Number.isNaN(noteId)) return;
    try {
      const r = await fetch(`/api/portal/brain/knowledge/${noteId}`);
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        if (r.status === 404) setError('Note not found.');
        else setError(json.message || `Failed to load (HTTP ${r.status}).`);
        setLoading(false);
        return;
      }
      const n = json.data as BrainNote;
      setNote(n);
      setTitle(n.title);
      setBody(n.body ?? '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => { fetchNote(); }, [fetchNote]);

  // Track whether the local title/body diverge from what was last persisted.
  // We compare to `note` (the server's last-known shape) so reverting an
  // edit cleanly resets dirty state without a round-trip.
  const dirty = note !== null && (title !== note.title || body !== (note.body ?? ''));

  /** Imperatively save current title + body. Returns success. */
  const save = useCallback(async (): Promise<boolean> => {
    if (Number.isNaN(noteId)) return false;
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
        setError(json.message || `Save failed (HTTP ${r.status}).`);
        setSaveState('error');
        return false;
      }
      setNote(json.data as BrainNote);
      setSaveState('saved');
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setSaveState('error');
      return false;
    }
  }, [noteId, title, body]);

  // Debounced auto-save. Re-scheduled on every dirty change; cancelled on
  // unmount or when a manual save runs.
  useEffect(() => {
    if (!dirty) return;
    const handle = window.setTimeout(() => { save(); }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(handle);
    // We intentionally depend only on the inputs that should re-arm the
    // timer: title/body changes. `save` reads them from closures.
  }, [title, body, dirty, save]);

  // Reset the "saved" pip after a beat so it doesn't stick forever.
  useEffect(() => {
    if (saveState !== 'saved') return;
    const id = window.setTimeout(() => setSaveState('idle'), 2000);
    return () => window.clearTimeout(id);
  }, [saveState]);

  // Track this note in the recent ring so it shows up under "Recent" in the
  // Cmd-K palette next time.
  useEffect(() => {
    if (Number.isFinite(noteId)) pushRecentNoteId(noteId);
  }, [noteId]);

  // Global Cmd-K / Ctrl-K to open the palette from zen mode too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleCreate = useCallback(async () => {
    const r = await fetch('/api/portal/brain/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Untitled', body: '' }),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok && json.success && json.data?.id) {
      router.push(`/portal/brain/knowledge?id=${json.data.id}`);
    }
  }, [router]);

  const handleEditorReady = useCallback((view: EditorView | null) => {
    editorViewRef.current = view;
  }, []);

  const getEditorView = useCallback(() => editorViewRef.current, []);

  const patchMeta = useCallback(async (patch: Partial<BrainNote>) => {
    if (Number.isNaN(noteId)) return;
    const r = await fetch(`/api/portal/brain/knowledge/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await r.json().catch(() => ({}));
    if (r.ok && json.success) {
      setNote(json.data as BrainNote);
    } else {
      setError(json.message || 'Update failed.');
    }
  }, [noteId]);

  const handleDelete = useCallback(async () => {
    if (Number.isNaN(noteId) || !note) return;
    if (!confirm(`Delete "${note.title}"? This can't be undone.`)) return;
    const r = await fetch(`/api/portal/brain/knowledge/${noteId}`, { method: 'DELETE' });
    const json = await r.json().catch(() => ({}));
    if (r.ok && json.success) {
      router.push('/portal/brain/knowledge');
    } else {
      setError(json.message || 'Delete failed.');
    }
  }, [noteId, note, router]);

  if (Number.isNaN(noteId)) {
    return (
      <div className="max-w-4xl mx-auto py-12 text-center text-muted-foreground">
        Invalid note id.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-16 flex items-center justify-center gap-2 text-muted-foreground">
        <span className="material-icons animate-spin">progress_activity</span>
        Loading note…
      </div>
    );
  }

  if (!note) {
    return (
      <div className="max-w-4xl mx-auto py-12 space-y-3">
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-4 text-sm text-destructive">
          {error ?? 'Note not found.'}
        </div>
        <Link
          href="/portal/brain/knowledge"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent"
        >
          <span className="material-icons text-base">arrow_back</span>
          Back to knowledge
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => router.push('/portal/brain/knowledge')}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent"
        >
          <span className="material-icons text-base">arrow_back</span>
          Knowledge
        </button>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled note"
            className="w-full text-xl font-semibold bg-transparent border-0 border-b border-transparent focus:border-primary/50 px-1 py-1 focus:outline-none"
            aria-label="Note title"
          />
        </div>
        <SaveStatus state={saveState} dirty={dirty} />
        <button
          type="button"
          onClick={() => save()}
          disabled={!dirty || saveState === 'saving'}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <span className="material-icons text-base">save</span>
          Save
        </button>
        <NoteActionButtons
          note={note}
          onPatch={patchMeta}
          onDelete={handleDelete}
          showZenLink={false}
        />
      </div>

      <NoteMetaStrip note={note} onPatch={patchMeta} />

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Body: editor + side panels */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        <div className="min-w-0">
          <MarkdownEditor
            value={body}
            onChange={setBody}
            onSave={() => { save(); }}
            onEditorReady={handleEditorReady}
            minHeight={500}
            defaultMode="split"
            storageKey="brain.editor.detail.mode"
          />
        </div>

        <aside className="lg:sticky lg:top-4 bg-card border border-border rounded-lg overflow-hidden">
          <PanelTabs active={activePanel} onChange={setActivePanel} />
          <div className="max-h-[70vh] overflow-y-auto">
            {activePanel === 'outline' && (
              <NoteOutlinePanel body={body} getEditorView={getEditorView} />
            )}
            {activePanel === 'backlinks' && (
              <NoteBacklinksPanel noteId={note.id} />
            )}
            {activePanel === 'fields' && (
              <NoteCustomFieldsPanel noteId={note.id} />
            )}
          </div>
        </aside>
      </div>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onCreate={handleCreate}
        selectedNoteId={Number.isFinite(noteId) ? noteId : null}
      />
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
        Saving…
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
    return <span className="text-xs text-muted-foreground">Unsaved changes</span>;
  }
  return null;
}

function PanelTabs({
  active,
  onChange,
}: {
  active: SidePanel;
  onChange: (p: SidePanel) => void;
}): ReactNode {
  const tabs: Array<{ id: SidePanel; icon: string; label: string }> = useMemo(
    () => [
      { id: 'outline', icon: 'segment', label: 'Outline' },
      { id: 'backlinks', icon: 'link', label: 'Backlinks' },
      { id: 'fields', icon: 'tune', label: 'Fields' },
    ],
    [],
  );

  return (
    <div role="tablist" className="flex border-b border-border bg-muted/30">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            active === t.id
              ? 'text-foreground bg-background border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
          }`}
        >
          <span className="material-icons text-sm">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  );
}
