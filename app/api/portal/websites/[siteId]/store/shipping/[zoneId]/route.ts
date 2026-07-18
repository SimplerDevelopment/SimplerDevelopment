import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { shippingZones } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveStoreSite } from '@/lib/portal-auth';

type Params = { params: Promise<{ siteId: string; zoneId: string }> };

async function resolveZone(userId: number, siteId: string, zoneId: string) {
  const site = await resolveStoreSite(userId, parseInt(siteId));
  if (!site) return null;

  const [zone] = await db
    .select()
    .from(shippingZones)
    .where(and(eq(shippingZones.id, parseInt(zoneId)), eq(shippingZones.websiteId, site.id)))
    .limit(1);

  return zone || null;
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, zoneId } = await params;
  const zone = await resolveZone(parseInt(session.user.id, 10), siteId, zoneId);
  if (!zone) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updateData: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updateData.name = body.name;
  if (body.countries !== undefined) updateData.countries = body.countries;
  if (body.states !== undefined) updateData.states = body.states;
  if (body.active !== undefined) updateData.active = body.active;

  const [updated] = await db
    .update(shippingZones)
    .set(updateData)
    .where(eq(shippingZones.id, zone.id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, zoneId } = await params;
  const zone = await resolveZone(parseInt(session.user.id, 10), siteId, zoneId);
  if (!zone) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Cascade delete handles rates
  await db.delete(shippingZones).where(eq(shippingZones.id, zone.id));

  return NextResponse.json({ success: true, message: 'Shipping zone deleted' });
}
