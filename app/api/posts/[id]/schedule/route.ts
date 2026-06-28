import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { resolvePortalSite } from '@/lib/portal-client';

const scheduleSchema = z.object({
  publishedAt: z.string().datetime().nullable(),
  published: z.boolean().optional(),
});

/**
 * Dual-audience guard for a single post by id. This route is called by the
 * shared ContentCalendar component, which renders in BOTH the global admin
 * panel (app/admin/content-calendar) and per-tenant portal
 * (app/portal/websites/[siteId]/calendar). Allow:
 *  - admin/editor staff (global content managers), OR
 *  - a portal user who owns the post's website (scoped via resolvePortalSite).
 * Returns an error NextResponse to deny, or null to proceed.
 */
async function guardPostAccess(postId: number): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const role = (session.user as { role?: string }).role;
  if (role === 'admin' || role === 'editor') return null;

  // Portal user: must own the post's website. A post with a null websiteId is
  // a global/admin post that no portal tenant owns → deny.
  const [post] = await db
    .select({ websiteId: posts.websiteId })
    .from(posts)
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post?.websiteId) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  const site = await resolvePortalSite(parseInt(session.user.id, 10), post.websiteId);
  if (!site) {
    return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const postId = parseInt(id);
    if (isNaN(postId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid post ID' },
        { status: 400 },
      );
    }

    const denied = await guardPostAccess(postId);
    if (denied) return denied;

    const body = await request.json();
    const { publishedAt, published } = scheduleSchema.parse(body);

    const updates: Record<string, unknown> = {
      publishedAt: publishedAt ? new Date(publishedAt) : null,
      updatedAt: new Date(),
    };

    if (published !== undefined) {
      updates.published = published;
    }

    const [updated] = await db
      .update(posts)
      .set(updates)
      .where(eq(posts.id, postId))
      .returning();

    if (!updated) {
      return NextResponse.json(
        { success: false, error: 'Post not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.issues },
        { status: 400 },
      );
    }
    console.error('Error scheduling post:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to schedule post' },
      { status: 500 },
    );
  }
}
