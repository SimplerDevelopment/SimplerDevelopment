'use client';

/**
 * Single-step inline editor used by the playbook edit page.
 *
 * Surfaces:
 *   - Step name (inline-editable)
 *   - Kind dropdown — task | note | meeting | decision | review_item | wait | branch
 *   - Kind-aware config form (e.g. dueOffsetDays for task, cron for wait)
 *   - Optional condition editor ({ field, op, value })
 *   - nextStepKeys multi-select against the other steps in the same playbook
 *
 * The component is "controlled-on-save" — local state mirrors `step` and we
 * call `onChange(patch)` debounced by the parent. Drag-handle is rendered
 * here; the parent wires the actual drag-and-drop reorder.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PLAYBOOK_CONDITION_OPS,
  PLAYBOOK_STEP_KINDS,
  playbookStepKindChip,
  type BrainPlaybookCondition,
  type BrainPlaybookConditionOp,
  type BrainPlaybookStepKind,
  type PlaybookStepRow,
} from './playbooks-shared';

interface Props {
  step: PlaybookStepRow;
  /** All sibling steps in the same playbook — for the nextStepKeys multi-select. */
  siblings: PlaybookStepRow[];
  onPatch: (patch: Partial<PlaybookStepRow>) => void;
  onRemove: () => void;
  /** Drag-handle helpers — wired in the parent. */
  dragHandleProps?: {
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
    onDragEnd: (e: React.DragEvent<HTMLDivElement>) => void;
  };
  /** Drop target helpers for the row container. */
  dropTargetProps?: {
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  };
  busy?: boolean;
}

// ─── debounce hook ─────────────────────────────────────────────────────────

function useDebouncedPatch(patch: (p: Partial<PlaybookStepRow>) => void, delayMs = 500) {
  const pendingRef = useRef<Partial<PlaybookStepRow>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (Object.keys(pendingRef.current).length > 0) {
      const p = pendingRef.current;
      pendingRef.current = {};
      patch(p);
    }
  };

  const schedule = (p: Partial<PlaybookStepRow>) => {
    pendingRef.current = { ...pendingRef.current, ...p };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, delayMs);
  };

  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { schedule, flush };
}

// ─── kind-aware config form ────────────────────────────────────────────────

