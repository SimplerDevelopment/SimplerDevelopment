import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { shippingZones, shippingRates } from '@/lib/db/schema';
import { eq, sql, asc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const zones = await db
    .select()
    .from(shippingZones)
    .where(eq(shippingZones.websiteId, site.id))
    .orderBy(asc(shippingZones.createdAt));

  // Fetch rates for all zones
  const zoneIds = zones.map((z) => z.id);
  let ratesMap: Record<number, typeof shippingRates.$inferSelect[]> = {};

  if (zoneIds.length > 0) {
    const allRates = await db
      .select()
      .from(shippingRates)
      .where(sql`${shippingRates.zoneId} IN (${sql.join(zoneIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(asc(shippingRates.createdAt));

    for (const rate of allRates) {
      if (!ratesMap[rate.zoneId]) ratesMap[rate.zoneId] = [];
      ratesMap[rate.zoneId].push(rate);
    }
  }

  const data = zones.map((z) => ({
    ...z,
    rates: ratesMap[z.id] || [],
  }));

  return NextResponse.json({ success: true, data });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { name, countries, states, active } = body;

  if (!name) {
    return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  }

  const [zone] = await db
    .insert(shippingZones)
    .values({
      websiteId: site.id,
      name,
      countries: countries || [],
      states: states || [],
      active: active ?? true,
    })
    .returning();

  return NextResponse.json({ success: true, data: { ...zone, rates: [] } }, { status: 201 });
}
