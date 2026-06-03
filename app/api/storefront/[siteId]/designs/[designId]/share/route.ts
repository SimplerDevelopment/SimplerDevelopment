import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productDesigns } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { resolveDesignerCaller } from '@/lib/storefront/designer-auth';

// POST /api/storefront/[siteId]/designs/[designId]/share
// Body: { isPublic: boolean }
// Returns: { design, shareableUrl, uuid, isPublic }
//
// Product-designs only (integer ids). The shared `[designId]` segment routes
// numeric ids here; legacy UUID designs never call share.
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

  const body = await req.json().catch(() => null) as { isPublic?: boolean } | null;
  if (!body || typeof body.isPublic !== 'boolean') {
    return NextResponse.json({ success: false, message: 'isPublic boolean required' }, { status: 400 });
  }

  const [row] = await db.select()
    .from(productDesigns)
    .where(and(
      eq(productDesigns.id, designId),
      eq(productDesigns.websiteId, websiteId),
      isNull(productDesigns.deletedAt),
    ))
    .limit(1);
  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const caller = await resolveDesignerCaller(req, websiteId);
  const ownedBySelf =
    (caller.customerId && row.customerId === caller.customerId) ||
    (caller.sessionId && row.sessionId === caller.sessionId);
  if (!ownedBySelf) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const [updated] = await db.update(productDesigns)
    .set({ isPublic: body.isPublic, updatedAt: new Date() })
    .where(eq(productDesigns.id, designId))
    .returning();

  // Build a shareable URL on the origin that hit us.
  const origin = req.nextUrl.origin;
  const shareableUrl = `${origin}/design/share/${updated.uuid}`;

  return NextResponse.json({
    success: true,
    design: updated,
    shareableUrl,
    uuid: updated.uuid,
    isPublic: updated.isPublic,
  });
}
