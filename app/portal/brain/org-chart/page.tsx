'use client';

/**
 * Brain Org Chart — admin page.
 *
 * Layout (≥md):
 *   ┌────────────────────────────────────┬──────────────────────┐
 *   │  Header: Org Chart · N units       │   Selected unit       │
 *   │  [New unit] [Compact / Expanded]   │   ─────────           │
 *   │                                    │   Breadcrumb          │
 *   │  <OrgUnitTree>                     │   Name (inline edit)  │
 *   │                                    │   description…       │
 *   │                                    │   Lead person         │
 *   │                                    │   Members (paginated)│
 *   │                                    │   [+ Add member]      │
 *   │                                    │   [Delete unit]       │
 *   └────────────────────────────────────┴──────────────────────┘
 *
 * Wave 3a owns `<PersonPicker>` — until it lands we inline a minimal
 * search-typeahead against `/api/portal/brain/people?search=`.
 *
 * TODO: replace inline PersonPicker fallback with shared
 *       `components/brain/PersonPicker.tsx` once Wave 3a merges.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import OrgUnitTree from '@/components/brain/OrgUnitTree';
import type {
  BrainOrgUnitTreeNode,
  BrainOrgUnitWithDetails,
  OrgUnitMemberSummary,
} from '@/lib/brain/org-units';

// ─── Shared types ────────────────────────────────────────────────────────────

interface PersonHit {
  id: number;
  fullName: string;
  email: string | null;
  title: string | null;
}

const MEMBERS_PAGE_SIZE = 25;
const COLOR_PRESETS = [
  '', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899',
];
const ICON_PRESETS = [
  'groups', 'engineering', 'design_services', 'business_center', 'support_agent', 'campaign',
  'science', 'savings', 'gavel', 'school', 'rocket_launch', 'health_and_safety',
];

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BrainOrgChartPage() {
  const [tree, setTree] = useState<BrainOrgUnitTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [compactView, setCompactView] = useState(false);
  const [showNewUnitModal, setShowNewUnitModal] = useState(false);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/org-units?as=tree');
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load org units.');
        return;
      }
      setTree((json.data?.tree as BrainOrgUnitTreeNode[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch-on-mount. loadTree() sets state via setState calls inside async
  // callbacks — the lint rule trips on the synchronous setLoading(true) at
  // the head of loadTree. This is the standard "fetch on mount" pattern in
  // this codebase; suppressed in line with the rest of app/portal/**.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadTree(); }, [loadTree]);

  const flatCount = useMemo(() => {
    const walk = (nodes: BrainOrgUnitTreeNode[]): number =>
      nodes.reduce((acc, n) => acc + 1 + walk(n.children), 0);
    return walk(tree);
  }, [tree]);

  // ─── Tree actions ─────────────────────────────────────────────────────────
  const handleMove = useCallback(async (sourceId: number, newParentId: number | null) => {
    const r = await fetch(`/api/portal/brain/org-units/${sourceId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newParentId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'Failed to move unit.');
      return;
    }
    await loadTree();
  }, [loadTree]);

  const handleRename = useCallback(async (id: number, newName: string) => {
    const r = await fetch(`/api/portal/brain/org-units/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'Failed to rename unit.');
      return;
    }
    await loadTree();
  }, [loadTree]);

  const handleDelete = useCallback(async (id: number, force: boolean) => {
    const r = await fetch(`/api/portal/brain/org-units/${id}${force ? '?force=true' : ''}`, {
      method: 'DELETE',
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'Failed to delete unit.');
      return;
    }
    if (selectedId === id) setSelectedId(null);
    await loadTree();
  }, [loadTree, selectedId]);

  const handleMerge = useCallback(async (sourceId: number, targetId: number) => {
    const r = await fetch(`/api/portal/brain/org-units/${sourceId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetOrgUnitId: targetId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'Failed to merge units.');
      return;
    }
    if (selectedId === sourceId) setSelectedId(targetId);
    await loadTree();
  }, [loadTree, selectedId]);

  const handleCreateChild = useCallback(async (parentId: number | null, name: string) => {
    const r = await fetch('/api/portal/brain/org-units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parentId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'Failed to create unit.');
      return;
    }
    await loadTree();
    if (typeof json.data?.id === 'number') setSelectedId(json.data.id);
  }, [loadTree]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading && tree.length === 0) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    );
  }

  if (error && tree.length === 0) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load org chart
          </div>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-4">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">account_tree</span>
            Org Chart
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {flatCount} unit{flatCount === 1 ? '' : 's'} · drag rows to reorganize
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex border border-border rounded-md overflow-hidden" role="group" aria-label="Density">
            <button
              type="button"
              onClick={() => setCompactView(false)}
              className={`px-2.5 py-1.5 text-xs inline-flex items-center gap-1 ${!compactView ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'}`}
              aria-pressed={!compactView}
            >
              <span className="material-icons text-sm">density_medium</span>
              Expanded
            </button>
            <button
              type="button"
              onClick={() => setCompactView(true)}
              className={`px-2.5 py-1.5 text-xs inline-flex items-center gap-1 ${compactView ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60'}`}
              aria-pressed={compactView}
            >
              <span className="material-icons text-sm">density_small</span>
              Compact
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowNewUnitModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">add</span>
            New unit
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-lg overflow-hidden">
          <div className={compactView ? 'text-xs [&_.material-icons]:!text-sm' : ''}>
            <OrgUnitTree
              tree={tree}
              selectedUnitId={selectedId}
              onSelect={(u) => setSelectedId(u.id)}
              enableDragDrop
              onMove={handleMove}
              onRename={handleRename}
              onDelete={handleDelete}
              onMerge={handleMerge}
              onCreateChild={handleCreateChild}
              showMemberCounts
            />
          </div>
        </div>

        <aside className="lg:col-span-1">
          {selectedId === null ? (
            <EmptySidePanel />
          ) : (
            <UnitSidePanel
              unitId={selectedId}
              onChanged={loadTree}
              onDeleted={() => { setSelectedId(null); loadTree(); }}
            />
          )}
        </aside>
      </div>

      {showNewUnitModal && (
        <NewUnitModal
          tree={tree}
          onClose={() => setShowNewUnitModal(false)}
          onCreated={(created) => {
            setShowNewUnitModal(false);
            setSelectedId(created.id);
            loadTree();
          }}
        />
      )}
    </div>
  );
}

// ─── Empty side panel ───────────────────────────────────────────────────────

function EmptySidePanel() {
  return (
    <div className="bg-card border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
      <span className="material-icons text-4xl text-muted-foreground/60 mb-2 block">account_tree</span>
      <p className="font-medium text-foreground">Nothing selected</p>
      <p className="text-xs mt-1">Select an org unit, or drag rows to reorganize.</p>
    </div>
  );
}

// ─── Unit side panel ────────────────────────────────────────────────────────

function UnitSidePanel({
  unitId,
  onChanged,
  onDeleted,
}: {
  unitId: number;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [details, setDetails] = useState<BrainOrgUnitWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable fields (local buffer, committed on blur / Enter).
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [savingField, setSavingField] = useState<string | null>(null);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [memberPage, setMemberPage] = useState(0);
  const [showDeleteUnit, setShowDeleteUnit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/org-units/${unitId}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load unit.');
        return;
      }
      const data = json.data as BrainOrgUnitWithDetails;
      setDetails(data);
      setNameDraft(data.unit.name);
      setDescDraft(data.unit.description ?? '');
      setMemberPage(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  // Same fetch-on-mount pattern as the top-level loadTree above.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const patchUnit = async (patch: Record<string, unknown>, fieldLabel: string) => {
    setSavingField(fieldLabel);
    try {
      const r = await fetch(`/api/portal/brain/org-units/${unitId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        alert(json.message || 'Failed to update unit.');
        return false;
      }
      await load();
      onChanged();
      return true;
    } finally {
      setSavingField(null);
    }
  };

  const removeMember = async (personId: number) => {
    const r = await fetch(`/api/portal/brain/org-units/${unitId}/members`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'Failed to remove member.');
      return;
    }
    await load();
    onChanged();
  };

  const setPrimary = async (personId: number, primary: boolean, roleInUnit: string | null) => {
    // The members POST endpoint upserts on (personId, orgUnitId). Re-POSTing
    // with primary=true also flips primary=false on the person's other
    // memberships (handled in `addMember` server-side).
    const r = await fetch(`/api/portal/brain/org-units/${unitId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, primary, roleInUnit }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) {
      alert(json.message || 'Failed to update primary.');
      return;
    }
    await load();
    onChanged();
  };

  if (loading && !details) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-center text-sm text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading unit…
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
        <div className="flex items-center gap-2 font-medium mb-1">
          <span className="material-icons text-base">error_outline</span>
          Couldn&apos;t load unit
        </div>
        <p>{error}</p>
      </div>
    );
  }

  const { unit, ancestors, members } = details;
  const pagedMembers = members.slice(
    memberPage * MEMBERS_PAGE_SIZE,
    memberPage * MEMBERS_PAGE_SIZE + MEMBERS_PAGE_SIZE,
  );
  const totalPages = Math.max(1, Math.ceil(members.length / MEMBERS_PAGE_SIZE));

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center flex-wrap gap-1 text-xs text-muted-foreground">
        {ancestors.length === 0 ? (
          <span>Root</span>
        ) : (
          ancestors.map((a, i) => (
            <span key={a.id} className="inline-flex items-center gap-1">
              {i > 0 && <span className="material-icons text-[14px]">chevron_right</span>}
              <span>{a.name}</span>
            </span>
          ))
        )}
        {ancestors.length > 0 && <span className="material-icons text-[14px]">chevron_right</span>}
        <span className="font-medium text-foreground">{unit.name}</span>
      </div>

      {/* Name (inline editable) */}
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
          Name
        </label>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => {
            const v = nameDraft.trim();
            if (v && v !== unit.name) patchUnit({ name: v }, 'name');
            else setNameDraft(unit.name);
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }}
          className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
          Description
        </label>
        <textarea
          value={descDraft}
          onChange={(e) => setDescDraft(e.target.value)}
          onBlur={() => {
            const v = descDraft.trim();
            if (v !== (unit.description ?? '')) patchUnit({ description: v || null }, 'description');
          }}
          rows={2}
          placeholder="What does this unit do?"
          className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-y"
        />
      </div>

      {/* Color + Icon */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
            Color
          </label>
          <div className="flex flex-wrap gap-1">
            {COLOR_PRESETS.map((c) => (
              <button
                key={c || 'none'}
                type="button"
                onClick={() => patchUnit({ color: c || null }, 'color')}
                title={c || 'No color'}
                className={`w-6 h-6 rounded-full border ${unit.color === c || (!unit.color && !c) ? 'ring-2 ring-primary ring-offset-1' : 'border-border'}`}
                style={{ backgroundColor: c || 'transparent', backgroundImage: c ? undefined : 'repeating-linear-gradient(45deg, var(--border, #ccc) 0 2px, transparent 2px 4px)' }}
              />
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
            Icon
          </label>
          <div className="flex flex-wrap gap-1">
            {ICON_PRESETS.map((icon) => (
              <button
                key={icon}
                type="button"
                onClick={() => patchUnit({ icon }, 'icon')}
                title={icon}
                className={`w-7 h-7 inline-flex items-center justify-center rounded border ${unit.icon === icon ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
              >
                <span className="material-icons text-base">{icon}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {savingField && (
        <p className="text-[10px] text-muted-foreground italic">Saving {savingField}…</p>
      )}

      {/* Lead person */}
      <div>
        <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
          Lead person
        </label>
        {unit.leadPersonId === null ? (
          <button
            type="button"
            onClick={() => setShowLeadPicker(true)}
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-base">person_add</span>
            Set lead
          </button>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">
              <LeadPersonName personId={unit.leadPersonId} />
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowLeadPicker(true)}
                className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                title="Change lead"
              >
                <span className="material-icons text-sm">edit</span>
              </button>
              <button
                type="button"
                onClick={() => patchUnit({ leadPersonId: null }, 'lead')}
                className="h-6 w-6 inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-muted rounded"
                title="Clear lead"
              >
                <span className="material-icons text-sm">close</span>
              </button>
            </div>
          </div>
        )}
        {showLeadPicker && (
          <PersonPickerDialog
            title="Set lead person"
            onClose={() => setShowLeadPicker(false)}
            onPick={async (person) => {
              setShowLeadPicker(false);
              await patchUnit({ leadPersonId: person.id }, 'lead');
            }}
          />
        )}
      </div>

      {/* Members */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            Members ({members.length})
          </label>
          <button
            type="button"
            onClick={() => setShowAddMember(true)}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-sm">person_add</span>
            Add member
          </button>
        </div>
        {members.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No members yet.</p>
        ) : (
          <>
            <ul className="space-y-1 border border-border rounded divide-y divide-border">
              {pagedMembers.map((m) => (
                <MemberRow
                  key={m.personId}
                  member={m}
                  onRemove={() => removeMember(m.personId)}
                  onTogglePrimary={() => setPrimary(m.personId, !m.primary, m.roleInUnit)}
                />
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setMemberPage((p) => Math.max(0, p - 1))}
                  disabled={memberPage === 0}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
                >
                  <span className="material-icons text-sm">chevron_left</span>
                  Prev
                </button>
                <span className="text-muted-foreground">
                  Page {memberPage + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setMemberPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={memberPage >= totalPages - 1}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
                >
                  Next
                  <span className="material-icons text-sm">chevron_right</span>
                </button>
              </div>
            )}
          </>
        )}
        {showAddMember && (
          <AddMemberDialog
            onClose={() => setShowAddMember(false)}
            onAdd={async (personId, primary, role) => {
              const r = await fetch(`/api/portal/brain/org-units/${unitId}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personId, primary, roleInUnit: role || null }),
              });
              const json = await r.json().catch(() => ({}));
              if (!r.ok || !json.success) {
                alert(json.message || 'Failed to add member.');
                return;
              }
              setShowAddMember(false);
              await load();
              onChanged();
            }}
          />
        )}
      </div>

      {/* Danger zone */}
      <div className="pt-3 border-t border-border">
        <button
          type="button"
          onClick={() => setShowDeleteUnit(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm rounded border border-destructive/30 text-destructive hover:bg-destructive/10"
        >
          <span className="material-icons text-base">delete</span>
          Delete unit
        </button>
        {showDeleteUnit && (
          <DeleteUnitInlineModal
            unitName={unit.name}
            memberCount={members.length}
            onClose={() => setShowDeleteUnit(false)}
            onConfirm={async (force) => {
              const r = await fetch(`/api/portal/brain/org-units/${unitId}${force ? '?force=true' : ''}`, { method: 'DELETE' });
              const json = await r.json().catch(() => ({}));
              if (!r.ok || !json.success) {
                alert(json.message || 'Failed to delete unit.');
                return;
              }
              setShowDeleteUnit(false);
              onDeleted();
            }}
          />
        )}
      </div>
    </div>
  );
}

