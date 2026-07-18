import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { publishAllNavDrafts } from '@/lib/sites/publish-nav';

async function verifySiteAccess(siteIdRaw: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const siteId = parseInt(siteIdRaw);
  if (isNaN(siteId)) return null;
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteId), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  return site ?? null;
}

/**
 * Promote every nav row with a non-null draft on the site. Mirrors MCP
 * `nav_publish_all`. Per-row semantics: pendingDelete → row deleted;
 * pendingCreate or ordinary update → draft fields applied to live, draft
 * cleared.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const site = await verifySiteAccess(siteId);
  if (!site) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await publishAllNavDrafts(site.id);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
