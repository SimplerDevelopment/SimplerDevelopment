import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { bookingPages } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { headers } from 'next/headers';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const pageId = parseInt(id);

  const [page] = await db.select().from(bookingPages)
    .where(and(eq(bookingPages.id, pageId), eq(bookingPages.clientId, client.id)))
    .limit(1);

  if (!page) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const headersList = await headers();
  const host = headersList.get('host') || 'localhost:3000';
  const protocol = headersList.get('x-forwarded-proto') || 'https';
  const origin = `${protocol}://${host}`;
  const bookingUrl = `${origin}/book/${page.slug}`;

  const iframeEmbed = `<iframe src="${bookingUrl}" width="100%" height="700" frameborder="0" style="border:none;border-radius:8px;"></iframe>`;

  const scriptEmbed = `<div id="simpler-booking-${page.slug}"></div>
<script src="${origin}/embed/booking.js" data-slug="${page.slug}"></script>`;

  return NextResponse.json({
    success: true,
    data: {
      url: bookingUrl,
      iframe: iframeEmbed,
      script: scriptEmbed,
    },
  });
}
