'use server';

import { db } from '@/lib/db';
import { posts, categories, tags, postCategories, postTags } from '@/lib/db/schema';
import { eq, desc, and, isNull, inArray } from 'drizzle-orm';
import { unstable_cache, revalidateTag } from 'next/cache';

// ─── Blog list caching ──────────────────────────────────────────────────────
// The marketing home page and /blog list are rendered dynamically (the root
// layout reads headers()), so before caching, every visit re-ran these queries
// live. getAllBlogPosts also (a) SELECT *'d the heavy `content` JSON blob for
// EVERY post just to render title/excerpt cards, and (b) issued 1+2N round
// trips (a category + tags query per post) — which pushed production home/blog
// TTFB to ~7s. We now (1) select only list columns (never `content` — the
// single-post page fetches that separately), (2) batch all relations into 2
// queries via inArray, and (3) wrap the result in the Data Cache so the DB is
// hit at most once per revalidate window instead of once per request.
const BLOG_CACHE_TAG = 'blog-posts';
const BLOG_REVALIDATE_SECONDS = 600; // 10 min; busted immediately on post mutations via revalidateBlogPostsCache()

// List/card views never read `content`; omitting the blob is the single biggest
// win (posts can carry tens of KB of block JSON each).
const blogListColumns = {
  id: posts.id,
  slug: posts.slug,
  title: posts.title,
  excerpt: posts.excerpt,
  coverImage: posts.coverImage,
  published: posts.published,
  publishedAt: posts.publishedAt,
  createdAt: posts.createdAt,
  updatedAt: posts.updatedAt,
};

type BlogListRow = {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  published: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Attach category + tags to a set of list rows using exactly two batched
// queries (replaces the previous per-post N+1). `content` is set to '' because
// list/card consumers never read it; the single-post route uses
// getBlogPostBySlug which fetches the real content.
async function attachBlogRelations(rows: BlogListRow[]): Promise<BlogPostWithRelations[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const catRows = await db
    .select({
      postId: postCategories.postId,
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      color: categories.color,
    })
    .from(postCategories)
    .innerJoin(categories, eq(postCategories.categoryId, categories.id))
    .where(inArray(postCategories.postId, ids));

  const tagRows = await db
    .select({
      postId: postTags.postId,
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(inArray(postTags.postId, ids));

  const categoryByPost = new Map<number, BlogPostWithRelations['category']>();
  for (const c of catRows) {
    // First category wins, mirroring the previous .limit(1) behaviour.
    if (!categoryByPost.has(c.postId)) {
      categoryByPost.set(c.postId, { id: c.id, name: c.name, slug: c.slug, color: c.color });
    }
  }

  const tagsByPost = new Map<number, BlogPostWithRelations['tags']>();
  for (const t of tagRows) {
    const list = tagsByPost.get(t.postId) ?? [];
    list.push({ id: t.id, name: t.name, slug: t.slug });
    tagsByPost.set(t.postId, list);
  }

  return rows.map((row) => ({
    ...row,
    content: '',
    category: categoryByPost.get(row.id),
    tags: tagsByPost.get(row.id) ?? [],
  }));
}

/**
 * Invalidate the cached blog list/featured/category queries. Call after any
 * mutation that changes which global blog posts are published or their
 * list-visible fields (title/excerpt/cover/category/tags).
 */
export async function revalidateBlogPostsCache(): Promise<void> {
  revalidateTag(BLOG_CACHE_TAG, 'max');
}

// These helpers back main-domain blog routes (app/(pages)/blog/*) and must
// ONLY return SimplerDevelopment's own "global" blog posts — rows where
// posts.websiteId IS NULL per the schema convention. Tenant blog posts
// live in rows with a non-null websiteId and are served through
// /sites/[domain]/[[...slug]] on the owning tenant's subdomain. Without
// the isNull filter, any tenant's published blog post could be rendered
// on the SimplerDevelopment marketing blog by guessing its slug.

export interface BlogPostWithRelations {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  published: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category?: {
    id: number;
    name: string;
    slug: string;
    color: string | null;
  };
  tags: {
    id: number;
    name: string;
    slug: string;
  }[];
}

export interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
}

/**
 * Get all published global blog posts sorted by published date.
 * Cached in the Data Cache (see BLOG_REVALIDATE_SECONDS / BLOG_CACHE_TAG).
 */
async function getAllBlogPostsUncached(): Promise<BlogPostWithRelations[]> {
  try {
    const publishedPosts = await db
      .select(blogListColumns)
      .from(posts)
      .where(and(
        eq(posts.published, true),
        eq(posts.postType, 'blog'),
        isNull(posts.websiteId),
      ))
      .orderBy(desc(posts.publishedAt));

    return await attachBlogRelations(publishedPosts);
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    // Return empty array if database is not available (e.g., during build)
    return [];
  }
}

const getAllBlogPostsCached = unstable_cache(
  getAllBlogPostsUncached,
  ['blog-all-posts'],
  { revalidate: BLOG_REVALIDATE_SECONDS, tags: [BLOG_CACHE_TAG] },
);

export async function getAllBlogPosts(): Promise<BlogPostWithRelations[]> {
  return getAllBlogPostsCached();
}

/**
 * Get a single blog post by slug
 */
export async function getBlogPostBySlug(slug: string): Promise<BlogPostWithRelations | null> {
  try {
    const post = await db
      .select()
      .from(posts)
      .where(and(
        eq(posts.slug, slug),
        eq(posts.published, true),
        eq(posts.postType, 'blog'),
        isNull(posts.websiteId),
      ))
      .limit(1);

    if (!post || post.length === 0) {
      return null;
    }

    const postData = post[0];

    // Get category
    const postCategory = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        color: categories.color,
      })
      .from(postCategories)
      .innerJoin(categories, eq(postCategories.categoryId, categories.id))
      .where(eq(postCategories.postId, postData.id))
      .limit(1);

    // Get tags
    const postTagsList = await db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
      })
      .from(postTags)
      .innerJoin(tags, eq(postTags.tagId, tags.id))
      .where(eq(postTags.postId, postData.id));

    return {
      ...postData,
      category: postCategory[0] || undefined,
      tags: postTagsList,
    };
  } catch (error) {
    console.error(`Error fetching blog post ${slug}:`, error);
    return null;
  }
}