// Resolves a person id → name. Tiny cached fetch; keeps the side-panel
// markup simple. We cache in module scope so repeated lookups across
// re-renders don't hammer the API.
const personNameCache = new Map<number, string>();
function LeadPersonName({ personId }: { personId: number }) {
  // Seed from the module-scope cache on first render so repeated mounts
  // for the same id render the resolved name immediately. Derive from the
  // cache on every render — that lets a switch in personId pick up an
  // already-cached value without needing a sync setState inside the effect.
  const [resolved, setResolved] = useState<{ id: number; name: string } | null>(() => {
    const cached = personNameCache.get(personId);
    return cached ? { id: personId, name: cached } : null;
  });
  useEffect(() => {
    if (personNameCache.has(personId)) {
      // No setState — the render path below reads from the cache directly.
      return;
    }
    let cancelled = false;
    fetch(`/api/portal/brain/people/${personId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const n: string | undefined = j?.data?.person?.fullName;
        if (n) {
          personNameCache.set(personId, n);
          setResolved({ id: personId, name: n });
        } else {
          setResolved({ id: personId, name: `#${personId}` });
        }
      })
      .catch(() => { if (!cancelled) setResolved({ id: personId, name: `#${personId}` }); });
    return () => { cancelled = true; };
  }, [personId]);
  // Prefer the module cache (fresh after any sibling fetch), then the
  // local resolved state, else a placeholder.
  const display = personNameCache.get(personId)
    ?? (resolved?.id === personId ? resolved.name : null)
    ?? `#${personId}`;
  return <span>{display}</span>;
}

