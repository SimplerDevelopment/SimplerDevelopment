import { NextResponse } from 'next/server';
import { withApiKeyAndCors } from '@/lib/api-key-middleware';
import { listProducts } from '@/lib/data/products';

export const GET = withApiKeyAndCors(async (req, context) => {
  const { siteId } = await context.params;
  const siteIdNum = parseInt(siteId, 10);
  if (isNaN(siteIdNum)) return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const result = await listProducts(siteIdNum, {
    category: searchParams.get('category'),
    search: searchParams.get('search'),
    sort: searchParams.get('sort'),
    page: parseInt(searchParams.get('page') || '1'),
    limit: parseInt(searchParams.get('limit') || '24'),
  });

  if (!result) return NextResponse.json({ success: false, message: 'Store not found' }, { status: 404 });
  return NextResponse.json({ success: true, ...result });
});
