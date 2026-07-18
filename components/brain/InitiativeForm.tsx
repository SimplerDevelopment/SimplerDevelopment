'use client';

/**
 * Shared form for creating, editing, and closing an initiative.
 *
 * The three modes have different field sets:
 *   - 'create' — full create form (name, description, priority, owner, dates, confidentiality)
 *   - 'edit'   — same as create minus status, no slug change
 *   - 'close'  — outcome radio + reason + lessons-learned (terminal transition only)
 *
 * Owners are pulled from /api/portal/team. The form does not call the API
 * itself — onSubmit is the integration point.
 */
import { useState } from 'react';
import {
  INITIATIVE_PRIORITIES,
  initiativePriorityChip,
  type BrainInitiativePriority,
} from './initiatives-shared';

export interface InitiativeFormValues {
  name: string;
  description: string;
  priority: BrainInitiativePriority;
  ownerId: number | null;
  sponsorId: number | null;
  startDate: string;   // ISO 'YYYY-MM-DD' or ''
  targetDate: string;
  confidentialityLevel: 'standard' | 'restricted' | 'confidential';
}

export interface InitiativeCloseValues {
  outcome: 'completed' | 'cancelled';
  reason: string;
  lessonsLearned: string;
}

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

interface BasePropsCommon {
  team?: TeamMember[];
  onCancel?: () => void;
  submitLabel?: string;
}

interface CreateOrEditProps extends BasePropsCommon {
  mode: 'create' | 'edit';
  initial?: Partial<InitiativeFormValues>;
  onSubmit: (values: InitiativeFormValues) => Promise<void> | void;
}

interface CloseProps extends BasePropsCommon {
  mode: 'close';
  initial?: Partial<InitiativeCloseValues>;
  onSubmit: (values: InitiativeCloseValues) => Promise<void> | void;
}

export type InitiativeFormProps = CreateOrEditProps | CloseProps;

const EMPTY_VALUES: InitiativeFormValues = {
  name: '',
  description: '',
  priority: 'medium',
  ownerId: null,
  sponsorId: null,
  startDate: '',
  targetDate: '',
  confidentialityLevel: 'standard',
};

const EMPTY_CLOSE: InitiativeCloseValues = {
  outcome: 'completed',
  reason: '',
  lessonsLearned: '',
};

export default function InitiativeForm(props: InitiativeFormProps) {
  if (props.mode === 'close') return <CloseForm {...props} />;
  return <CreateEditForm {...props} />;
}

function CreateEditForm({ mode, initial, onSubmit, onCancel, team, submitLabel }: CreateOrEditProps) {
  // Parent is responsible for keying the form by initiative id so a different
  // initial set forces a remount. We do not re-sync `initial` on prop change.
  const [values, setValues] = useState<InitiativeFormValues>({ ...EMPTY_VALUES, ...initial });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof InitiativeFormValues>(key: K, val: InitiativeFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.name.trim()) {
      setErr('Name is required');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit({ ...values, name: values.name.trim() });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Name <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          maxLength={255}
          required
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="e.g. Launch SOC 2 audit by Q3"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
        <textarea
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          maxLength={50_000}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="What does success look like? Who's affected? Where do followups live?"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
          <div className="flex items-center gap-1">
            {INITIATIVE_PRIORITIES.map((p) => {
              const chip = initiativePriorityChip(p);
              const active = values.priority === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => set('priority', p)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    active
                      ? chip.className
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Confidentiality</label>
          <select
            value={values.confidentialityLevel}
            onChange={(e) => set('confidentialityLevel', e.target.value as InitiativeFormValues['confidentialityLevel'])}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="standard">Standard</option>
            <option value="restricted">Restricted</option>
            <option value="confidential">Confidential</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Owner</label>
          <select
            value={values.ownerId ?? ''}
            onChange={(e) => set('ownerId', e.target.value ? parseInt(e.target.value, 10) : null)}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Unassigned</option>
            {team?.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Sponsor (optional)</label>
          <select
            value={values.sponsorId ?? ''}
            onChange={(e) => set('sponsorId', e.target.value ? parseInt(e.target.value, 10) : null)}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">None</option>
            {team?.map((m) => (
              <option key={m.userId} value={m.userId}>{m.name || m.email}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Start date</label>
          <input
            type="date"
            value={values.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Target date</label>
          <input
            type="date"
            value={values.targetDate}
            onChange={(e) => set('targetDate', e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {err && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
          {err}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting
            ? <><span className="material-icons animate-spin text-base">progress_activity</span>Saving…</>
            : <><span className="material-icons text-base">{mode === 'create' ? 'add' : 'save'}</span>
                {submitLabel ?? (mode === 'create' ? 'Create initiative' : 'Save changes')}
              </>}
        </button>
      </div>
    </form>
  );
}

function CloseForm({ initial, onSubmit, onCancel, submitLabel }: CloseProps) {
  const [values, setValues] = useState<InitiativeCloseValues>({ ...EMPTY_CLOSE, ...initial });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof InitiativeCloseValues>(k: K, v: InitiativeCloseValues[K]) => {
    setValues((p) => ({ ...p, [k]: v }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.reason.trim() && !values.lessonsLearned.trim()) {
      setErr('Provide a reason or lessons learned (at least one is required).');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await onSubmit({
        outcome: values.outcome,
        reason: values.reason.trim(),
        lessonsLearned: values.lessonsLearned.trim(),
      });
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Close failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <span className="block text-xs font-medium text-muted-foreground mb-1.5">Outcome</span>
        <div className="grid grid-cols-2 gap-2">
          <label
            className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
              values.outcome === 'completed'
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            <input
              type="radio"
              checked={values.outcome === 'completed'}
              onChange={() => set('outcome', 'completed')}
              className="accent-primary"
            />
            <span className="material-icons text-base text-emerald-600 dark:text-emerald-400">check_circle</span>
            <span className="text-sm font-medium">Completed</span>
          </label>
          <label
            className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
              values.outcome === 'cancelled'
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:bg-accent'
            }`}
          >
            <input
              type="radio"
              checked={values.outcome === 'cancelled'}
              onChange={() => set('outcome', 'cancelled')}
              className="accent-primary"
            />
            <span className="material-icons text-base text-zinc-500">cancel</span>
            <span className="text-sm font-medium">Cancelled</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Reason</label>
        <textarea
          value={values.reason}
          onChange={(e) => set('reason', e.target.value)}
          rows={2}
          maxLength={5000}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="One-line summary of why this is closing."
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Lessons learned <span className="text-muted-foreground/70">(saved as a linked note)</span>
        </label>
        <textarea
          value={values.lessonsLearned}
          onChange={(e) => set('lessonsLearned', e.target.value)}
          rows={5}
          maxLength={50_000}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="What worked, what didn't, what would we do differently?"
        />
      </div>

      {err && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
          {err}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting
            ? <><span className="material-icons animate-spin text-base">progress_activity</span>Closing…</>
            : <><span className="material-icons text-base">archive</span>{submitLabel ?? 'Close initiative'}</>}
        </button>
      </div>
    </form>
  );
}
