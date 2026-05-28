'use client';

/**
 * Playbook step editor.
 *
 * Two top-level surfaces:
 *   1. Playbook metadata form (name/desc/category/trigger/owner) — debounced
 *      PATCH on field changes.
 *   2. Step list with drag-handle reorder + inline edit + delete.
 *
 * Reorder POSTs to PATCH /steps with `orderedStepIds`.
 * Per-step changes POST to PATCH /steps/[stepId] via the debouncer in
 * PlaybookStepEditor.
 * "Add step" POSTs to POST /steps with a synthesized unique key.
 */

import { useCallback, useEffect, useMemo, useState, use as reactUse } from 'react';
import Link from 'next/link';
import PlaybookForm, {
  valuesToTriggerConfig,
  type PlaybookFormValues,
} from '@/components/brain/PlaybookForm';
import PlaybookStepEditor from '@/components/brain/PlaybookStepEditor';
import {
  PLAYBOOK_STEP_KINDS,
  playbookStepKindChip,
  playbookStatusChip,
  type BrainPlaybookStepKind,
  type PlaybookRow,
  type PlaybookStepRow,
} from '@/components/brain/playbooks-shared';

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

interface DetailResponse {
  playbook: PlaybookRow;
  steps: PlaybookStepRow[];
}

export default function PlaybookEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = reactUse(params);
  const playbookId = parseInt(id, 10);

  const [playbook, setPlaybook] = useState<PlaybookRow | null>(null);
  const [steps, setSteps] = useState<PlaybookStepRow[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draggingId, setDraggingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!Number.isFinite(playbookId) || playbookId <= 0) {
      setError('Invalid playbook id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/playbooks/${playbookId}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load playbook');
        return;
      }
      const data = json.data as DetailResponse;
      setPlaybook(data.playbook);
      setSteps(data.steps);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [playbookId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/team')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          setTeam(
            json.data
              .filter((m: { userId?: number }) => typeof m.userId === 'number')
              .map((m: { userId: number; name: string | null; email: string }) => ({
                userId: m.userId,
                name: m.name,
                email: m.email,
              })),
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── playbook metadata ────────────────────────────────────────────────────

  const formInitial = useMemo<Partial<PlaybookFormValues> | undefined>(() => {
    if (!playbook) return undefined;
    return {
      name: playbook.name,
      description: playbook.description ?? '',
      category: playbook.category ?? '',
      triggerKind: playbook.triggerKind,
      triggerEvent: playbook.triggerConfig?.event ?? '',
      triggerCron: playbook.triggerConfig?.cron ?? '',
      ownerId: playbook.ownerId,
    };
  }, [playbook]);

  const onMetaSubmit = useCallback(
    async (values: PlaybookFormValues) => {
      setError(null);
      const triggerConfig = valuesToTriggerConfig(values);
      const r = await fetch(`/api/portal/brain/playbooks/${playbookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          description: values.description.trim() || null,
          category: values.category.trim() || null,
          triggerKind: values.triggerKind,
          triggerConfig,
          ownerId: values.ownerId ?? null,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        throw new Error(json.message || 'Update failed');
      }
      await load();
    },
    [playbookId, load],
  );

  // ─── step ops ─────────────────────────────────────────────────────────────

  const onPatchStep = useCallback(
    async (stepId: number, patch: Partial<PlaybookStepRow>) => {
      // Optimistic local update — keeps the form responsive.
      setSteps((prev) =>
        prev.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
      );
      try {
        const body: Record<string, unknown> = {};
        if (patch.key !== undefined) body.key = patch.key;
        if (patch.name !== undefined) body.name = patch.name;
        if (patch.description !== undefined) body.description = patch.description;
        if (patch.kind !== undefined) body.kind = patch.kind;
        if (patch.config !== undefined) body.config = patch.config;
        if (patch.condition !== undefined) body.condition = patch.condition;
        if (patch.nextStepKeys !== undefined) body.nextStepKeys = patch.nextStepKeys;
        if (patch.sortOrder !== undefined) body.sortOrder = patch.sortOrder;

        const r = await fetch(
          `/api/portal/brain/playbooks/${playbookId}/steps/${stepId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        const json = await r.json();
        if (!r.ok || !json.success) {
          setError(json.message || 'Step update failed');
          // Reload to surface the canonical state.
          await load();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Network error');
        await load();
      }
    },
    [playbookId, load],
  );

  const onRemoveStep = useCallback(
    async (stepId: number) => {
      if (!confirm('Remove this step? Any references in other steps’ nextStepKeys will be cleaned up.')) return;
      setBusy(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/portal/brain/playbooks/${playbookId}/steps/${stepId}`,
          { method: 'DELETE' },
        );
        const json = await r.json().catch(() => ({}));
        if (!r.ok || !json.success) {
          setError(json.message || 'Remove failed');
          return;
        }
        await load();
      } finally {
        setBusy(false);
      }
    },
    [playbookId, load],
  );

  const onAddStep = useCallback(
    async (kind: BrainPlaybookStepKind) => {
      setBusy(true);
      setError(null);
      try {
        // Mint a unique step key against the existing set.
        const existing = new Set(steps.map((s) => s.key));
        let key: string = kind;
        let n = 2;
        while (existing.has(key)) {
          key = `${kind}_${n}`;
          n += 1;
        }

        const r = await fetch(
          `/api/portal/brain/playbooks/${playbookId}/steps`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key,
              name: `New ${playbookStepKindChip(kind).label.toLowerCase()} step`,
              kind,
              config: {},
              nextStepKeys: [],
            }),
          },
        );
        const json = await r.json();
        if (!r.ok || !json.success) {
          setError(json.message || 'Add step failed');
          return;
        }
        await load();
      } finally {
        setBusy(false);
      }
    },
    [playbookId, steps, load],
  );

  // ─── drag-and-drop reorder ────────────────────────────────────────────────

  const reorderTo = useCallback(
    async (orderedStepIds: number[]) => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch(
          `/api/portal/brain/playbooks/${playbookId}/steps`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderedStepIds }),
          },
        );
        const json = await r.json();
        if (!r.ok || !json.success) {
          setError(json.message || 'Reorder failed');
          await load();
          return;
        }
        if (Array.isArray(json.data?.items)) {
          setSteps(json.data.items as PlaybookStepRow[]);
        }
      } finally {
        setBusy(false);
      }
    },
    [playbookId, load],
  );

  const handleDragStart = (id: number) => (e: React.DragEvent<HTMLDivElement>) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    // Some browsers require a non-empty payload for the drag to fire.
    e.dataTransfer.setData('text/plain', String(id));
  };

  const handleDragEnd = () => () => setDraggingId(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (targetId: number) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (draggingId === null || draggingId === targetId) {
      setDraggingId(null);
      return;
    }
    const ids = steps.map((s) => s.id);
    const fromIdx = ids.indexOf(draggingId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx < 0 || toIdx < 0) {
      setDraggingId(null);
      return;
    }
    const reordered = [...ids];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setDraggingId(null);

    // Optimistic local apply.
    const byId = new Map(steps.map((s) => [s.id, s]));
    const newSteps = reordered.map((sid, i) => {
      const s = byId.get(sid)!;
      return { ...s, sortOrder: i };
    });
    setSteps(newSteps);
    reorderTo(reordered);
  };

  // ─── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 flex items-center justify-center text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    );
  }

  if (error && !playbook) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Link
          href="/portal/brain/playbooks"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="material-icons text-sm">chevron_left</span>
          Playbooks
        </Link>
        <div className="mt-4 bg-destructive/10 border border-destructive/30 rounded-md p-4 text-sm text-destructive flex items-center gap-2">
          <span className="material-icons text-base">error_outline</span>
          {error || 'Playbook not found'}
        </div>
      </div>
    );
  }

  if (!playbook) return null;

  const statusChip = playbookStatusChip(playbook.status);

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-6">
      <Link
        href={`/portal/brain/playbooks/${playbookId}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="material-icons text-sm">chevron_left</span>
        Back to playbook
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">edit_note</span>
          Edit playbook
        </h1>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${statusChip.className}`}
          >
            <span className="material-icons text-[14px]">{statusChip.icon}</span>
            {statusChip.label}
          </span>
          <span className="font-mono">{playbook.slug}</span>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive flex items-center gap-2">
          <span className="material-icons text-base">error_outline</span>
          {error}
        </div>
      )}

      {/* Metadata */}
      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold text-foreground mb-3">Details</h2>
        <PlaybookForm
          key={playbook.id}
          mode="edit"
          team={team}
          initial={formInitial}
          onSubmit={onMetaSubmit}
          submitLabel="Save details"
        />
      </section>

      {/* Steps */}
      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="text-base font-semibold text-foreground inline-flex items-center gap-2">
            <span className="material-icons text-base text-primary">account_tree</span>
            Steps
            <span className="text-xs text-muted-foreground font-normal">
              ({steps.length})
            </span>
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Drag to reorder. Changes save automatically.
          </p>
        </div>

        {steps.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground bg-muted/30 rounded-md border border-dashed border-border">
            No steps yet. Use the buttons below to add your first step.
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((step) => (
              <div
                key={step.id}
                className={draggingId === step.id ? 'opacity-50' : ''}
              >
                <PlaybookStepEditor
                  step={step}
                  siblings={steps}
                  onPatch={(patch) => onPatchStep(step.id, patch)}
                  onRemove={() => onRemoveStep(step.id)}
                  dragHandleProps={{
                    onDragStart: handleDragStart(step.id),
                    onDragEnd: handleDragEnd(),
                  }}
                  dropTargetProps={{
                    onDragOver: handleDragOver,
                    onDrop: handleDrop(step.id),
                  }}
                  busy={busy}
                />
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-border">
          <span className="block text-xs font-medium text-muted-foreground mb-2">
            Add step
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {PLAYBOOK_STEP_KINDS.map((k) => {
              const chip = playbookStepKindChip(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => onAddStep(k)}
                  disabled={busy}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border border-border hover:bg-accent disabled:opacity-50 ${chip.className}`}
                >
                  <span className="material-icons text-sm">{chip.icon}</span>
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