function StepConfigForm({
  kind,
  config,
  onChange,
  disabled,
}: {
  kind: BrainPlaybookStepKind;
  config: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  const set = (key: string, val: unknown) => {
    const next = { ...config };
    if (val === '' || val === null || val === undefined) delete next[key];
    else next[key] = val;
    onChange(next);
  };

  const inputCls =
    'w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50';

  switch (kind) {
    case 'task':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-medium text-muted-foreground">Title template</span>
            <input
              type="text"
              value={String(config.title ?? '')}
              onChange={(e) => set('title', e.target.value)}
              disabled={disabled}
              placeholder="e.g. Send welcome packet to {{personName}}"
              className={inputCls}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-medium text-muted-foreground">Description</span>
            <textarea
              value={String(config.description ?? '')}
              onChange={(e) => set('description', e.target.value)}
              disabled={disabled}
              rows={2}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Owner hint</span>
            <input
              type="text"
              value={String(config.ownerHint ?? '')}
              onChange={(e) => set('ownerHint', e.target.value)}
              disabled={disabled}
              placeholder="manager / hr / csm"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Due (days from start)</span>
            <input
              type="number"
              step="1"
              value={
                typeof config.dueOffsetDays === 'number' ? String(config.dueOffsetDays) : ''
              }
              onChange={(e) =>
                set('dueOffsetDays', e.target.value === '' ? null : Number(e.target.value))
              }
              disabled={disabled}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Priority</span>
            <select
              value={String(config.priority ?? 'medium')}
              onChange={(e) => set('priority', e.target.value)}
              disabled={disabled}
              className={inputCls}
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="urgent">urgent</option>
            </select>
          </label>
        </div>
      );

    case 'note':
      return (
        <div className="grid grid-cols-1 gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Title</span>
            <input
              type="text"
              value={String(config.title ?? '')}
              onChange={(e) => set('title', e.target.value)}
              disabled={disabled}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Body (templates supported — {`{{var}}`})</span>
            <textarea
              value={String(config.body ?? '')}
              onChange={(e) => set('body', e.target.value)}
              disabled={disabled}
              rows={4}
              className={inputCls}
            />
          </label>
        </div>
      );

    case 'meeting':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label className="block sm:col-span-3">
            <span className="text-[11px] font-medium text-muted-foreground">Title</span>
            <input
              type="text"
              value={String(config.title ?? '')}
              onChange={(e) => set('title', e.target.value)}
              disabled={disabled}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Start (days from start)</span>
            <input
              type="number"
              step="1"
              value={
                typeof config.startOffsetDays === 'number' ? String(config.startOffsetDays) : ''
              }
              onChange={(e) =>
                set('startOffsetDays', e.target.value === '' ? null : Number(e.target.value))
              }
              disabled={disabled}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Duration (min)</span>
            <input
              type="number"
              step="5"
              value={typeof config.durationMin === 'number' ? String(config.durationMin) : ''}
              onChange={(e) =>
                set('durationMin', e.target.value === '' ? null : Number(e.target.value))
              }
              disabled={disabled}
              placeholder="30"
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Description</span>
            <input
              type="text"
              value={String(config.description ?? '')}
              onChange={(e) => set('description', e.target.value)}
              disabled={disabled}
              className={inputCls}
            />
          </label>
        </div>
      );

    case 'decision':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-medium text-muted-foreground">Decision title</span>
            <input
              type="text"
              value={String(config.title ?? '')}
              onChange={(e) => set('title', e.target.value)}
              disabled={disabled}
              className={inputCls}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-medium text-muted-foreground">Context</span>
            <textarea
              value={String(config.context ?? '')}
              onChange={(e) => set('context', e.target.value)}
              disabled={disabled}
              rows={2}
              className={inputCls}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-medium text-muted-foreground">Decision</span>
            <textarea
              value={String(config.decision ?? '')}
              onChange={(e) => set('decision', e.target.value)}
              disabled={disabled}
              rows={2}
              className={inputCls}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-medium text-muted-foreground">Rationale</span>
            <textarea
              value={String(config.rationale ?? '')}
              onChange={(e) => set('rationale', e.target.value)}
              disabled={disabled}
              rows={2}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Reversibility</span>
            <select
              value={String(config.reversibility ?? 'two_way')}
              onChange={(e) => set('reversibility', e.target.value)}
              disabled={disabled}
              className={inputCls}
            >
              <option value="two_way">Two-way</option>
              <option value="one_way">One-way</option>
            </select>
          </label>
        </div>
      );

    case 'review_item':
      return (
        <div className="grid grid-cols-1 gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Proposed type</span>
            <input
              type="text"
              value={String(config.proposedType ?? '')}
              onChange={(e) => set('proposedType', e.target.value)}
              disabled={disabled}
              placeholder="note / topic / decision / …"
              className={inputCls}
            />
          </label>
          <p className="text-[11px] text-muted-foreground">
            The proposed payload is built from run context — leave it blank to seed an empty
            payload, or populate it via context variables.
          </p>
        </div>
      );

    case 'wait':
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] font-medium text-muted-foreground">Wait until (days from start)</span>
            <input
              type="number"
              step="1"
              value={
                typeof config.untilOffsetDays === 'number'
                  ? String(config.untilOffsetDays)
                  : ''
              }
              onChange={(e) =>
                set('untilOffsetDays', e.target.value === '' ? null : Number(e.target.value))
              }
              disabled={disabled}
              placeholder="e.g. 7"
              className={inputCls}
            />
          </label>
        </div>
      );

    case 'branch':
      return (
        <p className="text-[11px] text-muted-foreground italic">
          Pure routing step — no side effect. Use the condition + next steps below to wire
          two divergent paths.
        </p>
      );
  }
}

// ─── condition editor ──────────────────────────────────────────────────────

