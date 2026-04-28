import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import {
  brainAiJobs,
  brainAiReviewItems,
  type BrainAiJobStatus,
  type BrainReviewItemPayload,
  type BrainReviewItemType,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { setMeetingAiSummary, updateMeetingStatus } from '@/lib/brain/meetings';
import { logAudit } from '@/lib/brain/audit';
import { hasCredits, deductCredits } from '@/lib/ai-credits';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set in environment variables.');
}
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-5';
const MAX_TRANSCRIPT_CHARS = 60_000; // hard cap to keep costs bounded

/**
 * Estimated credits for processing — input + output tokens both pull from the
 * same pool. Tuned for typical 10-30k char transcripts; the deduction below
 * uses real usage so this is just a pre-flight check.
 */
const ESTIMATED_CREDITS = 1_500;

interface ProcessMeetingArgs {
  clientId: number;
  meetingId: number;
  userId: number;
  transcript: string;
  meetingTitle: string;
  meetingDate?: Date | null;
  participants?: { name: string; email?: string }[];
}

interface MeetingExtraction {
  summary: string;
  decisions: { title: string; details?: string }[];
  commitments: { who: string; what: string; when?: string }[];
  tasks: {
    title: string;
    description?: string;
    ownerHint?: string;
    ownerEmail?: string;
    dueDate?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    complianceFlag?: boolean;
  }[];
  missingContext: string[];
  relationshipUpdates: { field: string; value: string; rationale?: string }[];
  complianceWarnings: { message: string; severity?: 'low' | 'medium' | 'high' }[];
}

const SYSTEM_PROMPT = `You analyze meeting transcripts for a business intelligence system called Company Brain.

Your job: extract STRUCTURED business outputs from a transcript so a human can review and approve them. You never make assumptions about people, companies, or commitments that aren't explicit in the transcript.

Return JSON only — no preamble, no markdown fences. Match this exact schema:

{
  "summary": string (2-4 sentences capturing what the meeting was about and the key outcome),
  "decisions": [{ "title": string, "details"?: string }],
  "commitments": [{ "who": string, "what": string, "when"?: string }],
  "tasks": [{
    "title": string,
    "description"?: string,
    "ownerHint"?: string (the name they're attributed to in the transcript, if any),
    "ownerEmail"?: string (only if explicitly mentioned),
    "dueDate"?: string (ISO 8601 date, only if explicit),
    "priority"?: "low" | "medium" | "high" | "urgent",
    "complianceFlag"?: boolean (true if this involves regulated info — SSN, account numbers, medical, legal hold, etc.)
  }],
  "missingContext": [string] (questions a reviewer should resolve before acting — e.g. "Who exactly is 'Sarah'? Last name unclear."),
  "relationshipUpdates": [{ "field": string, "value": string, "rationale"?: string }],
  "complianceWarnings": [{ "message": string, "severity"?: "low" | "medium" | "high" }]
}

Rules:
- Tasks must be concrete next actions, not aspirations. "Send proposal by Friday" is a task; "consider improving processes" is not.
- Mark complianceFlag=true on any task touching SSN, account numbers, tax IDs, medical info, or anything that triggers regulated review.
- If something is ambiguous, add it to missingContext rather than inventing a value.
- Never fabricate names, emails, dates, or dollar amounts that aren't in the transcript.
- Empty arrays are valid. Don't pad output.`;

