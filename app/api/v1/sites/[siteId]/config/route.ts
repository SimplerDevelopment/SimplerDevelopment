import { NextResponse } from 'next/server';
import { withApiKeyAndCors } from '@/lib/api-key-middleware';
import { getSiteConfig } from '@/lib/data/site-config';

export const GET = withApiKeyAndCors(async (_req, context) => {
  const { siteId } = await context.params;
  const siteIdNum = parseInt(siteId, 10);
  if (isNaN(siteIdNum)) return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });

  const config = await getSiteConfig(siteIdNum);
  if (!config) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: config });
});