function ConditionEditor({
  condition,
  onChange,
  disabled,
}: {
  condition: BrainPlaybookCondition | null;
  onChange: (next: BrainPlaybookCondition | null) => void;
  disabled?: boolean;
}) {
  const inputCls =
    'px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50';

  if (!condition) {
    return (
      <button
        type="button"
        onClick={() => onChange({ field: '', op: 'eq', value: '' })}
        disabled={disabled}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-dashed border-border text-muted-foreground hover:bg-accent disabled:opacity-50"
      >
        <span className="material-icons text-sm">add</span>
        Add condition
      </button>
    );
  }

  const op = condition.op;
  const needsValue = !(['exists', 'not_exists'] as BrainPlaybookConditionOp[]).includes(op);

  return (
    <div className="grid grid-cols-12 gap-2 items-start">
      <input
        type="text"
        value={condition.field}
        onChange={(e) => onChange({ ...condition, field: e.target.value })}
        placeholder="field (e.g. person.role)"
        disabled={disabled}
        className={`col-span-5 ${inputCls}`}
      />
      <select
        value={condition.op}
        onChange={(e) => onChange({ ...condition, op: e.target.value as BrainPlaybookConditionOp })}
        disabled={disabled}
        className={`col-span-2 ${inputCls}`}
      >
        {PLAYBOOK_CONDITION_OPS.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <input
        type="text"
        value={
          condition.value === undefined || condition.value === null
            ? ''
            : typeof condition.value === 'string'
              ? condition.value
              : JSON.stringify(condition.value)
        }
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        disabled={disabled || !needsValue}
        placeholder={needsValue ? 'value' : '— not used —'}
        className={`col-span-4 ${inputCls}`}
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        disabled={disabled}
        aria-label="Remove condition"
        className="col-span-1 p-1 text-muted-foreground hover:text-destructive rounded justify-self-end"
      >
        <span className="material-icons text-sm">close</span>
      </button>
    </div>
  );
}

// ─── main ──────────────────────────────────────────────────────────────────

export default function PlaybookStepEditor({
  step,
  siblings,
  onPatch,
  onRemove,
  dragHandleProps,
  dropTargetProps,
  busy,
}: Props) {
  const { schedule, flush } = useDebouncedPatch(onPatch, 500);

  const [local, setLocal] = useState({
    key: step.key,
    name: step.name,
    description: step.description ?? '',
  });

  // Re-sync local fields if parent's step row changed (e.g. server returned an
  // authoritative version after PATCH).
  useEffect(() => {
    setLocal({
      key: step.key,
      name: step.name,
      description: step.description ?? '',
    });
  }, [step.id, step.key, step.name, step.description]);

  const kindChip = playbookStepKindChip(step.kind);

  const nextStepKeysSet = useMemo(() => new Set(step.nextStepKeys ?? []), [step.nextStepKeys]);
  const otherSiblings = useMemo(
    () => siblings.filter((s) => s.id !== step.id),
    [siblings, step.id],
  );

  const toggleNext = (k: string) => {
    const next = new Set(nextStepKeysSet);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onPatch({ nextStepKeys: Array.from(next) });
  };

  return (
    <div
      {...dropTargetProps}
      className="bg-card border border-border rounded-xl p-3 space-y-3"
    >
      <div className="flex items-start gap-2">
        <div
          draggable={!busy}
          onDragStart={dragHandleProps?.onDragStart}
          onDragEnd={dragHandleProps?.onDragEnd}
          className="cursor-grab active:cursor-grabbing select-none text-muted-foreground hover:text-foreground p-1"
          title="Drag to reorder"
        >
          <span className="material-icons text-lg">drag_indicator</span>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start gap-2 flex-wrap">
            <input
              type="text"
              value={local.name}
              onChange={(e) => {
                setLocal((p) => ({ ...p, name: e.target.value }));
                schedule({ name: e.target.value });
              }}
              onBlur={flush}
              placeholder="Step name"
              disabled={busy}
              className="flex-1 min-w-[12rem] px-2 py-1.5 text-sm font-semibold rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
            <select
              value={step.kind}
              onChange={(e) => onPatch({ kind: e.target.value as BrainPlaybookStepKind })}
              disabled={busy}
              className={`px-2 py-1.5 text-xs font-medium rounded-md border border-border ${kindChip.className} focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50`}
            >
              {PLAYBOOK_STEP_KINDS.map((k) => (
                <option key={k} value={k}>{playbookStepKindChip(k).label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              aria-label="Remove this step"
              className="p-1.5 text-muted-foreground hover:text-destructive rounded disabled:opacity-50"
            >
              <span className="material-icons text-base">delete</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">Key</span>
              <input
                type="text"
                value={local.key}
                onChange={(e) => {
                  setLocal((p) => ({ ...p, key: e.target.value }));
                  schedule({ key: e.target.value });
                }}
                onBlur={flush}
                placeholder="stable_step_key"
                disabled={busy}
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium text-muted-foreground">Description</span>
              <input
                type="text"
                value={local.description}
                onChange={(e) => {
                  setLocal((p) => ({ ...p, description: e.target.value }));
                  schedule({ description: e.target.value });
                }}
                onBlur={flush}
                placeholder="Short description (optional)"
                disabled={busy}
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
            </label>
          </div>

          <div>
            <span className="block text-[11px] font-medium text-muted-foreground mb-1">
              {kindChip.label} config
            </span>
            <StepConfigForm
              kind={step.kind}
              config={step.config ?? {}}
              onChange={(c) => onPatch({ config: c })}
              disabled={busy}
            />
          </div>

          <div>
            <span className="block text-[11px] font-medium text-muted-foreground mb-1">
              Condition
            </span>
            <ConditionEditor
              condition={step.condition}
              onChange={(c) => onPatch({ condition: c })}
              disabled={busy}
            />
          </div>

          <div>
            <span className="block text-[11px] font-medium text-muted-foreground mb-1">
              Next steps
            </span>
            {otherSiblings.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                Add more steps to wire branches.
              </p>
            ) : (
              <div className="flex items-center gap-1 flex-wrap">
                {otherSiblings.map((s) => {
                  const active = nextStepKeysSet.has(s.key);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleNext(s.key)}
                      disabled={busy}
                      className={`px-2 py-1 text-[11px] rounded-md border transition-colors disabled:opacity-50 ${
                        active
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'border-border text-muted-foreground hover:bg-accent'
                      }`}
                    >
                      {active && (
                        <span className="material-icons text-[12px] mr-0.5 align-middle">
                          check
                        </span>
                      )}
                      {s.name || s.key}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
