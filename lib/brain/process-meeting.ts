/**
 * Shared brain meeting processing pipeline. Two callers:
 *   - app/api/portal/brain/meetings/[id]/process — manual Process button
 *   - app/api/email/inbound (when brain_profiles.auto_process_email is true)
 *
 * Pipeline steps (all best-effort — failure of one doesn't block the others):
 *   1. analyze attachments → Claude vision/PDF/text → 1-paragraph summaries
 *   2. extract links from transcript → fetch HTML → parse OG/meta → previews
 *   3. (optional) processMeetingTranscript → AI summary, action items, etc.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainMeetings } from '@/lib/db/schema';
import { getMeeting } from '@/lib/brain/meetings';
import { processMeetingTranscript } from '@/lib/ai/meeting-processor';
import { analyzeMeetingAttachments, type AttachmentLike } from '@/lib/brain/analyze-attachment';
import { extractAndFetchLinks, type LinkMeta } from '@/lib/brain/extract-links';

export interface ProcessOptions {
  /** When true, AI transcript processing is skipped — only attachments + links
   *  are enriched. Useful for the auto-on-ingest path if you want metadata
   *  but not full summarization on every email. */
  skipTranscriptAi?: boolean;
}

export interface ProcessResult {
  meetingId: number;
  attachmentsAnalyzed: number;
  attachmentTokens: number;
  linksExtracted: number;
  transcript: {
    jobId: number | null;
    reviewItemCount: number;
    summary: string | null;
  } | null;
}

/**
 * Run the full pipeline against a meeting. Idempotent:
 *   - already-analyzed attachments are skipped (unless they have transient
 *     failure markers — those retry automatically)
 *   - already-fetched link previews are kept
 *   - transcript processing is gated by hasTranscript
 *
 * Throws if the meeting can't be found or has nothing to process.
 */
export async function processBrainMeeting(args: {
  clientId: number;
  meetingId: number;
  userId: number;
  options?: ProcessOptions;
}): Promise<ProcessResult> {
  const { clientId, meetingId, userId, options = {} } = args;

  const meeting = await getMeeting(clientId, meetingId);
  if (!meeting) throw new Error('Meeting not found');

  const meta = (meeting.sourceMetadata as {
    attachments?: (AttachmentLike & { analysis?: string })[];
    links?: LinkMeta[];
  } | null) ?? {};
  const attachments = meta.attachments ?? [];
  const existingLinks = meta.links ?? [];
  const hasTranscript = !!meeting.transcript && meeting.transcript.trim().length > 0;
  const hasAttachments = attachments.length > 0;

  if (!hasTranscript && !hasAttachments) {
    throw new Error('Meeting has no transcript or attachments to process.');
  }

  // Step 1: enrichment (attachments + links). Run in parallel — both are
  // independent and best-effort. Failures are recorded inline rather than
  // surfaced as exceptions.
  const [attachmentResult, linkResult] = await Promise.all([
    hasAttachments ? analyzeMeetingAttachments(attachments) : Promise.resolve(null),
    hasTranscript
      ? extractAndFetchLinks(meeting.transcript!, existingLinks).catch(() => existingLinks)
      : Promise.resolve(existingLinks),
  ]);

  if (attachmentResult || linkResult.length > 0 || existingLinks.length > 0) {
    await db.update(brainMeetings)
      .set({
        sourceMetadata: {
          ...meta,
          ...(attachmentResult ? { attachments: attachmentResult.attachments } : {}),
          links: linkResult,
        },
        updatedAt: new Date(),
      })
      .where(eq(brainMeetings.id, meetingId));
  }

  // Step 2: transcript AI processing (more expensive). Only when there's a
  // transcript and the caller hasn't opted out.
  let transcriptResult: ProcessResult['transcript'] = null;
  if (hasTranscript && !options.skipTranscriptAi) {
    const out = await processMeetingTranscript({
      clientId,
      meetingId,
      userId,
      transcript: meeting.transcript!,
      meetingTitle: meeting.title,
      meetingDate: meeting.meetingDate,
      participants: meeting.participants.map((p) => ({ name: p.name, email: p.email ?? undefined })),
    });
    transcriptResult = {
      jobId: out.jobId,
      reviewItemCount: out.reviewItemIds.length,
      summary: out.extraction.summary,
    };
  }

  return {
    meetingId,
    attachmentsAnalyzed: attachmentResult?.attachments.length ?? 0,
    attachmentTokens: attachmentResult?.totalTokens ?? 0,
    linksExtracted: linkResult.length,
    transcript: transcriptResult,
  };
}
