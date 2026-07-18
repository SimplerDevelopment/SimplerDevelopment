'use client';

/**
 * Vertical stepper for a playbook run. Renders the run's step rows with the
 * appropriate status icon. Active steps get inline "Mark complete" / "Skip"
 * buttons. Wait steps show a countdown to waitUntil. Failed steps surface the
 * failureReason. Completed steps show the resulting entity link.
 */
import {
  playbookRunStepStatusChip,
  playbookStepKindChip,
  relativeTime,
  type PlaybookRunDetailStep,
} from './playbooks-shared';

interface Props {
  steps: PlaybookRunDetailStep[];
  /** Called when the user clicks "Mark complete" inline on an active step. */
  onComplete?: (stepId: number) => Promise<void> | void;
  /** Called when the user clicks "Skip" inline on an active step. */
  onSkip?: (stepId: number, reason?: string) => Promise<void> | void;
  busy?: boolean;
}

function resultEntityLink(
  step: PlaybookRunDetailStep,
): { href: string; label: string } | null {
  if (!step.resultEntityType || step.resultEntityId === null) return null;
  switch (step.resultEntityType) {
    case 'brain_task':
      return {
        href: `/portal/brain/tasks`,
        label: `Created brain_task #${step.resultEntityId}`,
      };
    case 'brain_note':
      return {
        href: `/portal/brain/knowledge/${step.resultEntityId}`,
        label: `Created brain_note #${step.resultEntityId}`,
      };
    case 'brain_calendar_event':
      return {
        href: `/portal/brain/calendar`,
        label: `Scheduled meeting #${step.resultEntityId}`,
      };
    case 'brain_ai_review_item':
      return {
        href: `/portal/brain/review`,
        label: `Review item #${step.resultEntityId}`,
      };
    default:
      return {
        href: `/portal/brain`,
        label: `${step.resultEntityType} #${step.resultEntityId}`,
      };
  }
}

export default function PlaybookRunStepper({ steps, onComplete, onSkip, busy }: Props) {
  if (steps.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground bg-muted/30 rounded-md border border-dashed border-border">
        No steps have been spawned yet.
      </div>
    );
  }

  return (
    <ol className="space-y-2">
      {steps.map((step, idx) => {
        const statusChip = playbookRunStepStatusChip(step.status);
        const kindChip = playbookStepKindChip(step.kind);
        const link = resultEntityLink(step);
        const isActive = step.status === 'active';
        const isWaitActive =
          isActive && step.kind === 'wait' && step.waitUntil !== null;

        return (
          <li key={step.id} className="relative">
            <div className="flex items-start gap-3 bg-card border border-border rounded-lg p-3">
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full inline-flex items-center justify-center ${statusChip.className}`}
                title={statusChip.label}
              >
                <span className="material-icons text-[18px]">{statusChip.icon}</span>
              </div>

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${kindChip.className}`}
                  >
                    <span className="material-icons text-[14px]">{kindChip.icon}</span>
                    {kindChip.label}
                  </span>
                  <span className="text-sm font-medium text-foreground truncate">
                    {step.name}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    #{idx + 1}
                  </span>
                </div>

                <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                  <span className="font-mono">{step.key}</span>
                  {step.startedAt && (
                    <span className="inline-flex items-center gap-1">
                      <span className="material-icons text-[12px]">play_circle</span>
                      started {relativeTime(step.startedAt, { signed: true })}
                    </span>
                  )}
                  {step.completedAt && (
                    <span className="inline-flex items-center gap-1">
                      <span className="material-icons text-[12px]">check_circle</span>
                      {step.status === 'skipped' ? 'skipped' : 'completed'}{' '}
                      {relativeTime(step.completedAt, { signed: true })}
                    </span>
                  )}
                  {isWaitActive && step.waitUntil && (
                    <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                      <span className="material-icons text-[12px]">hourglass_top</span>
                      waiting until {new Date(step.waitUntil).toLocaleString()} (
                      {relativeTime(step.waitUntil, { signed: true })})
                    </span>
                  )}
                </div>

                {link && (
                  <a
                    href={link.href}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <span className="material-icons text-[12px]">link</span>
                    {link.label}
                  </a>
                )}

                {step.status === 'failed' && step.failureReason && (
                  <div className="bg-destructive/10 border border-destructive/30 rounded-md p-2 text-[11px] text-destructive">
                    <span className="material-icons text-[12px] align-middle mr-1">
                      error_outline
                    </span>
                    {step.failureReason}
                  </div>
                )}
                {step.status === 'skipped' && step.failureReason && (
                  <p className="text-[11px] text-muted-foreground italic">
                    Reason: {step.failureReason}
                  </p>
                )}

                {isActive && (onComplete || onSkip) && (
                  <div className="flex items-center gap-1.5 pt-1">
                    {onComplete && (
                      <button
                        type="button"
                        onClick={() => onComplete(step.stepId)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
                      >
                        <span className="material-icons text-[14px]">check_circle</span>
                        Mark complete
                      </button>
                    )}
                    {onSkip && (
                      <button
                        type="button"
                        onClick={() => {
                          const reason = window.prompt('Reason for skipping?') ?? undefined;
                          if (reason === null) return;
                          onSkip(step.stepId, reason || undefined);
                        }}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-md text-muted-foreground hover:bg-accent disabled:opacity-50"
                      >
                        <span className="material-icons text-[14px]">skip_next</span>
                        Skip
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
            {idx < steps.length - 1 && (
              <div className="ml-4 my-1 h-3 border-l-2 border-dashed border-border" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
