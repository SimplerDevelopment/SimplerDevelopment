/**
 * Eval suite — Brand messaging generator (`lib/branding/generators.ts`,
 * extracted from app/api/portal/branding/generate-messaging).
 *
 * description → comprehensive messaging JSON. Scores the contract + the prompt's
 * own rule (3-5 key differentiators) + an LLM-judge for on-brand voice,
 * specificity, and no-fabrication of factual fields.
 *
 *   bun run lib/ai/evals/runner.ts --suite=branding-messaging --key=sk-ant-...
 */
import { z } from 'zod';
import { generateBrandMessaging } from '@/lib/branding/generators';
import type { EvalSuite } from '../types';
import { zodConformance, requiredFields, predicate, llmJudge, latencyUnder } from '../scorers';

interface Input {
  description: string;
}
type Messaging = Record<string, unknown>;

const messagingSchema = z.object({
  companyName: z.string().min(1),
  tagline: z.string().min(1),
  missionStatement: z.string().min(1),
  valueProposition: z.string().min(1),
  elevatorPitch: z.string().min(1),
  boilerplate: z.string().min(1),
  keyDifferentiators: z.array(z.string()).min(1),
});

const cases = [
  {
    id: 'b2b-saas',
    input: { description: 'Acme Flow is a B2B workflow automation SaaS for mid-market ops teams. Setup in minutes, no-code.' },
    expected: {},
    mockOutput: {
      companyName: 'Acme Flow',
      tagline: 'Automate the busywork, keep the control.',
      missionStatement: 'Acme Flow helps mid-market ops teams reclaim time by automating repetitive workflows without code.',
      visionStatement: 'A world where every ops team runs on automation it built itself.',
      valueProposition: 'Set up powerful no-code automations in minutes, not sprints — purpose-built for mid-market operations.',
      toneOfVoice: 'Pragmatic, Confident, Approachable',
      brandPersonality: 'A capable, no-nonsense teammate that gets things done.',
      writingStyle: 'Clear, direct, jargon-light. Lead with outcomes.',
      elevatorPitch: 'Acme Flow lets mid-market ops teams automate repetitive work in minutes with no code, so they ship faster without adding headcount.',
      boilerplate: 'Acme Flow is a no-code workflow automation platform for mid-market operations teams. Founded to eliminate repetitive busywork, it lets teams build and run automations in minutes. Acme Flow is trusted by operations leaders to scale without scaling headcount.',
      keyDifferentiators: ['No-code setup in minutes', 'Built for mid-market ops', 'No engineering dependency'],
      targetAudience: 'Mid-market operations and RevOps leaders drowning in manual, repetitive processes who lack engineering bandwidth.',
      industry: 'B2B SaaS',
      yearFounded: '', companySize: '', headquarters: '', websiteUrl: '',
      socialProof: '', keyClients: '', certifications: '', additionalContext: '',
    } as Messaging,
  },
  {
    id: 'artisan-coffee',
    input: { description: 'Northbeam Coffee roasts small-batch single-origin beans in Portland and ships direct to homes.' },
    expected: {},
    mockOutput: {
      companyName: 'Northbeam Coffee',
      tagline: 'Small-batch. Single-origin. Shipped fresh.',
      missionStatement: 'Northbeam brings carefully roasted single-origin coffee from farm to doorstep.',
      visionStatement: 'To make exceptional single-origin coffee an everyday ritual.',
      valueProposition: 'Freshly roasted single-origin beans shipped direct from our Portland roastery to your home.',
      toneOfVoice: 'Warm, Crafted, Honest',
      brandPersonality: 'A passionate local roaster who treats coffee as craft.',
      writingStyle: 'Sensory, unhurried, sincere.',
      elevatorPitch: 'Northbeam roasts small-batch single-origin coffee in Portland and ships it fresh to your door, so every cup tastes like it just left the roastery.',
      boilerplate: 'Northbeam Coffee is a Portland roaster of small-batch, single-origin beans shipped direct to homes. Founded for people who care where their coffee comes from, Northbeam roasts to order for peak freshness.',
      keyDifferentiators: ['Small-batch roasting', 'Single-origin sourcing', 'Roast-to-order freshness', 'Direct-to-home shipping'],
      targetAudience: 'Home coffee enthusiasts who value freshness, provenance, and craft over convenience-store blends.',
      industry: 'Food & Beverage',
      yearFounded: '', companySize: '', headquarters: 'Portland', websiteUrl: '',
      socialProof: '', keyClients: '', certifications: '', additionalContext: '',
    } as Messaging,
  },
] as const;

export const brandingMessagingSuite: EvalSuite<Input, Messaging> = {
  id: 'branding-messaging',
  description: 'Brand description → messaging (tagline, mission, value prop, differentiators, …).',
  cases: cases as unknown as EvalSuite<Input, Messaging>['cases'],
  scorers: [
    zodConformance<Messaging>(messagingSchema),
    requiredFields<Messaging>(['companyName', 'tagline', 'valueProposition', 'elevatorPitch']),
    predicate<Input, Messaging>('differentiators-3-to-5', (m) => {
      const d = m.keyDifferentiators;
      const n = Array.isArray(d) ? d.length : 0;
      return { pass: n >= 3 && n <= 5, detail: `${n} differentiators (want 3-5)` };
    }),
    llmJudge<Input, Messaging>({
      name: 'judge-on-brand',
      dimensions: ['on-brand', 'specificity', 'no-fabrication'],
      threshold: 0.7,
      buildPrompt: (m, ctx) =>
        [
          'Grade this generated brand messaging against the source description.',
          'on-brand = voice/positioning fit the description.',
          'specificity = concrete and differentiated, not generic filler.',
          'no-fabrication = no invented facts (year founded, clients, certs) not in the description.',
          '',
          `DESCRIPTION: ${ctx.input.description}`,
          '',
          `tagline: ${String(m.tagline)}`,
          `valueProposition: ${String(m.valueProposition)}`,
          `elevatorPitch: ${String(m.elevatorPitch)}`,
        ].join('\n'),
    }),
    latencyUnder(20_000),
  ],
  async run(input, env) {
    if (!env.anthropicApiKey) throw new Error('branding-messaging suite needs an Anthropic key (or run --mock)');
    const { messaging, inputTokens, outputTokens } = await generateBrandMessaging(input.description, env.anthropicApiKey, env.promptOverride);
    return { output: messaging, inputTokens, outputTokens };
  },
};
