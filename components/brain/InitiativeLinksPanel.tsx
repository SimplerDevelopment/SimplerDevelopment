'use client';

/**
 * Tabbed list of linked entities for an initiative. Each tab corresponds to
 * one entityType that has ≥1 row; tabs disappear when their list empties.
 *
 * The "+ Link" affordance opens a tiny picker dialog that searches the
 * relevant collection endpoint. We accept any of the seven entity types
 * unconditionally — `decision` / `topic` may not have a backing list yet
 * (the brain-restructure branch is in-flight), in which case the picker
 * shows an empty state rather than the tab refusing to open.
 */
import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  LINK_ENTITY_TYPES,
  linkEntityTypeMeta,
  type BrainInitiativeLinkType,
  type InitiativeLinkItem,
} from './initiatives-shared';

interface Props {
  initiativeId: number;
  /** Caller-fetched links. Re-render after mutations by bumping a key or reloading. */
  links: InitiativeLinkItem[];
  /** Bumped after a successful link/unlink so the parent reloads. */
  onChanged?: () => void;
}

export default function InitiativeLinksPanel({ initiativeId, links, onChanged }: Props) {
  // Buckets: only show tabs for entity types with ≥1 link, BUT always include
  // an "add" affordance that lets users pick from any allowed type.
  const grouped = useMemo(() => {
    const map = new Map<BrainInitiativeLinkType, InitiativeLinkItem[]>();
    for (const l of links) {
      const k = l.entityType;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(l);
    }
    return map;
  }, [links]);

  const orderedTypes = LINK_ENTITY_TYPES.filter((t) => grouped.has(t));
  // Active tab is "sticky" until its bucket empties — when the current tab is
  // no longer in orderedTypes we fall back to the first bucket. We derive
  // this in render (no effect) so we don't trigger a second render cycle.
  const [activeTypeRaw, setActiveType] = useState<BrainInitiativeLinkType | null>(null);
  const activeType: BrainInitiativeLinkType | null = (
    activeTypeRaw !== null && orderedTypes.includes(activeTypeRaw)
      ? activeTypeRaw
      : (orderedTypes[0] ?? null)
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unlink = useCallback(async (item: InitiativeLinkItem) => {
    if (!confirm(`Unlink this ${linkEntityTypeMeta(item.entityType).label.toLowerCase()}?`)) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/portal/brain/initiatives/${initiativeId}/links`, {
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
  }, [initiativeId, onChanged]);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-foreground inline-flex items-center gap-2">
          <span className="material-icons text-base text-primary">hub</span>
          Linked entities
          <span className="text-xs text-muted-foreground font-normal">
            ({links.length})
          </span>
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
          Nothing linked yet. Use Link to attach tasks, notes, meetings, decisions, topics, deals, or companies.
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-1 border-b border-border overflow-x-auto">
            {orderedTypes.map((t) => {
              const meta = linkEntityTypeMeta(t);
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
                  {meta.pluralLabel}
                  <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 space-y-1.5">
            {activeType && grouped.get(activeType)?.map((item) => (
              <div
                key={item.linkId}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30 hover:bg-muted/60 transition-colors"
              >
                {item.pinned && (
                  <span className="material-icons text-amber-600 dark:text-amber-400 text-base" title="Pinned">
                    push_pin
                  </span>
                )}
                <span className="material-icons text-base text-muted-foreground">
                  {linkEntityTypeMeta(item.entityType).icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-foreground truncate">
                    {item.title ?? `${linkEntityTypeMeta(item.entityType).label} #${item.entityId}`}
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
          initiativeId={initiativeId}
          onClose={() => setPickerOpen(false)}
          onLinked={() => { setPickerOpen(false); onChanged?.(); }}
        />
      )}
    </div>
  );
}

// ─── picker ──────────────────────────────────────────────────────────────────

interface PickerProps {
  initiativeId: number;
  onClose: () => void;
  onLinked: () => void;
}

