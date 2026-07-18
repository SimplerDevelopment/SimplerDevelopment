import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { productDesigns } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';

// GET /api/storefront/[siteId]/designs/public/[uuid]
// No auth. 404 unless the design is `isPublic`.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string; uuid: string }> },
) {
  const { siteId, uuid } = await params;
  const websiteId = parseInt(siteId, 10);
  if (Number.isNaN(websiteId)) {
    return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
  }
  if (!uuid) {
    return NextResponse.json({ success: false, message: 'Invalid uuid' }, { status: 400 });
  }

  const [row] = await db.select()
    .from(productDesigns)
    .where(and(
      eq(productDesigns.uuid, uuid),
      eq(productDesigns.websiteId, websiteId),
      isNull(productDesigns.deletedAt),
    ))
    .limit(1);

  if (!row || !row.isPublic) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: row });
}
