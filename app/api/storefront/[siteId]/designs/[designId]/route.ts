import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { storeSettings, designs, clients, clientMembers, clientWebsites } from '@/lib/db/schema';
import { and, eq, or } from 'drizzle-orm';
import { extractToken, validateSession } from '@/lib/storefront/customer-auth';
import { auth } from '@/lib/auth';

/**
 * Portal-staff auth check. Returns true when:
 *   1. The request carries a valid NextAuth (portal) session, AND
 *   2. The user is either the direct owner of the client that owns the
 *      website, OR a clientMembers row links them to that client.
 *
 * Used by the design GET/PUT/DELETE endpoints to let portal staff edit
 * "store-mode" designs (designs created server-side by the publisher with
 * no sessionId/customerId — so the normal storefront auth paths reject).
 *
 * Triggered by the `x-portal-staff: 1` request header so we don't take
 * the auth() round-trip on every storefront request; clients in admin
 * mode set the header explicitly.
 */
async function isPortalStaffWithSiteAccess(req: Request, websiteId: number): Promise<boolean> {
  if (req.headers.get('x-portal-staff') !== '1') return false;
  const session = await auth();
  const userIdRaw = session?.user?.id;
  if (!userIdRaw) return false;
  const userId = parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId)) return false;
  const [hit] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .innerJoin(clients, eq(clients.id, clientWebsites.clientId))
    .leftJoin(
      clientMembers,
      and(eq(clientMembers.clientId, clients.id), eq(clientMembers.userId, userId)),
    )
    .where(
      and(
        eq(clientWebsites.id, websiteId),
        or(eq(clients.userId, userId), eq(clientMembers.userId, userId)),
      ),
    )
    .limit(1);
  return !!hit;
}

async function verifyStore(websiteId: number) {
  const [store] = await db.select().from(storeSettings)
    .where(and(eq(storeSettings.websiteId, websiteId), eq(storeSettings.enabled, true)))
    .limit(1);
  return store;
}

/**
 * Resolves the design and verifies the caller owns it via:
 *   - Authorization: Bearer <customerToken> matching design.customerId, OR
 *   - sessionId (query string for GET/DELETE; body for PUT) matching design.sessionId
 */
async function resolveDesignWithAuthz(
  req: Request,
  websiteId: number,
  designId: string,
  callerSessionId: string | null,
): Promise<
  | { kind: 'ok'; design: typeof designs.$inferSelect }
  | { kind: 'error'; status: number; message: string }
> {
  if (!/^[0-9a-fA-F-]{36}$/.test(designId)) {
    return { kind: 'error', status: 400, message: 'Invalid design ID' };
  }

  const [design] = await db.select().from(designs)
    .where(and(eq(designs.id, designId), eq(designs.websiteId, websiteId)))
    .limit(1);

  if (!design) {
    return { kind: 'error', status: 404, message: 'Design not found' };
  }

  // Portal-staff path — set by the x-portal-staff header on admin requests.
  // Staff with site access can read/write ANY design on the site, including
  // store-mode designs that have no sessionId/customerId.
  if (await isPortalStaffWithSiteAccess(req, websiteId)) {
    return { kind: 'ok', design };
  }

  // Try logged-in customer auth first
  const token = extractToken(req);
  if (token) {
    const customerSession = await validateSession(token);
    if (customerSession && customerSession.websiteId === websiteId && design.customerId === customerSession.customerId) {
      return { kind: 'ok', design };
    }
  }

  // Fall back to guest sessionId
  if (callerSessionId && design.sessionId && design.sessionId === callerSessionId) {
    return { kind: 'ok', design };
  }

  return { kind: 'error', status: 403, message: 'Forbidden' };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ siteId: string; designId: string }> }
) {
  try {
    const { siteId, designId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    const res = await resolveDesignWithAuthz(req, websiteId, designId, sessionId);
    if (res.kind === 'error') {
      return NextResponse.json({ success: false, message: res.message }, { status: res.status });
    }

    return NextResponse.json({ success: true, data: res.design });
  } catch (err) {
    console.error('Storefront design GET error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string; designId: string }> }
) {
  try {
    const { siteId, designId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const body = await req.json();
    const { name, layersBySurface, canvasSize, status, sessionId } = body || {};

    const res = await resolveDesignWithAuthz(req, websiteId, designId, sessionId || null);
    if (res.kind === 'error') {
      return NextResponse.json({ success: false, message: res.message }, { status: res.status });
    }

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return NextResponse.json({ success: false, message: 'name must be a non-empty string' }, { status: 400 });
      }
      updateData.name = name.trim();
    }
    if (layersBySurface !== undefined) {
      if (typeof layersBySurface !== 'object' || layersBySurface === null || Array.isArray(layersBySurface)) {
        return NextResponse.json({ success: false, message: 'layersBySurface must be an object' }, { status: 400 });
      }
      updateData.layersBySurface = layersBySurface;
    }
    if (canvasSize !== undefined) {
      if (typeof canvasSize !== 'object' || canvasSize === null) {
        return NextResponse.json({ success: false, message: 'canvasSize must be an object' }, { status: 400 });
      }
      updateData.canvasSize = canvasSize;
    }
    if (status !== undefined) {
      if (!['draft', 'finalized', 'rendered'].includes(status)) {
        return NextResponse.json({ success: false, message: 'invalid status' }, { status: 400 });
      }
      updateData.status = status;
    }

    const [updated] = await db.update(designs)
      .set(updateData)
      .where(eq(designs.id, res.design.id))
      .returning();

    return NextResponse.json({ success: true, data: updated });
  } catch (err) {
    console.error('Storefront design PUT error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ siteId: string; designId: string }> }
) {
  try {
    const { siteId, designId } = await params;
    const websiteId = parseInt(siteId, 10);
    if (isNaN(websiteId)) {
      return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
    }

    const store = await verifyStore(websiteId);
    if (!store) {
      return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    const res = await resolveDesignWithAuthz(req, websiteId, designId, sessionId);
    if (res.kind === 'error') {
      return NextResponse.json({ success: false, message: res.message }, { status: res.status });
    }

    await db.delete(designs).where(eq(designs.id, res.design.id));

    return NextResponse.json({ success: true, message: 'Design deleted' });
  } catch (err) {
    console.error('Storefront design DELETE error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
