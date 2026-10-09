'use client';

/**
 * PUX-187 (design doc screen 46): the order's status as a three-step header
 * — the same move as the deal stage header (PUX-172). Read-only: status
 * changes still go through the Update Status card / Mark fulfilled.
 * Studio-only; the order page gates on useFeatureFlag('portal-redesign').
 */

import { orderSteps, terminalLabel, type StepState } from '@/lib/store/order-steps';

const STEP: Record<StepState, string> = {
  done: 'bg-foreground text-background',
  current: 'bg-primary text-primary-foreground',
  todo: 'border border-border text-muted-foreground',
};

export default function OrderStepper({ status }: { status: string }) {
  const terminal = terminalLabel(status);
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Order progress">
      {orderSteps(status).map(({ label, state }, i) => (
        <li key={label} aria-current={state === 'current' && !terminal ? 'step' : undefined}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-semibold ${terminal ? STEP.todo : STEP[state]}`}>
          <span className="tabular-nums opacity-70">{i + 1}</span>{label}
        </li>
      ))}
      {terminal && (
        <li className="rounded-full bg-[var(--portal-warn-bg)] px-3 py-1 text-[12.5px] font-semibold text-[var(--portal-warn)]">{terminal}</li>
      )}
    </ol>
  );
}
