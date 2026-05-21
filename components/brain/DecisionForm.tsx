'use client';

/**
 * DecisionForm — shared form for creating, editing, and superseding a
 * brain_decisions record.
 *
 *   mode='create'     — full form, blank.
 *   mode='supersede'  — full form, pre-filled from the predecessor. On submit
 *                       the parent posts to /api/portal/brain/decisions/[id]/supersede.
 *   mode='edit'       — narrow form. Hides rationale / decision / reversibility
 *                       because lib/brain/decisions.ts rejects in-place edits
 *                       on those fields (callers must supersede instead).
 *
 * The form is a controlled component: it raises (`onSubmit`) the cleaned
 * payload as `CreateDecisionInput` / `UpdateDecisionInput`. The parent route
 * decides what endpoint to hit and where to redirect. Topic attachment is
 * also raised so the parent can POST /api/portal/brain/topics/attach AFTER
 * the decision row exists.
 */
import { useEffect, useMemo, useState } from 'react';
import type {
  BrainDecisionReversibility,
} from '@/lib/db/schema';

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

interface TopicTreeNode {
  id: number;
  name: string;
  path: string;
  children?: TopicTreeNode[];
}

export type DecisionFormMode = 'create' | 'edit' | 'supersede';

export interface DecisionFormInitial {
  title?: string;
  context?: string | null;
  decision?: string;
  rationale?: string;
  alternativesConsidered?: string | null;
  reversibility?: BrainDecisionReversibility;
  decidedAt?: string | Date;
  decisionMakerId?: number | null;
  meetingId?: number | null;
  noteId?: number | null;
  companyId?: number | null;
  dealId?: number | null;
  confidentialityLevel?: 'standard' | 'restricted' | 'confidential';
  topicIds?: number[];
}

export interface DecisionFormSubmitPayload {
  title: string;
  context: string | null;
  decision: string;
  rationale: string;
  alternativesConsidered: string | null;
  reversibility: BrainDecisionReversibility;
  decidedAt: string;
  decisionMakerId: number | null;
  anchors: {
    meetingId: number | null;
    noteId: number | null;
    companyId: number | null;
    dealId: number | null;
  };
  confidentialityLevel: 'standard' | 'restricted' | 'confidential';
  topicIds: number[];
}

export interface DecisionFormProps {
  mode: DecisionFormMode;
  initial?: DecisionFormInitial;
  submitLabel?: string;
  cancelHref?: string;
  onSubmit: (payload: DecisionFormSubmitPayload) => Promise<void> | void;
  /** Error from the last submit attempt, displayed near the action row. */
  submitError?: string | null;
  /** When true, disables the submit button + shows a spinner. */
  submitting?: boolean;
}

