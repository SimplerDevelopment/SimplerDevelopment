/**
 * Scheduled-post auto-publish cron. Publishes CMS posts whose
 * `scheduled_publish_at` has arrived (and that aren't already published),
 * setting published=true + publishedAt=the scheduled time and clearing the
 * schedule so it can't re-fire.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 *
 * NOTE: public-site ISR revalidation is best-effort/follow-up — the post is
 * published in the DB immediately; the public route picks it up on its normal
 * revalidation cycle. (A future pass can resolve each affected site URL and
 * call revalidateClientSite, like the post PATCH route does.)
 */
import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { and, eq, isNotNull, lte, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function _GET(req: Request): Promise<Response> {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    const authz = req.headers.get('authorization');
    if (!cronSecret || authz !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  const now = new Date();
  const published = await db
    .update(posts)
    .set({
      published: true,
      // Preserve the intended publish time; COALESCE reads the pre-update value.
      publishedAt: sql`COALESCE(${posts.scheduledPublishAt}, now())`,
      scheduledPublishAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(posts.published, false),
        isNotNull(posts.scheduledPublishAt),
        lte(posts.scheduledPublishAt, now),
      ),
    )
    .returning({ id: posts.id, websiteId: posts.websiteId });

  return NextResponse.json({
    success: true,
    data: { published: published.length, ids: published.map((p) => p.id) },
  });
}

export const GET = withCronHealth(
  { name: 'api-cron:process-scheduled-posts', area: 'api-cron' },
  _GET,
);
