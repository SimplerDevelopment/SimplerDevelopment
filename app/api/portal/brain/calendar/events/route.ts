import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { listEvents, createEvent } from '@/lib/brain/calendar';

function parseDateParam(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

export async function GET(request: Request) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const url = new URL(request.url);
  const now = new Date();
  const from = parseDateParam(url.searchParams.get('from'), new Date(now.getFullYear(), now.getMonth(), 1));
  const to = parseDateParam(url.searchParams.get('to'), new Date(now.getFullYear(), now.getMonth() + 1, 1));

  const events = await listEvents(result.client.id, { from, to });
  return NextResponse.json({ success: true, data: events });
}

export async function POST(request: Request) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ success: false, message: 'title is required' }, { status: 400 });
  }
  if (typeof body.startAt !== 'string' || typeof body.endAt !== 'string') {
    return NextResponse.json({ success: false, message: 'startAt and endAt are required ISO strings' }, { status: 400 });
  }
  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return NextResponse.json({ success: false, message: 'Invalid startAt/endAt' }, { status: 400 });
  }
  if (endAt < startAt) {
    return NextResponse.json({ success: false, message: 'endAt must be on or after startAt' }, { status: 400 });
  }

  try {
    const event = await createEvent({
      clientId: result.client.id,
      title: body.title,
      description: typeof body.description === 'string' ? body.description : null,
      startAt,
      endAt,
      allDay: body.allDay === true,
      timezone: typeof body.timezone === 'string' ? body.timezone : 'UTC',
      location: typeof body.location === 'string' ? body.location : null,
      link: typeof body.link === 'string' ? body.link : null,
      relatedTaskId: typeof body.relatedTaskId === 'number' ? body.relatedTaskId : null,
      relatedMeetingId: typeof body.relatedMeetingId === 'number' ? body.relatedMeetingId : null,
      relatedRelationshipOverlayId: typeof body.relatedRelationshipOverlayId === 'number' ? body.relatedRelationshipOverlayId : null,
      createdBy: result.userId,
    });
    return NextResponse.json({ success: true, data: event });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : 'Failed to create event' }, { status: 400 });
  }
}