// ─── Member row ─────────────────────────────────────────────────────────────

function MemberRow({
  member,
  onRemove,
  onTogglePrimary,
}: {
  member: OrgUnitMemberSummary;
  onRemove: () => void;
  onTogglePrimary: () => void;
}) {
  const initials = member.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
  return (
    <li className="flex items-center gap-2 px-2 py-1.5">
      <span className="shrink-0 w-7 h-7 rounded-full bg-muted text-muted-foreground inline-flex items-center justify-center text-[11px] font-semibold">
        {initials || <span className="material-icons text-base">person</span>}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{member.fullName}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {member.roleInUnit || member.title || '—'}
        </div>
      </div>
      <button
        type="button"
        onClick={onTogglePrimary}
        title={member.primary ? 'Primary unit (click to unmark)' : 'Mark as primary unit'}
        className={`h-6 w-6 inline-flex items-center justify-center rounded hover:bg-muted ${member.primary ? 'text-yellow-500' : 'text-muted-foreground'}`}
      >
        <span className="material-icons text-base">{member.primary ? 'star' : 'star_outline'}</span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        title="Remove from unit"
        className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-muted"
      >
        <span className="material-icons text-base">close</span>
      </button>
    </li>
  );
}

// ─── Modals ─────────────────────────────────────────────────────────────────

