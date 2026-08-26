import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { getProjectsDashboard } from '@/lib/projects/dashboard-aggregate';

// NOTE ON ROUTING: this file is a static segment (`app/api/portal/projects/
// dashboard/route.ts`) that is a *sibling* of the dynamic `app/api/portal/
// projects/[id]/route.ts`. Next's App Router always prefers a matching static
// segment over a dynamic one at the same level, so `GET /api/portal/projects/
// dashboard` resolves here, never to `[id]/route.ts` with `id: 'dashboard'`.

const MAX_STALE_AFTER_DAYS = 365;
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;
const DEFAULT_STALE_AFTER_DAYS = 14;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const url = req.nextUrl;

  const staleAfterDaysRaw = url.searchParams.get('staleAfterDays');
  let staleAfterDays = DEFAULT_STALE_AFTER_DAYS;
  if (staleAfterDaysRaw !== null) {
    const parsed = parseInt(staleAfterDaysRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_STALE_AFTER_DAYS || String(parsed) !== staleAfterDaysRaw.trim()) {
      return NextResponse.json({ success: false, message: `staleAfterDays must be an integer between 1 and ${MAX_STALE_AFTER_DAYS}` }, { status: 400 });
    }
    staleAfterDays = parsed;
  }

  const limitRaw = url.searchParams.get('limit');
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const parsed = parseInt(limitRaw, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > MAX_LIMIT || String(parsed) !== limitRaw.trim()) {
      return NextResponse.json({ success: false, message: `limit must be an integer between 1 and ${MAX_LIMIT}` }, { status: 400 });
    }
    limit = parsed;
  }

  const data = await getProjectsDashboard({ clientId: client.id, staleAfterDays, limit });

  return NextResponse.json({ success: true, data });
}
