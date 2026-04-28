'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';

interface RelationshipDetail {
  overlay: {
    id: number;
    relationshipType: string;
    status: 'active' | 'paused' | 'archived';
    priority: 'low' | 'medium' | 'high' | 'critical';
    summary: string | null;
    currentPriorities: string | null;
    openLoops: string | null;
    nextReviewAt: string | null;
    lastTouchAt: string | null;
    confidentialityLevel: string;
    serviceLines: string[];
    complianceFlags: string[];
    staleAfterDays: number | null;
    sourceSystem: string | null;
    externalUrl: string | null;
  };
  underlying: {
    type: 'company' | 'deal';
    id: number;
    name: string;
    secondaryName?: string;
    industry?: string | null;
    domain?: string | null;
    value?: number | null;
    stage?: string | null;
  };
  contacts: { id: number; firstName: string; lastName: string | null; email: string | null; title: string | null }[];
  meetings: { id: number; title: string; meetingDate: string | null; status: string; createdAt: string }[];
  tasks: { id: number; title: string; status: string; priority: string; dueDate: string | null; createdByAi: boolean }[];
}

const PRIORITY_TONE: Record<RelationshipDetail['overlay']['priority'], string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  high: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  critical: 'bg-red-500/10 text-red-600 dark:text-red-400',
};

