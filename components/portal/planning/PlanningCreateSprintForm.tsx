'use client';

// The create-sprint form, lifted verbatim from the pre-consolidation
// SprintPlanning.tsx (~lines 403-461).

export interface SprintFormState {
  name: string;
  goal: string;
  startDate: string;
  endDate: string;
}

interface Props {
  form: SprintFormState;
  onFormChange: (form: SprintFormState) => void;
  onSubmit: (e: React.FormEvent) => void;
  saving: boolean;
  onCancel: () => void;
}

export default function PlanningCreateSprintForm({ form, onFormChange, onSubmit, saving, onCancel }: Props) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <h3 className="text-base font-semibold text-foreground mb-4">Create Sprint</h3>
      <form onSubmit={onSubmit} className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Sprint Name <span className="text-destructive">*</span></label>
          <input
            required
            type="text"
            placeholder="Sprint 1"
            value={form.name}
            onChange={e => onFormChange({ ...form, name: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Goal</label>
          <input
            type="text"
            placeholder="What does this sprint achieve?"
            value={form.goal}
            onChange={e => onFormChange({ ...form, goal: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Start Date</label>
          <input
            type="date"
            value={form.startDate}
            onChange={e => onFormChange({ ...form, startDate: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">End Date</label>
          <input
            type="date"
            value={form.endDate}
            onChange={e => onFormChange({ ...form, endDate: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="sm:col-span-2 flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <><span className="material-icons text-base animate-spin">refresh</span>Creating…</> : 'Create Sprint'}
          </button>
        </div>
      </form>
    </div>
  );
}
