'use client';

/**
 * DocumentRequiredReadsPanel — manage required-read assignments for a doc.
 *
 * - Lists required-reads grouped by targetType (Person | Org Unit).
 * - "Assign required read" button opens a modal with picker (person OR
 *   org_unit), optional pinned version, optional due date, and (for org_unit)
 *   an "expand to members" checkbox.
 * - Each row shows: target name, target type chip, pinned-version chip (if
 *   any), due date, remove button (DELETE → if 409 has_acks, offers force).
 */

import { useCallback, useEffect, useState } from 'react';
import { PersonPicker } from './PersonPicker';
import type {
  BrainDocumentRequiredReadTarget,
  RequiredReadRow,
} from '@/lib/brain/document-acks';

interface VersionSlim {
  id: number;
  versionNumber: number;
  isDraft: boolean;
}

interface Props {
  documentId: number;
  versions: VersionSlim[];
  /** Bumped after a successful mutation so the parent refetches. */
  onChanged?: () => void;
}

export default function DocumentRequiredReadsPanel({ documentId, versions, onChanged }: Props) {
  const [rows, setRows] = useState<RequiredReadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/documents/${documentId}/required-reads`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load required-reads.');
      } else {
        setRows((json.data?.items ?? []) as RequiredReadRow[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() defers setState into async IIFE; trigger fires synchronously by design
  useEffect(() => { load(); }, [load]);

  // Inner request helper — doesn't recurse. The exposed `remove` callback
  // handles the prompt + retry-on-409 flow.
  const runRemoveRequest = useCallback(async (
    row: RequiredReadRow,
    force: boolean,
  ): Promise<{ ok: boolean; needsForce: boolean; message?: string }> => {
    const r = await fetch(
      `/api/portal/brain/documents/${documentId}/required-reads/${row.id}${force ? '?force=true' : ''}`,
      { method: 'DELETE' },
    );
    const json = await r.json();
    if (r.status === 409 && json?.message?.includes?.('acknowledgment')) {
      return { ok: false, needsForce: true, message: json.message };
    }
    if (!r.ok || !json.success) {
      return { ok: false, needsForce: false, message: json.message || 'Remove failed.' };
    }
    return { ok: true, needsForce: false };
  }, [documentId]);

  const remove = useCallback(async (row: RequiredReadRow) => {
    if (!confirm(`Remove required-read for ${row.targetName ?? row.targetType + ' #' + row.targetId}?`)) return;
    setBusy(true);
    try {
      let res = await runRemoveRequest(row, false);
      if (!res.ok && res.needsForce) {
        if (confirm(`This required-read has acknowledgments tied to it. Force-remove anyway? (Acks will be kept but unlinked.)`)) {
          res = await runRemoveRequest(row, true);
        } else {
          return;
        }
      }
      if (!res.ok) {
        alert(res.message || 'Remove failed.');
        return;
      }
      onChanged?.();
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }, [runRemoveRequest, load, onChanged]);

  const personRows = rows.filter((r) => r.targetType === 'person');
  const orgUnitRows = rows.filter((r) => r.targetType === 'org_unit');

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-foreground inline-flex items-center gap-2">
          <span className="material-icons text-base text-primary">assignment_ind</span>
          Required reads
          <span className="text-xs text-muted-foreground font-normal">({rows.length})</span>
        </h2>
        <button
          type="button"
          onClick={() => setAssignOpen(true)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-border text-foreground hover:bg-accent"
        >
          <span className="material-icons text-sm">person_add</span>
          Assign required read
        </button>
      </div>

      {error && (
        <div className="mt-3 bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
          <span className="material-icons animate-spin text-sm">progress_activity</span>
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground mt-3">No required-reads yet.</p>
      ) : (
        <div className="mt-3 space-y-3">
          {personRows.length > 0 && (
            <RowGroup
              icon="person"
              title="People"
              rows={personRows}
              versions={versions}
              busy={busy}
              onRemove={remove}
            />
          )}
          {orgUnitRows.length > 0 && (
            <RowGroup
              icon="groups"
              title="Org units"
              rows={orgUnitRows}
              versions={versions}
              busy={busy}
              onRemove={remove}
            />
          )}
        </div>
      )}

      {assignOpen && (
        <AssignDialog
          documentId={documentId}
          versions={versions}
          onClose={() => setAssignOpen(false)}
          onAssigned={() => { setAssignOpen(false); load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}

// ─── row groups ──────────────────────────────────────────────────────────────

function RowGroup({
  icon,
  title,
  rows,
  versions,
  busy,
  onRemove,
}: {
  icon: string;
  title: string;
  rows: RequiredReadRow[];
  versions: VersionSlim[];
  busy: boolean;
  onRemove: (row: RequiredReadRow) => void;
}) {
  const versionLabel = (versionId: number | null) => {
    if (versionId == null) return null;
    const v = versions.find((x) => x.id === versionId);
    return v ? `v${v.versionNumber}` : `v#${versionId}`;
  };
  return (
    <section>
      <h3 className="text-[11px] uppercase font-semibold tracking-wide text-muted-foreground mb-1.5 inline-flex items-center gap-1">
        <span className="material-icons text-[14px]">{icon}</span>
        {title} ({rows.length})
      </h3>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/30"
          >
            <span className="material-icons text-base text-muted-foreground">{icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm text-foreground truncate">
                {r.targetName ?? `${r.targetType} #${r.targetId}`}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {r.pinnedVersionId !== null && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-primary/15 text-primary border border-primary/30">
                    <span className="material-icons text-[11px]">push_pin</span>
                    {versionLabel(r.pinnedVersionId)}
                  </span>
                )}
                {r.dueAt && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground">
                    <span className="material-icons text-[11px]">schedule</span>
                    Due {new Date(r.dueAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRemove(r)}
              disabled={busy}
              className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded disabled:opacity-50"
              title="Remove"
              aria-label="Remove"
            >
              <span className="material-icons text-sm">close</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── assign dialog ───────────────────────────────────────────────────────────

interface OrgUnitRef {
  id: number;
  name: string;
  path?: string;
}

function AssignDialog({
  documentId,
  versions,
  onClose,
  onAssigned,
}: {
  documentId: number;
  versions: VersionSlim[];
  onClose: () => void;
  onAssigned: () => void;
}) {
  const [targetType, setTargetType] = useState<BrainDocumentRequiredReadTarget>('person');
  const [personId, setPersonId] = useState<number | null>(null);
  const [orgUnits, setOrgUnits] = useState<OrgUnitRef[]>([]);
  const [orgUnitId, setOrgUnitId] = useState<number | null>(null);
  const [expandOrgUnit, setExpandOrgUnit] = useState(false);
  const [pinnedVersionId, setPinnedVersionId] = useState<number | null>(null);
  const [dueAt, setDueAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Lazy-load org-units when needed.
  useEffect(() => {
    if (targetType !== 'org_unit' || orgUnits.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/portal/brain/org-units?as=flat');
        const json = await r.json();
        if (cancelled || !r.ok || !json.success) return;
        const items = (json.data?.items ?? []) as OrgUnitRef[];
        setOrgUnits(items);
      } catch {
        /* non-fatal */
      }
    })();
    return () => { cancelled = true; };
  }, [targetType, orgUnits.length]);

  const submit = async () => {
    setErr(null);
    const targetId = targetType === 'person' ? personId : orgUnitId;
    if (targetId === null) {
      setErr(`Pick a ${targetType === 'person' ? 'person' : 'org unit'} first.`);
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        targetType,
        targetId,
      };
      if (pinnedVersionId !== null) body.pinnedVersionId = pinnedVersionId;
      if (dueAt) body.dueAt = new Date(dueAt).toISOString();
      if (targetType === 'org_unit' && expandOrgUnit) body.expandOrgUnit = true;

      const r = await fetch(`/api/portal/brain/documents/${documentId}/required-reads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setErr(json.message || 'Assign failed.');
        return;
      }
      onAssigned();
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
            <h3 className="text-base font-semibold text-foreground">Assign required read</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Make this document required reading for a person or org unit.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <span className="material-icons text-lg">close</span>
          </button>
        </div>

        <div>
          <span className="text-[11px] font-medium text-muted-foreground">Target type</span>
          <div className="mt-1 flex items-center gap-1 bg-background border border-border rounded-md p-0.5">
            {(['person', 'org_unit'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTargetType(t)}
                className={`flex-1 px-2 py-1 rounded text-xs font-medium capitalize transition-colors ${
                  targetType === t
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                }`}
              >
                {t === 'org_unit' ? 'Org unit' : 'Person'}
              </button>
            ))}
          </div>
        </div>

        {targetType === 'person' ? (
          <div>
            <span className="text-[11px] font-medium text-muted-foreground">Person</span>
            <div className="mt-1">
              <PersonPicker value={personId} onChange={setPersonId} placeholder="Search people…" />
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="rr-orgunit" className="text-[11px] font-medium text-muted-foreground">Org unit</label>
            <select
              id="rr-orgunit"
              value={orgUnitId ?? ''}
              onChange={(e) => setOrgUnitId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Choose an org unit…</option>
              {orgUnits.map((u) => (
                <option key={u.id} value={u.id}>{u.path ?? u.name}</option>
              ))}
            </select>
            <label className="mt-2 flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={expandOrgUnit}
                onChange={(e) => setExpandOrgUnit(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Expand to individual members (one required-read per active person)
            </label>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rr-pinned" className="text-[11px] font-medium text-muted-foreground">Pin to version (optional)</label>
            <select
              id="rr-pinned"
              value={pinnedVersionId ?? ''}
              onChange={(e) => setPinnedVersionId(e.target.value ? parseInt(e.target.value, 10) : null)}
              className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Current published</option>
              {versions
                .filter((v) => !v.isDraft)
                .map((v) => (
                  <option key={v.id} value={v.id}>v{v.versionNumber}</option>
                ))}
            </select>
          </div>
          <div>
            <label htmlFor="rr-due" className="text-[11px] font-medium text-muted-foreground">Due date (optional)</label>
            <input
              id="rr-due"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
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
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting
              ? <><span className="material-icons animate-spin text-base">progress_activity</span>Assigning…</>
              : <><span className="material-icons text-base">person_add</span>Assign</>}
          </button>
        </div>
      </div>
    </div>
  );
}
