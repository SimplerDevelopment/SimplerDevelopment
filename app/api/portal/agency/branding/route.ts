// Agency-level branding overrides used by the portal chrome when the
// owning client has white-label enabled. Distinct from `siteBranding`
// (per-website public-facing brand) and `brandingProfiles` (reusable
// brand kits) because those tables already mean specific things — this
// is just the three or four fields the *portal* shell needs to swap.
//
// GET   — current overrides
// PATCH — update agencyName / agencyLogoUrl / agencyPrimaryColor

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { getPortalClient, getPortalRole } from '@/lib/portal-client';
import { eq } from 'drizzle-orm';

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

async function requireAdminClient() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }),
    } as const;
  }
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return {
      error: NextResponse.json({ success: false, error: 'Client not found' }, { status: 404 }),
    } as const;
  }
  const role = await getPortalRole(userId, client.id);
  if (role !== 'owner' && role !== 'admin') {
    return {
      error: NextResponse.json(
        { success: false, error: 'Owner or admin role required' },
        { status: 403 },
      ),
    } as const;
  }
  return { userId, client } as const;
}

export async function GET() {
  const ctx = await requireAdminClient();
  if ('error' in ctx) return ctx.error;

  const [row] = await db
    .select({
      agencyName: clients.agencyName,
      agencyLogoUrl: clients.agencyLogoUrl,
      agencyPrimaryColor: clients.agencyPrimaryColor,
      whiteLabelEnabled: clients.whiteLabelEnabled,
    })
    .from(clients)
    .where(eq(clients.id, ctx.client.id))
    .limit(1);

  return NextResponse.json({
    success: true,
    data: {
      agencyName: row?.agencyName ?? null,
      agencyLogoUrl: row?.agencyLogoUrl ?? null,
      agencyPrimaryColor: row?.agencyPrimaryColor ?? null,
      whiteLabelEnabled: row?.whiteLabelEnabled ?? false,
    },
  });
}

export async function PATCH(req: Request) {
  const ctx = await requireAdminClient();
  if ('error' in ctx) return ctx.error;

  let body: { agencyName?: string | null; agencyLogoUrl?: string | null; agencyPrimaryColor?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, string | null | Date> = {};

  if (Object.prototype.hasOwnProperty.call(body, 'agencyName')) {
    const v = body.agencyName === null ? null : (body.agencyName ?? '').trim();
    if (v && v.length > 255) {
      return NextResponse.json({ success: false, error: 'agencyName too long' }, { status: 400 });
    }
    updates.agencyName = v || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'agencyLogoUrl')) {
    const v = body.agencyLogoUrl === null ? null : (body.agencyLogoUrl ?? '').trim();
    if (v) {
      try {
        const u = new URL(v);
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
      } catch {
        return NextResponse.json({ success: false, error: 'agencyLogoUrl must be a valid http(s) URL' }, { status: 400 });
      }
    }
    if (v && v.length > 500) {
      return NextResponse.json({ success: false, error: 'agencyLogoUrl too long' }, { status: 400 });
    }
    updates.agencyLogoUrl = v || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'agencyPrimaryColor')) {
    const v = body.agencyPrimaryColor === null ? null : (body.agencyPrimaryColor ?? '').trim();
    if (v && !HEX_COLOR.test(v)) {
      return NextResponse.json(
        { success: false, error: 'agencyPrimaryColor must be a hex color like #2563eb' },
        { status: 400 },
      );
    }
    updates.agencyPrimaryColor = v || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: false, error: 'No fields provided' }, { status: 400 });
  }

  updates.updatedAt = new Date();

  await db.update(clients).set(updates).where(eq(clients.id, ctx.client.id));

  const [row] = await db
    .select({
      agencyName: clients.agencyName,
      agencyLogoUrl: clients.agencyLogoUrl,
      agencyPrimaryColor: clients.agencyPrimaryColor,
      whiteLabelEnabled: clients.whiteLabelEnabled,
    })
    .from(clients)
    .where(eq(clients.id, ctx.client.id))
    .limit(1);

  return NextResponse.json({ success: true, data: row });
}
