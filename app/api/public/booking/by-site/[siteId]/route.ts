import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages, clientWebsites } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const websiteId = parseInt(siteId, 10);
  if (isNaN(websiteId)) {
    return NextResponse.json({ error: 'Invalid site ID' }, { status: 400 });
  }

  // Get the client ID for this website
  const [site] = await db
    .select({ clientId: clientWebsites.clientId })
    .from(clientWebsites)
    .where(eq(clientWebsites.id, websiteId))
    .limit(1);

  if (!site) {
    return NextResponse.json({ data: [] });
  }

  const pages = await db
    .select({
      id: bookingPages.id,
      title: bookingPages.title,
      slug: bookingPages.slug,
      description: bookingPages.description,
      duration: bookingPages.duration,
      price: bookingPages.price,
      priceLabel: bookingPages.priceLabel,
      color: bookingPages.color,
      maxGuests: bookingPages.maxGuests,
    })
    .from(bookingPages)
    .where(and(eq(bookingPages.clientId, site.clientId), eq(bookingPages.active, true)));

  return NextResponse.json({ data: pages });
}
