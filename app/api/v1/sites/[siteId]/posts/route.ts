import { NextResponse } from 'next/server';
import { withApiKeyAndCors } from '@/lib/api-key-middleware';
import { listPosts, verifySiteActive } from '@/lib/data/posts';

export const GET = withApiKeyAndCors(async (req, context) => {
  const { siteId } = await context.params;
  const siteIdNum = parseInt(siteId, 10);
  if (isNaN(siteIdNum)) return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });

  const site = await verifySiteActive(siteIdNum);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const result = await listPosts(siteIdNum, {
    limit: parseInt(searchParams.get('limit') || '20'),
    offset: parseInt(searchParams.get('offset') || '0'),
    postType: searchParams.get('postType'),
    category: searchParams.get('category'),
    tag: searchParams.get('tag'),
    search: searchParams.get('search'),
  });

  return NextResponse.json({ success: true, ...result });
});
