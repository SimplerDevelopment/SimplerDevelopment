import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getMeeting } from '@/lib/brain/meetings';

const INBOUND_SECRET = process.env.INBOUND_EMAIL_SECRET || '';
const ATTACHMENT_WORKER_URL = process.env.BRAIN_ATTACHMENT_WORKER_URL
  || 'https://sd-email-inbound.lingering-bush-dcd7.workers.dev';
const SIGNED_URL_TTL_SECONDS = 300; // 5 min

interface AttachmentMeta {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

/**
 * GET /api/portal/brain/meetings/[id]/attachments/[idx]
 *
 * Verifies session + meeting ownership, then redirects the browser to a
 * short-lived HMAC-signed URL on the email Worker, which streams the R2
 * object back. Vercel never sees the bytes — only the signing happens here.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; idx: string }> },
) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const { id, idx } = await params;
  const meetingId = parseInt(id, 10);
  const attachmentIdx = parseInt(idx, 10);
  if (Number.isNaN(meetingId) || Number.isNaN(attachmentIdx)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const meeting = await getMeeting(result.client.id, meetingId);
  if (!meeting) {
    return NextResponse.json({ success: false, message: 'Meeting not found' }, { status: 404 });
  }

  const attachments = (meeting.sourceMetadata as { attachments?: AttachmentMeta[] } | null)?.attachments ?? [];
  const att = attachments[attachmentIdx];
  if (!att) {
    return NextResponse.json({ success: false, message: 'Attachment not found' }, { status: 404 });
  }

  if (!INBOUND_SECRET) {
    return NextResponse.json({ success: false, message: 'Server misconfigured: INBOUND_EMAIL_SECRET unset' }, { status: 500 });
  }

  const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const sig = createHmac('sha256', INBOUND_SECRET).update(`${att.key}\n${exp}`).digest('hex');
  const url = `${ATTACHMENT_WORKER_URL}/attachment?key=${encodeURIComponent(att.key)}&exp=${exp}&sig=${sig}`;
  return NextResponse.redirect(url, 302);
}
