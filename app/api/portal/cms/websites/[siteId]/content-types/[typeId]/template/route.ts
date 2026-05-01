import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, postTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { revalidateClientSite } from '@/lib/revalidate-client-site';

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

// GET → { template: { blocks, version } | null } so the editor can show either
// the saved wrapper or an empty starting state.
export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string; typeId: string }> }) {
  const { siteId, typeId } = await params;
  const ctx = await verifyTypeAccess(siteId, typeId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  let template: unknown = null;
  if (ctx.type.template) {
    try { template = JSON.parse(ctx.type.template); } catch { template = null; }
  }
  return NextResponse.json({ success: true, data: { template } });
}

// PUT body: { template: { blocks: [...], version: '1.0' } | null }. Pass null
// (or omit / send empty object) to drop the wrapper for this type.
export async function PUT(req: Request, { params }: { params: Promise<{ siteId: string; typeId: string }> }) {
  const { siteId, typeId } = await params;
  const ctx = await verifyTypeAccess(siteId, typeId);
  if (!ctx) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { template } = body as { template?: { blocks?: unknown[]; version?: string } | null };

  let serialized: string | null;
  if (!template || !Array.isArray(template.blocks) || template.blocks.length === 0) {
    serialized = null;
  } else {
    serialized = JSON.stringify({ blocks: template.blocks, version: template.version || '1.0' });
  }

  const [updated] = await db
    .update(postTypes)
    .set({ template: serialized, updatedAt: new Date() })
    .where(eq(postTypes.id, ctx.type.id))
    .returning();

  await revalidateClientSite(ctx.site.id).catch(() => {});

  let parsed: unknown = null;
  if (updated.template) { try { parsed = JSON.parse(updated.template); } catch {} }
  return NextResponse.json({ success: true, data: { template: parsed } });
}
