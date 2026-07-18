'use client';

/**
 * Brain Documents — draft editor page.
 *
 * Inline markdown editor for the current draft version. Layout:
 *   - Title field (PATCH /documents/[id] on debounced change)
 *   - Category dropdown (PATCH /documents/[id])
 *   - Summary field (writes to brain_document_versions.summary)
 *   - changeNotes textarea (writes to brain_document_versions.changeNotes)
 *   - DocumentMarkdownEditor (textarea + live preview)
 *   - Publish button (POST /publish; catches empty-body error inline)
 *
 * Save semantics:
 *   - Title / category PATCH the document on debounce (600ms).
 *   - Body / summary / changeNotes POST the version on debounce (800ms),
 *     which `editDraftVersion` upserts onto the current draft.
 *   - A small "Saved …" indicator on each row reflects the last successful
 *     write.
 */

import Link from 'next/link';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import DocumentMarkdownEditor from '@/components/brain/DocumentMarkdownEditor';
import type {
  BrainDocument,
  BrainDocumentVersion,
  BrainDocumentCategory,
} from '@/lib/brain/documents';
import { pBtnPrimary, pBtnGhost, pCardPad, pInput, pSelect, pSectionTitle } from '@/components/portal/portal-ui';

interface LoadedData {
  document: BrainDocument;
  currentDraftVersion?: BrainDocumentVersion;
  currentPublishedVersion?: BrainDocumentVersion;
}

const CATEGORIES: BrainDocumentCategory[] = ['sop', 'policy', 'guide', 'reference', 'announcement', 'other'];
const CATEGORY_LABEL: Record<BrainDocumentCategory, string> = {
  sop: 'SOP',
  policy: 'Policy',
  guide: 'Guide',
  reference: 'Reference',
  announcement: 'Announcement',
  other: 'Other',
};

function relativeTime(d: Date | null): string {
  if (!d) return '';
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return d.toLocaleTimeString();
}

