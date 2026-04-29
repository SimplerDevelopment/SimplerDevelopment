'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  createdAt: string;
  updatedAt: string;
}

function formatBytes(n: number | null): string {
  if (n === null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function fileIcon(mime: string | null): string {
  if (!mime) return 'attach_file';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'movie';
  if (mime.startsWith('audio/')) return 'audiotrack';
  if (mime === 'application/pdf') return 'picture_as_pdf';
  if (mime.includes('spreadsheet') || mime.includes('excel') || mime === 'text/csv') return 'table_chart';
  if (mime.includes('word') || mime.includes('document')) return 'description';
  if (mime.includes('zip') || mime.includes('compressed')) return 'folder_zip';
  return 'attach_file';
}

interface RelationshipOption {
  overlayId: number;
  name: string;
  type: string;
  underlying: 'company' | 'deal';
}

const CONFIDENTIALITY_BADGE: Record<BrainNote['confidentialityLevel'], string> = {
  standard: 'bg-muted text-muted-foreground',
  restricted: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  confidential: 'bg-red-500/10 text-red-700 dark:text-red-300',
};

const PAGE_SIZE = 50;

export default function BrainKnowledgePage() {
  const [notes, setNotes] = useState<BrainNote[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [tags, setTags] = useState<string[]>([]);
  const [relationships, setRelationships] = useState<RelationshipOption[]>([]);
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BrainNote | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (activeTag) params.set('tag', activeTag);
    if (pinnedOnly) params.set('pinned', 'true');
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String((page - 1) * PAGE_SIZE));

    async function safeJson(url: string): Promise<{ ok: boolean; data?: { success?: boolean; data?: unknown; message?: string }; status: number; raw?: string }> {
      try {
        const r = await fetch(url);
        const text = await r.text();
        if (!text) return { ok: r.ok, status: r.status };
        try {
          return { ok: r.ok, data: JSON.parse(text), status: r.status };
        } catch {
          return { ok: r.ok, status: r.status, raw: text.slice(0, 500) };
        }
      } catch (err) {
        return { ok: false, status: 0, raw: err instanceof Error ? err.message : 'Network error' };
      }
    }

    const [notesRes, tagsRes, relRes] = await Promise.all([
      safeJson(`/api/portal/brain/knowledge?${params.toString()}`),
      safeJson('/api/portal/brain/knowledge?tags=true'),
      safeJson('/api/portal/brain/relationships'),
    ]);

    // Notes is the page's primary resource — surface its failure first.
    if (notesRes.data?.success) {
      const payload = notesRes.data.data as { items: BrainNote[]; total: number; limit: number; offset: number };
      setNotes(payload.items);
      setTotal(payload.total);
      setError(null);
    } else {
      const msg = notesRes.data?.message
        || notesRes.raw
        || (notesRes.status === 401 ? 'Not signed in.' : `Failed to load notes (HTTP ${notesRes.status}).`);
      setError(msg);
      setNotes([]);
      setTotal(0);
    }

    if (tagsRes.data?.success) {
      const tagsData = tagsRes.data.data as { tags?: string[] } | undefined;
      setTags(tagsData?.tags ?? []);
    }
    if (relRes.data?.success) {
      const list: RelationshipOption[] = ((relRes.data.data as Array<{
        overlay: { id: number; relationshipType: string };
        underlying: { type: 'company' | 'deal'; name: string };
      }>) ?? []).map((r) => ({
        overlayId: r.overlay.id,
        name: r.underlying.name,
        type: r.overlay.relationshipType,
        underlying: r.underlying.type,
      }));
      setRelationships(list);
    }
  }, [search, activeTag, pinnedOnly, page]);

  useEffect(() => { load(); }, [load]);

  // Reset to page 1 whenever filters change, otherwise the user can land on
  // an empty page (e.g. on page 5 of 5, switch tags, new filter only has 2 pages).
  useEffect(() => {
    setPage(1);
  }, [search, activeTag, pinnedOnly]);

  const openCreate = () => { setEditing(null); setShowForm(true); };
  const openEdit = (note: BrainNote) => { setEditing(note); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };

  const handleSave = async (payload: NoteFormValues, file: File | null) => {
    setCreating(true);
    try {
      // New note + attachment → multipart upload route, which uploads to S3
      // and creates the note in one call.
      if (!editing && file) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', payload.title);
        fd.append('body', payload.body);
        fd.append('tags', JSON.stringify(payload.tags));
        fd.append('confidentialityLevel', payload.confidentialityLevel);
        fd.append('pinned', String(payload.pinned));
        if (payload.relationshipOverlayId !== null) fd.append('relationshipOverlayId', String(payload.relationshipOverlayId));

        const res = await fetch('/api/portal/brain/knowledge/upload', {
          method: 'POST',
          body: fd,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success) {
          setError(json.message || 'Upload failed.');
          return;
        }
        closeForm();
        await load();
        return;
      }

      const url = editing
        ? `/api/portal/brain/knowledge/${editing.id}`
        : '/api/portal/brain/knowledge';
      const method = editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.message || 'Save failed.');
        return;
      }
      closeForm();
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleClearAttachment = async (note: BrainNote) => {
    if (!confirm(`Remove the attached file "${note.attachmentFilename}"?`)) return;
    const res = await fetch(`/api/portal/brain/knowledge/${note.id}/attachment`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      setError(json.message || 'Failed to remove attachment.');
      return;
    }
    await load();
  };

  const handleDelete = async (note: BrainNote) => {
    if (!confirm(`Delete "${note.title}"?`)) return;
    const res = await fetch(`/api/portal/brain/knowledge/${note.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok || !json.success) {
      setError(json.message || 'Delete failed.');
      return;
    }
    await load();
  };

  const togglePin = async (note: BrainNote) => {
    await fetch(`/api/portal/brain/knowledge/${note.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: !note.pinned }),
    });
    await load();
  };

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="material-icons text-primary">menu_book</span>
            Knowledge
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Notes and reference material linked to relationships, deals, and meetings. Pin the ones you reach for daily.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/brain"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent"
          >
            <span className="material-icons text-base">arrow_back</span>
            Brain
          </Link>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">add</span>
            New note
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex-1 relative">
          <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">search</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search notes…"
            className="w-full pl-9 pr-3 py-1.5 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={pinnedOnly}
            onChange={(e) => setPinnedOnly(e.target.checked)}
            className="h-4 w-4"
          />
          Pinned only
        </label>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Tags:</span>
          <button
            onClick={() => setActiveTag(null)}
            className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
              activeTag === null ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            all
          </button>
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTag(activeTag === t ? null : t)}
              className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${
                activeTag === t ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {notes === null ? (
        <div className="text-muted-foreground flex items-center gap-2 py-10 justify-center">
          <span className="material-icons animate-spin">progress_activity</span>
          Loading notes…
        </div>
      ) : notes.length === 0 ? (
        <div className="bg-muted/30 border border-border rounded-xl p-10 text-center">
          <span className="material-icons text-5xl text-muted-foreground">menu_book</span>
          <h3 className="font-semibold mt-3">No notes yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Capture context about a relationship, a deal, a one-off insight — anything you'll want to find later.
          </p>
          <button
            onClick={openCreate}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">add</span>
            New note
          </button>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {notes.map((n) => (
              <NoteCard
                key={n.id}
                note={n}
                relationships={relationships}
                onEdit={() => openEdit(n)}
                onDelete={() => handleDelete(n)}
                onTogglePin={() => togglePin(n)}
                onClearAttachment={() => handleClearAttachment(n)}
              />
            ))}
          </ul>
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onChange={setPage}
          />
        </>
      )}

      {/* New / edit form — modal overlay */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
          onClick={closeForm}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl my-8"
          >
            <NoteForm
              note={editing}
              relationships={relationships}
              allTags={tags}
              saving={creating}
              onCancel={closeForm}
              onSave={handleSave}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NoteCard({
  note,
  relationships,
  onEdit,
  onDelete,
  onTogglePin,
  onClearAttachment,
}: {
  note: BrainNote;
  relationships: RelationshipOption[];
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onClearAttachment: () => void;
}) {
  const linkedRel = note.relationshipOverlayId
    ? relationships.find((r) => r.overlayId === note.relationshipOverlayId)
    : null;

  const preview = note.body.length > 220 ? note.body.slice(0, 220) + '…' : note.body;

  return (
    <li className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {note.pinned && <span className="material-icons text-sm text-amber-500" title="Pinned">push_pin</span>}
            <h3 className="font-semibold text-foreground truncate">{note.title}</h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CONFIDENTIALITY_BADGE[note.confidentialityLevel]}`}>
              {note.confidentialityLevel}
            </span>
            {note.source !== 'manual' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300">
                {note.source.replace('_', ' ')}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            <span>Updated {new Date(note.updatedAt).toLocaleDateString()}</span>
            {linkedRel && (
              <Link href={`/portal/brain/relationships/${linkedRel.overlayId}`} className="hover:text-primary inline-flex items-center gap-0.5">
                <span className="material-icons text-sm">{linkedRel.underlying === 'company' ? 'business' : 'handshake'}</span>
                {linkedRel.name}
              </Link>
            )}
            {note.meetingId && (
              <Link href={`/portal/brain/meetings/${note.meetingId}`} className="hover:text-primary inline-flex items-center gap-0.5">
                <span className="material-icons text-sm">forum</span>
                meeting
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onTogglePin}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
            title={note.pinned ? 'Unpin' : 'Pin'}
          >
            <span className="material-icons text-base">{note.pinned ? 'push_pin' : 'pin'}</span>
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent"
            title="Edit"
          >
            <span className="material-icons text-base">edit</span>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            title="Delete"
          >
            <span className="material-icons text-base">delete</span>
          </button>
        </div>
      </div>
      {note.attachmentUrl && note.attachmentFilename && (
        <div className="mt-3 inline-flex items-center gap-2 bg-muted/40 border border-border rounded-md px-2.5 py-1.5 max-w-full">
          <span className="material-icons text-base text-primary shrink-0">{fileIcon(note.attachmentMimeType)}</span>
          <a
            href={note.attachmentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-foreground hover:text-primary truncate min-w-0"
            title={note.attachmentFilename}
          >
            {note.attachmentFilename}
          </a>
          <span className="text-xs text-muted-foreground shrink-0">{formatBytes(note.attachmentFileSize)}</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onClearAttachment(); }}
            className="text-muted-foreground hover:text-destructive p-0.5 shrink-0"
            title="Remove file"
          >
            <span className="material-icons text-sm">close</span>
          </button>
        </div>
      )}
      {preview && (
        <p className="text-sm text-muted-foreground mt-3 whitespace-pre-wrap leading-relaxed">{preview}</p>
      )}
      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {note.tags.map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t}</span>
          ))}
        </div>
      )}
    </li>
  );
}

interface NoteFormValues {
  title: string;
  body: string;
  tags: string[];
  relationshipOverlayId: number | null;
  confidentialityLevel: 'standard' | 'restricted' | 'confidential';
  pinned: boolean;
}

function NoteForm({
  note,
  relationships,
  allTags,
  saving,
  onCancel,
  onSave,
}: {
  note: BrainNote | null;
  relationships: RelationshipOption[];
  allTags: string[];
  saving: boolean;
  onCancel: () => void;
  onSave: (v: NoteFormValues, file: File | null) => void;
}) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [body, setBody] = useState(note?.body ?? '');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [relationshipOverlayId, setRelationshipOverlayId] = useState<number | null>(note?.relationshipOverlayId ?? null);
  const [confidentialityLevel, setConfidentialityLevel] = useState<NoteFormValues['confidentialityLevel']>(note?.confidentialityLevel ?? 'standard');
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const tagSuggestions = useMemo(() => {
    if (!tagInput.trim()) return [];
    return allTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase().trim()) && !tags.includes(t));
  }, [tagInput, allTags, tags]);

  const addTag = (t: string) => {
    const v = t.trim();
    if (!v || tags.includes(v)) return;
    setTags([...tags, v]);
    setTagInput('');
  };

  const handleFileChange = (selected: File | null) => {
    setFile(selected);
    // Auto-fill title from filename when title is empty.
    if (selected && !title.trim()) {
      setTitle(selected.name);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({ title: title.trim(), body, tags, relationshipOverlayId, confidentialityLevel, pinned }, file);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{note ? 'Edit note' : 'New note'}</h2>
        <button type="button" onClick={onCancel} className="p-1 text-muted-foreground hover:text-foreground">
          <span className="material-icons text-lg">close</span>
        </button>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Q2 strategy notes…"
          required
          className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Body</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder="Markdown supported."
          className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {!note && (
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Attach file (optional)
          </label>
          {file ? (
            <div className="mt-1 flex items-center gap-2 bg-muted/40 border border-border rounded-md px-3 py-2">
              <span className="material-icons text-base text-primary shrink-0">{fileIcon(file.type)}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm truncate">{file.name}</div>
                <div className="text-xs text-muted-foreground">{formatBytes(file.size)}</div>
              </div>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-muted-foreground hover:text-destructive p-1 shrink-0"
                title="Remove file"
              >
                <span className="material-icons text-base">close</span>
              </button>
            </div>
          ) : (
            <label
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) handleFileChange(f);
              }}
              className={`mt-1 flex flex-col items-center justify-center gap-1 px-4 py-6 rounded-md border-2 border-dashed transition-colors cursor-pointer ${
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-accent/40'
              }`}
            >
              <span className="material-icons text-3xl text-muted-foreground">cloud_upload</span>
              <span className="text-sm font-medium">Drop a file here or click to browse</span>
              <span className="text-xs text-muted-foreground">Max 10 MB · any file type</span>
              <input
                type="file"
                className="sr-only"
                onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Linked relationship</label>
          <select
            value={relationshipOverlayId ?? ''}
            onChange={(e) => setRelationshipOverlayId(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">— None —</option>
            {relationships.map((r) => (
              <option key={r.overlayId} value={r.overlayId}>
                {r.name} {r.underlying === 'company' ? '(company)' : '(deal)'}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Confidentiality</label>
          <select
            value={confidentialityLevel}
            onChange={(e) => setConfidentialityLevel(e.target.value as NoteFormValues['confidentialityLevel'])}
            className="mt-1 w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="standard">Standard</option>
            <option value="restricted">Restricted</option>
            <option value="confidential">Confidential</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</label>
        <div className="mt-1 flex flex-wrap gap-1.5 mb-2">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted">
              {t}
              <button type="button" onClick={() => setTags(tags.filter(x => x !== t))} className="text-muted-foreground hover:text-destructive">
                <span className="material-icons text-xs">close</span>
              </button>
            </span>
          ))}
        </div>
        <div className="relative">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            placeholder="Type a tag and press enter"
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {tagSuggestions.length > 0 && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-auto">
              {tagSuggestions.slice(0, 8).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => addTag(s)}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={pinned}
          onChange={(e) => setPinned(e.target.checked)}
          className="h-4 w-4"
        />
        Pin to top of list
      </label>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium disabled:opacity-50"
        >
          {saving ? (
            <><span className="material-icons text-base animate-spin">progress_activity</span>Saving…</>
          ) : (
            <><span className="material-icons text-base">check</span>{note ? 'Save changes' : (file ? 'Upload & save' : 'Create note')}</>
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-3 pt-2 text-sm">
      <div className="text-muted-foreground">
        {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(1)}
          disabled={page === 1}
          aria-label="First page"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <span className="material-icons text-base">first_page</span>
        </button>
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <span className="material-icons text-base">chevron_left</span>
        </button>
        <span className="px-2 text-muted-foreground tabular-nums">
          page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          aria-label="Next page"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <span className="material-icons text-base">chevron_right</span>
        </button>
        <button
          type="button"
          onClick={() => onChange(totalPages)}
          disabled={page === totalPages}
          aria-label="Last page"
          className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <span className="material-icons text-base">last_page</span>
        </button>
      </div>
    </div>
  );
}
