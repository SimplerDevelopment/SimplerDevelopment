import { NextResponse } from 'next/server';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { listNotes, countNotes, createNote, listAllTags, type NoteSort, type NoteOrder } from '@/lib/brain/notes';

const ALLOWED_SORTS: NoteSort[] = ['updated', 'created', 'title'];
const ALLOWED_ORDERS: NoteOrder[] = ['asc', 'desc'];

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
  const trashed = url.searchParams.get('trashed') === 'true';

  const sortRaw = url.searchParams.get('sort');
  const orderRaw = url.searchParams.get('order');
  if (sortRaw !== null && !ALLOWED_SORTS.includes(sortRaw as NoteSort)) {
    return NextResponse.json({ success: false, message: `Invalid sort. Allowed: ${ALLOWED_SORTS.join(', ')}` }, { status: 400 });
  }
  if (orderRaw !== null && !ALLOWED_ORDERS.includes(orderRaw as NoteOrder)) {
    return NextResponse.json({ success: false, message: `Invalid order. Allowed: ${ALLOWED_ORDERS.join(', ')}` }, { status: 400 });
  }
  const sort = (sortRaw as NoteSort | null) ?? undefined;
  const order = (orderRaw as NoteOrder | null) ?? undefined;

  // Pagination — clamp to sane bounds. limit max 200 (matches the previous
  // un-paginated cap so we never blow up a client by accident).
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const offsetRaw = parseInt(url.searchParams.get('offset') ?? '0', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 200)) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

  const filters = {
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
    trashed,
  };

  const [items, total] = await Promise.all([
    listNotes(result.client.id, { ...filters, limit, offset, sort, order }),
    countNotes(result.client.id, filters),
  ]);

  return NextResponse.json({ success: true, data: { items, total, limit, offset } });
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
