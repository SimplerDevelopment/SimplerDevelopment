/**
 * Eval suite — Meeting transcript extractor (`lib/ai/meeting-processor.ts`).
 *
 * Wires the pure `extractMeetingTranscript` core (extracted from the DB
 * orchestrator) so the prompt is evaluated on a transcript directly — no
 * meeting row, no review-item writes, no credit check. Needs an Anthropic key.
 * Measures the structured business-extraction contract + whether it surfaces
 * tasks and flags compliance-sensitive content.
 *
 *   bun run lib/ai/evals/runner.ts --suite=meeting-extractor --key=sk-ant-...
 */
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { extractMeetingTranscript, type MeetingExtraction } from '@/lib/ai/meeting-processor';
import type { EvalSuite } from '../types';
import { zodConformance, requiredFields, predicate, latencyUnder } from '../scorers';

interface Input {
  transcript: string;
  meetingTitle: string;
  participants?: { name: string; email?: string }[];
}
interface Expected {
  minTasks?: number;
  expectCompliance?: boolean;
}

const extractionSchema = z.object({
  summary: z.string().min(1),
  decisions: z.array(z.object({ title: z.string() })),
  commitments: z.array(z.object({ who: z.string(), what: z.string() })),
  tasks: z.array(z.object({ title: z.string() })),
  missingContext: z.array(z.string()),
  relationshipUpdates: z.array(z.object({ field: z.string(), value: z.string() })),
  complianceWarnings: z.array(z.object({ message: z.string() })),
});

const cases = [
  {
    id: 'standup-with-actions',
    input: {
      meetingTitle: 'Weekly sync',
      participants: [{ name: 'Alex' }, { name: 'Sam' }],
      transcript:
        'Alex: We agreed to ship the billing dunning feature this week. Sam will send the proposal to Acme by Friday. ' +
        'We also decided to drop the legacy import path. Alex to update the changelog.',
    },
    expected: { minTasks: 1 } satisfies Expected,
    mockOutput: {
      summary: 'The team agreed to ship billing dunning this week, send the Acme proposal by Friday, and drop the legacy import path.',
      decisions: [{ title: 'Drop the legacy import path' }],
      commitments: [{ who: 'Sam', what: 'Send the proposal to Acme by Friday' }],
      tasks: [
        { title: 'Send proposal to Acme', ownerHint: 'Sam', dueDate: 'Friday' },
        { title: 'Update the changelog', ownerHint: 'Alex' },
      ],
      missingContext: [],
      relationshipUpdates: [],
      complianceWarnings: [],
    } as MeetingExtraction,
  },
  {
    id: 'compliance-sensitive',
    input: {
      meetingTitle: 'Onboarding call',
      participants: [{ name: 'Dana' }],
      transcript:
        "Dana: The client emailed us their SSN and bank account number to set up ACH. We need someone to store those securely and confirm KYC.",
    },
    expected: { expectCompliance: true } satisfies Expected,
    mockOutput: {
      summary: 'Client sent SSN and bank details for ACH setup; secure storage and KYC confirmation needed.',
      decisions: [],
      commitments: [],
      tasks: [{ title: 'Securely store client SSN/bank details and confirm KYC', complianceFlag: true }],
      missingContext: [],
      relationshipUpdates: [],
      complianceWarnings: [{ message: 'Transcript contains SSN and bank account numbers — regulated data.', severity: 'high' }],
    } as MeetingExtraction,
  },
] as const;

export const meetingExtractorSuite: EvalSuite<Input, MeetingExtraction> = {
  id: 'meeting-extractor',
  description: 'Meeting transcript → summary, decisions, commitments, tasks, compliance warnings.',
  cases: cases as unknown as EvalSuite<Input, MeetingExtraction>['cases'],
  scorers: [
    zodConformance<MeetingExtraction>(extractionSchema),
    requiredFields<MeetingExtraction>(['summary']),
    predicate<Input, MeetingExtraction>('extracts-expected-tasks', (o, ctx) => {
      const exp = ctx.expected as Expected;
      const min = exp.minTasks ?? 0;
      return { pass: o.tasks.length >= min, detail: `${o.tasks.length} tasks (min ${min})` };
    }),
    predicate<Input, MeetingExtraction>('flags-compliance-when-expected', (o, ctx) => {
      const exp = ctx.expected as Expected;
      if (!exp.expectCompliance) return { pass: true, detail: 'no compliance expectation' };
      const flagged = o.complianceWarnings.length > 0 || o.tasks.some((t) => t.complianceFlag);
      return { pass: flagged, detail: `warnings=${o.complianceWarnings.length}` };
    }),
    latencyUnder(25_000),
  ],
  async run(input, env) {
    if (!env.anthropicApiKey) throw new Error('meeting-extractor suite needs an Anthropic key (or run --mock)');
    const anthropic = new Anthropic({ apiKey: env.anthropicApiKey });
    const { extraction, inputTokens, outputTokens } = await extractMeetingTranscript(
      { transcript: input.transcript, meetingTitle: input.meetingTitle, participants: input.participants, systemPromptOverride: env.promptOverride },
      anthropic,
    );
    return { output: extraction, inputTokens, outputTokens };
  },
};
