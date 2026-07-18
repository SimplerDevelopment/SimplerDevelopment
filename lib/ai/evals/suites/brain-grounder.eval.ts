/**
 * Eval suite — Brain groundedness checker (`lib/ai/brain-tools/grounder.ts`).
 *
 * A meta-eval: the grounder IS the production anti-hallucination guard, so we
 * eval the guard itself. Each case pairs a (question, answer, toolResults) with
 * the correct verdict — a grounded answer must score grounded=true, a
 * fabricated one grounded=false. Measures whether the checker actually catches
 * hallucinations, plus its self-consistency (uncertain ⇔ confidence < 0.5).
 *
 * Clean to wire: `checkGroundedness(q, a, toolResults, anthropic)` takes the
 * client directly — no DB / tenant.
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { checkGroundedness, type GroundednessResult } from '@/lib/ai/brain-tools/grounder';
import type { EvalSuite } from '../types';
import { zodConformance, predicate, latencyUnder } from '../scorers';

interface Input {
  question: string;
  answer: string;
  toolResults: string;
}
interface Expected {
  grounded: boolean;
}

const groundednessSchema = z.object({
  confidence: z.number().min(0).max(1),
  grounded: z.boolean(),
  sources: z.array(z.string()),
  uncertain: z.boolean(),
});

const cases = [
  {
    id: 'grounded-answer',
    input: {
      question: 'What database did we choose?',
      answer: 'We chose PostgreSQL as the primary database.',
      toolResults: JSON.stringify([{ type: 'decision', title: 'Primary database', body: 'Decided to use PostgreSQL.' }]),
    },
    expected: { grounded: true } satisfies Expected,
    mockOutput: { confidence: 0.95, grounded: true, sources: ['Primary database'], uncertain: false } as GroundednessResult,
  },
  {
    id: 'hallucinated-answer',
    input: {
      question: 'What database did we choose?',
      answer: 'We chose a proprietary in-house engine called SynthBase v3 with 99.999% uptime.',
      toolResults: JSON.stringify([{ type: 'decision', title: 'Primary database', body: 'Decided to use PostgreSQL.' }]),
    },
    expected: { grounded: false } satisfies Expected,
    mockOutput: { confidence: 0.1, grounded: false, sources: [], uncertain: true } as GroundednessResult,
  },
  {
    id: 'empty-context',
    input: {
      question: 'What is our refund policy?',
      answer: 'Refunds are issued within 30 days, no questions asked.',
      toolResults: JSON.stringify([]),
    },
    expected: { grounded: false } satisfies Expected,
    mockOutput: { confidence: 0.2, grounded: false, sources: [], uncertain: true } as GroundednessResult,
  },
] as const;

export const brainGrounderSuite: EvalSuite<Input, GroundednessResult> = {
  id: 'brain-grounder',
  description: 'Anti-hallucination checker: does it flag grounded vs fabricated answers correctly?',
  cases: cases as unknown as EvalSuite<Input, GroundednessResult>['cases'],
  scorers: [
    zodConformance<GroundednessResult>(groundednessSchema),
    predicate<Input, GroundednessResult>('verdict-correct', (o, ctx) => {
      const exp = ctx.expected as Expected;
      return { pass: o.grounded === exp.grounded, detail: `grounded=${o.grounded}, expected ${exp.grounded}` };
    }),
    predicate<Input, GroundednessResult>('uncertain-self-consistent', (o) => {
      const expected = o.confidence < 0.5;
      return { pass: o.uncertain === expected, detail: `uncertain=${o.uncertain} but confidence=${o.confidence}` };
    }),
    latencyUnder(8_000),
  ],
  async run(input, env) {
    if (!env.anthropicApiKey) throw new Error('brain-grounder suite needs an Anthropic key (or run --mock)');
    const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
    const output = await checkGroundedness(input.question, input.answer, input.toolResults, anthropic);
    return { output };
  },
};
