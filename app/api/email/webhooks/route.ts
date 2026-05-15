import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emailCampaignSends, emailCampaigns, emailSubscribers } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

// Resend webhook event types we care about
type ResendEvent =
  | { type: 'email.opened'; data: { email_id: string } }
  | { type: 'email.clicked'; data: { email_id: string } }
  // Resend's bounce payload carries `bounce` with a `type` ('hard' | 'soft' | …).
  // Older payload variants surfaced `bounce_type` at the data root, so we read
  // either shape and fall back to 'hard' if neither is present (safer to honor
  // an unlabeled bounce as a hard one than to keep mailing).
  | { type: 'email.bounced'; data: { email_id: string; bounce?: { type?: string }; bounce_type?: string } }
  | { type: 'email.complained'; data: { email_id: string } };

export async function POST(req: Request) {
  // Verify webhook signature in production
  // TODO(W2.1 security-fix-plan.md): add full Svix signature verification using the
  // `svix` package — Wave 2 (requires new dep + prod env coordination).
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const signature = req.headers.get('svix-signature');
  if (!signature) return new NextResponse('Unauthorized', { status: 401 });

  const event = (await req.json()) as ResendEvent;

  if (!event?.type || !event?.data?.email_id) {
    return NextResponse.json({ received: true });
  }

  const resendEmailId = event.data.email_id;

  const [send] = await db
    .select({
      id: emailCampaignSends.id,
      campaignId: emailCampaignSends.campaignId,
      subscriberId: emailCampaignSends.subscriberId,
    })
    .from(emailCampaignSends)
    .where(eq(emailCampaignSends.resendEmailId, resendEmailId))
    .limit(1);

  if (!send) return NextResponse.json({ received: true });

  switch (event.type) {
    case 'email.opened':
      await db
        .update(emailCampaignSends)
        .set({ openedAt: new Date() })
        .where(eq(emailCampaignSends.id, send.id));
      await db.execute(
        sql`UPDATE email_campaigns SET total_opened = total_opened + 1, updated_at = now() WHERE id = ${send.campaignId}`
      );
      break;

    case 'email.clicked':
      await db
        .update(emailCampaignSends)
        .set({ clickedAt: new Date() })
        .where(eq(emailCampaignSends.id, send.id));
      await db.execute(
        sql`UPDATE email_campaigns SET total_clicked = total_clicked + 1, updated_at = now() WHERE id = ${send.campaignId}`
      );
      break;

    case 'email.bounced': {
      await db
        .update(emailCampaignSends)
        .set({ bouncedAt: new Date() })
        .where(eq(emailCampaignSends.id, send.id));
      await db.execute(
        sql`UPDATE email_campaigns SET total_bounced = total_bounced + 1, updated_at = now() WHERE id = ${send.campaignId}`
      );
      // Suppress the subscriber from future sends on a hard bounce — the
      // address is permanently bad and continuing to mail it tanks the
      // domain's sender reputation. Soft bounces are transient (full
      // mailbox, server outage) so we leave status alone.
      // TODO(qa-2026-05-14): introduce a soft_bounce_count column on
      // email_subscribers so 3+ consecutive soft bounces also flip the
      // subscriber to 'bounced'. For now we just log.
      const bounceType = event.data.bounce?.type ?? event.data.bounce_type ?? 'hard';
      if (bounceType === 'hard') {
        await db
          .update(emailSubscribers)
          .set({ status: 'bounced' })
          .where(eq(emailSubscribers.id, send.subscriberId));
      }
      break;
    }

    case 'email.complained':
      await db
        .update(emailCampaignSends)
        .set({ complainedAt: new Date() })
        .where(eq(emailCampaignSends.id, send.id));
      // Suppress the subscriber from future sends — continuing to mail a
      // complainer is a CAN-SPAM / GDPR / Resend-TOS issue and further
      // erodes domain reputation.
      await db
        .update(emailSubscribers)
        .set({ status: 'complained' })
        .where(eq(emailSubscribers.id, send.subscriberId));
      break;
  }

  return NextResponse.json({ received: true });
}
