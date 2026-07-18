import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  IMPERSONATE_COOKIE,
  IMPERSONATE_COOKIE_OPTIONS,
  mintImpersonationToken,
} from '@/lib/impersonation';
import { requireStaffSession } from '@/lib/admin/auth';

/**
 * Start an impersonation session as the target client.
 *
 * POST /api/admin/portal/clients/[id]/impersonate
 *
 * Admin-panel staff only (role admin|employee, via requireStaffSession) — the
 * same boundary that gates the admin UI this endpoint is reached from. Editors
 * are intentionally excluded: they cannot reach the admin client list, so they
 * must not be able to mint an impersonation cookie by POSTing a guessed
 * clientId directly. Sets an HMAC-signed `sd_impersonate_client_id` cookie and
 * redirects to /portal/dashboard.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  const userId = session?.user?.id;

  if (!userId) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 },
    );
  }

  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json(
      { success: false, message: 'Invalid client id' },
      { status: 400 },
    );
  }

  // Confirm the client exists before minting a token for it.
  const [target] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!target) {
    return NextResponse.json(
      { success: false, message: 'Client not found' },
      { status: 404 },
    );
  }

  const staffUserId = parseInt(userId, 10);
  const token = mintImpersonationToken(clientId, staffUserId);

  console.log('[impersonation] start', {
    staffUserId,
    targetClientId: clientId,
    timestamp: new Date().toISOString(),
    action: 'start',
  });

  // Honor `?redirect=1` (used by <form>-based POST from the admin button) by
  // sending a 303 to /portal/dashboard. JSON callers get success+redirect URL.
  const url = new URL(_req.url);
  const wantRedirect = url.searchParams.get('redirect') === '1';
  const redirectTo = '/portal/dashboard';

  if (wantRedirect) {
    const res = NextResponse.redirect(new URL(redirectTo, _req.url), { status: 303 });
    res.cookies.set(IMPERSONATE_COOKIE, token, IMPERSONATE_COOKIE_OPTIONS);
    return res;
  }

  const res = NextResponse.json({ success: true, data: { redirectTo } });
  res.cookies.set(IMPERSONATE_COOKIE, token, IMPERSONATE_COOKIE_OPTIONS);
  return res;
}
