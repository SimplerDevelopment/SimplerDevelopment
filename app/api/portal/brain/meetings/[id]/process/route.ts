import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getMeeting } from '@/lib/brain/meetings';
import { processMeetingTranscript } from '@/lib/ai/meeting-processor';
import { analyzeMeetingAttachments, type AttachmentLike } from '@/lib/brain/analyze-attachment';
import { extractAndFetchLinks, type LinkMeta } from '@/lib/brain/extract-links';
import { db } from '@/lib/db';
import { brainMeetings } from '@/lib/db/schema';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const meetingId = parseInt(id, 10);
  if (Number.isNaN(meetingId)) {
    return NextResponse.json({ success: false, message: 'Invalid meeting id' }, { status: 400 });
  }
  const meeting = await getMeeting(result.client.id, meetingId);
  if (!meeting) {
    return NextResponse.json({ success: false, message: 'Meeting not found' }, { status: 404 });
  }
  if (meeting.status === 'processing') {
    return NextResponse.json({ success: false, message: 'Meeting is already processing.' }, { status: 409 });
  }

  const meta = (meeting.sourceMetadata as {
    attachments?: (AttachmentLike & { analysis?: string })[];
    links?: LinkMeta[];
  } | null) ?? {};
  const attachments = meta.attachments ?? [];
  const existingLinks = meta.links ?? [];
  const hasTranscript = !!meeting.transcript && meeting.transcript.trim().length > 0;
  const hasAttachments = attachments.length > 0;

  if (!hasTranscript && !hasAttachments) {
    return NextResponse.json({ success: false, message: 'Meeting has no transcript or attachments to process.' }, { status: 400 });
  }

  try {
    // Step 1: enrich the meeting with attachment analyses and link previews.
    // Both are cheap, fast, independent of transcript, and written back to
    // source_metadata so the UI surfaces them even if step 2 (transcript AI
    // processing) fails. Run both in parallel.
    const [attachmentResult, linkResult] = await Promise.all([
      hasAttachments ? analyzeMeetingAttachments(attachments) : Promise.resolve(null),
      hasTranscript
        ? extractAndFetchLinks(meeting.transcript!, existingLinks)
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

    // Step 2: transcript processing (existing flow). Skipped for attachment-only
    // meetings — the attachment analyses become the meeting's content for now.
    if (hasTranscript) {
      const out = await processMeetingTranscript({
        clientId: result.client.id,
        meetingId,
        userId: result.userId,
        transcript: meeting.transcript!,
        meetingTitle: meeting.title,
        meetingDate: meeting.meetingDate,
        participants: meeting.participants.map((p) => ({ name: p.name, email: p.email ?? undefined })),
      });
      return NextResponse.json({
        success: true,
        data: {
          jobId: out.jobId,
          reviewItemCount: out.reviewItemIds.length,
          summary: out.extraction.summary,
          attachmentsAnalyzed: attachmentResult?.attachments.length ?? 0,
          attachmentTokens: attachmentResult?.totalTokens ?? 0,
          linksExtracted: linkResult.length,
        },
      });
    }

    // Attachment-only path — nothing else to do, return what we analyzed.
    return NextResponse.json({
      success: true,
      data: {
        jobId: null,
        reviewItemCount: 0,
        summary: null,
        attachmentsAnalyzed: attachmentResult?.attachments.length ?? 0,
        attachmentTokens: attachmentResult?.totalTokens ?? 0,
      },
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to process meeting',
    }, { status: 500 });
  }
}
