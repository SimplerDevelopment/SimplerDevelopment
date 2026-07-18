import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, postTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

async function verifyTypeAccess(siteId: string, typeId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  if (!site) return null;

  // Only allow editing site-specific types (not global)
  const [type] = await db
    .select()
    .from(postTypes)
    .where(and(eq(postTypes.id, parseInt(typeId)), eq(postTypes.websiteId, site.id)))
    .limit(1);

  return type ? { site, type } : null;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string; typeId: string }> },
) {
  const { siteId, typeId } = await params;
  const access = await verifyTypeAccess(siteId, typeId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();

  const [updated] = await db
    .update(postTypes)
    .set({
      name: body.name ?? access.type.name,
      slug: body.slug ?? access.type.slug,
      description: body.description !== undefined ? (body.description || null) : access.type.description,
      icon: body.icon ?? access.type.icon,
      active: body.active ?? access.type.active,
      updatedAt: new Date(),
    })
    .where(eq(postTypes.id, access.type.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ siteId: string; typeId: string }> },
) {
  const { siteId, typeId } = await params;
  const access = await verifyTypeAccess(siteId, typeId);
  if (!access) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(postTypes).where(eq(postTypes.id, access.type.id));
  return NextResponse.json({ success: true });
}
