import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { listNotes, createNote, listAllTags } from '@/lib/brain/notes';

export async function GET(request: Request) {
  const result = await authorizePortal({ action: 'read' });
  if (isAuthError(result)) return result.response;

  const url = new URL(request.url);
  const wantTags = url.searchParams.get('tags') === 'true';

  if (wantTags) {
    const tags = await listAllTags(result.client.id);
    return NextResponse.json({ success: true, data: { tags } });
  }

  const relationshipOverlayId = url.searchParams.get('relationshipOverlayId');
  const companyId = url.searchParams.get('companyId');
  const dealId = url.searchParams.get('dealId');
  const contactId = url.searchParams.get('contactId');
  const meetingId = url.searchParams.get('meetingId');
  const tag = url.searchParams.get('tag');
  const search = url.searchParams.get('search');
  const pinnedOnly = url.searchParams.get('pinned') === 'true';
  const sourceUrl = url.searchParams.get('sourceUrl');
  const sourceUrlStartsWith = url.searchParams.get('sourceUrlStartsWith');

  const notes = await listNotes(result.client.id, {
    relationshipOverlayId: relationshipOverlayId ? parseInt(relationshipOverlayId, 10) : undefined,
    companyId: companyId ? parseInt(companyId, 10) : undefined,
    dealId: dealId ? parseInt(dealId, 10) : undefined,
    contactId: contactId ? parseInt(contactId, 10) : undefined,
    meetingId: meetingId ? parseInt(meetingId, 10) : undefined,
    tag: tag ?? undefined,
    search: search ?? undefined,
    pinnedOnly,
    sourceUrl: sourceUrl ?? undefined,
    sourceUrlStartsWith: sourceUrlStartsWith ?? undefined,
  });

  return NextResponse.json({ success: true, data: notes });
}

export async function POST(request: Request) {
  const result = await authorizePortal({ action: 'write' });
  if (isAuthError(result)) return result.response;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.title !== 'string' || !body.title.trim()) {
    return NextResponse.json({ success: false, message: 'title is required' }, { status: 400 });
  }

  const note = await createNote({
    clientId: result.client.id,
    title: body.title,
    body: typeof body.body === 'string' ? body.body : '',
    tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === 'string') : [],
    meetingId: typeof body.meetingId === 'number' ? body.meetingId : null,
    relationshipOverlayId: typeof body.relationshipOverlayId === 'number' ? body.relationshipOverlayId : null,
    companyId: typeof body.companyId === 'number' ? body.companyId : null,
    dealId: typeof body.dealId === 'number' ? body.dealId : null,
    contactId: typeof body.contactId === 'number' ? body.contactId : null,
    confidentialityLevel: ['standard', 'restricted', 'confidential'].includes(body.confidentialityLevel)
      ? body.confidentialityLevel : 'standard',
    pinned: body.pinned === true,
    sourceUrl: typeof body.sourceUrl === 'string' && body.sourceUrl.trim() ? body.sourceUrl.trim() : null,
    source: 'manual',
    createdBy: result.userId,
  });

  return NextResponse.json({ success: true, data: note });
}
