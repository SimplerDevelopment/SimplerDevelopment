import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, siteNavigation } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { publishNavItem } from '@/lib/sites/publish-nav';

async function verifyItemAccess(siteIdRaw: string, itemIdRaw: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const siteId = parseInt(siteIdRaw);
  const itemId = parseInt(itemIdRaw);
  if (isNaN(siteId) || isNaN(itemId)) return null;
  const [row] = await db
    .select({ navId: siteNavigation.id })
    .from(siteNavigation)
    .innerJoin(clientWebsites, eq(clientWebsites.id, siteNavigation.websiteId))
    .where(
      and(
        eq(siteNavigation.id, itemId),
        eq(siteNavigation.websiteId, siteId),
        eq(clientWebsites.clientId, client.id),
      ),
    )
    .limit(1);
  return row ? { itemId } : null;
}

/**
 * Promote a single nav item's draft to live. Mirrors MCP `nav_publish`.
 * Same semantics: pendingDelete → row deleted; pendingCreate or ordinary
 * update → draft fields applied to live columns and draft cleared.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; itemId: string }> },
) {
  const { siteId, itemId } = await params;
  const access = await verifyItemAccess(siteId, itemId);
  if (!access) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await publishNavItem(access.itemId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Publish failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
