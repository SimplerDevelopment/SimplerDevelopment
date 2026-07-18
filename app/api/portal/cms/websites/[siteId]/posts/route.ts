import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts, postCategories, postTags } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { assertBlocksAllowedForRole, BlockGateError } from '@/lib/security/block-allowlist';
import { parseSiteIdParam } from '@/lib/api/parse-params';

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const parsed = parseSiteIdParam(siteId);
  if (!parsed.ok) return parsed.response;

  const site = await resolveClientSite(parseInt(session.user.id, 10), parsed.value);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const data = await db
    .select()
    .from(posts)
    .where(eq(posts.websiteId, site.id))
    .orderBy(posts.createdAt);

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const parsed = parseSiteIdParam(siteId);
  if (!parsed.ok) return parsed.response;

  const site = await resolveClientSite(parseInt(session.user.id, 10), parsed.value);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { title, slug, postType, excerpt, content, coverImage, published, categoryIds, tagIds, seoTitle, seoDescription, ogImage, noIndex, canonicalUrl } = body;

  if (!title || !slug || !content) {
    return NextResponse.json({ success: false, message: 'title, slug, and content are required' }, { status: 400 });
  }

  // Gate raw-HTML / raw-script block types to admin/editor staff only.
  try {
    assertBlocksAllowedForRole(content, (session.user as { role?: string }).role);
  } catch (err) {
    if (err instanceof BlockGateError) {
      return NextResponse.json({ success: false, message: err.message }, { status: 403 });
    }
    throw err;
  }

  // Check slug uniqueness within this website
  const [existing] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.slug, slug), eq(posts.websiteId, site.id)))
    .limit(1);

  if (existing) {
    return NextResponse.json({ success: false, message: 'A post with this slug already exists on this website' }, { status: 400 });
  }

  const [post] = await db.insert(posts).values({
    title,
    slug,
    postType: postType || 'page',
    excerpt: excerpt || null,
    content,
    coverImage: coverImage || null,
    published: published ?? false,
    publishedAt: published ? new Date() : null,
    seoTitle: seoTitle || null,
    seoDescription: seoDescription || null,
    ogImage: ogImage || null,
    noIndex: noIndex ?? false,
    canonicalUrl: canonicalUrl || null,
    websiteId: site.id,
  }).returning();

  // Save category associations
  if (categoryIds?.length) {
    await db.insert(postCategories).values(
      categoryIds.map((catId: number) => ({ postId: post.id, categoryId: catId }))
    );
  }

  // Save tag associations
  if (tagIds?.length) {
    await db.insert(postTags).values(
      tagIds.map((tId: number) => ({ postId: post.id, tagId: tId }))
    );
  }

  return NextResponse.json({ success: true, data: post });
}
