import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { media, mediaVersions } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { and, eq } from 'drizzle-orm';

// Restoring an old version: snapshot the current state into mediaVersions,
// then copy the chosen historical row back onto `media`. Bumps version so
// timeline stays monotonic. The chosen historical row is consumed (deleted)
// because its bytes are now live again on the media row.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; versionId: string }> }) {
  const authz = await authorizePortal({ action: 'write' });
  if (isAuthError(authz)) return authz.response;
  const { client, userId } = authz;

  const { id, versionId } = await params;
  const mediaId = parseInt(id, 10);
  const vId = parseInt(versionId, 10);

  const [current] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.clientId, client.id)))
    .limit(1);
  if (!current) {
    return NextResponse.json({ success: false, message: 'Media not found' }, { status: 404 });
  }

  const [target] = await db
    .select()
    .from(mediaVersions)
    .where(and(eq(mediaVersions.id, vId), eq(mediaVersions.mediaId, mediaId)))
    .limit(1);
  if (!target) {
    return NextResponse.json({ success: false, message: 'Version not found' }, { status: 404 });
  }

  await db.insert(mediaVersions).values({
    mediaId: current.id,
    version: current.version,
    filename: current.filename,
    storedFilename: current.storedFilename,
    mimeType: current.mimeType,
    fileSize: current.fileSize,
    url: current.url,
    uploadedBy: current.uploadedBy,
  });

  const [updated] = await db
    .update(media)
    .set({
      filename: target.filename,
      storedFilename: target.storedFilename,
      mimeType: target.mimeType,
      fileSize: target.fileSize,
      url: target.url,
      version: current.version + 1,
      uploadedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(media.id, mediaId))
    .returning();

  await db.delete(mediaVersions).where(eq(mediaVersions.id, vId));

  return NextResponse.json({ success: true, data: updated });
}
