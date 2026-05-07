import { slaState, isSlaMet, type SlaState } from '@/lib/tickets/sla';

interface Props {
  /** Ticket status — used to short-circuit the timer once resolved/closed. */
  status: string | null | undefined;
  /** First-response due timestamp (nullable). */
  firstResponseDueAt: Date | string | null | undefined;
  /** Resolution due timestamp (nullable). */
  resolutionDueAt: Date | string | null | undefined;
  /** Optional resolved-at stamp; when set we render SLA-met regardless of status. */
  resolvedAt?: Date | string | null;
  /** Compact mode renders only the worse of the two as a single chip. */
  compact?: boolean;
  /** Override "now" — used by tests. */
  now?: Date;
}

const SEVERITY: Record<SlaState['kind'], number> = {
  overdue: 4,
  due_soon: 3,
  on_track: 2,
  met: 1,
  none: 0,
};

function chip(state: SlaState, label: string) {
  return (
    <span
      key={label}
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${state.className}`}
      title={`${label}: ${state.label}`}
    >
      <span className="material-icons text-[14px] leading-none">{state.icon}</span>
      <span>
        <span className="opacity-70 mr-1">{label}</span>
        {state.label}
      </span>
    </span>
  );
}

export default function TicketSlaBadge({
  status,
  firstResponseDueAt,
  resolutionDueAt,
  resolvedAt,
  compact = false,
  now,
}: Props) {
  const met = isSlaMet(status) || !!resolvedAt;
  const firstResponseState = slaState(firstResponseDueAt, { now, isMet: met });
  const resolutionState = slaState(resolutionDueAt, { now, isMet: met });

  if (compact) {
    // Pick the worse of the two so the list view shows one chip per row.
    const worse =
      SEVERITY[firstResponseState.kind] >= SEVERITY[resolutionState.kind]
        ? firstResponseState
        : resolutionState;
    if (worse.kind === 'none') return null;
    return chip(worse, worse.kind === 'met' ? 'SLA' : 'SLA');
  }

  // Full mode (detail page) — show both the response + resolution timers
  // unless the ticket is already met (one combined chip is enough).
  if (met) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
        <span className="material-icons text-[14px] leading-none">check_circle</span>
        SLA met
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {firstResponseState.kind !== 'none' && chip(firstResponseState, 'First reply')}
      {resolutionState.kind !== 'none' && chip(resolutionState, 'Resolution')}
    </div>
  );
}
