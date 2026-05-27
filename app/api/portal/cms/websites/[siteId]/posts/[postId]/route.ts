import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts, postCategories, postTags, postRevisions } from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { revalidateClientSite, clientSiteUrl } from '@/lib/revalidate-client-site';
import { assertBlocksAllowedForRole, BlockGateError } from '@/lib/security/block-allowlist';

// How recent the previous revision needs to be for an autosave write to be
// considered redundant. Combined with the content-hash check below, this keeps
// the revision table from ballooning during long editing sessions.
const AUTOSAVE_REVISION_MIN_INTERVAL_MS = 10 * 60_000; // 10 minutes

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

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
  const { title, slug, postType, excerpt, content, coverImage, published, categoryIds, tagIds, seoTitle, seoDescription, ogImage, noIndex, canonicalUrl, customCss, customJs, revisionTrigger } = body;

  // Gate raw-HTML / raw-script block types to admin/editor staff only.
  if (content !== undefined) {
    try {
      assertBlocksAllowedForRole(content, (session.user as { role?: string }).role);
    } catch (err) {
      if (err instanceof BlockGateError) {
        return NextResponse.json({ success: false, message: err.message }, { status: 403 });
      }
      throw err;
    }
  }

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
      ...(seoTitle !== undefined && { seoTitle: seoTitle || null }),
      ...(seoDescription !== undefined && { seoDescription: seoDescription || null }),
      ...(ogImage !== undefined && { ogImage: ogImage || null }),
      ...(noIndex !== undefined && { noIndex }),
      ...(canonicalUrl !== undefined && { canonicalUrl: canonicalUrl || null }),
      ...(customCss !== undefined && { customCss: customCss || null }),
      ...(customJs !== undefined && { customJs: customJs || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(posts.id, pid), eq(posts.websiteId, site.id)))
    .returning();

  if (!post) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Create revision snapshot.
  //
  // Manual saves and publish events always write a revision. Autosaves now skip
  // the write when the most recent revision is both (a) less than
  // AUTOSAVE_REVISION_MIN_INTERVAL_MS old and (b) has the same content hash —
  // otherwise a 2s autosave loop would write a fresh row for every keystroke
  // even when nothing actually changed (e.g. style-tab tinkering that bounces
  // back to the same value, or repeated autosaves on an idle tab).
  const trigger = published && revisionTrigger !== 'autosave' ? 'publish' : (revisionTrigger || 'manual');
  if (content !== undefined) {
    const newHash = hashContent(post.content);
    let shouldWriteRevision = true;
    if (trigger === 'autosave') {
      const [last] = await db
        .select({ createdAt: postRevisions.createdAt, contentHash: postRevisions.contentHash })
        .from(postRevisions)
        .where(eq(postRevisions.postId, pid))
        .orderBy(desc(postRevisions.createdAt))
        .limit(1);
      if (last) {
        const tooSoon = Date.now() - last.createdAt.getTime() < AUTOSAVE_REVISION_MIN_INTERVAL_MS;
        const sameHash = last.contentHash === newHash;
        if (tooSoon && sameHash) shouldWriteRevision = false;
      }
    }
    if (shouldWriteRevision) {
      await db.insert(postRevisions).values({
        postId: pid,
        content: post.content,
        title: post.title,
        trigger,
        contentHash: newHash,
        createdBy: parseInt(session.user.id, 10),
      });
    }
  }

  // Sync categories if provided. The client form always sends `categoryIds`
  // even on autosave (it's part of formData), so DELETE+INSERT every PUT would
  // churn join rows even when nothing changed. Diff against the current set
  // and only touch rows that actually moved.
  if (categoryIds !== undefined) {
    const incoming = new Set<number>((categoryIds as number[]) ?? []);
    const existingRows = await db
      .select({ categoryId: postCategories.categoryId })
      .from(postCategories)
      .where(eq(postCategories.postId, pid));
    const existing = new Set(existingRows.map((r) => r.categoryId));
    const toAdd = [...incoming].filter((id) => !existing.has(id));
    const toRemove = [...existing].filter((id) => !incoming.has(id));
    if (toRemove.length) {
      await db
        .delete(postCategories)
        .where(and(eq(postCategories.postId, pid), inArray(postCategories.categoryId, toRemove)));
    }
    if (toAdd.length) {
      await db.insert(postCategories).values(
        toAdd.map((catId) => ({ postId: pid, categoryId: catId }))
      );
    }
  }

  // Same diff strategy for tags.
  if (tagIds !== undefined) {
    const incoming = new Set<number>((tagIds as number[]) ?? []);
    const existingRows = await db
      .select({ tagId: postTags.tagId })
      .from(postTags)
      .where(eq(postTags.postId, pid));
    const existing = new Set(existingRows.map((r) => r.tagId));
    const toAdd = [...incoming].filter((id) => !existing.has(id));
    const toRemove = [...existing].filter((id) => !incoming.has(id));
    if (toRemove.length) {
      await db
        .delete(postTags)
        .where(and(eq(postTags.postId, pid), inArray(postTags.tagId, toRemove)));
    }
    if (toAdd.length) {
      await db.insert(postTags).values(
        toAdd.map((tId) => ({ postId: pid, tagId: tId }))
      );
    }
  }

  // Trigger on-demand revalidation on the client site (non-blocking)
  const siteUrl = clientSiteUrl(site.subdomain, site.domain);
  if (siteUrl) {
    const postSlug = post.slug;
    revalidateClientSite(siteUrl, [
      `/blog/${postSlug}`,
      `/p/${postSlug}`,
    ]).catch(() => {}); // fire-and-forget
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
