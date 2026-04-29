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

import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { brainMeetings, brainAiReviewItems } from '@/lib/db/schema';
import {
  getMeeting,
  buildThreadTranscript,
  collectThreadParticipants,
} from '@/lib/brain/meetings';
import { getBrainProfile } from '@/lib/brain/profiles';
import { processMeetingTranscript, type MeetingExtraction } from '@/lib/ai/meeting-processor';
import { classifyAndLinkCrm } from '@/lib/brain/classify-crm';
import { analyzeMeetingAttachments, type AttachmentLike } from '@/lib/brain/analyze-attachment';
import { extractAndFetchLinks, type LinkMeta } from '@/lib/brain/extract-links';

/** Email-like sources whose meetings are eligible for CRM auto-linking and
 *  thread-aware AI processing. Add new sources here when they ingest email. */
const EMAIL_SOURCES: ReadonlySet<string> = new Set(['email', 'gmail-api']);

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
  crm: {
    jobId: number | null;
    reviewItemCount: number;
    contactId: number | null;
    contactCreated: boolean;
    companyId: number | null;
    skipped?: 'no_sender_email' | 'no_credits' | 'disabled' | 'not_email_source' | 'no_extraction' | 'failed';
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
  let extraction: MeetingExtraction | null = null;
  if (hasTranscript && !options.skipTranscriptAi) {
    // Gmail thread context: process the whole conversation (oldest -> newest)
    // rather than the single message in isolation. Each new reply re-runs the
    // pipeline anchored to itself, so we dedupe by clearing PENDING review
    // items from any sibling in the thread (approved/rejected items are kept).
    const isGmailThread = meeting.source === 'gmail-api'
      && !!meeting.thread
      && meeting.thread.length > 1;
    let aiTranscript = meeting.transcript!;
    let aiParticipants: { name: string; email?: string }[] = meeting.participants.map((p) => ({
      name: p.name,
      ...(p.email ? { email: p.email } : {}),
    }));
    if (isGmailThread) {
      const combined = buildThreadTranscript(meeting.thread!);
      if (combined) aiTranscript = combined;
      const threadParticipants = collectThreadParticipants(meeting.thread!);
      if (threadParticipants.length > 0) aiParticipants = threadParticipants;

      const siblingIds = meeting.thread!.map((s) => s.id);
      await db.delete(brainAiReviewItems).where(and(
        eq(brainAiReviewItems.clientId, clientId),
        eq(brainAiReviewItems.sourceType, 'meeting'),
        inArray(brainAiReviewItems.sourceId, siblingIds),
        eq(brainAiReviewItems.status, 'pending'),
      ));
    }

    const out = await processMeetingTranscript({
      clientId,
      meetingId,
      userId,
      transcript: aiTranscript,
      meetingTitle: meeting.title,
      meetingDate: meeting.meetingDate,
      participants: aiParticipants,
    });
    extraction = out.extraction;
    transcriptResult = {
      jobId: out.jobId,
      reviewItemCount: out.reviewItemIds.length,
      summary: out.extraction.summary,
    };
  }

  // Step 3: brain → CRM auto-linking. Only runs when the profile opted in,
  // the meeting was an inbound email, and the transcript step produced an
  // extraction we can ground the AI call in. Best-effort — failure here
  // doesn't fail the overall pipeline (auto-applied links are kept).
  let crmResult: ProcessResult['crm'] = null;
  if (!EMAIL_SOURCES.has(meeting.source)) {
    crmResult = { jobId: null, reviewItemCount: 0, contactId: null, contactCreated: false, companyId: null, skipped: 'not_email_source' };
  } else if (!extraction) {
    crmResult = { jobId: null, reviewItemCount: 0, contactId: null, contactCreated: false, companyId: null, skipped: 'no_extraction' };
  } else {
    const profile = await getBrainProfile(clientId);
    if (!profile?.autoLinkCrm) {
      crmResult = { jobId: null, reviewItemCount: 0, contactId: null, contactCreated: false, companyId: null, skipped: 'disabled' };
    } else {
      try {
        const out = await classifyAndLinkCrm({
          clientId,
          meetingId,
          userId,
          extraction,
          sourceMetadata: meeting.sourceMetadata,
          meetingTitle: meeting.title,
          transcript: meeting.transcript,
        });
        crmResult = {
          jobId: out.jobId,
          reviewItemCount: out.reviewItemIds.length,
          contactId: out.appliedLinks.contactId ?? null,
          contactCreated: out.appliedLinks.contactCreated ?? false,
          companyId: out.appliedLinks.companyId ?? null,
          skipped: out.skipped,
        };
      } catch (err) {
        // Soft-fail: log via console; the audit row is written inside classifyAndLinkCrm.
        console.error(`[brain.classify-crm] meeting ${meetingId}:`, err);
        crmResult = { jobId: null, reviewItemCount: 0, contactId: null, contactCreated: false, companyId: null, skipped: 'failed' };
      }
    }
  }

  return {
    meetingId,
    attachmentsAnalyzed: attachmentResult?.attachments.length ?? 0,
    attachmentTokens: attachmentResult?.totalTokens ?? 0,
    linksExtracted: linkResult.length,
    transcript: transcriptResult,
    crm: crmResult,
  };
}
