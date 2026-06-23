import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { designLibraryAssets as designAssets } from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';

// GET /api/storefront/[siteId]/designs/assets?type=icon|art&category=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId, 10);
  if (Number.isNaN(websiteId)) {
    return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const category = url.searchParams.get('category');

  const conditions = [
    eq(designAssets.websiteId, websiteId),
    eq(designAssets.active, true),
  ];
  if (type === 'icon' || type === 'art') {
    conditions.push(eq(designAssets.type, type));
  }
  if (category) {
    conditions.push(eq(designAssets.category, category));
  }

  const rows = await db.select()
    .from(designAssets)
    .where(and(...conditions))
    .orderBy(asc(designAssets.order), asc(designAssets.id));

  return NextResponse.json({ success: true, data: rows });
}
