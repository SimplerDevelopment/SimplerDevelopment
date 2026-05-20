import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const websiteId = searchParams.get('websiteId');

    if (!start || !end) {
      return NextResponse.json(
        { success: false, error: 'start and end query params are required (ISO dates)' },
        { status: 400 },
      );
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'start and end must be valid ISO dates' },
        { status: 400 },
      );
    }

    // Fetch posts that fall within the date range.
    // A post appears on its publishedAt date if set, otherwise createdAt.
    //
    // Pass ISO strings rather than Date objects to the `sql` template — the
    // pg driver (via node-postgres' postgres-array path) throws
    // `TypeError: The "string" argument must be of type string … Received an
    // instance of Date` when a bare Date is interpolated into a raw fragment.
    // Casting to ::timestamptz makes the comparison explicit.
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    const conditions = [
      sql`COALESCE(${posts.publishedAt}, ${posts.createdAt}) >= ${startIso}::timestamptz`,
      sql`COALESCE(${posts.publishedAt}, ${posts.createdAt}) <= ${endIso}::timestamptz`,
    ];

    if (websiteId) {
      conditions.push(eq(posts.websiteId, parseInt(websiteId)));
    }

    const result = await db
      .select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        postType: posts.postType,
        published: posts.published,
        publishedAt: posts.publishedAt,
        createdAt: posts.createdAt,
        coverImage: posts.coverImage,
        excerpt: posts.excerpt,
        websiteId: posts.websiteId,
      })
      .from(posts)
      .where(and(...conditions))
      .orderBy(sql`COALESCE(${posts.publishedAt}, ${posts.createdAt}) ASC`);

    // Derive status for each post
    const now = new Date();
    const data = result.map((post) => {
      const date = post.publishedAt ?? post.createdAt;
      let status: 'draft' | 'scheduled' | 'published';
      if (post.published) {
        status = 'published';
      } else if (post.publishedAt && new Date(post.publishedAt) > now) {
        status = 'scheduled';
      } else {
        status = 'draft';
      }
      return { ...post, date, status };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching calendar posts:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch calendar data' },
      { status: 500 },
    );
  }
}