/**
 * Get all blog posts by category slug.
 * Cached per-slug in the Data Cache.
 */
async function getBlogPostsByCategoryUncached(categorySlug: string): Promise<BlogPostWithRelations[]> {
  try {
    // First get the category
    const category = await db
      .select()
      .from(categories)
      .where(eq(categories.slug, categorySlug))
      .limit(1);

    if (!category || category.length === 0) {
      return [];
    }

    const categoryId = category[0].id;

    // Get posts in this category (list columns only — no `content` blob)
    const categoryPosts = await db
      .select(blogListColumns)
      .from(posts)
      .innerJoin(postCategories, eq(posts.id, postCategories.postId))
      .where(
        and(
          eq(postCategories.categoryId, categoryId),
          eq(posts.published, true),
          eq(posts.postType, 'blog'),
          isNull(posts.websiteId),
        )
      )
      .orderBy(desc(posts.publishedAt));

    // Batch the relations, then overwrite category with the known one (every
    // post here belongs to `category[0]` by construction).
    const withRelations = await attachBlogRelations(categoryPosts);
    const known = {
      id: category[0].id,
      name: category[0].name,
      slug: category[0].slug,
      color: category[0].color,
    };
    return withRelations.map((post) => ({ ...post, category: known }));
  } catch (error) {
    console.error(`Error fetching blog posts for category ${categorySlug}:`, error);
    return [];
  }
}

const getBlogPostsByCategoryCached = unstable_cache(
  getBlogPostsByCategoryUncached,
  ['blog-posts-by-category'],
  { revalidate: BLOG_REVALIDATE_SECONDS, tags: [BLOG_CACHE_TAG] },
);

export async function getBlogPostsByCategory(categorySlug: string): Promise<BlogPostWithRelations[]> {
  return getBlogPostsByCategoryCached(categorySlug);
}

/**
 * Get all categories
 */
export async function getAllCategories(): Promise<BlogCategory[]> {
  try {
    // Only surface categories that actually have a published, global blog post
    // (websiteId IS NULL). This keeps empty/leftover categories — e.g. test
    // fixtures like "test-cat-<timestamp>" — out of the public category list,
    // and prevents linking to category pages that would render no posts.
    const allCategories = await db
      .selectDistinct({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        color: categories.color,
      })
      .from(categories)
      .innerJoin(postCategories, eq(postCategories.categoryId, categories.id))
      .innerJoin(posts, eq(posts.id, postCategories.postId))
      .where(and(
        eq(posts.published, true),
        eq(posts.postType, 'blog'),
        isNull(posts.websiteId),
      ))
      .orderBy(categories.name);

    return allCategories;
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

/**
 * Get a single category by slug
 */
export async function getCategoryBySlug(slug: string): Promise<BlogCategory | null> {
  try {
    const category = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        color: categories.color,
      })
      .from(categories)
      .where(eq(categories.slug, slug))
      .limit(1);

    if (!category || category.length === 0) {
      return null;
    }

    return category[0];
  } catch (error) {
    console.error(`Error fetching category ${slug}:`, error);
    return null;
  }
}

/**
 * Get featured blog posts (the 3 most recent) for the marketing home page.
 * Dedicated lean query: only the 3 needed rows, no `content` blob, relations
 * batched, result cached. Previously this fetched ALL posts via
 * getAllBlogPosts and sliced — the dominant cause of the ~7s home-page TTFB.
 */
async function getFeaturedBlogPostsUncached(): Promise<BlogPostWithRelations[]> {
  try {
    const recent = await db
      .select(blogListColumns)
      .from(posts)
      .where(and(
        eq(posts.published, true),
        eq(posts.postType, 'blog'),
        isNull(posts.websiteId),
      ))
      .orderBy(desc(posts.publishedAt))
      .limit(3);

    return await attachBlogRelations(recent);
  } catch (error) {
    console.error('Error fetching featured blog posts:', error);
    return [];
  }
}

const getFeaturedBlogPostsCached = unstable_cache(
  getFeaturedBlogPostsUncached,
  ['blog-featured-posts'],
  { revalidate: BLOG_REVALIDATE_SECONDS, tags: [BLOG_CACHE_TAG] },
);

export async function getFeaturedBlogPosts(): Promise<BlogPostWithRelations[]> {
  return getFeaturedBlogPostsCached();
}
