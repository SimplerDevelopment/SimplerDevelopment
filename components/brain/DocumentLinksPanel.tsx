'use client';

/**
 * DocumentLinksPanel — tabbed list of entities linked to a document.
 *
 * Six linkable entity types per `lib/brain/documents.ts`:
 *   topic | initiative | decision | meeting | glossary_term | person
 *
 * Each tab shows the rows for that type and a "+ Link" button opens an
 * entity-picker dialog that searches the relevant collection endpoint.
 * Mirrors the pattern in InitiativeLinksPanel — kept independent so the two
 * panels can evolve separately (initiatives links use a different shape).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ResolvedDocumentLink,
  BrainDocumentLinkEntityType,
} from '@/lib/brain/documents';

const ENTITY_TYPES: BrainDocumentLinkEntityType[] = [
  'topic',
  'initiative',
  'decision',
  'meeting',
  'glossary_term',
  'person',
];

const META: Record<BrainDocumentLinkEntityType, { label: string; plural: string; icon: string }> = {
  topic:         { label: 'Topic',         plural: 'Topics',     icon: 'account_tree' },
  initiative:    { label: 'Initiative',    plural: 'Initiatives', icon: 'flag' },
  decision:      { label: 'Decision',      plural: 'Decisions',  icon: 'gavel' },
  meeting:       { label: 'Meeting',       plural: 'Meetings',   icon: 'event' },
  glossary_term: { label: 'Glossary term', plural: 'Glossary',   icon: 'menu_book' },
  person:        { label: 'Person',        plural: 'People',     icon: 'person' },
};

interface Props {
  documentId: number;
  links: ResolvedDocumentLink[];
  onChanged?: () => void;
}

export default function DocumentLinksPanel({ documentId, links, onChanged }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<BrainDocumentLinkEntityType, ResolvedDocumentLink[]>();
    for (const l of links) {
      const arr = map.get(l.entityType) ?? [];
      arr.push(l);
      map.set(l.entityType, arr);
    }
    return map;
  }, [links]);

  const orderedTypes = ENTITY_TYPES.filter((t) => grouped.has(t));
  const [activeTypeRaw, setActiveType] = useState<BrainDocumentLinkEntityType | null>(null);
  const activeType: BrainDocumentLinkEntityType | null =
    activeTypeRaw !== null && orderedTypes.includes(activeTypeRaw)
      ? activeTypeRaw
      : (orderedTypes[0] ?? null);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unlink = useCallback(async (item: ResolvedDocumentLink) => {
    if (!confirm(`Unlink this ${META[item.entityType].label.toLowerCase()}?`)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}/links`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: item.entityType, entityId: item.entityId }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setErr(json.message || 'Failed to unlink.');
        return;
      }
      onChanged?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }, [documentId, onChanged]);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-foreground inline-flex items-center gap-2">
          <span className="material-icons text-base text-primary">hub</span>
          Linked entities
          <span className="text-xs text-muted-foreground font-normal">({links.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border text-foreground hover:bg-accent"
        >
          <span className="material-icons text-sm">add_link</span>
          Link
        </button>
      </div>

      {err && (
        <div className="mt-3 bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
          {err}
        </div>
      )}

      {orderedTypes.length === 0 ? (
        <div className="mt-4 text-center py-6 text-xs text-muted-foreground bg-muted/30 rounded-md border border-dashed border-border">
          Nothing linked yet. Attach topics, initiatives, decisions, meetings, glossary terms, or people to give this doc context.
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-1 border-b border-border overflow-x-auto">
            {orderedTypes.map((t) => {
              const meta = META[t];
              const count = grouped.get(t)?.length ?? 0;
              return (
                <button
                  key={t}
                  onClick={() => setActiveType(t)}
                  className={`px-2.5 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                    activeType === t
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="material-icons text-sm">{meta.icon}</span>
                  {meta.plural}
                  <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 space-y-1.5">
            {activeType && grouped.get(activeType)?.map((item) => (
              <div
                key={`${item.entityType}:${item.entityId}`}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors"
              >
                <span className="material-icons text-base text-muted-foreground">
                  {META[item.entityType].icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground truncate">
                    {item.title ?? `${META[item.entityType].label} #${item.entityId}`}
                  </div>
                  {item.note && (
                    <div className="text-[11px] text-muted-foreground truncate">{item.note}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => unlink(item)}
                  disabled={busy}
                  className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded disabled:opacity-50"
                  title="Unlink"
                  aria-label="Unlink"
                >
                  <span className="material-icons text-sm">close</span>
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {pickerOpen && (
        <LinkPickerDialog
          documentId={documentId}
          onClose={() => setPickerOpen(false)}
          onLinked={() => { setPickerOpen(false); onChanged?.(); }}
        />
      )}
    </div>
  );
}

// ─── picker dialog ───────────────────────────────────────────────────────────

interface PickerOption {
  id: number;
  label: string;
  secondary?: string;
}

function LinkPickerDialog({
  documentId,
  onClose,
  onLinked,
}: {
  documentId: number;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [type, setType] = useState<BrainDocumentLinkEntityType>('topic');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    setOptions([]);
    setPickedId(null);
    try {
      const opts = await fetchPickerOptions(type, search);
      setOptions(opts);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to load options');
    } finally {
      setLoading(false);
    }
  }, [type, search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const submit = async () => {
    if (pickedId === null) return;
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: type,
          entityId: pickedId,
          note: note.trim() || undefined,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setErr(json.message || 'Failed to link.');
        return;
      }
      onLinked();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg shadow-xl max-w-lg w-full p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Link an entity</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Attach a topic, initiative, decision, meeting, glossary term, or person.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <span className="material-icons text-lg">close</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Type</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as BrainDocumentLinkEntityType)}
              className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{META[t].label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Search</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Title or name…"
              className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </label>
        </div>

        <div className="max-h-48 overflow-y-auto bg-muted/30 border border-border rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              <span className="material-icons animate-spin text-base mr-1.5">progress_activity</span>
              Loading…
            </div>
          ) : options.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground">
              No {META[type].plural.toLowerCase()} found.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {options.map((opt) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => setPickedId(opt.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-accent/60 transition-colors ${
                      pickedId === opt.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <div className="text-sm text-foreground truncate">{opt.label}</div>
                    {opt.secondary && (
                      <div className="text-[11px] text-muted-foreground truncate">{opt.secondary}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="block">
          <span className="text-[11px] font-medium text-muted-foreground">Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this linked?"
            className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </label>

        {err && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
            {err}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting || pickedId === null}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting
              ? <><span className="material-icons animate-spin text-base">progress_activity</span>Linking…</>
              : <><span className="material-icons text-base">add_link</span>Link</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── picker source helpers ───────────────────────────────────────────────────

async function fetchPickerOptions(
  type: BrainDocumentLinkEntityType,
  search: string,
): Promise<PickerOption[]> {
  const q = search.trim();
  try {
    switch (type) {
      case 'topic': {
        const r = await fetch('/api/portal/brain/topics');
        const json = await r.json();
        if (!r.ok || !json.success) return [];
        const items = (Array.isArray(json.data?.items) ? json.data.items : Array.isArray(json.data) ? json.data : []) as Array<{ id: number; name: string; path?: string }>;
        return items
          .filter((t) => q === '' || t.name.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 30)
          .map((t) => ({ id: t.id, label: t.name, secondary: t.path }));
      }
      case 'initiative': {
        const r = await fetch('/api/portal/brain/initiatives');
        const json = await r.json();
        if (!r.ok || !json.success) return [];
        const items = (Array.isArray(json.data?.items) ? json.data.items : Array.isArray(json.data) ? json.data : []) as Array<{ id: number; name: string; status?: string }>;
        return items
          .filter((i) => q === '' || i.name.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 30)
          .map((i) => ({ id: i.id, label: i.name, secondary: i.status }));
      }
      case 'decision': {
        const r = await fetch('/api/portal/brain/decisions');
        const json = await r.json();
        if (!r.ok || !json.success) return [];
        const items = (Array.isArray(json.data?.items) ? json.data.items : Array.isArray(json.data) ? json.data : []) as Array<{ id: number; title: string; status?: string }>;
        return items
          .filter((d) => q === '' || d.title.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 30)
          .map((d) => ({ id: d.id, label: d.title, secondary: d.status }));
      }
      case 'meeting': {
        const r = await fetch('/api/portal/brain/communications');
        const json = await r.json();
        if (!r.ok || !json.success) return [];
        const items = (Array.isArray(json.data?.items) ? json.data.items : Array.isArray(json.data) ? json.data : []) as Array<{ id: number; title: string; meetingDate?: string | null }>;
        return items
          .filter((m) => q === '' || m.title.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 30)
          .map((m) => ({ id: m.id, label: m.title, secondary: m.meetingDate ? new Date(m.meetingDate).toLocaleDateString() : undefined }));
      }
      case 'glossary_term': {
        const url = q
          ? `/api/portal/brain/glossary?search=${encodeURIComponent(q)}&limit=30`
          : '/api/portal/brain/glossary?limit=30';
        const r = await fetch(url);
        const json = await r.json();
        if (!r.ok || !json.success) return [];
        const items = (Array.isArray(json.data?.items) ? json.data.items : []) as Array<{ id: number; term: string; shortDefinition?: string | null }>;
        return items.slice(0, 30).map((g) => ({ id: g.id, label: g.term, secondary: g.shortDefinition ?? undefined }));
      }
      case 'person': {
        const url = q
          ? `/api/portal/brain/people?search=${encodeURIComponent(q)}&limit=30`
          : '/api/portal/brain/people?limit=30';
        const r = await fetch(url);
        const json = await r.json();
        if (!r.ok || !json.success) return [];
        const items = (Array.isArray(json.data?.items) ? json.data.items : []) as Array<{ id: number; fullName: string; title?: string | null }>;
        return items.slice(0, 30).map((p) => ({ id: p.id, label: p.fullName, secondary: p.title ?? undefined }));
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}
