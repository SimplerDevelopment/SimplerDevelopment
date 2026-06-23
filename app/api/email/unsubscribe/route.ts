import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emailSubscribers, emailCampaigns } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse('Missing unsubscribe token', { status: 400 });
  }

  const [subscriber] = await db
    .select()
    .from(emailSubscribers)
    .where(eq(emailSubscribers.unsubscribeToken, token))
    .limit(1);

  if (!subscriber) {
    return new NextResponse('Invalid or expired unsubscribe link', { status: 404 });
  }

  if (subscriber.status !== 'unsubscribed') {
    await db
      .update(emailSubscribers)
      .set({ status: 'unsubscribed', unsubscribedAt: new Date() })
      .where(eq(emailSubscribers.id, subscriber.id));

    // Increment unsubscribe counters on any campaigns that sent to this subscriber
    await db.execute(
      sql`UPDATE email_campaigns
          SET total_unsubscribed = total_unsubscribed + 1, updated_at = now()
          WHERE id IN (
            SELECT DISTINCT campaign_id FROM email_campaign_sends WHERE subscriber_id = ${subscriber.id}
          )`
    );
  }

  const base = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
  return NextResponse.redirect(`${base}/unsubscribed`);
}

// One-click unsubscribe (RFC 8058)
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  if (!token) return new NextResponse('Missing token', { status: 400 });

  const [subscriber] = await db
    .select({ id: emailSubscribers.id, status: emailSubscribers.status })
    .from(emailSubscribers)
    .where(eq(emailSubscribers.unsubscribeToken, token))
    .limit(1);

  if (!subscriber) return new NextResponse('Not found', { status: 404 });

  if (subscriber.status !== 'unsubscribed') {
    await db
      .update(emailSubscribers)
      .set({ status: 'unsubscribed', unsubscribedAt: new Date() })
      .where(eq(emailSubscribers.id, subscriber.id));
  }

  return new NextResponse(null, { status: 200 });
}
