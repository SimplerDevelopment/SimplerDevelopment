import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { media, clientWebsites } from '@/lib/db/schema';
import { and, eq, desc, like, or, sql } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const siteIdNum = parseInt(siteId);

  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteIdNum), eq(clientWebsites.active, true)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');
  const mimeType = searchParams.get('mimeType') || '';

  const conditions = [eq(media.websiteId, siteIdNum)];

  if (mimeType && mimeType !== 'all') {
    conditions.push(like(media.mimeType, `${mimeType}%`));
  }

  const where = and(...conditions);

  const [data, [{ count }]] = await Promise.all([
    db
      .select({
        id: media.id,
        filename: media.filename,
        mimeType: media.mimeType,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl,
        alt: media.alt,
        caption: media.caption,
        width: media.width,
        height: media.height,
      })
      .from(media)
      .where(where)
      .orderBy(desc(media.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(media)
      .where(where),
  ]);

  return NextResponse.json({
    success: true,
    data,
    pagination: { limit, offset, total: count },
  });
}
