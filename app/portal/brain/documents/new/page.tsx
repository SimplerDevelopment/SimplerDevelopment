'use client';

/**
 * Brain Documents — create page.
 *
 * Form for CreateDocumentInput: title, category, ownerId (user picker),
 * confidentialityLevel, defaultTopicIds (TopicPicker), source note
 * (optional — search via /api/portal/brain/knowledge?search=).
 *
 * If a source note is selected, POST goes to /promote-from-note instead so
 * the new document's v1 draft is seeded with the note's body. Otherwise we
 * hit POST /documents which creates an empty v1 draft.
 *
 * Either way, on success we redirect to /[id]/edit so the author can start
 * writing immediately.
 */

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import TopicPicker from '@/components/brain/TopicPicker';
import type { BrainDocumentCategory } from '@/lib/brain/documents';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pInput, pSelect, pCardPad } from '@/components/portal/portal-ui';

interface UserOption { id: number; name: string | null }
interface NoteOption { id: number; title: string }

const CATEGORIES: BrainDocumentCategory[] = ['sop', 'policy', 'guide', 'reference', 'announcement', 'other'];
const CATEGORY_LABEL: Record<BrainDocumentCategory, string> = {
  sop: 'SOP',
  policy: 'Policy',
  guide: 'Guide',
  reference: 'Reference',
  announcement: 'Announcement',
  other: 'Other',
};

