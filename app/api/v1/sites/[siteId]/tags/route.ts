import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { tags } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { withApiKeyAndCors } from '@/lib/api-key-middleware';
import { verifySiteActive } from '@/lib/data/posts';

export const GET = withApiKeyAndCors(async (_req, context) => {
  const { siteId } = await context.params;
  const siteIdNum = parseInt(siteId, 10);
  if (isNaN(siteIdNum)) return NextResponse.json({ success: false, message: 'Invalid site ID' }, { status: 400 });

  const site = await verifySiteActive(siteIdNum);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const data = await db
    .select({ id: tags.id, name: tags.name, slug: tags.slug })
    .from(tags)
    .where(eq(tags.websiteId, siteIdNum))
    .orderBy(tags.name);

  return NextResponse.json({ success: true, data });
});
