import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [page] = await db.select({
    id: bookingPages.id,
    title: bookingPages.title,
    slug: bookingPages.slug,
    description: bookingPages.description,
    duration: bookingPages.duration,
    timezone: bookingPages.timezone,
    availability: bookingPages.availability,
    questions: bookingPages.questions,
    color: bookingPages.color,
    maxAdvanceDays: bookingPages.maxAdvanceDays,
    minNoticeMins: bookingPages.minNoticeMins,
  }).from(bookingPages)
    .where(and(eq(bookingPages.slug, slug), eq(bookingPages.active, true)))
    .limit(1);

  if (!page) return NextResponse.json({ success: false, message: 'Booking page not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: page });
}
