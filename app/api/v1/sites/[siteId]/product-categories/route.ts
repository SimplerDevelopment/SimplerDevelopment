import { NextResponse } from 'next/server';
import { withApiKeyAndCors } from '@/lib/api-key-middleware';
import { listProductCategories } from '@/lib/data/products';

export const GET = withApiKeyAndCors(async (_req, context) => {
  const { siteId } = await context.params;
  const siteIdNum = parseInt(siteId, 10);
  if (isNaN(siteIdNum)) return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });

  const data = await listProductCategories(siteIdNum);
  if (!data) return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });

  return NextResponse.json({ success: true, data });
});
