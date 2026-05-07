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
import { resolveClientApiKey } from '@/lib/ai/resolve-client-key';
import { recordAiUsage } from '@/lib/ai/audit';

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

export interface MeetingExtraction {
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

  // Mark meeting as processing + create job row FIRST. This way a credit
  // failure (or any other early failure) leaves an auditable
  // `brain_ai_jobs` row with status='failed', so the meeting detail page's
  // latestJob banner can surface the reason. Previously the credit check
  // ran before the insert and silent failures were invisible.
  await updateMeetingStatus(args.clientId, args.meetingId, 'processing');
  const [job] = await db.insert(brainAiJobs).values({
    clientId: args.clientId,
    jobType: 'process_meeting',
    status: 'running' as BrainAiJobStatus,
    input: { meetingId: args.meetingId, transcriptLength: args.transcript.length, truncated },
    createdBy: args.userId,
    startedAt: new Date(),
  }).returning();

  // Resolve BYOK vs platform key for this client.
  const resolved = await resolveClientApiKey({ clientId: args.clientId, provider: 'anthropic' });
  const anthropic = new Anthropic({ apiKey: resolved.key });

  // Credit pre-flight. If insufficient, mark the freshly-created job as
  // failed and bubble up — same shape as any other AI failure. BYOK skips
  // this since the client pays their provider directly.
  if (resolved.source === 'platform' && !(await hasCredits(args.clientId, ESTIMATED_CREDITS))) {
    const message = 'Insufficient AI credits. Purchase more credits, enable pay-as-you-go, or add a BYOK key.';
    await db.update(brainAiJobs).set({
      status: 'failed' as BrainAiJobStatus,
      error: message,
      completedAt: new Date(),
    }).where(eq(brainAiJobs.id, job.id));
    await updateMeetingStatus(args.clientId, args.meetingId, 'draft');
    await logAudit({
      clientId: args.clientId,
      actorId: args.userId,
      action: 'meeting.process_failed',
      entityType: 'brain_meeting',
      entityId: args.meetingId,
      metadata: { error: message, reason: 'insufficient_credits' },
    });
    throw new Error(message);
  }

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

    console.log(`[brain.process] meeting=${args.meetingId} AI request: transcript=${transcript.length}c title="${args.meetingTitle}" participants=${args.participants?.length ?? 0}`);
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

    console.log(`[brain.process] meeting=${args.meetingId} AI raw response (${textBlock.text.length}c): ${textBlock.text.slice(0, 800)}`);

    extraction = parseExtraction(textBlock.text);
    console.log(`[brain.process] meeting=${args.meetingId} parsed: tasks=${extraction.tasks.length} decisions=${extraction.decisions.length} commitments=${extraction.commitments.length} compliance=${extraction.complianceWarnings.length}`);
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
  // Skip when using BYOK — the client already paid their provider.
  const credits = Math.max(1, Math.round(inputTokens / 1000) + Math.round(outputTokens / 250));
  if (resolved.source === 'platform') {
    await deductCredits(args.clientId, credits, 'brain_meeting_processing', `meeting:${args.meetingId}`, `Processed meeting ${args.meetingId}`);
  }
  void recordAiUsage({ clientId: args.clientId, source: resolved.source, tokens: inputTokens + outputTokens });

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
