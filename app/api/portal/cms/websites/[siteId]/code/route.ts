import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { users } from '@/lib/db/schema/auth';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

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
  return site ? { site, userId } : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const ctx = await verifySite(siteId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { site } = ctx;

  // Resolve the draft author name/email so the UI can render "Drafted by X · ago".
  let draftAuthor: { id: number; name: string | null; email: string | null } | null = null;
  if (site.draftUpdatedBy) {
    const [u] = await db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, site.draftUpdatedBy))
      .limit(1);
    if (u) draftAuthor = { id: u.id, name: u.name, email: u.email };
  }

  // A draft is considered "present" when any draft column is non-null (i.e.
  // someone staged a change). When both draft cols match live, the UI still
  // shows the Draft tab but the publish button stays disabled.
  const hasDraft = site.draftCustomCss !== null || site.draftCustomJs !== null;

  return NextResponse.json({
    success: true,
    data: {
      customCss: site.customCss || '',
      customJs: site.customJs || '',
      draftCustomCss: site.draftCustomCss,
      draftCustomJs: site.draftCustomJs,
      draftUpdatedAt: site.draftUpdatedAt ? site.draftUpdatedAt.toISOString() : null,
      draftUpdatedBy: draftAuthor,
      hasDraft,
    },
  });
}

/**
 * Saves to the DRAFT columns. The public renderer keeps serving live until
 * the user explicitly publishes via POST /publish. Mirrors the behaviour of
 * MCP `sites_update_custom_code`.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const ctx = await verifySite(siteId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const { site, userId } = ctx;

  const body = await req.json();
  const { customCss, customJs } = body as { customCss?: string; customJs?: string };

  const patch: Record<string, unknown> = {
    updatedAt: new Date(),
    draftUpdatedAt: new Date(),
    draftUpdatedBy: userId,
  };
  if (customCss !== undefined) patch.draftCustomCss = customCss === '' ? null : customCss;
  if (customJs !== undefined) patch.draftCustomJs = customJs === '' ? null : customJs;

  const [updated] = await db
    .update(clientWebsites)
    .set(patch)
    .where(eq(clientWebsites.id, site.id))
    .returning();

  // Public site render is force-dynamic and reads only `custom_css`/`custom_js`,
  // so draft writes don't need cache invalidation.

  return NextResponse.json({
    success: true,
    data: {
      customCss: updated.customCss || '',
      customJs: updated.customJs || '',
      draftCustomCss: updated.draftCustomCss,
      draftCustomJs: updated.draftCustomJs,
      draftUpdatedAt: updated.draftUpdatedAt ? updated.draftUpdatedAt.toISOString() : null,
    },
  });
}
