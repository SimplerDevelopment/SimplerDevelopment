import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { discardSiteCustomCodeDraft } from '@/lib/sites/publish-custom-code';

async function verifySite(siteIdRaw: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;
  const [site] = await db
    .select({ id: clientWebsites.id, customCss: clientWebsites.customCss, customJs: clientWebsites.customJs })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteIdRaw)), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  return site || null;
}

/**
 * Clears draft_custom_css, draft_custom_js, draft_updated_at, draft_updated_by.
 * Leaves live values untouched. Returns the current live values so the UI
 * can re-seed the editor without a second round-trip.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await verifySite(siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  await discardSiteCustomCodeDraft(site.id);

  return NextResponse.json({
    success: true,
    data: {
      customCss: site.customCss || '',
      customJs: site.customJs || '',
      draftCustomCss: null,
      draftCustomJs: null,
      draftUpdatedAt: null,
      draftUpdatedBy: null,
      hasDraft: false,
    },
  });
}
