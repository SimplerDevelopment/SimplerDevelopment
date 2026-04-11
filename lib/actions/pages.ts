'use server';

import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';

// These helpers back main-domain routes (e.g. app/(pages)/p/[slug]) and
// must ONLY return SimplerDevelopment's own "global" content — rows where
// posts.websiteId IS NULL per the schema convention. Tenant content lives
// in rows with a non-null websiteId and is served through
// /sites/[domain]/[[...slug]] on the owning tenant's subdomain. Without
// the isNull filter, any tenant's published page could be rendered by
// guessing its slug on the apex domain.

export async function getPageBySlug(slug: string) {
  try {
    const result = await db
      .select()
      .from(posts)
      .where(and(
        eq(posts.slug, slug),
        eq(posts.published, true),
        eq(posts.postType, 'page'),
        isNull(posts.websiteId),
      ))
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
      .where(and(
        eq(posts.published, true),
        eq(posts.postType, 'page'),
        isNull(posts.websiteId),
      ));

    return result;
  } catch (error) {
    console.error('Error fetching pages:', error);
    return [];
  }
}
