import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
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
  return site || null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await verifySite(siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({
    success: true,
    data: { customCss: site.customCss || '', customJs: site.customJs || '' },
  });
}

export async function PUT(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const site = await verifySite(siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { customCss, customJs } = body as { customCss?: string; customJs?: string };

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (customCss !== undefined) patch.customCss = customCss === '' ? null : customCss;
  if (customJs !== undefined) patch.customJs = customJs === '' ? null : customJs;

  const [updated] = await db
    .update(clientWebsites)
    .set(patch)
    .where(eq(clientWebsites.id, site.id))
    .returning();

  // Per-page renders use `dynamic = 'force-dynamic'`, so no ISR cache to bust —
  // site CSS/JS picks up on the next request automatically.

  return NextResponse.json({
    success: true,
    data: { customCss: updated.customCss || '', customJs: updated.customJs || '' },
  });
}
