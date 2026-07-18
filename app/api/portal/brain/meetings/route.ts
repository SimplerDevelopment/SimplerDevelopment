/**
 * GET /api/portal/brain/meetings?limit=20
 *
 * Lightweight list of recent meetings for the active tenant — used by the
 * EntityPicker on the decision form so authors can attach a meeting anchor
 * by title rather than by raw numeric ID. Tenant-scoped via
 * `requireBrainEntitlement` + `listMeetings(clientId, …)`.
 *
 * Response shape:
 *   { success: true, data: { items: Array<{id, title, meetingDate, status, source}> } }
 *
 * Notes:
 *   - This endpoint deliberately does NOT support `?search=` server-side —
 *     EntityPicker filters the returned page client-side. If we add an
 *     fts-backed search later (e.g. against meeting titles + transcripts),
 *     the picker can drop `supportsServerSearch: false` and let the server
 *     do the work. For now, 20 recent rows is enough for the picker UX.
 *   - We project a slim row shape (no transcript / no sourceMetadata) so the
 *     list-call stays cheap.
 */
import { NextResponse } from 'next/server';
import { requireBrainEntitlement } from '@/lib/brain/entitlement';
import { listMeetings } from '@/lib/brain/meetings';

export async function GET(request: Request) {
  const result = await requireBrainEntitlement({ action: 'read' });
  if ('response' in result) return result.response;

  const url = new URL(request.url);
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 100)) : 20;

  const rows = await listMeetings(result.client.id, { limit });
  const items = rows.map((m) => ({
    id: m.id,
    title: m.title,
    meetingDate: m.meetingDate,
    status: m.status,
    source: m.source,
  }));

  return NextResponse.json({ success: true, data: { items } });
}
