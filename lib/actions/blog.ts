'use server';

import { db } from '@/lib/db';
import { posts, categories, tags, postCategories, postTags } from '@/lib/db/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';

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
 * Get all published blog posts sorted by published date
 */
export async function getAllBlogPosts(): Promise<BlogPostWithRelations[]> {
  try {
    const publishedPosts = await db
      .select()
      .from(posts)
      .where(and(
        eq(posts.published, true),
        eq(posts.postType, 'blog'),
        isNull(posts.websiteId),
      ))
      .orderBy(desc(posts.publishedAt));

    // Fetch related data for each post
    const postsWithRelations = await Promise.all(
      publishedPosts.map(async (post) => {
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
          .where(eq(postCategories.postId, post.id))
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
          .where(eq(postTags.postId, post.id));

        return {
          ...post,
          category: postCategory[0] || undefined,
          tags: postTagsList,
        };
      })
    );

    return postsWithRelations;
  } catch (error) {
    console.error('Error fetching blog posts:', error);
    // Return empty array if database is not available (e.g., during build)
    return [];
  }
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
 * Get all blog posts by category slug
 */
export async function getBlogPostsByCategory(categorySlug: string): Promise<BlogPostWithRelations[]> {
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

    // Get posts in this category
    const categoryPosts = await db
      .select({
        id: posts.id,
        slug: posts.slug,
        title: posts.title,
        excerpt: posts.excerpt,
        content: posts.content,
        coverImage: posts.coverImage,
        published: posts.published,
        publishedAt: posts.publishedAt,
        createdAt: posts.createdAt,
        updatedAt: posts.updatedAt,
      })
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

    // Fetch related data for each post
    const postsWithRelations = await Promise.all(
      categoryPosts.map(async (post) => {
        // Get tags
        const postTagsList = await db
          .select({
            id: tags.id,
            name: tags.name,
            slug: tags.slug,
          })
          .from(postTags)
          .innerJoin(tags, eq(postTags.tagId, tags.id))
          .where(eq(postTags.postId, post.id));

        return {
          ...post,
          category: {
            id: category[0].id,
            name: category[0].name,
            slug: category[0].slug,
            color: category[0].color,
          },
          tags: postTagsList,
        };
      })
    );

    return postsWithRelations;
  } catch (error) {
    console.error(`Error fetching blog posts for category ${categorySlug}:`, error);
    return [];
  }
}

/**
 * Get all categories
 */
export async function getAllCategories(): Promise<BlogCategory[]> {
  try {
    const allCategories = await db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        color: categories.color,
      })
      .from(categories)
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
 * Get featured blog posts (limit to first 3)
 */
export async function getFeaturedBlogPosts(): Promise<BlogPostWithRelations[]> {
  const allPosts = await getAllBlogPosts();
  return allPosts.slice(0, 3);
}
