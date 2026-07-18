import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getMeeting } from '@/lib/brain/meetings';
import { processBrainMeeting } from '@/lib/brain/process-meeting';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const meetingId = parseInt(id, 10);
  if (Number.isNaN(meetingId)) {
    return NextResponse.json({ success: false, message: 'Invalid meeting id' }, { status: 400 });
  }

  // Up-front existence + status check so the manual button gives a fast 4xx
  // instead of routing through the shared processor's "Meeting not found" throw.
  const meeting = await getMeeting(result.client.id, meetingId);
  if (!meeting) {
    return NextResponse.json({ success: false, message: 'Meeting not found' }, { status: 404 });
  }
  if (meeting.status === 'processing') {
    return NextResponse.json({ success: false, message: 'Meeting is already processing.' }, { status: 409 });
  }

  try {
    const out = await processBrainMeeting({
      clientId: result.client.id,
      meetingId,
      userId: result.userId,
    });
    return NextResponse.json({
      success: true,
      data: {
        jobId: out.transcript?.jobId ?? null,
        reviewItemCount: out.transcript?.reviewItemCount ?? 0,
        summary: out.transcript?.summary ?? null,
        attachmentsAnalyzed: out.attachmentsAnalyzed,
        attachmentTokens: out.attachmentTokens,
        linksExtracted: out.linksExtracted,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process meeting';
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(`[brain.process.route] meeting=${meetingId} FAILED: ${message}`);
    if (stack) console.error(stack);
    const status = message === 'Meeting has no transcript or attachments to process.' ? 400 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
