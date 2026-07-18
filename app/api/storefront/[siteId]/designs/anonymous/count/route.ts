import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productDesigns } from '@/lib/db/schema';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DESIGN_SESSION_COOKIE } from '@/lib/storefront/designer-auth';

// GET /api/storefront/[siteId]/designs/anonymous/count
// Returns { count: number } of designs for the current anonymous session.
// 0 if no cookie present. Used by the editor to prompt account creation.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId, 10);
  if (Number.isNaN(websiteId)) {
    return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
  }

  const sessionId = req.cookies.get(DESIGN_SESSION_COOKIE)?.value;
  if (!sessionId) {
    return NextResponse.json({ success: true, count: 0 });
  }

  const [{ count }] = await db.select({ count: sql<number>`count(*)` })
    .from(productDesigns)
    .where(and(
      eq(productDesigns.websiteId, websiteId),
      eq(productDesigns.sessionId, sessionId),
      isNull(productDesigns.deletedAt),
    ));

  return NextResponse.json({ success: true, count: Number(count) });
}
