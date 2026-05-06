import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { emailCampaignSends, emailCampaigns } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';

// Resend webhook event types we care about
type ResendEvent =
  | { type: 'email.opened'; data: { email_id: string } }
  | { type: 'email.clicked'; data: { email_id: string } }
  | { type: 'email.bounced'; data: { email_id: string } }
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
    .select({ id: emailCampaignSends.id, campaignId: emailCampaignSends.campaignId })
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

    case 'email.bounced':
      await db
        .update(emailCampaignSends)
        .set({ bouncedAt: new Date() })
        .where(eq(emailCampaignSends.id, send.id));
      await db.execute(
        sql`UPDATE email_campaigns SET total_bounced = total_bounced + 1, updated_at = now() WHERE id = ${send.campaignId}`
      );
      break;

    case 'email.complained':
      await db
        .update(emailCampaignSends)
        .set({ complainedAt: new Date() })
        .where(eq(emailCampaignSends.id, send.id));
      break;
  }

  return NextResponse.json({ received: true });
}
