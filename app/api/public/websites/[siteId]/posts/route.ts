import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { posts, categories, tags, postCategories, postTags, clientWebsites } from '@/lib/db/schema';
import { and, eq, desc, like, sql, inArray } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const siteIdNum = parseInt(siteId);

  // Verify website exists and is active
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteIdNum), eq(clientWebsites.active, true)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const offset = parseInt(searchParams.get('offset') || '0');
  const postType = searchParams.get('postType') || null;
  const category = searchParams.get('category') || null;
  const tag = searchParams.get('tag') || null;
  const search = searchParams.get('search') || null;

  const conditions = [
    eq(posts.websiteId, siteIdNum),
    eq(posts.published, true),
  ];

  if (postType) conditions.push(eq(posts.postType, postType));
  if (search) conditions.push(like(posts.title, `%${search}%`));

  // Get post IDs filtered by category/tag if needed
  let filteredPostIds: number[] | null = null;

  if (category) {
    const catPosts = await db
      .select({ postId: postCategories.postId })
      .from(postCategories)
      .innerJoin(categories, eq(categories.id, postCategories.categoryId))
      .where(and(eq(categories.slug, category), eq(categories.websiteId, siteIdNum)));
    filteredPostIds = catPosts.map(p => p.postId);
  }

  if (tag) {
    const tagPosts = await db
      .select({ postId: postTags.postId })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(and(eq(tags.slug, tag), eq(tags.websiteId, siteIdNum)));
    const tagPostIds = tagPosts.map(p => p.postId);
    filteredPostIds = filteredPostIds
      ? filteredPostIds.filter(id => tagPostIds.includes(id))
      : tagPostIds;
  }

  if (filteredPostIds !== null) {
    if (filteredPostIds.length === 0) {
      return NextResponse.json({ success: true, data: [], pagination: { limit, offset, total: 0 } });
    }
    conditions.push(inArray(posts.id, filteredPostIds));
  }

  const where = and(...conditions);

  const [data, [{ count }]] = await Promise.all([
    db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        postType: posts.postType,
        excerpt: posts.excerpt,
        coverImage: posts.coverImage,
        publishedAt: posts.publishedAt,
      })
      .from(posts)
      .where(where)
      .orderBy(desc(posts.publishedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(posts)
      .where(where),
  ]);

  return NextResponse.json({
    success: true,
    data,
    pagination: { limit, offset, total: count },
  });
}
