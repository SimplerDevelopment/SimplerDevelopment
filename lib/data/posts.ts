import { db } from '@/lib/db';
import { posts, categories, tags, postCategories, postTags, clientWebsites } from '@/lib/db/schema';
import { and, eq, desc, like, sql, inArray } from 'drizzle-orm';

export interface ListPostsFilters {
  limit?: number;
  offset?: number;
  postType?: string | null;
  category?: string | null;
  tag?: string | null;
  search?: string | null;
}

export async function listPosts(siteId: number, filters: ListPostsFilters = {}) {
  const limit = Math.min(filters.limit ?? 20, 100);
  const offset = filters.offset ?? 0;

  const conditions = [
    eq(posts.websiteId, siteId),
    eq(posts.published, true),
  ];

  if (filters.postType) conditions.push(eq(posts.postType, filters.postType));
  if (filters.search) conditions.push(like(posts.title, `%${filters.search}%`));

  // Filter by category slug
  let filteredPostIds: number[] | null = null;

  if (filters.category) {
    const catPosts = await db
      .select({ postId: postCategories.postId })
      .from(postCategories)
      .innerJoin(categories, eq(categories.id, postCategories.categoryId))
      .where(and(eq(categories.slug, filters.category), eq(categories.websiteId, siteId)));
    filteredPostIds = catPosts.map(p => p.postId);
  }

  if (filters.tag) {
    const tagPosts = await db
      .select({ postId: postTags.postId })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(and(eq(tags.slug, filters.tag), eq(tags.websiteId, siteId)));
    const tagPostIds = tagPosts.map(p => p.postId);
    filteredPostIds = filteredPostIds
      ? filteredPostIds.filter(id => tagPostIds.includes(id))
      : tagPostIds;
  }

  if (filteredPostIds !== null) {
    if (filteredPostIds.length === 0) {
      return { data: [], pagination: { limit, offset, total: 0 } };
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

  return { data, pagination: { limit, offset, total: count } };
}

export async function getPostBySlug(siteId: number, slug: string) {
  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), eq(posts.websiteId, siteId), eq(posts.published, true)))
    .limit(1);

  if (!post) return null;

  const [catRows, tagRows] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name, slug: categories.slug, color: categories.color })
      .from(postCategories)
      .innerJoin(categories, eq(categories.id, postCategories.categoryId))
      .where(eq(postCategories.postId, post.id)),
    db
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(eq(postTags.postId, post.id)),
  ]);

  return { ...post, categories: catRows, tags: tagRows };
}

export async function verifySiteActive(siteId: number) {
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteId), eq(clientWebsites.active, true)))
    .limit(1);
  return site ?? null;
}
