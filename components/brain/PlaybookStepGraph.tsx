'use client';

/**
 * Read-only step graph for the playbook detail page. Renders steps in
 * sortOrder with arrows showing nextStepKeys. Each step shows kind icon,
 * name, conditional chip if `condition` is set, count of incoming + outgoing
 * edges.
 */
import {
  playbookStepKindChip,
  type PlaybookStepRow,
} from './playbooks-shared';

interface Props {
  steps: PlaybookStepRow[];
}

export default function PlaybookStepGraph({ steps }: Props) {
  if (steps.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-muted-foreground bg-muted/30 rounded-md border border-dashed border-border">
        No steps yet. Add steps in the editor to define this playbook&apos;s flow.
      </div>
    );
  }

  // Compute incoming-edge counts per step key.
  const incomingCount = new Map<string, number>();
  for (const s of steps) {
    for (const k of s.nextStepKeys ?? []) {
      incomingCount.set(k, (incomingCount.get(k) ?? 0) + 1);
    }
  }

  const stepsByKey = new Map(steps.map((s) => [s.key, s]));

  return (
    <ol className="space-y-2">
      {steps.map((step, idx) => {
        const chip = playbookStepKindChip(step.kind);
        const incoming = incomingCount.get(step.key) ?? 0;
        const outgoing = (step.nextStepKeys ?? []).length;
        const isEntry = incoming === 0;
        const isTerminal = outgoing === 0;

        return (
          <li key={step.id} className="relative">
            <div className="flex items-start gap-3 bg-card border border-border rounded-lg p-3">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-muted/60 text-muted-foreground inline-flex items-center justify-center text-[11px] font-medium">
                {idx + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${chip.className}`}
                  >
                    <span className="material-icons text-[14px]">{chip.icon}</span>
                    {chip.label}
                  </span>
                  <span className="text-sm font-medium text-foreground truncate">
                    {step.name}
                  </span>
                  {isEntry && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                      <span className="material-icons text-[11px]">login</span>
                      entry
                    </span>
                  )}
                  {isTerminal && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 text-zinc-600 dark:bg-zinc-700/40 dark:text-zinc-300">
                      <span className="material-icons text-[11px]">flag</span>
                      terminal
                    </span>
                  )}
                  {step.condition && (
                    <span
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300"
                      title={`${step.condition.field} ${step.condition.op}${
                        step.condition.value !== undefined
                          ? ` ${
                              typeof step.condition.value === 'string'
                                ? step.condition.value
                                : JSON.stringify(step.condition.value)
                            }`
                          : ''
                      }`}
                    >
                      <span className="material-icons text-[11px]">rule</span>
                      conditional
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="font-mono">{step.key}</span>
                  <span className="inline-flex items-center gap-1">
                    <span className="material-icons text-[12px]">arrow_back</span>
                    {incoming} in
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="material-icons text-[12px]">arrow_forward</span>
                    {outgoing} out
                  </span>
                </div>
                {(step.nextStepKeys ?? []).length > 0 && (
                  <div className="mt-2 flex items-center gap-1 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      next:
                    </span>
                    {step.nextStepKeys.map((k) => {
                      const target = stepsByKey.get(k);
                      return (
                        <span
                          key={k}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] ${
                            target
                              ? 'bg-muted/60 text-foreground'
                              : 'bg-destructive/10 text-destructive border border-destructive/30'
                          }`}
                          title={target ? target.name : 'Missing target step!'}
                        >
                          <span className="material-icons text-[11px]">arrow_forward</span>
                          {target?.name ?? k}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {idx < steps.length - 1 && (
              <div className="ml-3.5 my-1 h-3 border-l-2 border-dashed border-border" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
