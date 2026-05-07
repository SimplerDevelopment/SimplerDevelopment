// White-label kill-switch. Flips `clients.whiteLabelEnabled`. Refuses to
// turn the flag on unless the agency has a verified custom domain — that
// gate is the whole point of the table column. Turning it off is always
// allowed (agencies can pause white-label without un-verifying DNS).

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { getPortalClient, getPortalRole } from '@/lib/portal-client';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 });
  }
  const role = await getPortalRole(userId, client.id);
  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ success: false, error: 'Owner or admin role required' }, { status: 403 });
  }

  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ success: false, error: '`enabled` must be boolean' }, { status: 400 });
  }

  if (body.enabled) {
    const [row] = await db
      .select({
        verifiedAt: clients.customDomainVerifiedAt,
        agencyName: clients.agencyName,
      })
      .from(clients)
      .where(eq(clients.id, client.id))
      .limit(1);

    if (!row?.verifiedAt) {
      return NextResponse.json(
        {
          success: false,
          error: 'Verify a custom domain before enabling white-label.',
          hint: 'POST /api/portal/agency/custom-domain to start the flow, then verify it before re-trying.',
        },
        { status: 422 },
      );
    }

    if (!row.agencyName) {
      return NextResponse.json(
        {
          success: false,
          error: 'Set an agencyName before enabling white-label.',
          hint: 'PATCH /api/portal/agency/branding with {"agencyName": "Your Agency"}.',
        },
        { status: 422 },
      );
    }
  }

  await db
    .update(clients)
    .set({ whiteLabelEnabled: body.enabled, updatedAt: new Date() })
    .where(eq(clients.id, client.id));

  return NextResponse.json({ success: true, data: { whiteLabelEnabled: body.enabled } });
}
