/**
 * Registry of eval suites.
 *
 * Add a new suite: create `<prompt>.eval.ts` exporting an `EvalSuite`, then
 * register it here. The runner + report pick it up automatically.
 *
 * Wired so far (POC): automation parser, survey summary. Next candidates —
 * note classifier, meeting extractor, branding generators, pitch-deck generator
 * (see the prompt inventory). DB-coupled prompts (classifier/extractor) need a
 * seeded tenant, so they take `--clientId` like the Brain runner.
 */
import type { EvalSuite } from '../types';
import { automationParserSuite } from './automation-parser.eval';
import { surveySummarySuite } from './survey-summary.eval';

export const ALL_SUITES: EvalSuite[] = [
  automationParserSuite as unknown as EvalSuite,
  surveySummarySuite as unknown as EvalSuite,
];

export function getSuite(id: string): EvalSuite | undefined {
  return ALL_SUITES.find((s) => s.id === id);
}
