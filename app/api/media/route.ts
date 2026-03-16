import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { desc, like, sql, or } from 'drizzle-orm';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const mimeType = searchParams.get('mimeType') || '';

    let query = db.select().from(media);

    // Search filter
    if (search) {
      query = query.where(
        or(
          like(media.filename, `%${search}%`),
          like(media.alt, `%${search}%`),
          like(media.caption, `%${search}%`)
        )
      ) as typeof query;
    }

    // MIME type filter
    if (mimeType && mimeType !== 'all') {
      query = query.where(like(media.mimeType, `${mimeType}%`)) as typeof query;
    }

    const result = await query
      .orderBy(desc(media.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(media);

    return NextResponse.json({
      success: true,
      data: result,
      pagination: {
        limit,
        offset,
        total: count,
      },
    });
  } catch (error) {
    console.error('Error fetching media:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch media' },
      { status: 500 }
    );
  }
}
