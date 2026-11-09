/**
 * PUX-187 (design doc screen 46): the seven order statuses folded onto a
 * three-step header — Placed → Processing → Fulfilled. The seven-state model
 * stays in the status timeline; this only decides which step is lit.
 * "Fulfilled" = shipped or delivered, the same gate the page uses to hide
 * Mark as Shipped (`status !== 'shipped' && status !== 'delivered'`).
 */
export const ORDER_STEPS = ['Placed', 'Processing', 'Fulfilled'] as const;

export type StepState = 'done' | 'current' | 'todo';

const STEP_OF: Record<string, number> = {
  pending: 0, confirmed: 0, processing: 1, shipped: 2, delivered: 2,
};

/** Terminal statuses that leave the funnel; shown as a pill instead of a step. */
export function terminalLabel(status: string): string | null {
  return status === 'cancelled' ? 'Cancelled' : status === 'refunded' ? 'Refunded' : null;
}

export function orderSteps(status: string): { label: string; state: StepState }[] {
  const cur = STEP_OF[status] ?? 0;
  return ORDER_STEPS.map((label, i) => ({ label, state: i < cur ? 'done' : i === cur ? 'current' : 'todo' }));
}

/** The one teal: true while the order can still be fulfilled. */
export function canFulfil(status: string): boolean {
  return (STEP_OF[status] ?? -1) < 2 && terminalLabel(status) === null;
}
