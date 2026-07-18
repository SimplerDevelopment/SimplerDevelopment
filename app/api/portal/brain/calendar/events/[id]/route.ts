import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { getEvent, updateEvent, deleteEvent } from '@/lib/brain/calendar';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (Number.isNaN(eventId)) {
    return NextResponse.json({ success: false, message: 'Invalid event id' }, { status: 400 });
  }
  const event = await getEvent(result.client.id, eventId);
  if (!event) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: event });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'write' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (Number.isNaN(eventId)) {
    return NextResponse.json({ success: false, message: 'Invalid event id' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ success: false, message: 'Invalid body' }, { status: 400 });
  }

  const startAt = typeof body.startAt === 'string' ? new Date(body.startAt) : undefined;
  const endAt = typeof body.endAt === 'string' ? new Date(body.endAt) : undefined;
  if ((startAt && Number.isNaN(startAt.getTime())) || (endAt && Number.isNaN(endAt.getTime()))) {
    return NextResponse.json({ success: false, message: 'Invalid startAt/endAt' }, { status: 400 });
  }

  try {
    const updated = await updateEvent(result.client.id, eventId, {
      title: typeof body.title === 'string' ? body.title : undefined,
      description: body.description === null ? null : (typeof body.description === 'string' ? body.description : undefined),
      startAt,
      endAt,
      allDay: typeof body.allDay === 'boolean' ? body.allDay : undefined,
      timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
      location: body.location === null ? null : (typeof body.location === 'string' ? body.location : undefined),
      link: body.link === null ? null : (typeof body.link === 'string' ? body.link : undefined),
      relatedTaskId: body.relatedTaskId === null ? null : (typeof body.relatedTaskId === 'number' ? body.relatedTaskId : undefined),
      relatedMeetingId: body.relatedMeetingId === null ? null : (typeof body.relatedMeetingId === 'number' ? body.relatedMeetingId : undefined),
      relatedRelationshipOverlayId: body.relatedRelationshipOverlayId === null ? null : (typeof body.relatedRelationshipOverlayId === 'number' ? body.relatedRelationshipOverlayId : undefined),
    }, result.userId);

    if (!updated) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Failed to update event' }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireBrainEntitlement({ action: 'admin' });
  if ('response' in result) return result.response;

  const { id } = await params;
  const eventId = parseInt(id, 10);
  if (Number.isNaN(eventId)) {
    return NextResponse.json({ success: false, message: 'Invalid event id' }, { status: 400 });
  }

  const ok = await deleteEvent(result.client.id, eventId, result.userId);
  if (!ok) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
