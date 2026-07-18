import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookingPages, bookings, bookingWaivers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;

    const [page] = await db.select().from(bookingPages)
      .where(and(eq(bookingPages.slug, slug), eq(bookingPages.active, true)))
      .limit(1);

    if (!page) return NextResponse.json({ success: false, message: 'Booking page not found' }, { status: 404 });
    if (!page.enableWaivers) return NextResponse.json({ success: false, message: 'Waivers are not enabled' }, { status: 400 });

    const body = await req.json();
    const { bookingId, signerName, signerEmail, signatureData } = body;

    if (!bookingId || !signerName?.trim() || !signerEmail?.trim() || !signatureData) {
      return NextResponse.json({ success: false, message: 'bookingId, signerName, signerEmail, and signatureData are required' }, { status: 400 });
    }

    // Verify booking belongs to this page
    const [booking] = await db.select({ id: bookings.id }).from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.bookingPageId, page.id)))
      .limit(1);

    if (!booking) return NextResponse.json({ success: false, message: 'Booking not found' }, { status: 404 });

    // Get client IP
    const forwarded = req.headers.get('x-forwarded-for');
    const ipAddress = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || null;

    const [waiver] = await db.insert(bookingWaivers).values({
      bookingId,
      bookingPageId: page.id,
      clientId: page.clientId,
      signerName: signerName.trim(),
      signerEmail: signerEmail.trim(),
      signatureData,
      waiverContent: page.waiverContent || '',
      ipAddress,
    }).returning();

    return NextResponse.json({ success: true, data: { id: waiver.id } }, { status: 201 });
  } catch (err) {
    console.error('Waiver submit error:', err);
    return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
  }
}
