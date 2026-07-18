import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { media, brandingProfiles } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, and, like, or, desc, sql, isNull } from 'drizzle-orm';

export async function GET(req: Request) {
  // Bearer-aware (mobile) + NextAuth (web). Read access = any member.
  const authResult = await authorizePortal({ action: 'read' });
  if (isAuthError(authResult)) return authResult.response;
  const { client } = authResult;

  // Get all branding profiles for this client
  const profiles = await db
    .select({ id: brandingProfiles.id, name: brandingProfiles.name })
    .from(brandingProfiles)
    .where(eq(brandingProfiles.clientId, client.id));

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '20');
  const offset = parseInt(searchParams.get('offset') || '0');
  const search = searchParams.get('search') || '';
  const mimeType = searchParams.get('mimeType') || '';
  const filterProfileId = searchParams.get('brandingProfileId') || '';

  // Scope all queries to this client's media
  const conditions = [eq(media.clientId, client.id)];

  if (filterProfileId === 'unassigned') {
    conditions.push(isNull(media.brandingProfileId));
  } else if (filterProfileId) {
    conditions.push(eq(media.brandingProfileId, parseInt(filterProfileId)));
  }

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

  const rows = await db
    .select({
      id: media.id,
      filename: media.filename,
      storedFilename: media.storedFilename,
      mimeType: media.mimeType,
      fileSize: media.fileSize,
      width: media.width,
      height: media.height,
      url: media.url,
      thumbnailUrl: media.thumbnailUrl,
      alt: media.alt,
      caption: media.caption,
      uploadedBy: media.uploadedBy,
      websiteId: media.websiteId,
      brandingProfileId: media.brandingProfileId,
      createdAt: media.createdAt,
      updatedAt: media.updatedAt,
      brandingProfileName: brandingProfiles.name,
    })
    .from(media)
    .leftJoin(brandingProfiles, eq(media.brandingProfileId, brandingProfiles.id))
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
    data: rows,
    brandingProfiles: profiles,
    pagination: { limit, offset, total: count },
  });
}
