import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailCampaigns, emailSubscribers, emailCampaignSends } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { createEmailTransport, isMailpitEmailTransport } from '@/lib/email';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { resolveResendKey } from '@/lib/email/resolve-resend';
import { enqueueCampaignSend } from '@/lib/email/campaign-send-job';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const campaignId = parseInt(id);

  const [campaign] = await db
    .select()
    .from(emailCampaigns)
    .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.clientId, client.id)))
    .limit(1);

  if (!campaign) return NextResponse.json({ success: false, message: 'Campaign not found' }, { status: 404 });
  if (campaign.status === 'sent' || campaign.status === 'sending') {
    return NextResponse.json({ success: false, message: `Campaign is already ${campaign.status}` }, { status: 400 });
  }

  // A/B mode requires a B subject. Surface the failure early so the user
  // doesn't end up in a half-sent state.
  if (campaign.abEnabled && !campaign.abSubjectB?.trim()) {
    return NextResponse.json({ success: false, message: 'A/B test enabled but Subject B is empty' }, { status: 400 });
  }

  const alreadySentSubIds = await db
    .select({ subscriberId: emailCampaignSends.subscriberId })
    .from(emailCampaignSends)
    .where(eq(emailCampaignSends.campaignId, campaignId));

  const sentIds = new Set(alreadySentSubIds.map(s => s.subscriberId));

  const subscribers = await db
    .select()
    .from(emailSubscribers)
    .where(and(eq(emailSubscribers.listId, campaign.listId), eq(emailSubscribers.status, 'active')));

  // Deterministic order so re-runs land the same recipients in the same
  // A/B cohort. Sort by id ascending — stable across reads.
  subscribers.sort((a, b) => a.id - b.id);

  const targets = subscribers.filter(s => !sentIds.has(s.id));

  if (targets.length === 0) {
    return NextResponse.json({ success: false, message: 'No active subscribers to send to' }, { status: 400 });
  }

  // Resolve the email transport — BYOK Resend when hosted, Mailpit locally —
  // BEFORE queuing anything. A missing platform/BYOK key throws here; catch
  // it and return a structured error instead of enqueuing a job that would
  // just fail async on the same lookup — this way the person clicking
  // "Send" gets the actionable error immediately instead of via a stranded
  // 'sending' campaign.
  try {
    if (isMailpitEmailTransport()) {
      createEmailTransport();
    } else {
      createEmailTransport({ resendApiKey: (await resolveResendKey(client.id)).key });
    }
  } catch {
    return NextResponse.json(
      { success: false, message: 'Email transport unavailable — no Resend key configured for this client' },
      { status: 502 },
    );
  }

  // The actual send (A/B split, rendering, per-subscriber dispatch, and the
  // eventual status flip to 'sent'/'ab_testing') now happens durably on the
  // internal_jobs queue — see lib/email/campaign-send-job.ts (PUX-046). The
  // helper also flips status to 'sending', so a double-click lands on the
  // already-sending guard above instead of enqueuing twice.
  await enqueueCampaignSend(campaignId, client.id);

  return NextResponse.json({
    success: true,
    data: { queued: true, totalTargets: targets.length },
  });
}
