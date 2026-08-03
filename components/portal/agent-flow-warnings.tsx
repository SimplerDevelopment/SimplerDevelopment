/**
 * Advisory banner for self-review findings on a saved flow.
 *
 * Split out of AgentFlowTab.tsx purely to keep that file under the 800-line
 * budget — it is presentational and holds no state of its own.
 */
'use client';

import type { SelfReviewWarning } from '@/lib/agent-flows/types';

interface Props {
  warnings: SelfReviewWarning[];
  onDismiss: () => void;
}

export function SelfReviewBanner({ warnings, onDismiss }: Props) {
  if (warnings.length === 0) return null;

  return (
    // Amber, not red, and shown AFTER a successful save: a node reviewing its
    // own persona's work is the one defect the pipeline can't catch itself
    // (the review agrees, the run goes green), but same-persona sequences are
    // often deliberate, so this informs rather than blocks.
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100 text-xs">
      <span className="material-icons text-base shrink-0">gpp_maybe</span>
      <div className="flex-1 space-y-1">
        {warnings.map((w) => (
          <p key={`${w.upstreamNodeId}->${w.nodeId}`}>{w.message}</p>
        ))}
      </div>
      <button type="button" onClick={onDismiss} className="hover:underline shrink-0">
        Dismiss
      </button>
    </div>
  );
}
