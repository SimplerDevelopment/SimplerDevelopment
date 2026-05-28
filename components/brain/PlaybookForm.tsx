'use client';

/**
 * Shared create/edit form for a playbook's metadata (name, description,
 * category, trigger config, owner, default topics).
 *
 * Step authoring happens elsewhere — this form only deals with the playbook
 * record itself. Use the dedicated step editor at /playbooks/[id]/edit for
 * step graph authoring.
 */
import { useState } from 'react';
import {
  PLAYBOOK_TRIGGER_KINDS,
  playbookTriggerKindChip,
  type BrainPlaybookTriggerKind,
  type PlaybookTriggerConfig,
} from './playbooks-shared';

export interface PlaybookFormValues {
  name: string;
  description: string;
  category: string;
  triggerKind: BrainPlaybookTriggerKind;
  triggerEvent: string;
  triggerCron: string;
  ownerId: number | null;
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
  initial?: Partial<PlaybookFormValues>;
  onSubmit: (values: PlaybookFormValues) => Promise<void> | void;
}

export type PlaybookFormProps = CreateOrEditProps;

const EMPTY_VALUES: PlaybookFormValues = {
  name: '',
  description: '',
  category: '',
  triggerKind: 'manual',
  triggerEvent: '',
  triggerCron: '',
  ownerId: null,
};

/**
 * Reduce form values to the payload the create/update endpoints expect.
 * `null` clears a field, `undefined` leaves it untouched (PATCH semantics).
 */
export function valuesToTriggerConfig(values: PlaybookFormValues): PlaybookTriggerConfig | null {
  if (values.triggerKind === 'event' && values.triggerEvent.trim()) {
    return { event: values.triggerEvent.trim() };
  }
  if (values.triggerKind === 'scheduled' && values.triggerCron.trim()) {
    return { cron: values.triggerCron.trim() };
  }
  return null;
}

export default function PlaybookForm({
  mode,
  initial,
  onSubmit,
  onCancel,
  team,
  submitLabel,
}: PlaybookFormProps) {
  const [values, setValues] = useState<PlaybookFormValues>({ ...EMPTY_VALUES, ...initial });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof PlaybookFormValues>(key: K, val: PlaybookFormValues[K]) => {
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
          maxLength={200}
          required
          autoFocus={mode === 'create'}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="e.g. New-hire onboarding"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
        <textarea
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          rows={3}
          maxLength={10_000}
          className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="What does this playbook do? When should someone start a run?"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
          <input
            type="text"
            value={values.category}
            onChange={(e) => set('category', e.target.value)}
            maxLength={100}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="hr, sales, ops, compliance…"
          />
        </div>
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
      </div>

      <div>
        <span className="block text-xs font-medium text-muted-foreground mb-1.5">Trigger</span>
        <div className="grid grid-cols-3 gap-2">
          {PLAYBOOK_TRIGGER_KINDS.map((k) => {
            const chip = playbookTriggerKindChip(k);
            const active = values.triggerKind === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => set('triggerKind', k)}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
                  active
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                <span className="material-icons text-base">{chip.icon}</span>
                {chip.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Manual = a user kicks off each run.
          Event = an automation event fires it (Phase G; saved but not yet acted on).
          Scheduled = a cron fires it (Phase G; saved but not yet acted on).
        </p>
      </div>

      {values.triggerKind === 'event' && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Event name
          </label>
          <input
            type="text"
            value={values.triggerEvent}
            onChange={(e) => set('triggerEvent', e.target.value)}
            maxLength={200}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="e.g. initiative.created, crm_deal.won"
          />
        </div>
      )}

      {values.triggerKind === 'scheduled' && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Cron expression
          </label>
          <input
            type="text"
            value={values.triggerCron}
            onChange={(e) => set('triggerCron', e.target.value)}
            maxLength={120}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="0 9 * * 1 (Mondays at 9am)"
          />
        </div>
      )}

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
          {submitting ? (
            <>
              <span className="material-icons animate-spin text-base">progress_activity</span>
              Saving…
            </>
          ) : (
            <>
              <span className="material-icons text-base">{mode === 'create' ? 'add' : 'save'}</span>
              {submitLabel ?? (mode === 'create' ? 'Create playbook' : 'Save changes')}
            </>
          )}
        </button>
      </div>
    </form>
  );
}