function toIsoDateInputValue(input: string | Date | undefined): string {
  if (!input) {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function flattenTopics(nodes: TopicTreeNode[], depth = 0): Array<TopicTreeNode & { depth: number }> {
  const out: Array<TopicTreeNode & { depth: number }> = [];
  for (const n of nodes) {
    out.push({ ...n, depth });
    if (n.children?.length) out.push(...flattenTopics(n.children, depth + 1));
  }
  return out;
}

export default function DecisionForm({
  mode,
  initial,
  submitLabel,
  cancelHref,
  onSubmit,
  submitError,
  submitting,
}: DecisionFormProps) {
  const isEdit = mode === 'edit';
  const isSupersede = mode === 'supersede';

  const [title, setTitle] = useState(initial?.title ?? '');
  const [context, setContext] = useState(initial?.context ?? '');
  const [decision, setDecision] = useState(initial?.decision ?? '');
  const [rationale, setRationale] = useState(initial?.rationale ?? '');
  const [alternatives, setAlternatives] = useState(initial?.alternativesConsidered ?? '');
  const [reversibility, setReversibility] = useState<BrainDecisionReversibility>(initial?.reversibility ?? 'two_way');
  const [decidedAt, setDecidedAt] = useState<string>(toIsoDateInputValue(initial?.decidedAt));
  const [decisionMakerId, setDecisionMakerId] = useState<number | null>(initial?.decisionMakerId ?? null);
  const [meetingId, setMeetingId] = useState<string>(initial?.meetingId ? String(initial.meetingId) : '');
  const [noteId, setNoteId] = useState<string>(initial?.noteId ? String(initial.noteId) : '');
  const [companyId, setCompanyId] = useState<string>(initial?.companyId ? String(initial.companyId) : '');
  const [dealId, setDealId] = useState<string>(initial?.dealId ? String(initial.dealId) : '');
  const [confidentiality, setConfidentiality] = useState<'standard' | 'restricted' | 'confidential'>(
    initial?.confidentialityLevel ?? 'standard',
  );
  const [topicIds, setTopicIds] = useState<number[]>(initial?.topicIds ?? []);

  const [team, setTeam] = useState<TeamMember[]>([]);
  const [topics, setTopics] = useState<TopicTreeNode[]>([]);
  const [validation, setValidation] = useState<string | null>(null);

  // Load team for the decision-maker dropdown.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/team')
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res?.success && Array.isArray(res.data)) {
          // Shape from /api/portal/team is { memberId, userId, name, email, role, ... }.
          const rows: TeamMember[] = res.data
            .map((m: { userId?: number; name?: string | null; email?: string }) => ({
              userId: typeof m.userId === 'number' ? m.userId : 0,
              name: m.name ?? null,
              email: m.email ?? '',
            }))
            .filter((m: TeamMember) => m.userId > 0);
          setTeam(rows);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Load topic tree for the topic chips picker — only when we actually need
  // it (topic attach happens after the row exists, so edit mode hides the
  // picker since edit-flow topic management is a future enhancement).
  const showTopics = !isEdit;
  useEffect(() => {
    if (!showTopics) return;
    let cancelled = false;
    fetch('/api/portal/brain/topics?as=tree')
      .then((r) => r.json())
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.data?.tree) {
          setTopics(res.data.tree as TopicTreeNode[]);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [showTopics]);

  const flatTopics = useMemo(() => flattenTopics(topics), [topics]);

  const toggleTopic = (id: number) => {
    setTopicIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const parseNumeric = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidation(null);

    if (!title.trim()) {
      setValidation('Title is required.');
      return;
    }
    if (!isEdit && !decision.trim()) {
      setValidation('Decision is required.');
      return;
    }
    if (!isEdit && !rationale.trim()) {
      setValidation('Rationale is required.');
      return;
    }

    const payload: DecisionFormSubmitPayload = {
      title: title.trim(),
      context: context.trim() ? context : null,
      decision: decision,
      rationale: rationale,
      alternativesConsidered: alternatives.trim() ? alternatives : null,
      reversibility,
      decidedAt: new Date(decidedAt).toISOString(),
      decisionMakerId,
      anchors: {
        meetingId: parseNumeric(meetingId),
        noteId: parseNumeric(noteId),
        companyId: parseNumeric(companyId),
        dealId: parseNumeric(dealId),
      },
      confidentialityLevel: confidentiality,
      topicIds,
    };

    await onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title */}
      <Field label="Title" required>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={255}
          required
          placeholder="Adopt Drizzle ORM for new data-access code"
          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </Field>

      {/* Context */}
      <Field label="Context" hint="What was the situation? (optional)">
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={3}
          placeholder="Background, constraints, the problem to solve."
          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </Field>

      {/* Decision + Rationale + Alternatives — hidden in edit mode */}
      {!isEdit && (
        <>
          <Field label="Decision" required hint="What was decided?">
            <textarea
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              rows={3}
              required
              placeholder="The concrete decision in 1–3 sentences."
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </Field>

          <Field label="Rationale" required hint="Why?">
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              rows={4}
              required
              placeholder="The reasoning, key trade-offs, evidence considered."
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </Field>

          <Field label="Alternatives considered" hint="What else was evaluated? (optional)">
            <textarea
              value={alternatives}
              onChange={(e) => setAlternatives(e.target.value)}
              rows={3}
              placeholder="One per line — what you didn't choose and why."
              className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </Field>
        </>
      )}

      {/* Alternatives is editable on edit, too — it's not "history-bearing". */}
      {isEdit && (
        <Field label="Alternatives considered" hint="What else was evaluated? (optional)">
          <textarea
            value={alternatives}
            onChange={(e) => setAlternatives(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </Field>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Reversibility — hidden in edit mode */}
        {!isEdit && (
          <Field label="Reversibility">
            <div className="flex gap-2">
              <RadioPill
                checked={reversibility === 'two_way'}
                label="Two-way door"
                icon="sync_alt"
                onClick={() => setReversibility('two_way')}
              />
              <RadioPill
                checked={reversibility === 'one_way'}
                label="One-way door"
                icon="arrow_forward"
                onClick={() => setReversibility('one_way')}
              />
            </div>
          </Field>
        )}

        {/* Decided-at */}
        <Field label="Decided at">
          <input
            type="date"
            value={decidedAt}
            onChange={(e) => setDecidedAt(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </Field>

        {/* Decision-maker */}
        <Field label="Decision maker">
          <select
            value={decisionMakerId ?? ''}
            onChange={(e) =>
              setDecisionMakerId(e.target.value ? parseInt(e.target.value, 10) : null)
            }
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">— (defaults to you)</option>
            {team.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name || m.email}
              </option>
            ))}
          </select>
        </Field>

        {/* Confidentiality */}
        <Field label="Confidentiality">
          <select
            value={confidentiality}
            onChange={(e) =>
              setConfidentiality(e.target.value as 'standard' | 'restricted' | 'confidential')
            }
            className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="standard">Standard</option>
            <option value="restricted">Restricted</option>
            <option value="confidential">Confidential</option>
          </select>
        </Field>
      </div>

      {/* Anchors — numeric IDs only for now */}
      <fieldset>
        <legend className="text-sm font-medium text-foreground mb-2 flex items-center gap-1.5">
          <span className="material-icons text-base text-primary">anchor</span>
          Anchors
          <span className="text-xs font-normal text-muted-foreground">(optional — link this decision to a source record)</span>
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <NumericAnchorField label="Meeting #" value={meetingId} onChange={setMeetingId} icon="event" />
          <NumericAnchorField label="Note #" value={noteId} onChange={setNoteId} icon="description" />
          <NumericAnchorField label="Company #" value={companyId} onChange={setCompanyId} icon="business" />
          <NumericAnchorField label="Deal #" value={dealId} onChange={setDealId} icon="handshake" />
        </div>
        {/* TODO(wave-3a+): wire interactive pickers for meeting/note/company/deal
            instead of numeric IDs once those reusable pickers exist. */}
      </fieldset>

      {/* Topic picker (create + supersede only) */}
      {showTopics && (
        <Field label="Topics" hint="Tag this decision with one or more topics from your taxonomy.">
          {flatTopics.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">
              No topics yet. Create some in{' '}
              <a className="underline hover:text-foreground" href="/portal/brain/topics">
                Topics
              </a>{' '}
              to make decisions easier to find.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-md border border-border bg-background p-2 flex flex-wrap gap-1.5">
              {flatTopics.map((t) => {
                const selected = topicIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTopic(t.id)}
                    title={t.path}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                      selected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {selected && <span className="material-icons text-[14px] leading-none">check</span>}
                    {'·'.repeat(t.depth)}
                    {t.depth > 0 ? ' ' : ''}
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
      )}

      {/* Action row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2 border-t border-border">
        {(validation || submitError) && (
          <div className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400 flex-1 min-w-0">
            <span className="material-icons text-base shrink-0">error_outline</span>
            <span className="break-words">{validation || submitError}</span>
          </div>
        )}
        <div className="flex items-center gap-2 sm:ml-auto">
          {cancelHref && (
            <a
              href={cancelHref}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
            >
              Cancel
            </a>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting && (
              <span className="material-icons animate-spin text-base">progress_activity</span>
            )}
            {submitLabel ?? (isSupersede ? 'Supersede' : isEdit ? 'Save changes' : 'Record decision')}
          </button>
        </div>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-foreground flex items-center gap-1.5 mb-1.5">
        {label}
        {required && <span className="text-rose-600 dark:text-rose-400">*</span>}
        {hint && <span className="text-xs font-normal text-muted-foreground">— {hint}</span>}
      </span>
      {children}
    </label>
  );
}

function RadioPill({
  checked,
  label,
  icon,
  onClick,
}: {
  checked: boolean;
  label: string;
  icon: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
        checked
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-muted/30 text-muted-foreground border-border hover:bg-muted hover:text-foreground'
      }`}
    >
      <span className="material-icons text-base">{icon}</span>
      {label}
    </button>
  );
}

function NumericAnchorField({
  label,
  value,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
        <span className="material-icons text-[14px] leading-none">{icon}</span>
        {label}
      </span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        min="1"
        className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
    </label>
  );
}
