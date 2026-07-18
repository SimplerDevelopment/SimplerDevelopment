import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { and, desc, eq, like, or, sql } from 'drizzle-orm';

// Auth + client-scoped. The MediaPicker component used to default to this
// route, which previously had no auth or scoping at all and was the source
// of cross-tenant leaks in the visual editor's media browser.
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    const userId = parseInt(session.user.id as string, 10);
    const client = await getPortalClient(userId);
    if (!client) {
      return NextResponse.json({ success: false, error: 'No portal client found' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const search = searchParams.get('search') || '';
    const mimeType = searchParams.get('mimeType') || '';

    const conditions = [eq(media.clientId, client.id)];
    if (search) {
      conditions.push(
        or(
          like(media.filename, `%${search}%`),
          like(media.alt, `%${search}%`),
          like(media.caption, `%${search}%`)
        )!
      );
    }
    if (mimeType && mimeType !== 'all') {
      conditions.push(like(media.mimeType, `${mimeType}%`));
    }

    const result = await db
      .select()
      .from(media)
      .where(and(...conditions))
      .orderBy(desc(media.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(media)
      .where(and(...conditions));

    return NextResponse.json({
      success: true,
      data: result,
      pagination: { limit, offset, total: count },
    });
  } catch (error) {
    console.error('Error fetching media:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch media' },
      { status: 500 }
    );
  }
}
