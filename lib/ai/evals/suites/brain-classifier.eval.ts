/**
 * Eval suite — Brain intent classifier (`lib/ai/brain-tools/classifier.ts`).
 *
 * Label-accuracy archetype: a forced-tool call returns {intent, complexity,
 * reasoning}. We measure whether it picks the right intent (and complexity)
 * against a labeled set — the metric you'd track when tuning the classifier
 * prompt or swapping its model. Clean to wire: `classifyIntent(message,
 * anthropic)` takes the client directly, no DB / tenant.
 */
import { z } from 'zod';
import { classifyIntent, type Classification, type BrainIntent } from '@/lib/ai/brain-tools/classifier';
import type { EvalSuite } from '../types';
import { zodConformance, predicate, latencyUnder } from '../scorers';

interface Input {
  message: string;
}
interface Expected {
  intent: BrainIntent;
  complexity?: 'simple' | 'complex';
}

const classificationSchema = z.object({
  intent: z.enum(['lookup', 'capture', 'planning', 'people', 'procedural', 'summary']),
  complexity: z.enum(['simple', 'complex']),
  reasoning: z.string().min(1),
});

function labeled(id: string, message: string, intent: BrainIntent, mockComplexity: 'simple' | 'complex' = 'simple') {
  return {
    id,
    input: { message },
    expected: { intent } satisfies Expected,
    mockOutput: { intent, complexity: mockComplexity, reasoning: `mock: ${intent}` } as Classification,
  };
}

const cases = [
  labeled('lookup-decision', 'What did we decide about switching our primary database?', 'lookup'),
  labeled('capture-note', 'Add a note that we shipped the billing dunning feature today.', 'capture'),
  labeled('people-expert', 'Who on the team knows the most about Kubernetes?', 'people'),
  labeled('planning-okr', "How are we tracking against this quarter's revenue OKR?", 'planning'),
  labeled('procedural-playbook', 'How do I run the customer onboarding playbook?', 'procedural'),
  labeled('summary-dashboard', 'Give me a high-level summary of everything happening this week.', 'summary'),
] as const;

export const brainClassifierSuite: EvalSuite<Input, Classification> = {
  id: 'brain-classifier',
  description: 'Company Brain message → {intent, complexity} label accuracy.',
  cases: cases as unknown as EvalSuite<Input, Classification>['cases'],
  scorers: [
    zodConformance<Classification>(classificationSchema),
    predicate<Input, Classification>('intent-correct', (o, ctx) => {
      const exp = ctx.expected as Expected;
      return { pass: o.intent === exp.intent, detail: `got ${o.intent}, expected ${exp.intent}` };
    }),
    predicate<Input, Classification>('complexity-correct-when-labeled', (o, ctx) => {
      const exp = ctx.expected as Expected;
      if (!exp.complexity) return { pass: true, detail: 'no complexity label' };
      return { pass: o.complexity === exp.complexity, detail: `got ${o.complexity}, expected ${exp.complexity}` };
    }),
    latencyUnder(8_000),
  ],
  async run(input, env) {
    // classifyIntent routes through the platform AI (completeObject + clientId
    // → resolveClientApiKey), so the suite needs --clientId, not a raw key.
    if (!env.clientId) throw new Error('brain-classifier suite needs --clientId (routes through platform AI)');
    const output = await classifyIntent(input.message, env.clientId);
    return { output };
  },
};
