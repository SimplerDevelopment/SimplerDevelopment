'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback, useMemo } from 'react';

type ProposedType =
  | 'task' | 'decision' | 'commitment' | 'relationship_update' | 'follow_up' | 'compliance_warning' | 'note'
  | 'crm_contact_classify' | 'crm_deal_link' | 'crm_deal_create' | 'crm_company_link' | 'crm_company_create';
type ReviewItemStatus = 'pending' | 'approved' | 'rejected' | 'edited';

interface ReviewItem {
  id: number;
  proposedType: ProposedType;
  proposedPayload: Record<string, unknown>;
  status: ReviewItemStatus;
  reviewedAt: string | null;
  resultEntityType: string | null;
  resultEntityId: number | null;
  createdAt: string;
}

const TYPE_META: Record<ProposedType, { label: string; icon: string; tone: string }> = {
  task: { label: 'Task', icon: 'task_alt', tone: 'text-blue-600 dark:text-blue-400 bg-blue-500/10' },
  decision: { label: 'Decision', icon: 'flag', tone: 'text-purple-600 dark:text-purple-400 bg-purple-500/10' },
  commitment: { label: 'Commitment', icon: 'handshake', tone: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  relationship_update: { label: 'Relationship update', icon: 'group_work', tone: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10' },
  follow_up: { label: 'Follow-up', icon: 'reply', tone: 'text-foreground bg-muted' },
  compliance_warning: { label: 'Compliance warning', icon: 'warning', tone: 'text-red-600 dark:text-red-400 bg-red-500/10' },
  note: { label: 'Note', icon: 'sticky_note_2', tone: 'text-foreground bg-muted' },
  crm_contact_classify: { label: 'Classify contact', icon: 'badge', tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_deal_link:        { label: 'Link to deal',     icon: 'link',  tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_deal_create:      { label: 'Create deal',      icon: 'monetization_on', tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_company_link:     { label: 'Link to company',  icon: 'link',  tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
  crm_company_create:   { label: 'Create company',   icon: 'apartment', tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' },
};

const TYPE_ORDER: ProposedType[] = [
  'compliance_warning',
  'crm_company_link', 'crm_company_create', 'crm_contact_classify', 'crm_deal_link', 'crm_deal_create',
  'task', 'decision', 'commitment', 'relationship_update', 'follow_up', 'note',
];

interface MeetingShape {
  id: number;
  title: string;
  status: string;
  aiSummary: string | null;
}

export default function MeetingReviewPage() {
  const params = useParams<{ id: string }>();
  const meetingId = parseInt(params.id, 10);

  const [meeting, setMeeting] = useState<MeetingShape | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mr, ir] = await Promise.all([
        fetch(`/api/portal/brain/communications/${meetingId}`),
        fetch(`/api/portal/brain/communications/${meetingId}/review`),
      ]);
      const [mj, ij] = await Promise.all([mr.json(), ir.json()]);
      if (!mr.ok || !mj.success) {
        setError(mj.message || 'Failed to load communication.');
      } else if (!ir.ok || !ij.success) {
        setError(ij.message || 'Failed to load review items.');
      } else {
        setMeeting({ id: mj.data.id, title: mj.data.title, status: mj.data.status, aiSummary: mj.data.aiSummary });
        setItems(ij.data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { if (!Number.isNaN(meetingId)) load(); }, [meetingId, load]);

  const grouped = useMemo(() => {
    const out = new Map<ProposedType, ReviewItem[]>();
    for (const t of TYPE_ORDER) out.set(t, []);
    for (const i of items) {
      if (!out.has(i.proposedType)) out.set(i.proposedType, []);
      out.get(i.proposedType)!.push(i);
    }
    return out;
  }, [items]);

  const pendingCount = items.filter((i) => i.status === 'pending').length;

  const approve = async (item: ReviewItem, editedPayload?: Record<string, unknown>) => {
    setBusyId(item.id);
    try {
      const r = await fetch(`/api/portal/brain/review-items/${item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editedPayload ? { editedPayload } : {}),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to approve.');
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (item: ReviewItem) => {
    setBusyId(item.id);
    try {
      const r = await fetch(`/api/portal/brain/review-items/${item.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to reject.');
      }
      await load();
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading review queue…
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error || 'Communication not found.'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href={`/portal/brain/communications/${meetingId}`} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <span className="material-icons text-sm">arrow_back</span>
            Back to communication
          </Link>
          <h1 className="text-2xl font-bold text-foreground mt-2 flex items-center gap-2">
            <span className="material-icons text-primary">reviews</span>
            Review queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1 truncate">{meeting.title}</p>
        </div>
        <div className="text-sm text-muted-foreground flex-shrink-0">
          {pendingCount === 0
            ? <span className="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1"><span className="material-icons text-base">check_circle</span> All clear</span>
            : <span><strong className="text-foreground">{pendingCount}</strong> pending</span>
          }
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {meeting.aiSummary && (
        <section className="bg-card border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
            <span className="material-icons text-base text-muted-foreground">auto_awesome</span>
            AI summary
          </h2>
          <p className="text-sm text-foreground whitespace-pre-wrap">{meeting.aiSummary}</p>
        </section>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-lg">
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">inbox</span>
          <p className="text-sm text-muted-foreground">
            No items in the review queue yet. Run AI processing from the communication page.
          </p>
        </div>
      ) : (
        TYPE_ORDER.filter((t) => (grouped.get(t)?.length ?? 0) > 0).map((type) => (
          <section key={type} className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-base text-muted-foreground">{TYPE_META[type].icon}</span>
              {TYPE_META[type].label}
              <span className="text-xs text-muted-foreground font-normal">
                ({grouped.get(type)!.length})
              </span>
            </h2>
            <div className="space-y-2">
              {grouped.get(type)!.map((item) => (
                <ReviewCard
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  onApprove={(payload) => approve(item, payload)}
                  onReject={() => reject(item)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function ReviewCard({ item, busy, onApprove, onReject }: {
  item: ReviewItem;
  busy: boolean;
  onApprove: (editedPayload?: Record<string, unknown>) => void;
  onReject: () => void;
}) {
  const meta = TYPE_META[item.proposedType];
  const [editing, setEditing] = useState(false);
  const [draftJson, setDraftJson] = useState(JSON.stringify(item.proposedPayload, null, 2));

  const isPending = item.status === 'pending';

  let summary = '';
  const p = item.proposedPayload;
  if (item.proposedType === 'task') {
    summary = (typeof p.title === 'string' ? p.title : 'Untitled task');
  } else if (item.proposedType === 'decision') {
    summary = (typeof p.title === 'string' ? p.title : '');
  } else if (item.proposedType === 'commitment') {
    summary = `${typeof p.who === 'string' ? p.who : 'Someone'} → ${typeof p.what === 'string' ? p.what : ''}`;
  } else if (item.proposedType === 'relationship_update') {
    summary = `${typeof p.field === 'string' ? p.field : 'field'}: ${typeof p.value === 'string' ? p.value : ''}`;
  } else if (item.proposedType === 'compliance_warning') {
    summary = typeof p.message === 'string' ? p.message : '';
  } else if (item.proposedType === 'crm_contact_classify') {
    const parts: string[] = [];
    if (typeof p.proposedStatus === 'string') parts.push(`status → ${p.proposedStatus}`);
    if (typeof p.proposedSeniority === 'string') parts.push(`seniority → ${p.proposedSeniority}`);
    if (typeof p.proposedDepartment === 'string') parts.push(`department → ${p.proposedDepartment}`);
    if (typeof p.proposedTitle === 'string') parts.push(`title → ${p.proposedTitle}`);
    summary = parts.length > 0 ? `Contact #${p.contactId}: ${parts.join(', ')}` : `Contact #${p.contactId}`;
  } else if (item.proposedType === 'crm_deal_link') {
    summary = `Link this email to deal #${p.dealId}`;
  } else if (item.proposedType === 'crm_deal_create') {
    const value = typeof p.value === 'number' ? ` (${formatCents(p.value, typeof p.currency === 'string' ? p.currency : 'USD')})` : '';
    summary = `Create deal: ${typeof p.title === 'string' ? p.title : '(untitled)'}${value}`;
  } else if (item.proposedType === 'crm_company_link') {
    const candidates = Array.isArray(p.candidateCompanyIds) ? p.candidateCompanyIds : [];
    summary = candidates.length > 1
      ? `Pick a company from ${candidates.length} candidates (default: #${p.companyId})`
      : `Link to company #${p.companyId}`;
  } else if (item.proposedType === 'crm_company_create') {
    const dom = typeof p.domain === 'string' ? ` (${p.domain})` : '';
    summary = `Create company: ${typeof p.name === 'string' ? p.name : '(unnamed)'}${dom}`;
  } else {
    summary = JSON.stringify(p).slice(0, 80);
  }

  return (
    <div className={`bg-card border rounded-lg p-4 ${
      item.status === 'approved' || item.status === 'edited'
        ? 'border-emerald-500/30 bg-emerald-500/5'
        : item.status === 'rejected'
          ? 'border-border opacity-60'
          : 'border-border'
    }`}>
      <div className="flex items-start gap-3">
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.tone} flex items-center gap-1 flex-shrink-0`}>
          <span className="material-icons text-sm">{meta.icon}</span>
          {meta.label}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground break-words">{summary}</p>
          <PayloadDetails payload={item.proposedPayload} type={item.proposedType} />
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isPending ? (
            <>
              <button
                onClick={() => setEditing(!editing)}
                disabled={busy}
                className="px-2 py-1 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
              >
                {editing ? 'Cancel edit' : 'Edit'}
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="px-2 py-1 text-xs rounded-md border border-border text-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 inline-flex items-center gap-1"
              >
                <span className="material-icons text-sm">close</span>
                Reject
              </button>
              <button
                onClick={() => {
                  if (editing) {
                    try {
                      const parsed = JSON.parse(draftJson);
                      onApprove(parsed);
                      setEditing(false);
                    } catch {
                      alert('Edited payload is not valid JSON.');
                    }
                  } else {
                    onApprove();
                  }
                }}
                disabled={busy}
                className="px-2 py-1 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1"
              >
                <span className="material-icons text-sm">check</span>
                Approve
              </button>
            </>
          ) : item.status === 'approved' || item.status === 'edited' ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
              <span className="material-icons text-sm">check_circle</span>
              {item.status === 'edited' ? 'Edited & approved' : 'Approved'}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <span className="material-icons text-sm">block</span>
              Rejected
            </span>
          )}
        </div>
      </div>
      {editing && (
        <div className="mt-3">
          <label className="text-xs text-muted-foreground mb-1 block">Edit JSON before approving:</label>
          <textarea
            value={draftJson}
            onChange={(e) => setDraftJson(e.target.value)}
            rows={Math.min(15, draftJson.split('\n').length + 1)}
            className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      )}
    </div>
  );
}

function PayloadDetails({ payload, type }: { payload: Record<string, unknown>; type: ProposedType }) {
  const bits: { label: string; value: string }[] = [];
  if (type === 'task') {
    if (typeof payload.description === 'string' && payload.description) bits.push({ label: '', value: payload.description });
    if (typeof payload.ownerHint === 'string') bits.push({ label: 'owner', value: payload.ownerHint });
    if (typeof payload.dueDate === 'string') bits.push({ label: 'due', value: payload.dueDate });
    if (typeof payload.priority === 'string') bits.push({ label: 'priority', value: payload.priority });
    if (payload.complianceFlag === true) bits.push({ label: '', value: 'compliance flag' });
    if (typeof payload.relatesToBrainHit === 'string') bits.push({ label: 'brain context', value: payload.relatesToBrainHit });
  } else if (type === 'decision' && typeof payload.details === 'string') {
    bits.push({ label: '', value: payload.details });
  } else if (type === 'commitment' && typeof payload.when === 'string') {
    bits.push({ label: 'when', value: payload.when });
  } else if (type === 'relationship_update' && typeof payload.rationale === 'string') {
    bits.push({ label: 'rationale', value: payload.rationale });
  } else if (type === 'compliance_warning' && typeof payload.severity === 'string') {
    bits.push({ label: 'severity', value: payload.severity });
  } else if (type === 'crm_contact_classify') {
    if (typeof payload.confidence === 'string') bits.push({ label: 'confidence', value: payload.confidence });
    if (typeof payload.rationale === 'string') bits.push({ label: 'rationale', value: payload.rationale });
  } else if (type === 'crm_deal_link') {
    if (typeof payload.rationale === 'string') bits.push({ label: 'rationale', value: payload.rationale });
  } else if (type === 'crm_deal_create') {
    if (typeof payload.priority === 'string') bits.push({ label: 'priority', value: payload.priority });
    if (typeof payload.expectedCloseDate === 'string') bits.push({ label: 'close by', value: payload.expectedCloseDate });
    if (typeof payload.contactId === 'number') bits.push({ label: 'contact', value: `#${payload.contactId}` });
    if (typeof payload.companyId === 'number') bits.push({ label: 'company', value: `#${payload.companyId}` });
    if (typeof payload.rationale === 'string') bits.push({ label: 'rationale', value: payload.rationale });
  } else if (type === 'crm_company_link') {
    const candidates = Array.isArray(payload.candidateCompanyIds) ? payload.candidateCompanyIds : [];
    if (candidates.length > 1) bits.push({ label: 'candidates', value: candidates.map((c) => `#${c}`).join(', ') });
    if (typeof payload.rationale === 'string') bits.push({ label: 'rationale', value: payload.rationale });
  } else if (type === 'crm_company_create') {
    if (typeof payload.industry === 'string') bits.push({ label: 'industry', value: payload.industry });
    if (typeof payload.website === 'string') bits.push({ label: 'website', value: payload.website });
    if (typeof payload.rationale === 'string') bits.push({ label: 'rationale', value: payload.rationale });
  }

  if (bits.length === 0) return null;
  return (
    <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
      {bits.map((b, i) => (
        <div key={i}>
          {b.label && <span className="font-medium">{b.label}:</span>} {b.value}
        </div>
      ))}
    </div>
  );
}

function formatCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