function NewUnitModal({
  tree,
  onClose,
  onCreated,
}: {
  tree: BrainOrgUnitTreeNode[];
  onClose: () => void;
  onCreated: (created: { id: number }) => void;
}) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [leadPersonId, setLeadPersonId] = useState<number | null>(null);
  const [leadPersonName, setLeadPersonName] = useState<string | null>(null);
  const [color, setColor] = useState<string>('');
  const [icon, setIcon] = useState<string>('groups');
  const [submitting, setSubmitting] = useState(false);
  const [showLeadPicker, setShowLeadPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const v = name.trim();
    if (!v) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/org-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: v,
          parentId,
          description: description.trim() || null,
          leadPersonId,
          color: color || null,
          icon,
        }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to create unit.');
        return;
      }
      onCreated(json.data);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="New org unit" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            placeholder="Engineering"
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
        <Field label="Parent unit">
          <ParentUnitPicker
            tree={tree}
            value={parentId}
            onChange={setParentId}
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="What does this unit do?"
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-y"
          />
        </Field>
        <Field label="Lead person (optional)">
          {leadPersonId === null ? (
            <button
              type="button"
              onClick={() => setShowLeadPicker(true)}
              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
            >
              <span className="material-icons text-base">person_add</span>
              Pick lead
            </button>
          ) : (
            <div className="flex items-center gap-2 text-sm">
              <span>{leadPersonName ?? `#${leadPersonId}`}</span>
              <button
                type="button"
                onClick={() => { setLeadPersonId(null); setLeadPersonName(null); }}
                className="text-muted-foreground hover:text-destructive"
                title="Clear"
              >
                <span className="material-icons text-base">close</span>
              </button>
            </div>
          )}
          {showLeadPicker && (
            <PersonPickerDialog
              title="Pick lead person"
              onClose={() => setShowLeadPicker(false)}
              onPick={(p) => { setLeadPersonId(p.id); setLeadPersonName(p.fullName); setShowLeadPicker(false); }}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Color">
            <div className="flex flex-wrap gap-1">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c || 'none'}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c || 'No color'}
                  className={`w-6 h-6 rounded-full border ${color === c ? 'ring-2 ring-primary ring-offset-1' : 'border-border'}`}
                  style={{ backgroundColor: c || 'transparent', backgroundImage: c ? undefined : 'repeating-linear-gradient(45deg, var(--border, #ccc) 0 2px, transparent 2px 4px)' }}
                />
              ))}
            </div>
          </Field>
          <Field label="Icon">
            <div className="flex flex-wrap gap-1">
              {ICON_PRESETS.map((it) => (
                <button
                  key={it}
                  type="button"
                  onClick={() => setIcon(it)}
                  title={it}
                  className={`w-7 h-7 inline-flex items-center justify-center rounded border ${icon === it ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
                >
                  <span className="material-icons text-base">{it}</span>
                </button>
              ))}
            </div>
          </Field>
        </div>
        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded p-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !name.trim()}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {submitting && <span className="material-icons animate-spin text-sm">progress_activity</span>}
            Create
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ParentUnitPicker({
  tree,
  value,
  onChange,
}: {
  tree: BrainOrgUnitTreeNode[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  // Flatten tree to a depth-prefixed list — preserves hierarchy visually
  // inside a single <select>.
  const items: Array<{ id: number; label: string; depth: number }> = [];
  const walk = (nodes: BrainOrgUnitTreeNode[], depth: number) => {
    for (const n of nodes) {
      items.push({ id: n.id, label: n.name, depth });
      walk(n.children, depth + 1);
    }
  };
  walk(tree, 0);
  return (
    <select
      value={value === null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? null : parseInt(e.target.value, 10))}
      className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
    >
      <option value="">— No parent (root) —</option>
      {items.map((it) => (
        <option key={it.id} value={String(it.id)}>
          {`${'  '.repeat(it.depth)}${it.depth > 0 ? '↳ ' : ''}${it.label}`}
        </option>
      ))}
    </select>
  );
}

function AddMemberDialog({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (personId: number, primary: boolean, role: string) => Promise<void> | void;
}) {
  const [selected, setSelected] = useState<PersonHit | null>(null);
  const [primary, setPrimary] = useState(false);
  const [role, setRole] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <ModalShell title="Add member" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Person">
          {selected ? (
            <div className="flex items-center justify-between gap-2 bg-muted/40 border border-border rounded px-2 py-1.5">
              <div className="text-sm">
                <div>{selected.fullName}</div>
                {selected.title && <div className="text-[11px] text-muted-foreground">{selected.title}</div>}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-muted-foreground hover:text-foreground"
                title="Clear"
              >
                <span className="material-icons text-base">close</span>
              </button>
            </div>
          ) : (
            <InlinePersonPicker onPick={setSelected} />
          )}
        </Field>
        <Field label="Role in unit (optional)">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Tech lead"
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </Field>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={primary}
            onChange={(e) => setPrimary(e.target.checked)}
          />
          <span>Primary unit for this person</span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded border border-border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!selected || submitting}
            onClick={async () => {
              if (!selected) return;
              setSubmitting(true);
              try { await onAdd(selected.id, primary, role.trim()); }
              finally { setSubmitting(false); }
            }}
            className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {submitting && <span className="material-icons animate-spin text-sm">progress_activity</span>}
            Add
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function PersonPickerDialog({
  title,
  onClose,
  onPick,
}: {
  title: string;
  onClose: () => void;
  onPick: (p: PersonHit) => void;
}) {
  return (
    <ModalShell title={title} onClose={onClose}>
      <InlinePersonPicker onPick={onPick} />
    </ModalShell>
  );
}

// TODO: replace with shared <PersonPicker> once Wave 3a lands
// (components/brain/PersonPicker.tsx).
function InlinePersonPicker({ onPick }: { onPick: (p: PersonHit) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonHit[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const q = encodeURIComponent(query.trim());
        const r = await fetch(`/api/portal/brain/people?search=${q}&limit=10`);
        const json = await r.json().catch(() => ({}));
        if (json?.success && Array.isArray(json.data?.items)) {
          setResults(json.data.items as PersonHit[]);
        } else {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search people…"
        autoFocus
        className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <div className="mt-2 max-h-60 overflow-y-auto border border-border rounded">
        {loading ? (
          <div className="p-3 text-xs text-muted-foreground inline-flex items-center gap-1">
            <span className="material-icons animate-spin text-sm">progress_activity</span>
            Searching…
          </div>
        ) : results.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground italic">
            {query ? 'No matching people.' : 'Start typing to search.'}
          </div>
        ) : (
          <ul className="list-none divide-y divide-border">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="w-full text-left px-2.5 py-1.5 hover:bg-muted"
                >
                  <div className="text-sm">{p.fullName}</div>
                  {(p.title || p.email) && (
                    <div className="text-[11px] text-muted-foreground truncate">
                      {[p.title, p.email].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DeleteUnitInlineModal({
  unitName,
  memberCount,
  onClose,
  onConfirm,
}: {
  unitName: string;
  memberCount: number;
  onClose: () => void;
  onConfirm: (force: boolean) => Promise<void> | void;
}) {
  const [force, setForce] = useState(false);
  const needsForce = memberCount > 0;
  return (
    <ModalShell title={`Delete "${unitName}"?`} onClose={onClose}>
      <p className="text-xs text-muted-foreground mb-3">
        {needsForce
          ? `This unit has ${memberCount} member${memberCount === 1 ? '' : 's'}. Force delete detaches members and re-parents children up one level.`
          : 'This will permanently delete the unit.'}
      </p>
      {needsForce && (
        <label className="flex items-start gap-2 text-xs mb-3 cursor-pointer">
          <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="mt-0.5" />
          <span><strong>Force delete</strong> (cascades children to parent, detaches all members)</span>
        </label>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 text-sm rounded border border-border hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={needsForce && !force}
          onClick={() => onConfirm(force)}
          className="px-3 py-1.5 text-sm rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <span className="material-icons text-base">delete</span>
          Delete
        </button>
      </div>
    </ModalShell>
  );
}

// ─── Small UI helpers ──────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-card border border-border rounded-lg shadow-xl p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <span className="material-icons text-base">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
        {label}
      </label>
      {children}
    </div>
  );
}
