import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages, clientWebsites } from '@/lib/db/schema';
import { eq, and, or, asc } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;

  // Find site by domain, subdomain, or subdomain.simplerdevelopment.com
  const bareSubdomain = domain.replace('.simplerdevelopment.com', '');
  const [site] = await db
    .select({ id: clientWebsites.id, clientId: clientWebsites.clientId })
    .from(clientWebsites)
    .where(or(
      eq(clientWebsites.domain, domain),
      eq(clientWebsites.subdomain, domain),
      eq(clientWebsites.subdomain, bareSubdomain),
    ))
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
      thumbnail: bookingPages.thumbnail,
    })
    .from(bookingPages)
    .where(and(eq(bookingPages.clientId, site.clientId), eq(bookingPages.active, true)))
    .orderBy(asc(bookingPages.price));

  return NextResponse.json({ data: pages });
}
