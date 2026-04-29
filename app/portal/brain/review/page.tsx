'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback, useMemo } from 'react';

type ProposedType =
  | 'task' | 'decision' | 'commitment' | 'relationship_update' | 'follow_up' | 'compliance_warning' | 'note'
  | 'crm_contact_classify' | 'crm_deal_link' | 'crm_deal_create' | 'crm_company_link' | 'crm_company_create';
type ReviewItemStatus = 'pending' | 'approved' | 'rejected' | 'edited';

interface ReviewItem {
  id: number;
  sourceType: string;
  sourceId: number;
  proposedType: ProposedType;
  proposedPayload: Record<string, unknown>;
  status: ReviewItemStatus;
  reviewedAt: string | null;
  resultEntityType: string | null;
  resultEntityId: number | null;
  createdAt: string;
}

interface MeetingShape {
  id: number;
  title: string;
  status: string;
  meetingDate: string | null;
  source: string;
  gmailThreadId: string | null;
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

const STATUS_TABS: { key: 'pending' | 'approved' | 'rejected' | 'all'; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

export default function GlobalReviewQueuePage() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [meetings, setMeetings] = useState<Record<number, MeetingShape>>({});
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/portal/brain/review?status=${statusFilter}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load review queue.');
        setItems([]);
      } else {
        setItems(json.data.items);
        setMeetings(json.data.meetings);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Group items by source meeting (or "Other" for non-meeting sources). Within
  // each group, sort by type using TYPE_ORDER so compliance warnings rise.
  const groups = useMemo(() => {
    const byMeeting = new Map<number | 'other', ReviewItem[]>();
    for (const item of items) {
      const key = item.sourceType === 'meeting' ? item.sourceId : 'other' as const;
      if (!byMeeting.has(key)) byMeeting.set(key, []);
      byMeeting.get(key)!.push(item);
    }
    // Sort groups by latest meeting date (newest first), 'other' last.
    return [...byMeeting.entries()].sort(([a], [b]) => {
      if (a === 'other') return 1;
      if (b === 'other') return -1;
      const da = meetings[a as number]?.meetingDate ?? '';
      const db = meetings[b as number]?.meetingDate ?? '';
      return db.localeCompare(da);
    });
  }, [items, meetings]);

  const approve = async (item: ReviewItem) => {
    setBusyId(item.id);
    try {
      const r = await fetch(`/api/portal/brain/review-items/${item.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await r.json();
      if (!r.ok || !json.success) setError(json.message || 'Failed to approve.');
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
      if (!r.ok || !json.success) setError(json.message || 'Failed to reject.');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const pendingTotal = useMemo(() => items.filter((i) => i.status === 'pending').length, [items]);

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="material-icons text-primary">reviews</span>
            Review queue
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tasks, decisions, commitments, and CRM links extracted by AI from your communications. Approve to commit them, edit and approve, or reject.
          </p>
        </div>
        {statusFilter === 'pending' && (
          <div className="text-sm text-muted-foreground flex-shrink-0">
            {pendingTotal === 0
              ? <span className="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1"><span className="material-icons text-base">check_circle</span> All clear</span>
              : <span><strong className="text-foreground">{pendingTotal}</strong> pending</span>
            }
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              statusFilter === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <span className="material-icons animate-spin mr-2">progress_activity</span>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-card border border-border rounded-lg">
          <span className="material-icons text-4xl text-muted-foreground mb-2 block">inbox</span>
          <p className="text-foreground text-sm font-medium">
            {statusFilter === 'pending' ? 'Nothing pending review.' : 'Nothing here yet.'}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            New items appear here when AI processes a meeting or email thread.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([key, groupItems]) => {
            const meeting = key === 'other' ? null : meetings[key as number];
            return (
              <section key={String(key)} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    {meeting ? (
                      <Link
                        href={`/portal/brain/meetings/${meeting.id}`}
                        className="text-sm font-medium text-foreground hover:text-primary truncate inline-flex items-center gap-1"
                      >
                        <span className="material-icons text-base text-muted-foreground">
                          {meeting.gmailThreadId ? 'forum' : 'chat'}
                        </span>
                        {meeting.title}
                      </Link>
                    ) : (
                      <span className="text-sm font-medium text-foreground inline-flex items-center gap-1">
                        <span className="material-icons text-base text-muted-foreground">help</span>
                        Other sources
                      </span>
                    )}
                    {meeting?.meetingDate && (
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(meeting.meetingDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {groupItems.length} item{groupItems.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="space-y-2">
                  {groupItems.map((item) => (
                    <ReviewCard
                      key={item.id}
                      item={item}
                      busy={busyId === item.id}
                      onApprove={() => approve(item)}
                      onReject={() => reject(item)}
                      meetingHref={meeting ? `/portal/brain/meetings/${meeting.id}/review` : null}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ item, busy, onApprove, onReject, meetingHref }: {
  item: ReviewItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  meetingHref: string | null;
}) {
  const meta = TYPE_META[item.proposedType] ?? { label: item.proposedType, icon: 'help', tone: 'text-foreground bg-muted' };
  const isPending = item.status === 'pending';
  const summary = describeProposal(item);

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
              {meetingHref && (
                <Link
                  href={meetingHref}
                  className="px-2 py-1 text-xs rounded-md border border-border text-foreground hover:bg-accent inline-flex items-center gap-1"
                  title="Edit in detail review"
                >
                  <span className="material-icons text-sm">edit</span>
                </Link>
              )}
              <button
                onClick={onReject}
                disabled={busy}
                className="px-2 py-1 text-xs rounded-md border border-border text-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 inline-flex items-center gap-1"
              >
                <span className="material-icons text-sm">close</span>
                Reject
              </button>
              <button
                onClick={onApprove}
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
    </div>
  );
}

function describeProposal(item: ReviewItem): string {
  const p = item.proposedPayload;
  const s = (k: string) => typeof p[k] === 'string' ? p[k] as string : '';
  const n = (k: string) => typeof p[k] === 'number' ? p[k] as number : null;
  switch (item.proposedType) {
    case 'task': return s('title') || 'Untitled task';
    case 'decision': return s('title') || 'Untitled decision';
    case 'commitment': return `${s('who') || 'Someone'} → ${s('what')}`;
    case 'relationship_update': return `${s('field') || 'field'}: ${s('value')}`;
    case 'compliance_warning': return s('message') || 'Compliance warning';
    case 'crm_contact_classify': {
      const parts: string[] = [];
      if (s('proposedStatus')) parts.push(`status → ${s('proposedStatus')}`);
      if (s('proposedSeniority')) parts.push(`seniority → ${s('proposedSeniority')}`);
      if (s('proposedDepartment')) parts.push(`department → ${s('proposedDepartment')}`);
      if (s('proposedTitle')) parts.push(`title → ${s('proposedTitle')}`);
      const id = n('contactId');
      return parts.length > 0 ? `Contact${id ? ` #${id}` : ''}: ${parts.join(', ')}` : `Contact${id ? ` #${id}` : ''}`;
    }
    case 'crm_deal_link': return `Link to deal #${n('dealId')}`;
    case 'crm_deal_create': {
      const value = n('value');
      const v = value !== null ? ` (${formatCents(value, s('currency') || 'USD')})` : '';
      return `Create deal: ${s('title') || '(untitled)'}${v}`;
    }
    case 'crm_company_link': {
      const candidates = Array.isArray(p.candidateCompanyIds) ? p.candidateCompanyIds : [];
      return candidates.length > 1
        ? `Pick a company from ${candidates.length} candidates (default: #${n('companyId')})`
        : `Link to company #${n('companyId')}`;
    }
    case 'crm_company_create': {
      const dom = s('domain') ? ` (${s('domain')})` : '';
      return `Create company: ${s('name') || '(unnamed)'}${dom}`;
    }
    default: return JSON.stringify(p).slice(0, 80);
  }
}

function PayloadDetails({ payload, type }: { payload: Record<string, unknown>; type: ProposedType }) {
  const bits: { label: string; value: string }[] = [];
  if (type === 'task') {
    if (typeof payload.description === 'string' && payload.description) bits.push({ label: '', value: payload.description });
    if (typeof payload.ownerHint === 'string') bits.push({ label: 'owner', value: payload.ownerHint });
    if (typeof payload.dueDate === 'string') bits.push({ label: 'due', value: payload.dueDate });
    if (typeof payload.priority === 'string') bits.push({ label: 'priority', value: payload.priority });
    if (payload.complianceFlag === true) bits.push({ label: '', value: 'compliance flag' });
  } else if (type === 'decision' && typeof payload.details === 'string') {
    bits.push({ label: '', value: payload.details });
  } else if (type === 'commitment' && typeof payload.when === 'string') {
    bits.push({ label: 'when', value: payload.when });
  } else if (type === 'relationship_update' && typeof payload.rationale === 'string') {
    bits.push({ label: 'rationale', value: payload.rationale });
  } else if (type === 'compliance_warning' && typeof payload.severity === 'string') {
    bits.push({ label: 'severity', value: payload.severity });
  } else if (type === 'crm_contact_classify' && typeof payload.rationale === 'string') {
    bits.push({ label: 'rationale', value: payload.rationale });
  } else if (type === 'crm_deal_link' && typeof payload.rationale === 'string') {
    bits.push({ label: 'rationale', value: payload.rationale });
  } else if (type === 'crm_deal_create') {
    if (typeof payload.priority === 'string') bits.push({ label: 'priority', value: payload.priority });
    if (typeof payload.expectedCloseDate === 'string') bits.push({ label: 'close by', value: payload.expectedCloseDate });
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
