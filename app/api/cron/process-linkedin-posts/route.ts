/**
 * LinkedIn scheduled-post publish cron. Picks up `linkedin_posts` rows where
 * `status='scheduled' AND scheduled_at <= now()`, publishes them via the
 * LinkedIn Posts REST API, and marks them `published` (or `failed`).
 *
 * CAS guard: each row is atomically flipped to `status='publishing'` before
 * the API call. A concurrent cron tick that selects the same row will find it
 * already in `publishing` and skip it — preventing double-fires.
 *
 * Per-row failure isolation: a thrown error (bad token, LinkedIn 4xx/5xx,
 * media-not-implemented) is caught, written to `error`, and the row is marked
 * `failed`. It never aborts the rest of the batch.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 */
import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { db } from '@/lib/db';
import { linkedinPosts } from '@/lib/db/schema';
import { and, asc, eq, lte } from 'drizzle-orm';
import { publishPost } from '@/lib/linkedin/api';
import { getValidAccessToken } from '@/lib/linkedin/connections';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_PER_TICK = 10;
const MAX_ERROR_LEN = 1000;

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

  // Select due rows — oldest first so no post starves.
  const due = await db
    .select()
    .from(linkedinPosts)
    .where(
      and(
        eq(linkedinPosts.status, 'scheduled'),
        lte(linkedinPosts.scheduledAt, now),
      ),
    )
    .orderBy(asc(linkedinPosts.scheduledAt))
    .limit(MAX_PER_TICK);

  let processed = 0;
  let published = 0;
  let failed = 0;

  for (const row of due) {
    // CAS: flip to 'publishing' only when still 'scheduled'. If a parallel
    // cron tick already claimed this row, returning() comes back empty — skip.
    const claimed = await db
      .update(linkedinPosts)
      .set({ status: 'publishing', updatedAt: new Date() })
      .where(
        and(
          eq(linkedinPosts.id, row.id),
          eq(linkedinPosts.status, 'scheduled'),
        ),
      )
      .returning({ id: linkedinPosts.id });

    if (claimed.length === 0) continue;

    processed++;

    try {
      const { accessToken, memberUrn } = await getValidAccessToken(row.clientId, row.userId);
      const { postUrn, permalink } = await publishPost({
        accessToken,
        memberUrn,
        commentary: row.text,
        mediaType: row.mediaType,
        mediaUrl: row.mediaUrl,
        mediaAssetUrn: row.mediaAssetUrn,
      });

      await db
        .update(linkedinPosts)
        .set({
          status: 'published',
          publishedAt: new Date(),
          linkedinPostId: postUrn,
          permalink,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(linkedinPosts.id, row.id));

      published++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await db
        .update(linkedinPosts)
        .set({
          status: 'failed',
          error: msg.slice(0, MAX_ERROR_LEN),
          updatedAt: new Date(),
        })
        .where(eq(linkedinPosts.id, row.id));

      failed++;
    }
  }

  return NextResponse.json({ success: true, data: { processed, published, failed } });
}

export const GET = withCronHealth(
  { name: 'api-cron:process-linkedin-posts', area: 'api-cron' },
  _GET,
);