export default function BrainDocumentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const documentId = parseInt(id, 10);
  const router = useRouter();

  const [data, setData] = useState<LoadedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable fields (controlled).
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<BrainDocumentCategory>('reference');
  const [body, setBody] = useState('');
  const [summary, setSummary] = useState('');
  const [changeNotes, setChangeNotes] = useState('');

  // Saved indicators.
  const [titleSavedAt, setTitleSavedAt] = useState<Date | null>(null);
  const [bodySavedAt, setBodySavedAt] = useState<Date | null>(null);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingBody, setSavingBody] = useState(false);

  // Publish flow.
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const dirtyMetaRef = useRef(false);
  const dirtyVersionRef = useRef(false);
  const metaDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const versionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}?includeBody=true`);
      const json = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setLoadError(json.message || 'Failed to load document.');
        return;
      }
      const loaded = json.data as LoadedData;
      setData(loaded);
      setTitle(loaded.document.title);
      setCategory(loaded.document.category);
      // If there's a current draft version, edit that. Else seed from latest
      // published. Else start blank.
      const seed = loaded.currentDraftVersion ?? loaded.currentPublishedVersion;
      setBody(seed?.body ?? '');
      setSummary(seed?.summary ?? '');
      setChangeNotes(seed?.changeNotes ?? '');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() defers setState into async IIFE; trigger fires synchronously by design
  useEffect(() => { load(); }, [load]);

  // ─── Debounced metadata save (title + category) ────────────────────────────
  const saveMeta = useCallback(async () => {
    if (!dirtyMetaRef.current) return;
    setSavingTitle(true);
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || 'Untitled', category }),
      });
      const json = await r.json();
      if (r.ok && json.success) {
        setTitleSavedAt(new Date());
        dirtyMetaRef.current = false;
      }
    } finally {
      setSavingTitle(false);
    }
  }, [documentId, title, category]);

  useEffect(() => {
    if (loading || loadError) return;
    if (!data) return;
    // First-load arrivals shouldn't trip the dirty flag — only changes do.
    if (title === data.document.title && category === data.document.category) return;
    dirtyMetaRef.current = true;
    if (metaDebounceRef.current) clearTimeout(metaDebounceRef.current);
    metaDebounceRef.current = setTimeout(() => { saveMeta(); }, 600);
    return () => {
      if (metaDebounceRef.current) clearTimeout(metaDebounceRef.current);
    };
  }, [title, category, data, loading, loadError, saveMeta]);

  // ─── Debounced version body save ───────────────────────────────────────────
  const saveVersion = useCallback(async () => {
    if (!dirtyVersionRef.current) return;
    setSavingBody(true);
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          summary: summary || null,
          changeNotes: changeNotes || null,
        }),
      });
      const json = await r.json();
      if (r.ok && json.success) {
        setBodySavedAt(new Date());
        dirtyVersionRef.current = false;
      }
    } finally {
      setSavingBody(false);
    }
  }, [documentId, body, summary, changeNotes]);

  useEffect(() => {
    if (loading || loadError || !data) return;
    const seed = data.currentDraftVersion ?? data.currentPublishedVersion;
    const seedBody = seed?.body ?? '';
    const seedSummary = seed?.summary ?? '';
    const seedNotes = seed?.changeNotes ?? '';
    if (body === seedBody && summary === seedSummary && changeNotes === seedNotes) return;
    dirtyVersionRef.current = true;
    if (versionDebounceRef.current) clearTimeout(versionDebounceRef.current);
    versionDebounceRef.current = setTimeout(() => { saveVersion(); }, 800);
    return () => {
      if (versionDebounceRef.current) clearTimeout(versionDebounceRef.current);
    };
  }, [body, summary, changeNotes, data, loading, loadError, saveVersion]);

  // ─── Publish ───────────────────────────────────────────────────────────────
  const publish = async () => {
    setPublishError(null);
    // Flush any pending saves first so the publish doesn't fire against stale state.
    if (dirtyVersionRef.current) await saveVersion();
    if (dirtyMetaRef.current) await saveMeta();
    setPublishing(true);
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}/publish`, { method: 'POST' });
      const json = await r.json();
      if (!r.ok || !json.success) {
        const message = json?.message ?? '';
        if (/empty body|add content/i.test(message)) {
          setPublishError('Add some content before publishing.');
        } else {
          setPublishError(message || 'Publish failed.');
        }
        return;
      }
      router.push(`/portal/brain/documents/${documentId}`);
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-12 flex items-center justify-center text-muted-foreground text-sm">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="max-w-5xl mx-auto py-12 px-4">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load this document
          </div>
          <p>{loadError ?? 'Not found'}</p>
          <Link href="/portal/brain/documents" className="inline-flex items-center gap-1 mt-3 text-xs underline">
            <span className="material-icons text-sm">arrow_back</span>
            Back to documents
          </Link>
        </div>
      </div>
    );
  }

  const titleSavedHint = savingTitle ? 'Saving…' : titleSavedAt ? `Saved ${relativeTime(titleSavedAt)}` : '';
  const bodySavedHint = savingBody ? 'Saving…' : bodySavedAt ? `Saved ${relativeTime(bodySavedAt)}` : '';

  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-4">
      <nav className="text-xs text-muted-foreground flex items-center gap-1">
        <Link href="/portal/brain/documents" className="hover:text-foreground inline-flex items-center gap-0.5">
          <span className="material-icons text-sm">description</span>
          Documents
        </Link>
        <span className="material-icons text-sm">chevron_right</span>
        <Link href={`/portal/brain/documents/${documentId}`} className="hover:text-foreground truncate max-w-[20rem]">
          {data.document.title}
        </Link>
        <span className="material-icons text-sm">chevron_right</span>
        <span>Edit draft</span>
      </nav>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className={`${pSectionTitle} flex items-center gap-2`}>
            <span className="material-icons text-primary">edit_note</span>
            Edit draft
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Changes save automatically. Publish when ready — the document becomes the canonical answer.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/portal/brain/documents/${documentId}`}
            className={pBtnGhost}
          >
            <span className="material-icons text-base">visibility</span>
            View
          </Link>
          <button
            type="button"
            onClick={publish}
            disabled={publishing || !body.trim()}
            className={pBtnPrimary}
          >
            {publishing
              ? <><span className="material-icons text-base animate-spin">progress_activity</span>Publishing…</>
              : <><span className="material-icons text-base">publish</span>Publish</>}
          </button>
        </div>
      </header>

      {publishError && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-xs text-destructive">
          {publishError}
        </div>
      )}

      {/* Metadata row */}
      <div className={`${pCardPad} space-y-3`}>
        <div className="grid sm:grid-cols-[1fr_220px] gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="doc-edit-title" className="text-xs font-medium text-foreground">Title</label>
              {titleSavedHint && (
                <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
                  <span className="material-icons text-[12px]">cloud_done</span>
                  {titleSavedHint}
                </span>
              )}
            </div>
            <input
              id="doc-edit-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${pInput} text-base font-semibold`}
            />
          </div>
          <div>
            <label htmlFor="doc-edit-cat" className="block text-xs font-medium text-foreground mb-1">Category</label>
            <select
              id="doc-edit-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as BrainDocumentCategory)}
              className={pSelect}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="doc-edit-summary" className="block text-xs font-medium text-foreground mb-1">Summary (optional)</label>
          <input
            id="doc-edit-summary"
            type="text"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="One-line description that shows above the body."
            className={pInput}
          />
        </div>

        <div>
          <label htmlFor="doc-edit-notes" className="block text-xs font-medium text-foreground mb-1">Change notes (optional)</label>
          <textarea
            id="doc-edit-notes"
            value={changeNotes}
            onChange={(e) => setChangeNotes(e.target.value)}
            placeholder="What changed in this draft? Shown in version history."
            rows={2}
            className={`${pInput} resize-y`}
          />
        </div>
      </div>

      {/* Body editor */}
      <div className={pCardPad}>
        <DocumentMarkdownEditor
          value={body}
          onChange={setBody}
          savedHint={bodySavedHint}
        />
      </div>
    </div>
  );
}
