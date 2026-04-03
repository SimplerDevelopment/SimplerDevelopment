import { NextResponse } from 'next/server';
import { withApiKeyAndCors } from '@/lib/api-key-middleware';
import { getProductBySlug } from '@/lib/data/products';

export const GET = withApiKeyAndCors(async (_req, context) => {
  const { siteId, slug } = await context.params;
  const siteIdNum = parseInt(siteId, 10);
  if (isNaN(siteIdNum)) return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });

  const data = await getProductBySlug(siteIdNum, slug);
  if (!data) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data });
});
