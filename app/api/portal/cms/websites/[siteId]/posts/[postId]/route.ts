import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts, postCategories, postTags } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; postId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, postId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [post] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, parseInt(postId)), eq(posts.websiteId, site.id)))
    .limit(1);

  if (!post) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [cats, tgs] = await Promise.all([
    db.select({ categoryId: postCategories.categoryId }).from(postCategories).where(eq(postCategories.postId, post.id)),
    db.select({ tagId: postTags.tagId }).from(postTags).where(eq(postTags.postId, post.id)),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      ...post,
      categoryIds: cats.map(c => c.categoryId),
      tagIds: tgs.map(t => t.tagId),
    },
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string; postId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, postId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { title, slug, postType, excerpt, content, coverImage, published, categoryIds, tagIds } = body;

  // If slug changed, check uniqueness within this website
  if (slug) {
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.slug, slug), eq(posts.websiteId, site.id)))
      .limit(1);
    if (existing && existing.id !== parseInt(postId)) {
      return NextResponse.json({ success: false, message: 'A post with this slug already exists on this website' }, { status: 400 });
    }
  }

  const pid = parseInt(postId);

  const [post] = await db
    .update(posts)
    .set({
      ...(title !== undefined && { title }),
      ...(slug !== undefined && { slug }),
      ...(postType !== undefined && { postType }),
      ...(excerpt !== undefined && { excerpt: excerpt || null }),
      ...(content !== undefined && { content }),
      ...(coverImage !== undefined && { coverImage: coverImage || null }),
      ...(published !== undefined && {
        published,
        publishedAt: published ? new Date() : null,
      }),
      updatedAt: new Date(),
    })
    .where(and(eq(posts.id, pid), eq(posts.websiteId, site.id)))
    .returning();

  if (!post) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Sync categories if provided
  if (categoryIds !== undefined) {
    await db.delete(postCategories).where(eq(postCategories.postId, pid));
    if (categoryIds.length) {
      await db.insert(postCategories).values(
        categoryIds.map((catId: number) => ({ postId: pid, categoryId: catId }))
      );
    }
  }

  // Sync tags if provided
  if (tagIds !== undefined) {
    await db.delete(postTags).where(eq(postTags.postId, pid));
    if (tagIds.length) {
      await db.insert(postTags).values(
        tagIds.map((tId: number) => ({ postId: pid, tagId: tId }))
      );
    }
  }

  return NextResponse.json({ success: true, data: post });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; postId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, postId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db
    .delete(posts)
    .where(and(eq(posts.id, parseInt(postId)), eq(posts.websiteId, site.id)));

  return NextResponse.json({ success: true });
}
