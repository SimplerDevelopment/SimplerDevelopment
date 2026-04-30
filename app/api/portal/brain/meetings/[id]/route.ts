import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getMeeting, deleteMeeting, linkMeeting } from '@/lib/brain/meetings';
import { logAudit } from '@/lib/brain/audit';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'read' });
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
  return NextResponse.json({ success: true, data: meeting });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const meetingId = parseInt(id, 10);
  if (Number.isNaN(meetingId)) {
    return NextResponse.json({ success: false, message: 'Invalid meeting id' }, { status: 400 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const link: { companyId?: number | null; dealId?: number | null } = {};
  if ('companyId' in body) {
    link.companyId = typeof body.companyId === 'number' ? body.companyId : null;
  }
  if ('dealId' in body) {
    link.dealId = typeof body.dealId === 'number' ? body.dealId : null;
  }
  // Reject linking both at once.
  if (link.companyId != null && link.dealId != null) {
    return NextResponse.json({ success: false, message: 'A meeting can link to a company OR a deal, not both.' }, { status: 400 });
  }

  const updated = await linkMeeting(result.client.id, meetingId, link);
  if (!updated) {
    return NextResponse.json({ success: false, message: 'Meeting not found' }, { status: 404 });
  }
  await logAudit({
    clientId: result.client.id,
    actorId: result.userId,
    action: 'meeting.linked',
    entityType: 'brain_meeting',
    entityId: meetingId,
    metadata: { companyId: updated.companyId, dealId: updated.dealId },
  });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await authorizePortal({ action: 'admin' });
  if (isAuthError(result)) return result.response;

  const { id } = await params;
  const meetingId = parseInt(id, 10);
  if (Number.isNaN(meetingId)) {
    return NextResponse.json({ success: false, message: 'Invalid meeting id' }, { status: 400 });
  }

  try {
    const ok = await deleteMeeting(result.client.id, meetingId);
    if (!ok) {
      return NextResponse.json({ success: false, message: 'Meeting not found' }, { status: 404 });
    }
    await logAudit({
      clientId: result.client.id,
      actorId: result.userId,
      action: 'meeting.deleted',
      entityType: 'brain_meeting',
      entityId: meetingId,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(`[DELETE /api/portal/brain/meetings/${meetingId}] failed:`, err);
    const message = err instanceof Error ? err.message : 'Failed to delete meeting.';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
