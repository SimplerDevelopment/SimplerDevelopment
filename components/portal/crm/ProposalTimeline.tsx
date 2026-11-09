'use client';

/**
 * PUX-173: the sent → viewed → signed sequence as a native <details> under a
 * proposal row. Studio-only; the caller gates on the flag.
 */

import { proposalTimeline, type ProposalTimelineInput } from '@/lib/crm/proposal-timeline';

const when = (at: string | null) => at ? new Date(at).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function ProposalTimeline({ proposal, summary }: { proposal: ProposalTimelineInput; summary: string }) {
  return (
    <details className="group" onClick={(e) => e.stopPropagation()}>
      <summary className="cursor-pointer list-none text-[11px] text-muted-foreground hover:text-foreground">
        <span className="material-icons align-middle text-[14px] transition-transform group-open:rotate-90">chevron_right</span>
        {summary}
      </summary>
      <ol className="mt-1.5 space-y-1 border-l border-border pl-3">
        {proposalTimeline(proposal).map((s, i) => (
          <li key={i} className={`flex items-center gap-2 text-xs ${s.at ? 'text-foreground' : 'text-muted-foreground'}`}>
            <span className="material-icons text-[14px] text-muted-foreground">{s.icon}</span>
            <span>{s.label}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">{when(s.at)}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
