'use client';

// Extracted verbatim from app/portal/brain/tasks/page.tsx (PUX-165) so /portal/brain/review can render the same queue.

import Link from 'next/link';
import { pBtnPrimary, pBtnGhost, sBtn, sBtnGhost } from '@/components/portal/portal-ui';

// ─── Review types ────────────────────────────────────────────────────────────

export type ProposedType =
  | 'task' | 'decision' | 'commitment' | 'relationship_update' | 'follow_up' | 'compliance_warning' | 'note'
  | 'crm_contact_classify' | 'crm_deal_link' | 'crm_deal_create' | 'crm_company_link' | 'crm_company_create';
export type ReviewItemStatus = 'pending' | 'approved' | 'rejected' | 'edited';

export interface ReviewItem {
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
  // Phase 6 — suggested reviewer (populated by lib/brain/review-routing.ts).
  // Null when no candidate crossed the confidence threshold.
  suggestedReviewerPersonId?: number | null;
  suggestedReviewerScore?: number | null;
  suggestedReviewerReason?: string | null;
}

export const TYPE_META: Record<ProposedType, { label: string; icon: string; tone: string }> = {
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

export function ReviewCard({ item, busy, onApprove, onReject, meetingHref, selectable, selected, onToggleSelect, studio = false, primary = false }: {
  /** PUX-165: studio button styling; `primary` = this row owns the page's one teal Approve. */
  studio?: boolean;
  primary?: boolean;
  item: ReviewItem;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  meetingHref: string | null;
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
}) {
  const meta = TYPE_META[item.proposedType] ?? { label: item.proposedType, icon: 'help', tone: 'text-foreground bg-muted' };
  const isPending = item.status === 'pending';
  const summary = describeProposal(item);

  return (
    <div className={`bg-card border rounded-2xl p-4 ${
      selected
        ? 'border-primary/60 bg-primary/5'
        : item.status === 'approved' || item.status === 'edited'
          ? 'border-emerald-500/30 bg-emerald-500/5'
          : item.status === 'rejected'
            ? 'border-border opacity-60'
            : 'border-border'
    }`}>
      <div className="flex items-start gap-3">
        {selectable && (
          <input
            type="checkbox"
            className="h-4 w-4 mt-0.5 rounded border-border accent-primary cursor-pointer flex-shrink-0"
            checked={selected}
            onChange={onToggleSelect}
            disabled={busy}
            aria-label="Select item"
          />
        )}
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${meta.tone} flex items-center gap-1 flex-shrink-0`}>
          <span className="material-icons text-sm">{meta.icon}</span>
          {meta.label}
        </span>
        <SuggestedReviewerChip item={item} />
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
                  className={`${studio ? sBtnGhost : pBtnGhost} !py-1 !px-2 !text-xs`}
                  title="Edit in detail review"
                >
                  <span className="material-icons text-sm">edit</span>
                </Link>
              )}
              <button
                onClick={onReject}
                disabled={busy}
                className={`${studio ? sBtnGhost : pBtnGhost} !py-1 !px-2 !text-xs hover:border-destructive/50 hover:text-destructive`}
              >
                <span className="material-icons text-sm">close</span>
                Reject
              </button>
              <button
                onClick={onApprove}
                disabled={busy}
                className={`${studio ? (primary ? sBtn : sBtnGhost) : pBtnPrimary} !py-1 !px-2 !text-xs`}
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

export function describeProposal(item: ReviewItem): string {
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

export function PayloadDetails({ payload, type }: { payload: Record<string, unknown>; type: ProposedType }) {
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

export function formatCents(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/**
 * Renders the "routed-to" chip on a review-item card. Pulls
 * (suggestedReviewerPersonId, score, reason) from the row — populated by
 * lib/brain/review-routing.ts. Renders nothing when no suggestion exists.
 * The reason is a tooltip via `title` for keyboard + screen-reader users.
 */
export function SuggestedReviewerChip({ item }: { item: ReviewItem }) {
  const pid = item.suggestedReviewerPersonId;
  const score = item.suggestedReviewerScore;
  const reason = item.suggestedReviewerReason;
  if (pid == null || score == null) return null;
  // The reason string already includes the person's name when available, e.g.
  // "Sarah Chen — expertise in kubernetes". We surface a compact "#<id> · <score>"
  // here and put the full text in the tooltip so the row stays scannable.
  const label = reason && reason.includes('—')
    ? reason.split('—')[0].trim()
    : `#${pid}`;
  return (
    <span
      className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center gap-1 flex-shrink-0 cursor-help"
      title={reason ?? `Suggested reviewer #${pid} (score ${score})`}
    >
      <span className="material-icons text-sm">person_pin</span>
      <span className="truncate max-w-[8rem]">{label}</span>
      <span className="opacity-70">· {score}</span>
    </span>
  );
}

export default ReviewCard;
