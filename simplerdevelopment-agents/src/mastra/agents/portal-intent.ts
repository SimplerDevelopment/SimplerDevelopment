import { Agent } from '@mastra/core/agent';
import { z } from 'zod';

/**
 * Portal-assistant intent classifier — ported from the parent app's
 * `lib/ai/portal-tools/classifier.ts`. One fast call returns BOTH:
 *  - complexity → which model the assistant should use (Haiku vs Sonnet)
 *  - domains    → which slice of the portal's tools to expose (keeps the tool
 *                 list small so the model picks well)
 *
 * Those two values are handed to the assistant agent via Mastra's
 * `requestContext`, which its dynamic `model` and `tools` read at request time.
 */
const FAST_MODEL = process.env.SD_PORTAL_FAST_MODEL ?? 'anthropic/claude-haiku-4-5';

/** Portal domains the assistant can act in (mirror of the parent's domain map). */
export const PORTAL_DOMAINS = [
  'projects',
  'billing',
  'support',
  'services',
  'cms',
  'email',
  'pitch_decks',
  'booking',
  'team',
  'crm',
  'surveys',
  'automations',
  'store',
  'brain',
] as const;
export type PortalDomain = (typeof PORTAL_DOMAINS)[number];

export const portalIntentSchema = z.object({
  complexity: z
    .enum(['simple', 'complex'])
    .describe('"complex" if it needs multiple tools, cross-referencing, or a write; else "simple".'),
  domains: z
    .array(z.enum(PORTAL_DOMAINS))
    .describe('The few portal domains this request touches. Empty = unsure, expose everything.'),
});
export type PortalIntent = z.infer<typeof portalIntentSchema>;

export const portalClassifier = new Agent({
  id: 'portal-classifier',
  name: 'Portal Intent Classifier',
  instructions: `Classify a client-portal request.
Pick the portal domains it touches (projects, billing, support, services, cms,
email, pitch_decks, booking, team, crm, surveys, automations, store, brain) and
its complexity. Prefer 1-3 domains. Return only the structured fields.`,
  model: FAST_MODEL,
});

export async function classifyPortalIntent(message: string): Promise<PortalIntent> {
  const { object } = await portalClassifier.generate(message, {
    structuredOutput: { schema: portalIntentSchema },
  });
  return object;
}
