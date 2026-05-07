// Confirms DNS ownership for a previously-registered custom domain. The
// caller must already have POSTed to /api/portal/agency/custom-domain to
// generate a verification token; we look up the persisted token, run a
// `_simplerdev.<domain>` TXT lookup, and stamp `customDomainVerifiedAt`
// on success.
//
// On failure we return 422 with a hint about DNS propagation. The token
// stays in place so the user can retry without re-publishing the TXT
// record.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, customDomainHistory } from '@/lib/db/schema';
import { getPortalClient, getPortalRole } from '@/lib/portal-client';
import { eq } from 'drizzle-orm';
import { verifyDomainOwnership } from '@/lib/agency/dns-verify';
import { clearCustomDomainCache } from '@/lib/agency/custom-domain';

export async function POST() {
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

  const [row] = await db
    .select({
      customDomain: clients.customDomain,
      token: clients.customDomainVerificationToken,
      verifiedAt: clients.customDomainVerifiedAt,
    })
    .from(clients)
    .where(eq(clients.id, client.id))
    .limit(1);

  if (!row?.customDomain || !row.token) {
    return NextResponse.json(
      { success: false, error: 'No custom domain pending verification. Add one first.' },
      { status: 400 },
    );
  }

  const verified = await verifyDomainOwnership(row.customDomain, row.token);
  if (!verified) {
    return NextResponse.json(
      {
        success: false,
        error:
          'TXT record not found yet. DNS changes can take a few minutes to propagate — try again shortly.',
        data: {
          verificationRecord: {
            host: `_simplerdev.${row.customDomain}`,
            type: 'TXT',
            value: row.token,
          },
        },
      },
      { status: 422 },
    );
  }

  // Idempotent: if it was already verified, just return success.
  if (!row.verifiedAt) {
    const now = new Date();
    await db
      .update(clients)
      .set({ customDomainVerifiedAt: now, updatedAt: now })
      .where(eq(clients.id, client.id));

    await db.insert(customDomainHistory).values({
      clientId: client.id,
      domain: row.customDomain,
      action: 'verified',
      byUserId: userId,
    });

    clearCustomDomainCache();
  }

  return NextResponse.json({
    success: true,
    data: { customDomain: row.customDomain, verifiedAt: row.verifiedAt ?? new Date() },
  });
}
