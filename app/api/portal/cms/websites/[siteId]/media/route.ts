import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { resolveClientSite } from '@/lib/portal-client';
import { eq, and, like, or, desc, sql } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = parseInt(searchParams.get('offset') || '0');
  const search = searchParams.get('search') || '';
  const mimeType = searchParams.get('mimeType') || '';

  const conditions = [eq(media.websiteId, site.id)];

  if (search) {
    conditions.push(
      or(
        like(media.filename, `%${search}%`),
        like(media.alt, `%${search}%`),
        like(media.caption, `%${search}%`)
      )!
    );
  }

  if (mimeType && mimeType !== 'all') {
    conditions.push(like(media.mimeType, `${mimeType}%`));
  }

  const data = await db
    .select()
    .from(media)
    .where(and(...conditions))
    .orderBy(desc(media.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(media)
    .where(and(...conditions));

  return NextResponse.json({
    success: true,
    data,
    pagination: { limit, offset, total: count },
  });
}
