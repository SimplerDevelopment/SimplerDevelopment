import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts, postRevisions } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; postId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, postId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const pid = parseInt(postId);

  // Verify post belongs to site
  const [post] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.id, pid), eq(posts.websiteId, site.id)))
    .limit(1);

  if (!post) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const revisions = await db
    .select({
      id: postRevisions.id,
      title: postRevisions.title,
      trigger: postRevisions.trigger,
      createdAt: postRevisions.createdAt,
    })
    .from(postRevisions)
    .where(eq(postRevisions.postId, pid))
    .orderBy(desc(postRevisions.createdAt))
    .limit(100);

  return NextResponse.json({ success: true, data: revisions });
}

// POST = revert to a specific revision
export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string; postId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, postId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const pid = parseInt(postId);
  const body = await req.json();
  const revisionId = body.revisionId;

  if (!revisionId) return NextResponse.json({ success: false, message: 'revisionId required' }, { status: 400 });

  // Fetch the revision
  const [revision] = await db
    .select()
    .from(postRevisions)
    .where(and(eq(postRevisions.id, revisionId), eq(postRevisions.postId, pid)))
    .limit(1);

  if (!revision) return NextResponse.json({ success: false, message: 'Revision not found' }, { status: 404 });

  // Save current state as a revision before reverting
  const [currentPost] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, pid), eq(posts.websiteId, site.id)))
    .limit(1);

  if (!currentPost) return NextResponse.json({ success: false, message: 'Post not found' }, { status: 404 });

  await db.insert(postRevisions).values({
    postId: pid,
    content: currentPost.content,
    title: currentPost.title,
    trigger: 'manual',
    createdBy: parseInt(session.user.id, 10),
  });

  // Revert to the revision
  const [updated] = await db
    .update(posts)
    .set({
      content: revision.content,
      title: revision.title,
      updatedAt: new Date(),
    })
    .where(and(eq(posts.id, pid), eq(posts.websiteId, site.id)))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}
