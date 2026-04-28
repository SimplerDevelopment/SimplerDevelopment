import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getMeeting } from '@/lib/brain/meetings';
import { processMeetingTranscript } from '@/lib/ai/meeting-processor';

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
  if (!meeting.transcript || meeting.transcript.trim().length === 0) {
    return NextResponse.json({ success: false, message: 'Meeting has no transcript to process.' }, { status: 400 });
  }
  if (meeting.status === 'processing') {
    return NextResponse.json({ success: false, message: 'Meeting is already processing.' }, { status: 409 });
  }

  try {
    const out = await processMeetingTranscript({
      clientId: result.client.id,
      meetingId,
      userId: result.userId,
      transcript: meeting.transcript,
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
      },
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      message: err instanceof Error ? err.message : 'Failed to process meeting',
    }, { status: 500 });
  }
}