export default function RelationshipDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const overlayId = parseInt(params.id, 10);

  const [data, setData] = useState<RelationshipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/brain/relationships/${overlayId}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load.');
      } else {
        setData(json.data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [overlayId]);

  useEffect(() => { if (!Number.isNaN(overlayId)) load(); }, [overlayId, load]);

  const save = async (patch: Record<string, unknown>) => {
    const r = await fetch(`/api/portal/brain/relationships/${overlayId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const json = await r.json();
    if (!r.ok || !json.success) {
      setError(json.message || 'Failed to save.');
      return;
    }
    setData((d) => d ? { ...d, overlay: { ...d.overlay, ...json.data } } : d);
  };

  const remove = async () => {
    if (!confirm('Delete this relationship overlay? The underlying CRM record is unaffected.')) return;
    const r = await fetch(`/api/portal/brain/relationships/${overlayId}`, { method: 'DELETE' });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || !json.success) { setError(json.message || 'Failed to delete.'); return; }
    router.push('/portal/brain/relationships');
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-5xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error || 'Relationship not found.'}
        </div>
      </div>
    );
  }

  const { overlay, underlying, contacts, meetings, tasks } = data;
  const crmHref = underlying.type === 'company'
    ? `/portal/crm/companies/${underlying.id}`
    : `/portal/crm/deals?deal=${underlying.id}`;

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Link href="/portal/brain/relationships" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <span className="material-icons text-sm">arrow_back</span>
            All relationships
          </Link>
          <h1 className="text-2xl font-bold text-foreground mt-2 flex items-center gap-2 break-words">
            <span className="material-icons text-primary">{underlying.type === 'company' ? 'business' : 'handshake'}</span>
            {underlying.name}
          </h1>
          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <span>{overlay.relationshipType.replace(/_/g, ' ')}</span>
            <span>·</span>
            <Link href={crmHref} className="hover:text-primary inline-flex items-center gap-0.5">
              <span className="material-icons text-sm">open_in_new</span>
              View in CRM
            </Link>
            {underlying.industry && <><span>·</span><span>{underlying.industry}</span></>}
            {underlying.secondaryName && <><span>·</span><span>{underlying.secondaryName}</span></>}
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PRIORITY_TONE[overlay.priority]}`}>
              {overlay.priority}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={remove}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30"
          >
            <span className="material-icons text-base">delete</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Open tasks" value={tasks.filter((t) => t.status !== 'done').length} icon="checklist" />
        <Stat label="Notes" value={meetings.length} icon="forum" />
        <Stat label="Linked contacts" value={contacts.length} icon="people" />
      </div>

      <Section title="Snapshot" icon="dashboard">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Priority">
            <select
              value={overlay.priority}
              onChange={(e) => save({ priority: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              value={overlay.status}
              onChange={(e) => save({ status: e.target.value })}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
          <Field label="Next review">
            <input
              type="date"
              value={overlay.nextReviewAt ? overlay.nextReviewAt.slice(0, 10) : ''}
              onChange={(e) => save({ nextReviewAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </Field>
          <Field label="Stale after (days)">
            <input
              type="number"
              min={1}
              value={overlay.staleAfterDays ?? ''}
              onChange={(e) => save({ staleAfterDays: e.target.value ? parseInt(e.target.value, 10) : null })}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Optional"
            />
          </Field>
        </div>
      </Section>

      <Section title="Summary" icon="notes">
        <EditableTextarea
          value={overlay.summary}
          onSave={(v) => save({ summary: v })}
          placeholder="What is this relationship about?"
          rows={3}
        />
      </Section>

      <Section title="Current priorities" icon="flag">
        <EditableTextarea
          value={overlay.currentPriorities}
          onSave={(v) => save({ currentPriorities: v })}
          placeholder="What's the focus right now?"
          rows={3}
        />
      </Section>

      <Section title="Open loops" icon="hourglass_empty">
        <EditableTextarea
          value={overlay.openLoops}
          onSave={(v) => save({ openLoops: v })}
          placeholder="What's still hanging? Outstanding questions, awaited info, etc."
          rows={3}
        />
      </Section>

      <Section
        title="Open tasks"
        icon="checklist"
        action={<Link href="/portal/brain/tasks" className="text-xs text-primary hover:underline">All tasks</Link>}
      >
        {tasks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tasks linked to this relationship yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {tasks.slice(0, 10).map((t) => (
              <li key={t.id} className="py-2 flex items-center justify-between gap-2">
                <span className={`text-sm truncate ${t.status === 'done' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {t.title}
                  {t.createdByAi && <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground"><span className="material-icons text-sm">auto_awesome</span>AI</span>}
                </span>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {t.priority} · {t.status.replace(/_/g, ' ')}
                  {t.dueDate && ` · ${new Date(t.dueDate).toLocaleDateString()}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Recent notes"
        icon="forum"
        action={<Link href="/portal/brain/meetings/new" className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"><span className="material-icons text-sm">add</span>New</Link>}
      >
        {meetings.length === 0 ? (
          <p className="text-xs text-muted-foreground">No notes linked to this relationship yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {meetings.slice(0, 10).map((m) => (
              <li key={m.id} className="py-2">
                <Link href={`/portal/brain/meetings/${m.id}`} className="flex items-center justify-between hover:text-primary">
                  <span className="text-sm text-foreground truncate">{m.title}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {m.status.replace(/_/g, ' ')} ·{' '}
                    {new Date(m.meetingDate || m.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {contacts.length > 0 && (
        <Section title="People" icon="people">
          <ul className="space-y-1.5">
            {contacts.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/portal/crm/contacts/${c.id}`}
                  className="flex items-center justify-between text-sm hover:text-primary"
                >
                  <span className="text-foreground truncate">
                    {c.firstName} {c.lastName ?? ''}
                    {c.title && <span className="text-xs text-muted-foreground"> · {c.title}</span>}
                  </span>
                  {c.email && <span className="text-xs text-muted-foreground flex-shrink-0">{c.email}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, icon, action, children }: { title: string; icon: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="material-icons text-base text-muted-foreground">{icon}</span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
      <span className="material-icons text-2xl text-primary">{icon}</span>
      <div>
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function EditableTextarea({ value, onSave, placeholder, rows = 4 }: {
  value: string | null;
  onSave: (v: string | null) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const dirty = (draft || null) !== (value || null);
  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      {dirty && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSave(draft.trim() || null)}
            className="px-3 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Save
          </button>
          <button
            onClick={() => setDraft(value ?? '')}
            className="px-3 py-1 text-xs rounded-md border border-border text-foreground hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
