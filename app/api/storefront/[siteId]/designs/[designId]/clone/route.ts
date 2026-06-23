import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productDesigns } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import {
  resolveDesignerCaller,
  newDesignSessionId,
  DESIGN_SESSION_COOKIE,
  designSessionCookieOptions,
} from '@/lib/storefront/designer-auth';

// POST /api/storefront/[siteId]/designs/[designId]/clone
// Body: { name? }
//
// Clones any design the caller can READ — they own it, OR it is public/template.
// The clone is owned by the caller (customer if logged-in, else anonymous
// session — minting a cookie if missing).
//
// Product-designs only (integer ids). The shared `[designId]` segment routes
// numeric ids here; legacy UUID designs never call clone.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string; designId: string }> },
) {
  const { siteId, designId: designIdStr } = await params;
  const websiteId = parseInt(siteId, 10);
  const designId = parseInt(designIdStr, 10);
  if (Number.isNaN(websiteId) || Number.isNaN(designId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  const [source] = await db.select()
    .from(productDesigns)
    .where(and(
      eq(productDesigns.id, designId),
      eq(productDesigns.websiteId, websiteId),
      isNull(productDesigns.deletedAt),
    ))
    .limit(1);
  if (!source) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const caller = await resolveDesignerCaller(req, websiteId);
  const ownedBySelf =
    (caller.customerId && source.customerId === caller.customerId) ||
    (caller.sessionId && source.sessionId === caller.sessionId);

  if (!ownedBySelf && !source.isPublic && !source.isTemplate) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({})) as { name?: string };

  let mintedSessionId: string | null = null;
  let sessionId = caller.sessionId;
  if (!caller.customerId && !sessionId) {
    mintedSessionId = newDesignSessionId();
    sessionId = mintedSessionId;
  }

  const [clone] = await db.insert(productDesigns).values({
    uuid: crypto.randomUUID(),
    websiteId,
    productId: source.productId,
    styleId: source.styleId ?? null,
    customerId: caller.customerId ?? null,
    sessionId: caller.customerId ? null : sessionId,
    name: body.name?.trim() || `${source.name} (Copy)`,
    description: source.description ?? null,
    layers: source.layers ?? [],
    styleOverrides: source.styleOverrides ?? {},
    thumbnailUrl: source.thumbnailUrl ?? null,
    isPublic: false,
    isTemplate: false,
    lastAccessedAt: new Date(),
  }).returning();

  const res = NextResponse.json({ success: true, data: clone }, { status: 201 });
  if (mintedSessionId) {
    res.cookies.set(DESIGN_SESSION_COOKIE, mintedSessionId, designSessionCookieOptions());
  }
  return res;
}
