/**
 * PUX-173 (design doc screen 32): a proposal's e-sign story as one sequence.
 * Pure. Sent → first viewed → viewed again (×n) → signed / accepted /
 * declined / awaiting. The timestamps already live on crm_proposals;
 * `signedAt` is the proposal's own signature, not a linked contract's.
 */

export interface ProposalTimelineInput {
  status: string;
  sentAt?: string | null;
  firstViewedAt?: string | null;
  lastViewedAt?: string | null;
  viewCount?: number | null;
  signedAt?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
}

export interface TimelineStep { icon: string; label: string; at: string | null }

export function proposalTimeline(p: ProposalTimelineInput): TimelineStep[] {
  const views = p.viewCount ?? 0;
  const steps: TimelineStep[] = [
    { icon: 'send', label: p.sentAt ? 'Sent' : 'Not sent yet', at: p.sentAt ?? null },
    { icon: 'visibility', label: 'Viewed first time', at: p.firstViewedAt ?? (views > 0 ? p.lastViewedAt ?? null : null) },
  ];
  if (views > 1 && p.lastViewedAt) steps.push({ icon: 'visibility', label: `Viewed again (×${views - 1})`, at: p.lastViewedAt });
  if (p.signedAt) steps.push({ icon: 'draw', label: 'Signed', at: p.signedAt });
  else if (p.acceptedAt) steps.push({ icon: 'check_circle', label: 'Accepted', at: p.acceptedAt });
  else if (p.declinedAt) steps.push({ icon: 'cancel', label: 'Declined', at: p.declinedAt });
  else if (p.status !== 'draft') steps.push({ icon: 'draw', label: 'Awaiting signature', at: null });
  return steps;
}
