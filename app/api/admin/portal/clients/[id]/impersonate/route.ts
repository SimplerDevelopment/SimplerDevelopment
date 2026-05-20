import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  IMPERSONATE_COOKIE,
  IMPERSONATE_COOKIE_OPTIONS,
  isStaffRole,
  mintImpersonationToken,
} from '@/lib/impersonation';

/**
 * Start an impersonation session as the target client.
 *
 * POST /api/admin/portal/clients/[id]/impersonate
 *
 * Staff-only. Sets an HMAC-signed `sd_impersonate_client_id` cookie and
 * redirects to /portal/dashboard.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!userId || !isStaffRole(role)) {
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
