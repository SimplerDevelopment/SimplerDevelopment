import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingQuotes } from '@/lib/db/schema';
import { eq, and, ne } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [quote] = await db.select({
    id: bookingQuotes.id,
    slug: bookingQuotes.slug,
    title: bookingQuotes.title,
    description: bookingQuotes.description,
    price: bookingQuotes.price,
    customerName: bookingQuotes.customerName,
    lineItems: bookingQuotes.lineItems,
    startTime: bookingQuotes.startTime,
    endTime: bookingQuotes.endTime,
    status: bookingQuotes.status,
    expiresAt: bookingQuotes.expiresAt,
  }).from(bookingQuotes)
    .where(and(
      eq(bookingQuotes.slug, slug),
      ne(bookingQuotes.status, 'cancelled'),
    ))
    .limit(1);

  if (!quote) return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });

  if (quote.status === 'paid') {
    return NextResponse.json({ success: true, data: { ...quote, alreadyPaid: true } });
  }

  if (quote.expiresAt && new Date() > quote.expiresAt) {
    return NextResponse.json({ success: false, message: 'This quote has expired' }, { status: 410 });
  }

  return NextResponse.json({ success: true, data: quote });
}
