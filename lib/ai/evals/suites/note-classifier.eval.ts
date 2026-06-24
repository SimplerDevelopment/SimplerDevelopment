/**
 * Eval suite — Brain note classifier (`lib/brain/classify-notes.ts`).
 *
 * Wires the pure `classifyNoteRow` core (extracted from the DB orchestrator) so
 * the prompt is evaluated on note CONTENT — no row seeding, no tenant. Needs an
 * Anthropic key (or --clientId-resolved key). Measures the taxonomy facets the
 * production schema already validates, plus URL-hint-driven source accuracy.
 *
 *   bun run lib/ai/evals/runner.ts --suite=note-classifier --key=sk-ant-...
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { classifyNoteRow, type NoteRow, type NoteClassification } from '@/lib/brain/classify-notes';
import type { EvalSuite } from '../types';
import { zodConformance, predicate, latencyUnder } from '../scorers';

interface Input {
  title: string;
  body: string;
  sourceUrl?: string | null;
  /** Brain note `source` column (drives URL-hint prefill). */
  source?: string;
}
interface Expected {
  /** When set, the classifier should land on this taxonomy source facet. */
  source?: string;
}

// Structural contract (the production code Zod-validates the exact enums; here
// we assert shape + ranges so the suite doesn't couple to every slug literal).
const classificationSchema = z.object({
  noteId: z.number(),
  source: z.string().min(1),
  slateAreas: z.array(z.string()),
  audiences: z.array(z.string()),
  contentType: z.string().min(1),
  recency: z.string().min(1),
  competitor: z.string().nullable().optional(),
  status: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

const cases = [
  {
    id: 'competitor-blog',
    input: {
      title: "Carnegie's new enrollment marketing playbook",
      body: 'A breakdown of how a competitor is approaching enrollment marketing for 2026.',
      sourceUrl: 'https://www.carnegiehighered.com/blog/enrollment-playbook',
      source: 'document_import',
    },
    expected: { source: 'competitor' } satisfies Expected,
    mockOutput: {
      noteId: 0,
      source: 'competitor',
      slateAreas: [],
      audiences: ['enrollment'],
      contentType: 'article',
      recency: 'current-12mo',
      competitor: null,
      status: 'canonical',
      confidence: 0.9,
      reasoning: 'mock: competitor domain',
    } as unknown as NoteClassification,
  },
  {
    id: 'internal-howto',
    input: {
      title: 'How to run our weekly pipeline review',
      body: 'Step-by-step internal runbook for the weekly sales pipeline review meeting.',
      sourceUrl: null,
      source: 'manual',
    },
    expected: {} satisfies Expected,
    mockOutput: {
      noteId: 0,
      source: 'internal',
      slateAreas: [],
      audiences: [],
      contentType: 'runbook',
      recency: 'evergreen',
      competitor: null,
      status: 'canonical',
      confidence: 0.8,
      reasoning: 'mock: internal runbook',
    } as unknown as NoteClassification,
  },
] as const;

export const noteClassifierSuite: EvalSuite<Input, NoteClassification> = {
  id: 'note-classifier',
  description: 'Brain note content → taxonomy facets (source/content-type/recency/status) + confidence.',
  cases: cases as unknown as EvalSuite<Input, NoteClassification>['cases'],
  scorers: [
    zodConformance<NoteClassification>(classificationSchema),
    predicate<Input, NoteClassification>('source-correct-when-expected', (o, ctx) => {
      const exp = ctx.expected as Expected;
      if (!exp.source) return { pass: true, detail: `source=${o.source} (no expectation)` };
      return { pass: o.source === exp.source, detail: `got ${o.source}, expected ${exp.source}` };
    }),
    predicate<Input, NoteClassification>('confidence-in-range', (o) => ({
      pass: o.confidence >= 0 && o.confidence <= 1,
      detail: `confidence=${o.confidence}`,
    })),
    latencyUnder(10_000),
  ],
  async run(input, env) {
    if (!env.anthropicApiKey) throw new Error('note-classifier suite needs an Anthropic key (or run --mock)');
    const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
    const row: NoteRow = { id: 0, title: input.title, body: input.body, sourceUrl: input.sourceUrl ?? null, source: input.source ?? '' };
    const { classification } = await classifyNoteRow(row, anthropic);
    return { output: classification };
  },
};
