/**
 * Eval suite — Survey AI summary (`lib/surveys/ai-summary.ts`).
 *
 * Prompt synthesizes free-text survey answers into summary + sentiment +
 * themes + per-question summaries. Structural scorers check the contract and
 * the prompt's own rules (3-7 themes, every question covered); an LLM-judge
 * grades groundedness + specificity (the qualities raw schema checks can't).
 */
import { z } from 'zod';
import { generateSurveySummary, type SurveyAiSummary } from '@/lib/surveys/ai-summary';
import type { SurveyFieldDef } from '@/lib/db/schema';
import type { EvalSuite } from '../types';
import { zodConformance, requiredFields, predicate, llmJudge, latencyUnder } from '../scorers';

interface Input {
  fields: SurveyFieldDef[];
  responses: { answers: Record<string, string> }[];
}
interface Expected {
  /** Number of text questions that should appear in perQuestion. */
  textQuestions: number;
}

/** Minimal text field — fills the required SurveyFieldDef shape. */
function textField(id: string, label: string, order: number): SurveyFieldDef {
  return { id, type: 'textarea', label, placeholder: '', helpText: '', required: false, options: [], order };
}

const summarySchema = z.object({
  summary: z.string().min(1),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'mixed']),
  themes: z.array(z.string()).min(1),
  perQuestion: z.array(
    z.object({ fieldId: z.string(), label: z.string(), summary: z.string(), sampleCount: z.number() }),
  ),
  tokensUsed: z.number(),
});

const onboardingFields = [textField('q_like', 'What did you like most?', 0), textField('q_improve', 'What should we improve?', 1)];

const cases = [
  {
    id: 'onboarding-mixed',
    input: {
      fields: onboardingFields,
      responses: [
        { answers: { q_like: 'The setup wizard was fast and clear.', q_improve: 'Docs were thin; I got stuck on billing.' } },
        { answers: { q_like: 'Loved the templates.', q_improve: 'Mobile app felt slow.' } },
        { answers: { q_like: 'Support replied quickly.', q_improve: 'More integrations please.' } },
      ],
    },
    expected: { textQuestions: 2 } satisfies Expected,
    mockOutput: {
      summary: 'Respondents praised fast onboarding, templates, and support, while asking for better docs, mobile speed, and more integrations.',
      sentiment: 'mixed',
      themes: ['fast onboarding', 'good templates', 'thin docs', 'slow mobile', 'wants integrations'],
      perQuestion: [
        { fieldId: 'q_like', label: 'What did you like most?', summary: 'Setup speed, templates, and responsive support stood out.', sampleCount: 3 },
        { fieldId: 'q_improve', label: 'What should we improve?', summary: 'Docs depth, mobile performance, and integration breadth.', sampleCount: 3 },
      ],
      tokensUsed: 0,
    },
  },
  {
    id: 'nps-negative',
    input: {
      fields: [textField('q_why', 'Why did you give that score?', 0)],
      responses: [
        { answers: { q_why: 'Too expensive for what it does.' } },
        { answers: { q_why: 'Kept hitting bugs at checkout.' } },
      ],
    },
    expected: { textQuestions: 1 } satisfies Expected,
    mockOutput: {
      summary: 'Detractors cited high price relative to value and recurring checkout bugs.',
      sentiment: 'negative',
      themes: ['price too high', 'checkout bugs', 'low value'],
      perQuestion: [
        { fieldId: 'q_why', label: 'Why did you give that score?', summary: 'Cost concerns and checkout reliability dominated.', sampleCount: 2 },
      ],
      tokensUsed: 0,
    },
  },
] as const;

export const surveySummarySuite: EvalSuite<Input, SurveyAiSummary> = {
  id: 'survey-summary',
  description: 'Free-text survey answers → summary, sentiment, themes, per-question synthesis.',
  cases: cases as unknown as EvalSuite<Input, SurveyAiSummary>['cases'],
  scorers: [
    zodConformance<SurveyAiSummary>(summarySchema),
    requiredFields<SurveyAiSummary>(['summary', 'sentiment', 'themes']),
    predicate<Input, SurveyAiSummary>('themes-count-in-range', (o) => {
      const n = o.themes.length;
      return { pass: n >= 3 && n <= 7, detail: `${n} themes (want 3-7)` };
    }),
    predicate<Input, SurveyAiSummary>('all-questions-covered', (o, ctx) => {
      const exp = ctx.expected as Expected;
      return { pass: o.perQuestion.length === exp.textQuestions, detail: `${o.perQuestion.length}/${exp.textQuestions} questions` };
    }),
    llmJudge<Input, SurveyAiSummary>({
      name: 'judge-groundedness',
      dimensions: ['groundedness', 'specificity'],
      threshold: 0.7,
      buildPrompt: (o, ctx) => {
        const raw = ctx.input.responses
          .flatMap((r) => Object.values(r.answers))
          .map((a) => `- ${a}`)
          .join('\n');
        return [
          'Grade this survey summary against the raw responses it was built from.',
          'groundedness = every claim is supported by the responses (no fabrication).',
          'specificity = concrete and useful, not generic filler.',
          '',
          'RAW RESPONSES:',
          raw,
          '',
          'SUMMARY:',
          o.summary,
          `themes: ${o.themes.join(', ')}`,
        ].join('\n');
      },
    }),
    latencyUnder(20_000),
  ],
  async run(input, env) {
    // generateSurveySummary routes through the platform AI (complete + clientId
    // → resolveClientApiKey), so the suite needs --clientId, not a raw key.
    if (!env.clientId) throw new Error('survey-summary suite needs --clientId (routes through platform AI)');
    const out = await generateSurveySummary({ fields: input.fields, responses: input.responses, clientId: env.clientId });
    if (!out) throw new Error('survey-summary: no summarizable text responses for this case');
    return { output: out, outputTokens: out.tokensUsed };
  },
};