interface PickerOption {
  id: number;
  label: string;
  secondary?: string;
}

function LinkPickerDialog({ initiativeId, onClose, onLinked }: PickerProps) {
  const [type, setType] = useState<BrainInitiativeLinkType>('task');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [pinned, setPinned] = useState(false);
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

  // Debounce search reloads.
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  const submit = async () => {
    if (pickedId === null) return;
    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch(`/api/portal/brain/initiatives/${initiativeId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: type,
          entityId: pickedId,
          note: note.trim() || undefined,
          pinned: pinned || undefined,
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
              Attach a task, note, meeting, decision, topic, deal, or company.
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
              onChange={(e) => setType(e.target.value as BrainInitiativeLinkType)}
              className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {LINK_ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{linkEntityTypeMeta(t).label}</option>
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
              No {linkEntityTypeMeta(type).pluralLabel.toLowerCase()} found.
              {(type === 'decision' || type === 'topic') && ' Decisions and topics require the brain-restructure module.'}
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

        <div className="space-y-2">
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
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Pin this link
          </label>
        </div>

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

/**
 * Per-entity-type list endpoint. Returns the first ~20 matching rows for
 * picker display. Each branch tolerates a missing/legacy endpoint by returning
 * an empty list so the picker degrades gracefully.
 */
async function fetchPickerOptions(
  type: BrainInitiativeLinkType,
  search: string,
): Promise<PickerOption[]> {
  const q = search.trim();
  try {
    switch (type) {
      case 'task': {
        const r = await fetch('/api/portal/brain/tasks');
        const json = await r.json();
        if (!r.ok || !json.success) return [];
        const items = (Array.isArray(json.data) ? json.data : []) as Array<{ id: number; title: string; status: string }>;
        return items
          .filter((t) => q === '' || t.title.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 30)
          .map((t) => ({ id: t.id, label: t.title, secondary: t.status }));
      }
      case 'note': {
        const url = q
          ? `/api/portal/brain/knowledge?search=${encodeURIComponent(q)}&limit=30`
          : '/api/portal/brain/knowledge?limit=30';
        const r = await fetch(url);
        const json = await r.json();
        if (!r.ok || !json.success) return [];
        const items = (Array.isArray(json.data?.items) ? json.data.items : Array.isArray(json.data) ? json.data : []) as Array<{ id: number; title: string }>;
        return items.slice(0, 30).map((n) => ({ id: n.id, label: n.title || `Note #${n.id}` }));
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
      case 'crm_deal': {
        const r = await fetch('/api/portal/crm/deals');
        const json = await r.json();
        if (!r.ok || !json.success) return [];
        const items = (Array.isArray(json.data?.items) ? json.data.items : Array.isArray(json.data) ? json.data : []) as Array<{ id: number; title: string; stage?: string; value?: number; valueCents?: number }>;
        return items
          .filter((d) => q === '' || d.title.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 30)
          .map((d) => ({ id: d.id, label: d.title || `Deal #${d.id}`, secondary: d.stage }));
      }
      case 'crm_company': {
        const r = await fetch('/api/portal/crm/companies');
        const json = await r.json();
        if (!r.ok || !json.success) return [];
        const items = (Array.isArray(json.data?.items) ? json.data.items : Array.isArray(json.data) ? json.data : []) as Array<{ id: number; name: string; website?: string | null; domain?: string | null }>;
        return items
          .filter((c) => q === '' || c.name.toLowerCase().includes(q.toLowerCase()))
          .slice(0, 30)
          .map((c) => ({ id: c.id, label: c.name || `Company #${c.id}`, secondary: c.website || c.domain || undefined }));
      }
      case 'decision':
      case 'topic':
      default:
        // brain-restructure branch ships these — until it merges the picker
        // simply shows the empty state.
        return [];
    }
  } catch {
    return [];
  }
}
