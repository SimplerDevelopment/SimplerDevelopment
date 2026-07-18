// Public-ish read-only endpoint that returns the white-label chrome the
// portal shell should render for the current request. Used by the login
// page (where there is no session yet) and by the sidebar/header chrome
// (where there is one).
//
// Resolution order:
//   1. The middleware-injected `x-agency-client-id` header (set on
//      verified custom-domain requests).
//   2. The active client cookie / NextAuth session (best effort).
//
// Always returns 200 with `whiteLabelEnabled: false` rather than erroring
// — the caller treats absence of branding as "render the default chrome".
//
// We do NOT echo the verification token, role information, or any
// admin-only fields here. Just the public-facing brand bits.

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { eq } from 'drizzle-orm';

interface ChromePayload {
  whiteLabelEnabled: boolean;
  agencyName: string | null;
  agencyLogoUrl: string | null;
  agencyPrimaryColor: string | null;
}

const EMPTY: ChromePayload = {
  whiteLabelEnabled: false,
  agencyName: null,
  agencyLogoUrl: null,
  agencyPrimaryColor: null,
};

export async function GET() {
  let clientId: number | null = null;

  // 1. Custom-domain header from middleware.
  try {
    const h = await headers();
    const headerId = h.get('x-agency-client-id');
    if (headerId) {
      const parsed = parseInt(headerId, 10);
      if (Number.isFinite(parsed) && parsed > 0) clientId = parsed;
    }
  } catch {
    // headers() can throw outside request context; fall through.
  }

  // 2. Active client from session (only if no header hint).
  if (!clientId) {
    try {
      const session = await auth();
      if (session?.user?.id) {
        const userId = parseInt(session.user.id, 10);
        const c = await getPortalClient(userId);
        if (c) clientId = c.id;
      }
    } catch {
      // Unauthenticated — that's fine, just return empty payload.
    }
  }

  if (!clientId) return NextResponse.json({ success: true, data: EMPTY });

  const [row] = await db
    .select({
      whiteLabelEnabled: clients.whiteLabelEnabled,
      agencyName: clients.agencyName,
      agencyLogoUrl: clients.agencyLogoUrl,
      agencyPrimaryColor: clients.agencyPrimaryColor,
    })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!row?.whiteLabelEnabled) return NextResponse.json({ success: true, data: EMPTY });

  return NextResponse.json({
    success: true,
    data: {
      whiteLabelEnabled: true,
      agencyName: row.agencyName,
      agencyLogoUrl: row.agencyLogoUrl,
      agencyPrimaryColor: row.agencyPrimaryColor,
    } satisfies ChromePayload,
  });
}
