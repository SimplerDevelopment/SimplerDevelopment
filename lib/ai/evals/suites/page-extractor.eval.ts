/**
 * Eval suite — Browser-extension page extractor (`lib/extension/extract.ts`).
 *
 * The cleanest of the DB-coupled prompts to wire: `extractFromPage` takes the
 * page text directly and only needs `clientId` to resolve the tenant key (its
 * CRM/Brain enrichment tolerates zero matches), so this runs with `--clientId`
 * and NO row seeding. Output is already Zod-validated in production, so the
 * highest-value checks are entity-extraction quality on top of the contract.
 *
 *   bun run lib/ai/evals/runner.ts --suite=page-extractor --clientId=1 --key=sk-ant-...
 */
import { z } from 'zod';
import { extractFromPage, type ExtractionResult } from '@/lib/extension/extract';
import type { EvalSuite } from '../types';
import { zodConformance, requiredFields, predicate, latencyUnder } from '../scorers';

interface Input {
  url: string;
  title: string;
  text: string;
}
interface Expected {
  /** A person OR company name the extractor should surface (case-insensitive). */
  mustMentionEntity?: string;
}

const extractionSchema = z.object({
  summary: z.string().min(1),
  tags: z.array(z.string()).max(10),
  entities: z.object({
    // Default object parse strips extra keys (title/email/domain/…), so we only
    // assert the one field every entity must have.
    people: z.array(z.object({ name: z.string().min(1) })),
    companies: z.array(z.object({ name: z.string().min(1) })),
  }),
  suggestedNote: z.object({
    title: z.string().min(1),
    body: z.string(),
    tags: z.array(z.string()).max(10),
  }),
});

const cases = [
  {
    id: 'company-announcement',
    input: {
      url: 'https://example.com/news/acme-series-b',
      title: 'Acme Corp raises $40M Series B led by Northstar Ventures',
      text: 'Acme Corp, the logistics startup founded by Jane Rivera, announced a $40M Series B led by Northstar Ventures. CEO Jane Rivera said the funds will expand the engineering team.',
    },
    expected: { mustMentionEntity: 'Acme' } satisfies Expected,
    mockOutput: {
      summary: 'Acme Corp raised a $40M Series B led by Northstar Ventures to grow engineering.',
      tags: ['funding', 'series-b', 'logistics'],
      entities: {
        people: [{ name: 'Jane Rivera', title: 'CEO' }],
        companies: [{ name: 'Acme Corp' }, { name: 'Northstar Ventures' }],
      },
      suggestedNote: { title: 'Acme Corp Series B', body: 'Acme raised $40M (Northstar Ventures).', tags: ['funding'] },
    } as ExtractionResult,
  },
  {
    id: 'product-blog',
    input: {
      url: 'https://example.com/blog/launch',
      title: 'Launching realtime collaboration in our editor',
      text: 'Today we shipped realtime collaboration, letting multiple users edit the same document simultaneously with presence cursors and conflict-free merging.',
    },
    expected: {} satisfies Expected,
    mockOutput: {
      summary: 'Announced realtime collaboration with presence cursors and conflict-free merging in the editor.',
      tags: ['product', 'launch', 'collaboration'],
      entities: { people: [], companies: [] },
      suggestedNote: { title: 'Realtime collaboration launch', body: 'Shipped CRDT-based co-editing.', tags: ['product'] },
    } as ExtractionResult,
  },
] as const;

export const pageExtractorSuite: EvalSuite<Input, ExtractionResult> = {
  id: 'page-extractor',
  description: 'Web page → summary, tags, entities, suggested note (needs --clientId for the key).',
  cases: cases as unknown as EvalSuite<Input, ExtractionResult>['cases'],
  scorers: [
    zodConformance<ExtractionResult>(extractionSchema),
    requiredFields<ExtractionResult>(['summary', 'suggestedNote.title']),
    predicate<Input, ExtractionResult>('expected-entity-present', (o, ctx) => {
      const exp = ctx.expected as Expected;
      if (!exp.mustMentionEntity) return { pass: true, detail: 'no entity expectation' };
      const names = [...o.entities.people, ...o.entities.companies].map((e) => e.name.toLowerCase());
      const needle = exp.mustMentionEntity.toLowerCase();
      return { pass: names.some((n) => n.includes(needle)), detail: `entities: ${names.join(', ') || 'none'}` };
    }),
    latencyUnder(12_000),
  ],
  async run(input, env) {
    if (!env.clientId) throw new Error('page-extractor suite needs --clientId (resolves the tenant key)');
    const output = await extractFromPage({ clientId: env.clientId, url: input.url, title: input.title, text: input.text });
    return { output };
  },
};
