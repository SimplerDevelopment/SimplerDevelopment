import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { media, brandingProfiles } from '@/lib/db/schema';
import { resolveClientSite, getPortalClient } from '@/lib/portal-client';
import { eq, and, like, or, desc, sql, isNull } from 'drizzle-orm';

export async function GET(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const userId = parseInt(session.user.id, 10);
  const site = await resolveClientSite(userId, parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

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

  // Scope to media owned by this client AND attached to this site. Without
  // the websiteId filter, a per-site media manager would show every site's
  // media mixed together — fine for single-site clients, surprising for
  // multi-site ones.
  const conditions = [eq(media.clientId, client.id), eq(media.websiteId, site.id)];

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
