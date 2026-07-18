import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { publishSiteCustomCode } from '@/lib/sites/publish-custom-code';

async function verifySite(siteIdRaw: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteIdRaw)), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  return site || null;
}

/**
 * Publishes the draft custom CSS/JS to live and clears the draft.
 * Mirrors MCP `sites_publish_custom_code`. The same `publishSiteCustomCode`
 * helper is intended to be reused by the MCP approvals `site:publish` case
 * in a follow-up commit.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await verifySite(siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Refuse no-op publishes so a stray button-click can't silently overwrite
  // live with identical values (also keeps `updatedAt` honest).
  const draftMatchesLive =
    (site.draftCustomCss ?? null) === (site.customCss ?? null) &&
    (site.draftCustomJs ?? null) === (site.customJs ?? null);
  const noDraft = site.draftCustomCss === null && site.draftCustomJs === null;
  if (noDraft || draftMatchesLive) {
    return NextResponse.json(
      { success: false, message: 'No draft changes to publish.' },
      { status: 400 },
    );
  }

  const result = await publishSiteCustomCode(site.id);

  return NextResponse.json({
    success: true,
    data: {
      customCss: result.customCss,
      customJs: result.customJs,
      draftCustomCss: null,
      draftCustomJs: null,
      draftUpdatedAt: null,
      draftUpdatedBy: null,
      hasDraft: false,
    },
  });
}