export async function processMeetingTranscript(args: ProcessMeetingArgs): Promise<{
  jobId: number;
  reviewItemIds: number[];
  extraction: MeetingExtraction;
}> {
  const transcript = args.transcript.slice(0, MAX_TRANSCRIPT_CHARS);
  const truncated = args.transcript.length > MAX_TRANSCRIPT_CHARS;

  // Pre-flight credit check.
  if (!(await hasCredits(args.clientId, ESTIMATED_CREDITS))) {
    throw new Error('Insufficient AI credits. Purchase more credits or enable pay-as-you-go.');
  }

  // Mark meeting as processing + create job row.
  await updateMeetingStatus(args.clientId, args.meetingId, 'processing');
  const [job] = await db.insert(brainAiJobs).values({
    clientId: args.clientId,
    jobType: 'process_meeting',
    status: 'running' as BrainAiJobStatus,
    input: { meetingId: args.meetingId, transcriptLength: args.transcript.length, truncated },
    createdBy: args.userId,
    startedAt: new Date(),
  }).returning();

  let extraction: MeetingExtraction;
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const userPrompt = buildUserPrompt({
      transcript,
      title: args.meetingTitle,
      meetingDate: args.meetingDate ?? null,
      participants: args.participants ?? [],
      truncated,
    });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    inputTokens = response.usage?.input_tokens ?? 0;
    outputTokens = response.usage?.output_tokens ?? 0;

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) throw new Error('AI returned no text content.');

    extraction = parseExtraction(textBlock.text);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown AI processing error';
    await db.update(brainAiJobs).set({
      status: 'failed' as BrainAiJobStatus,
      error: message,
      completedAt: new Date(),
      inputTokens,
      outputTokens,
    }).where(eq(brainAiJobs.id, job.id));

    // Reset meeting status so user can retry.
    await updateMeetingStatus(args.clientId, args.meetingId, 'draft');

    await logAudit({
      clientId: args.clientId,
      actorId: args.userId,
      action: 'meeting.process_failed',
      entityType: 'brain_meeting',
      entityId: args.meetingId,
      metadata: { error: message },
    });

    throw err;
  }

  // Persist AI summary on the meeting record.
  await setMeetingAiSummary(args.clientId, args.meetingId, extraction.summary);

  // Materialize each extracted item as a pending review item.
  const reviewItemIds: number[] = [];

  const reviewRows: (typeof brainAiReviewItems.$inferInsert)[] = [];
  for (const t of extraction.tasks) {
    reviewRows.push(makeReviewRow(args.clientId, args.meetingId, 'task', {
      title: t.title,
      description: t.description,
      ownerHint: t.ownerHint,
      ownerEmail: t.ownerEmail,
      dueDate: t.dueDate,
      priority: t.priority,
      complianceFlag: t.complianceFlag,
    }));
  }
  for (const d of extraction.decisions) {
    reviewRows.push(makeReviewRow(args.clientId, args.meetingId, 'decision', d));
  }
  for (const c of extraction.commitments) {
    reviewRows.push(makeReviewRow(args.clientId, args.meetingId, 'commitment', c));
  }
  for (const r of extraction.relationshipUpdates) {
    reviewRows.push(makeReviewRow(args.clientId, args.meetingId, 'relationship_update', r));
  }
  for (const w of extraction.complianceWarnings) {
    reviewRows.push(makeReviewRow(args.clientId, args.meetingId, 'compliance_warning', w));
  }

  if (reviewRows.length > 0) {
    const inserted = await db.insert(brainAiReviewItems).values(reviewRows).returning({ id: brainAiReviewItems.id });
    for (const row of inserted) reviewItemIds.push(row.id);
  }

  // Move meeting into review state.
  await updateMeetingStatus(args.clientId, args.meetingId, 'needs_review');

  // Charge credits based on actual token usage. Rough heuristic: 1 credit per
  // 1k input tokens + 4 credits per 1k output tokens (output is more expensive).
  const credits = Math.max(1, Math.round(inputTokens / 1000) + Math.round(outputTokens / 250));
  await deductCredits(args.clientId, credits, 'brain_meeting_processing', `meeting:${args.meetingId}`, `Processed meeting ${args.meetingId}`);

  // Mark job complete.
  await db.update(brainAiJobs).set({
    status: 'completed' as BrainAiJobStatus,
    output: {
      reviewItemCount: reviewItemIds.length,
      summaryLength: extraction.summary.length,
    },
    inputTokens,
    outputTokens,
    creditsCharged: credits,
    completedAt: new Date(),
  }).where(eq(brainAiJobs.id, job.id));

  await logAudit({
    clientId: args.clientId,
    actorId: args.userId,
    action: 'meeting.processed',
    entityType: 'brain_meeting',
    entityId: args.meetingId,
    metadata: {
      jobId: job.id,
      reviewItemCount: reviewItemIds.length,
      inputTokens,
      outputTokens,
      creditsCharged: credits,
      truncated,
    },
  });

  return { jobId: job.id, reviewItemIds, extraction };
}

function makeReviewRow(
  clientId: number,
  meetingId: number,
  proposedType: BrainReviewItemType,
  payload: BrainReviewItemPayload,
): typeof brainAiReviewItems.$inferInsert {
  return {
    clientId,
    sourceType: 'meeting',
    sourceId: meetingId,
    proposedType,
    proposedPayload: payload,
    status: 'pending',
  };
}

function buildUserPrompt(args: {
  transcript: string;
  title: string;
  meetingDate: Date | null;
  participants: { name: string; email?: string }[];
  truncated: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`Meeting title: ${args.title}`);
  if (args.meetingDate) lines.push(`Meeting date: ${args.meetingDate.toISOString()}`);
  if (args.participants.length > 0) {
    lines.push('Participants:');
    for (const p of args.participants) {
      lines.push(`  - ${p.name}${p.email ? ` <${p.email}>` : ''}`);
    }
  }
  if (args.truncated) {
    lines.push('NOTE: Transcript was truncated to fit token budget. Be conservative about claims near the end.');
  }
  lines.push('');
  lines.push('Transcript:');
  lines.push('---');
  lines.push(args.transcript);
  lines.push('---');
  lines.push('');
  lines.push('Return JSON only. No commentary, no markdown fences.');
  return lines.join('\n');
}

function parseExtraction(text: string): MeetingExtraction {
  // Strip markdown fences if the model used them despite instructions.
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`AI returned non-JSON output: ${err instanceof Error ? err.message : 'parse failure'}. First 200 chars: ${cleaned.slice(0, 200)}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('AI output is not an object.');
  }
  const obj = parsed as Record<string, unknown>;

  return {
    summary: typeof obj.summary === 'string' ? obj.summary : '',
    decisions: asArray(obj.decisions),
    commitments: asArray(obj.commitments),
    tasks: asArray(obj.tasks),
    missingContext: asArray<string>(obj.missingContext),
    relationshipUpdates: asArray(obj.relationshipUpdates),
    complianceWarnings: asArray(obj.complianceWarnings),
  } as MeetingExtraction;
}

function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
