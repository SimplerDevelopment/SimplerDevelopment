import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { media, mediaVersions } from '@/lib/db/schema';
import { getPortalClient } from '@/lib/portal-client';
import { and, desc, eq } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 403 });
  }

  const { id } = await params;
  const mediaId = parseInt(id, 10);

  const [current] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.clientId, client.id)))
    .limit(1);
  if (!current) {
    return NextResponse.json({ success: false, message: 'Media not found' }, { status: 404 });
  }

  const history = await db
    .select()
    .from(mediaVersions)
    .where(eq(mediaVersions.mediaId, mediaId))
    .orderBy(desc(mediaVersions.version));

  return NextResponse.json({
    success: true,
    data: {
      current: {
        id: current.id,
        version: current.version,
        filename: current.filename,
        url: current.url,
        fileSize: current.fileSize,
        mimeType: current.mimeType,
        updatedAt: current.updatedAt,
      },
      history: history.map((h) => ({
        id: h.id,
        version: h.version,
        filename: h.filename,
        url: h.url,
        fileSize: h.fileSize,
        mimeType: h.mimeType,
        createdAt: h.createdAt,
      })),
    },
  });
}
