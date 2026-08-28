/**
 * PUX-172 (design doc screen 31): the deal's stage as a stepper.
 * Pure — stages ordered by `order`, each marked done / current / todo
 * relative to the deal's stageId. An unknown stageId marks everything todo.
 */

import type { Stage } from './types';

export type StepState = 'done' | 'current' | 'todo';

export function stageSteps(stages: Stage[], currentStageId: number): { stage: Stage; state: StepState }[] {
  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const i = ordered.findIndex((s) => s.id === currentStageId);
  return ordered.map((stage, k) => ({ stage, state: i === -1 ? 'todo' : k < i ? 'done' : k === i ? 'current' : 'todo' }));
}
