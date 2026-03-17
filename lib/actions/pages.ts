'use server';

import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function getPageBySlug(slug: string) {
  try {
    const result = await db
      .select()
      .from(posts)
      .where(and(eq(posts.slug, slug), eq(posts.published, true), eq(posts.postType, 'page')))
      .limit(1);

    if (!result || result.length === 0) {
      return null;
    }

    return result[0];
  } catch (error) {
    console.error(`Error fetching page ${slug}:`, error);
    return null;
  }
}

export async function getAllPages() {
  try {
    const result = await db
      .select()
      .from(posts)
      .where(and(eq(posts.published, true), eq(posts.postType, 'page')));

    return result;
  } catch (error) {
    console.error('Error fetching pages:', error);
    return [];
  }
}
