/**
 * Eval suite — Pitch-deck generator (`lib/ai/pitch-deck-generate.ts`, extracted
 * from app/api/portal/tools/pitch-decks/[id]/generate).
 *
 * prompt → 8-12 slide deck in block JSON. Scores the contract + the prompt's own
 * rules (8-12 slides; first slide leads with a hero block, last with a cta).
 * Expensive (16k+ token generation) — keep the case count small.
 *
 *   bun run lib/ai/evals/runner.ts --suite=deck-generator --key=sk-ant-...
 */
import { z } from 'zod';
import { generateDeckSlides } from '@/lib/ai/pitch-deck-generate';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import type { EvalSuite } from '../types';
import { zodConformance, predicate, latencyUnder } from '../scorers';

interface Input {
  prompt: string;
}

const slidesSchema = z
  .array(z.object({ blocks: z.array(z.record(z.string(), z.unknown())) }))
  .min(1);

/** Read the `type` of every block across a slide list (loose — blocks are unknown). */
function blockTypes(slide: unknown): string[] {
  const blocks = (slide as { blocks?: { type?: unknown }[] })?.blocks ?? [];
  return blocks.map((b) => String(b?.type ?? ''));
}

const cases = [
  {
    id: 'saas-pitch',
    input: { prompt: 'Create an investor pitch deck for Acme Flow, a no-code workflow automation SaaS for mid-market ops teams.' },
    expected: {},
    mockOutput: [
      { id: 's1', label: 'Cover', blocks: [{ id: 'b1', type: 'hero', order: 1, title: 'Acme Flow' }] },
      { id: 's2', label: 'Problem', blocks: [{ id: 'b2', type: 'text', order: 1, content: 'Ops teams drown in manual work.' }] },
      { id: 's3', label: 'Solution', blocks: [{ id: 'b3', type: 'text', order: 1, content: 'No-code automation in minutes.' }] },
      { id: 's4', label: 'Features', blocks: [{ id: 'b4', type: 'card-grid', order: 1, cards: [] }] },
      { id: 's5', label: 'Metrics', blocks: [{ id: 'b5', type: 'stats', order: 1, stats: [] }] },
      { id: 's6', label: 'Team', blocks: [{ id: 'b6', type: 'card-grid', order: 1, cards: [] }] },
      { id: 's7', label: 'Pricing', blocks: [{ id: 'b7', type: 'card-grid', order: 1, cards: [] }] },
      { id: 's8', label: 'Testimonial', blocks: [{ id: 'b8', type: 'testimonial', order: 1, quote: 'Game changer.', author: 'A customer' }] },
      { id: 's9', label: 'Call to Action', blocks: [{ id: 'b9', type: 'cta', order: 1, title: 'Get started', primaryButtonText: 'Book a demo', primaryButtonUrl: '#' }] },
    ] as unknown as PitchDeckSlideV2[],
  },
] as const;

export const deckGeneratorSuite: EvalSuite<Input, PitchDeckSlideV2[]> = {
  id: 'deck-generator',
  description: 'Prompt → 8-12 slide pitch deck (block JSON), hero cover + cta close.',
  cases: cases as unknown as EvalSuite<Input, PitchDeckSlideV2[]>['cases'],
  scorers: [
    zodConformance<PitchDeckSlideV2[]>(slidesSchema),
    predicate<Input, PitchDeckSlideV2[]>('slide-count-8-to-12', (slides) => ({
      pass: slides.length >= 8 && slides.length <= 12,
      detail: `${slides.length} slides (want 8-12)`,
    })),
    predicate<Input, PitchDeckSlideV2[]>('hero-cover-and-cta-close', (slides) => {
      if (slides.length === 0) return { pass: false, detail: 'no slides' };
      const firstHasHero = blockTypes(slides[0]).includes('hero');
      const lastHasCta = blockTypes(slides[slides.length - 1]).includes('cta');
      return { pass: firstHasHero && lastHasCta, detail: `firstHero=${firstHasHero} lastCta=${lastHasCta}` };
    }),
    latencyUnder(60_000),
  ],
  async run(input, env) {
    if (!env.anthropicApiKey) throw new Error('deck-generator suite needs an Anthropic key (or run --mock)');
    const { slides, inputTokens, outputTokens } = await generateDeckSlides(input.prompt, env.anthropicApiKey);
    return { output: slides, inputTokens, outputTokens };
  },
};
