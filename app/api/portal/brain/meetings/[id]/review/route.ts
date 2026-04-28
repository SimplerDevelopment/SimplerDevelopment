import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { listReviewItems } from '@/lib/brain/review';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const meetingId = parseInt(id, 10);
  if (Number.isNaN(meetingId)) {
    return NextResponse.json({ success: false, message: 'Invalid meeting id' }, { status: 400 });
  }
  const url = new URL(request.url);
  const status = url.searchParams.get('status');
  const items = await listReviewItems(result.client.id, {
    sourceType: 'meeting',
    sourceId: meetingId,
    status: (status as 'pending' | 'approved' | 'rejected' | 'edited') ?? undefined,
  });
  return NextResponse.json({ success: true, data: items });
}
