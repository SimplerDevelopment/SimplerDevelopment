/**
 * Registry of eval suites.
 *
 * Add a new suite: create `<prompt>.eval.ts` exporting an `EvalSuite`, then
 * register it here. The runner + report pick it up automatically.
 *
 * Wired: automation parser, survey summary, Brain intent classifier, Brain
 * groundedness checker, page extractor, note classifier, meeting extractor.
 *
 * The note classifier and meeting extractor were DB-coupled (they took row ids
 * and persisted results); we extracted pure `classifyNoteRow` /
 * `extractMeetingTranscript` cores so the prompts eval on content directly with
 * just an Anthropic key — same path the production orchestrators now call.
 * `page-extractor` still needs `--clientId` (it resolves the tenant key) but
 * needs no row seeding. Next candidates — branding/deck generators.
 */
import type { EvalSuite } from '../types';
import { automationParserSuite } from './automation-parser.eval';
import { surveySummarySuite } from './survey-summary.eval';
import { brainClassifierSuite } from './brain-classifier.eval';
import { brainGrounderSuite } from './brain-grounder.eval';
import { pageExtractorSuite } from './page-extractor.eval';
import { noteClassifierSuite } from './note-classifier.eval';
import { meetingExtractorSuite } from './meeting-extractor.eval';

export const ALL_SUITES: EvalSuite[] = [
  automationParserSuite as unknown as EvalSuite,
  surveySummarySuite as unknown as EvalSuite,
  brainClassifierSuite as unknown as EvalSuite,
  brainGrounderSuite as unknown as EvalSuite,
  pageExtractorSuite as unknown as EvalSuite,
  noteClassifierSuite as unknown as EvalSuite,
  meetingExtractorSuite as unknown as EvalSuite,
];

export function getSuite(id: string): EvalSuite | undefined {
  return ALL_SUITES.find((s) => s.id === id);
}
