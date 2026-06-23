import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { and, eq, asc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

/**
 * Slim post listing for the html-render block's `post` field picker.
 * Returns just `{id, title, slug, postType}` to keep the payload tiny — the
 * full GET endpoint above ships every column including 30+ KB content blobs
 * which is wasted bandwidth for a dropdown.
 *
 * Optional `?postType=X` filters to one type (used when an author has set
 * `field.postType` in the schema).
 */
export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const postType = url.searchParams.get('postType');

  const conditions = [eq(posts.websiteId, site.id)];
  if (postType) conditions.push(eq(posts.postType, postType));

  const rows = await db
    .select({ id: posts.id, title: posts.title, slug: posts.slug, postType: posts.postType })
    .from(posts)
    .where(and(...conditions))
    .orderBy(asc(posts.title));

  return NextResponse.json({ success: true, data: rows });
}