export default function BrainDocumentNewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?source=note pre-opens the note-picker section.
  const preferNoteSource = searchParams.get('source') === 'note';

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<BrainDocumentCategory>('reference');
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [confidentialityLevel, setConfidentialityLevel] = useState<'standard' | 'restricted' | 'confidential'>('standard');
  const [defaultTopicIds, setDefaultTopicIds] = useState<number[]>([]);

  // Source-note section
  const [useNoteSource, setUseNoteSource] = useState(preferNoteSource);
  const [noteSearch, setNoteSearch] = useState('');
  const [noteOptions, setNoteOptions] = useState<NoteOption[]>([]);
  const [pickedNoteId, setPickedNoteId] = useState<number | null>(null);
  const [noteSearchLoading, setNoteSearchLoading] = useState(false);
  const noteSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Load mentionable-users list (for owner picker) ────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/portal/mentionable-users');
        const json = await r.json();
        if (cancelled || !json.success) return;
        setUsers(json.data ?? []);
      } catch { /* non-fatal */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ─── Debounced note search ─────────────────────────────────────────────────
  const runNoteSearch = useCallback(async (q: string) => {
    setNoteSearchLoading(true);
    try {
      const url = q.trim()
        ? `/api/portal/brain/knowledge?search=${encodeURIComponent(q.trim())}&limit=20`
        : '/api/portal/brain/knowledge?limit=20';
      const r = await fetch(url);
      const json = await r.json();
      if (r.ok && json.success) {
        const items = (json.data?.items ?? []) as Array<{ id: number; title: string }>;
        setNoteOptions(items);
      }
    } finally {
      setNoteSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!useNoteSource) return;
    if (noteSearchDebounceRef.current) clearTimeout(noteSearchDebounceRef.current);
    noteSearchDebounceRef.current = setTimeout(() => {
      runNoteSearch(noteSearch);
    }, 250);
  }, [noteSearch, useNoteSource, runNoteSearch]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!title.trim() && !pickedNoteId) {
      setError('Title is required (or pick a source note to inherit its title).');
      return;
    }
    setSubmitting(true);
    try {
      if (useNoteSource && pickedNoteId !== null) {
        // Promote-from-note path.
        const body: Record<string, unknown> = { noteId: pickedNoteId, category };
        if (title.trim()) body.title = title.trim();
        const r = await fetch('/api/portal/brain/documents/promote-from-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const json = await r.json();
        if (!r.ok || !json.success) {
          setError(json.message || 'Promote failed.');
          return;
        }
        const docId = json.data?.document?.id;
        router.push(`/portal/brain/documents/${docId}/edit`);
        return;
      }

      // Plain create path.
      const r = await fetch('/api/portal/brain/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          category,
          ownerId: ownerId ?? undefined,
          confidentialityLevel,
          defaultTopicIds: defaultTopicIds.length ? defaultTopicIds : undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Create failed.');
        return;
      }
      const docId = json.data?.document?.id;
      router.push(`/portal/brain/documents/${docId}/edit`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-5">
      <nav className="text-xs text-muted-foreground flex items-center gap-1">
        <Link href="/portal/brain/documents" className="hover:text-foreground inline-flex items-center gap-0.5">
          <span className="material-icons text-sm">description</span>
          Documents
        </Link>
        <span className="material-icons text-sm">chevron_right</span>
        <span>New</span>
      </nav>

      <PortalPageHeader
        eyebrow="Company Brain"
        title={
          <span className="flex items-center gap-2">
            <span className="material-icons text-primary">add</span>
            New document
          </span>
        }
        subtitle="Start a fresh SOP or promote an existing note into a versioned document."
      />

      <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div>
          <label htmlFor="doc-title" className="block text-xs font-medium text-foreground mb-1">Title</label>
          <input
            id="doc-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={useNoteSource ? 'Optional — leave blank to use the note title' : 'e.g., Customer onboarding SOP'}
            className={pInput}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="doc-cat" className="block text-xs font-medium text-foreground mb-1">Category</label>
            <select
              id="doc-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as BrainDocumentCategory)}
              className={pSelect}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="doc-conf" className="block text-xs font-medium text-foreground mb-1">Confidentiality</label>
            <select
              id="doc-conf"
              value={confidentialityLevel}
              onChange={(e) => setConfidentialityLevel(e.target.value as 'standard' | 'restricted' | 'confidential')}
              className={pSelect}
            >
              <option value="standard">Standard</option>
              <option value="restricted">Restricted</option>
              <option value="confidential">Confidential</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="doc-owner" className="block text-xs font-medium text-foreground mb-1">Owner</label>
          <select
            id="doc-owner"
            value={ownerId ?? ''}
            onChange={(e) => setOwnerId(e.target.value ? parseInt(e.target.value, 10) : null)}
            className={pSelect}
          >
            <option value="">— Unassigned —</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? `User #${u.id}`}</option>)}
          </select>
        </div>

        <div>
          <span className="block text-xs font-medium text-foreground mb-1">Default topics (optional)</span>
          <TopicPicker
            selectedTopicIds={defaultTopicIds}
            onChange={setDefaultTopicIds}
            allowCreate={false}
            placeholder="Add a topic…"
          />
        </div>

        {/* Source-note section */}
        <div className="rounded-md border border-dashed border-border p-3 bg-muted/20">
          <label className="flex items-center gap-2 text-xs font-medium text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useNoteSource}
              onChange={(e) => {
                setUseNoteSource(e.target.checked);
                if (!e.target.checked) setPickedNoteId(null);
              }}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span className="material-icons text-base text-muted-foreground">file_upload</span>
            Seed this document from an existing note
          </label>

          {useNoteSource && (
            <div className="mt-2 space-y-2">
              <input
                type="text"
                value={noteSearch}
                onChange={(e) => setNoteSearch(e.target.value)}
                placeholder="Search notes…"
                className={pInput}
              />
              <div className="max-h-48 overflow-y-auto bg-background border border-border rounded-md">
                {noteSearchLoading ? (
                  <div className="text-center py-4 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                    <span className="material-icons animate-spin text-sm">progress_activity</span>
                    Searching…
                  </div>
                ) : noteOptions.length === 0 ? (
                  <p className="text-center py-4 text-xs text-muted-foreground">No notes found.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {noteOptions.map((n) => (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => setPickedNoteId(n.id)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-accent/60 transition-colors ${
                            pickedNoteId === n.id ? 'bg-primary/10' : ''
                          }`}
                        >
                          {n.title || `Note #${n.id}`}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Link href="/portal/brain/documents" className={pBtnGhost}>
            Cancel
          </Link>
          <button type="submit" disabled={submitting} className={pBtnPrimary}>
            {submitting
              ? <><span className="material-icons animate-spin text-base">progress_activity</span>Creating…</>
              : <><span className="material-icons text-base">add</span>Create &amp; open editor</>}
          </button>
        </div>
      </form>
    </div>
  );
}
