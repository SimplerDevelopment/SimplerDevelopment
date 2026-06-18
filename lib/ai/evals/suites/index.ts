/**
 * Registry of eval suites.
 *
 * Add a new suite: create `<prompt>.eval.ts` exporting an `EvalSuite`, then
 * register it here. The runner + report pick it up automatically.
 *
 * Wired: automation parser, survey summary, Brain intent classifier, Brain
 * groundedness checker. Next candidates — meeting extractor, note classifier,
 * branding generators, pitch-deck generator (see the prompt inventory).
 * DB-coupled prompts (note classifier / page extractor / meeting extractor)
 * need a seeded tenant, so they take `--clientId` like the Brain runner.
 */
import type { EvalSuite } from '../types';
import { automationParserSuite } from './automation-parser.eval';
import { surveySummarySuite } from './survey-summary.eval';
import { brainClassifierSuite } from './brain-classifier.eval';
import { brainGrounderSuite } from './brain-grounder.eval';

export const ALL_SUITES: EvalSuite[] = [
  automationParserSuite as unknown as EvalSuite,
  surveySummarySuite as unknown as EvalSuite,
  brainClassifierSuite as unknown as EvalSuite,
  brainGrounderSuite as unknown as EvalSuite,
];

export function getSuite(id: string): EvalSuite | undefined {
  return ALL_SUITES.find((s) => s.id === id);
}
