import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { media, posts, clientWebsites } from '@/lib/db/schema';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { eq, and, ilike } from 'drizzle-orm';

/**
 * PUX-188 (design doc screen 47): "Used on n pages" for one media item.
 * posts.content is serialized block JSON (text), so a page "uses" the file
 * when its content contains the media URL. Scoped twice: the media row must
 * belong to the caller's client, and only posts on this client's websites
 * are scanned (posts → client_websites.client_id).
 *
 * ponytail: ILIKE over posts.content is a sequential scan bounded to this
 * client's websites and capped at 50 rows — fine for portal-sized libraries;
 * add a media_usages table maintained on post save if a tenant grows past a
 * few thousand posts.
 */
const CAP = 50;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authz = await authorizePortal({ action: 'read' });
  if (isAuthError(authz)) return authz.response;
  const { client } = authz;
  const { id } = await params;

  const [row] = await db
    .select({ url: media.url })
    .from(media)
    .where(and(eq(media.id, parseInt(id)), eq(media.clientId, client.id)))
    .limit(1);
  if (!row) return NextResponse.json({ success: false, message: 'Media not found' }, { status: 404 });

  const needle = `%${row.url.replace(/[\\%_]/g, '\\$&')}%`;
  const rows = await db
    .select({ id: posts.id, title: posts.title, websiteId: posts.websiteId })
    .from(posts)
    .innerJoin(clientWebsites, eq(posts.websiteId, clientWebsites.id))
    .where(and(eq(clientWebsites.clientId, client.id), ilike(posts.content, needle)))
    .limit(CAP);

  return NextResponse.json({ success: true, data: { count: rows.length, capped: rows.length === CAP, pages: rows.slice(0, 10) } });
}
