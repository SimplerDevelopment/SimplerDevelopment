import { NextResponse } from 'next/server';
import { withApiKeyAndCors } from '@/lib/api-key-middleware';
import { getNavigation } from '@/lib/data/navigation';
import { verifySiteActive } from '@/lib/data/posts';

export const GET = withApiKeyAndCors(async (_req, context) => {
  const { siteId } = await context.params;
  const siteIdNum = parseInt(siteId, 10);
  if (isNaN(siteIdNum)) return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });

  const site = await verifySiteActive(siteIdNum);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const data = await getNavigation(siteIdNum);
  return NextResponse.json({ success: true, data });
});
