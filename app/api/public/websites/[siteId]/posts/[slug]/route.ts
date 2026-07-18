import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { posts, categories, tags, postCategories, postTags, clientWebsites } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; slug: string }> },
) {
  const { siteId, slug } = await params;
  const siteIdNum = parseInt(siteId);

  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteIdNum), eq(clientWebsites.active, true)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), eq(posts.websiteId, siteIdNum), eq(posts.published, true)))
    .limit(1);

  if (!post) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Fetch categories and tags for this post
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

  return NextResponse.json({
    success: true,
    data: {
      ...post,
      categories: catRows,
      tags: tagRows,
    },
  });
}
