import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, postTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { revalidateClientSite } from '@/lib/revalidate-client-site';

// Mirrors verifyTypeAccess in ../route.ts: only the site's own (non-global)
// content types are editable through the portal.
async function verifyTypeAccess(siteIdRaw: string, typeIdRaw: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return null;
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteIdRaw)), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  if (!site) return null;
  const [type] = await db
    .select()
    .from(postTypes)
    .where(and(eq(postTypes.id, parseInt(typeIdRaw)), eq(postTypes.websiteId, site.id)))
    .limit(1);
  return type ? { site, type } : null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string; typeId: string }> }) {
  const { siteId, typeId } = await params;
  const ctx = await verifyTypeAccess(siteId, typeId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    success: true,
    data: { customCss: ctx.type.customCss || '', customJs: ctx.type.customJs || '' },
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ siteId: string; typeId: string }> }) {
  const { siteId, typeId } = await params;
  const ctx = await verifyTypeAccess(siteId, typeId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { customCss, customJs } = body as { customCss?: string; customJs?: string };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (customCss !== undefined) patch.customCss = customCss === '' ? null : customCss;
  if (customJs !== undefined) patch.customJs = customJs === '' ? null : customJs;

  const [updated] = await db
    .update(postTypes)
    .set(patch)
    .where(eq(postTypes.id, ctx.type.id))
    .returning();

  await revalidateClientSite(ctx.site.id).catch(() => {});

  return NextResponse.json({
    success: true,
    data: { customCss: updated.customCss || '', customJs: updated.customJs || '' },
  });
}
