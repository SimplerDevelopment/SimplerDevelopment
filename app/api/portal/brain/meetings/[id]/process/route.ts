import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getMeeting } from '@/lib/brain/meetings';
import { processMeetingTranscript } from '@/lib/ai/meeting-processor';
import { analyzeMeetingAttachments, type AttachmentLike } from '@/lib/brain/analyze-attachment';
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

  const meta = (meeting.sourceMetadata as { attachments?: (AttachmentLike & { analysis?: string })[] } | null) ?? {};
  const attachments = meta.attachments ?? [];
  const hasTranscript = !!meeting.transcript && meeting.transcript.trim().length > 0;
  const hasAttachments = attachments.length > 0;

  if (!hasTranscript && !hasAttachments) {
    return NextResponse.json({ success: false, message: 'Meeting has no transcript or attachments to process.' }, { status: 400 });
  }

  try {
    // Step 1: analyze attachments first (cheap, fast, independent of transcript).
    // Result is written back to source_metadata so the UI shows it under each
    // attachment regardless of whether transcript processing succeeds.
    let attachmentResult: { attachments: typeof attachments; totalTokens: number } | null = null;
    if (hasAttachments) {
      attachmentResult = await analyzeMeetingAttachments(attachments);
      await db.update(brainMeetings)
        .set({
          sourceMetadata: { ...meta, attachments: attachmentResult.attachments },
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
