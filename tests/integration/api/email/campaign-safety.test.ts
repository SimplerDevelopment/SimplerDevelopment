import { beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

const provider = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@/lib/email/transport', () => ({
  isMailpitEmailTransport: () => false,
  createEmailTransport: () => ({ send: provider.send }),
}));
vi.mock('@/lib/email/resolve-resend', () => ({ resolveResendKey: vi.fn(async () => ({ key: 'local-test-key' })) }));
vi.mock('@/lib/email/render-cache', () => ({
  getOrRenderCampaignHtml: vi.fn(async () => ({ html: '<a href="{{UNSUBSCRIBE_URL}}">unsubscribe</a>', text: 'unsubscribe {{UNSUBSCRIBE_URL}}' })),
  htmlToText: (html: string) => html,
}));

import { db } from '@/lib/db';
import { emailLists, emailSubscribers, emailCampaigns, emailCampaignDeliveryIntents, emailCampaignSends, internalJobs, automationJobs } from '@/lib/db/schema';
import { sessionForNewClientUser } from '@/tests/helpers/session';
import { getTestSql } from '@/tests/helpers/test-db';
import { executeCampaignSend } from '@/lib/email/campaign-send';
import { freezeCampaignRecipients, campaignDeliveryPayload } from '@/lib/email/campaign-safety';
import { executeAbPromotion } from '@/lib/email/ab-promotion';
import { runCampaignSendJob } from '@/lib/email/campaign-send-job';

async function fixture(abEnabled = false, count = 4) {
  const { client } = await sessionForNewClientUser('durable-campaign');
  const [list] = await db.insert(emailLists).values({ clientId: client.id, name: 'Frozen recipients' }).returning();
  const subscribers = await db.insert(emailSubscribers).values(Array.from({ length: count }, (_, index) => ({
    listId: list.id, email: `recipient-${index}@test.local`, unsubscribeToken: `token-${list.id}-${index}`,
  }))).returning();
  const [campaign] = await db.insert(emailCampaigns).values({ clientId: client.id, listId: list.id, name: 'Durable test',
    subject: 'Subject A', fromName: 'Sender', fromEmail: 'sender@test.local', htmlContent: '<p>Original</p>',
    abEnabled, abSubjectB: abEnabled ? 'Subject B' : null, abTestSizePct: 50, useBlockEditor: true, contentBlocks: [],
  }).returning();
  return { client, list, subscribers, campaign };
}

async function reload(id: number) {
  const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, id));
  return campaign;
}

beforeEach(() => {
  provider.send.mockReset().mockResolvedValue({ data: { id: 'provider-accepted' }, error: null });
});

describe('Frozen campaign dispatch and provider recovery @email @tenancy', () => {
  it('concurrent freeze returns one immutable cohort and excludes later subscribers', async () => {
    const { campaign, subscribers } = await fixture(true);
    const plans = await Promise.all([
      freezeCampaignRecipients(campaign.id, campaign, subscribers),
      freezeCampaignRecipients(campaign.id, campaign, [...subscribers].reverse()),
    ]);
    expect(plans[0]).toEqual(plans[1]);
    expect(plans[0].map(row => row.variant)).toEqual(['a', 'b', null, null]);
    expect(await freezeCampaignRecipients(campaign.id, await reload(campaign.id), [])).toEqual(plans[0]);
  });

  it('persists all eligible payloads before first provider call and substitutes text unsubscribe links', async () => {
    const { campaign } = await fixture(false, 2);
    provider.send.mockImplementation(async payload => {
      const intents = await db.select().from(emailCampaignDeliveryIntents).where(eq(emailCampaignDeliveryIntents.campaignId, campaign.id));
      expect(intents).toHaveLength(2);
      expect(payload.text).toContain('/api/email/unsubscribe?token=');
      expect(payload.text).not.toContain('{{UNSUBSCRIBE_URL}}');
      return { data: { id: 'accepted' }, error: null };
    });
    expect(await executeCampaignSend(campaign.id, campaign)).toEqual({ sent: 2, failed: 0, total: 2 });
  });

  it('unsubscribe and list additions cannot change retry cohorts or promoted winner subjects', async () => {
    const { campaign, list, subscribers, client } = await fixture(true);
    provider.send.mockResolvedValueOnce({ data: { id: 'a-accepted' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'temporary provider rejection' } });
    expect(await executeCampaignSend(campaign.id, campaign)).toMatchObject({ sent: 1, failed: 1, ab: { held: 2 } });
    const firstB = provider.send.mock.calls[1][0];
    await db.update(emailSubscribers).set({ status: 'unsubscribed' }).where(eq(emailSubscribers.id, subscribers[0].id));
    await db.insert(emailSubscribers).values({ listId: list.id, email: 'later@test.local', unsubscribeToken: `later-${list.id}` });
    expect(await executeCampaignSend(campaign.id, await reload(campaign.id))).toMatchObject({ sent: 1, failed: 0, total: 1, ab: { held: 2 } });
    expect(provider.send.mock.calls[2][0]).toEqual(firstB);
    await db.update(emailCampaignSends).set({ openedAt: new Date() }).where(and(
      eq(emailCampaignSends.campaignId, campaign.id), eq(emailCampaignSends.subscriberId, subscribers[1].id),
    ));
    const promotions = await Promise.all([executeAbPromotion(campaign.id, await reload(campaign.id)), executeAbPromotion(campaign.id, await reload(campaign.id))]);
    expect(promotions.every(result => result.queued && result.winnerSubject === 'Subject B')).toBe(true);
    const jobs = await db.select().from(internalJobs).where(eq(internalJobs.dedupeKey, `email.campaign_send:${campaign.id}`));
    expect(jobs).toHaveLength(1);
    provider.send.mockResolvedValueOnce({ data: null, error: { message: 'retry held recipient' } });
    await expect(runCampaignSendJob({ campaignId: campaign.id, clientId: client.id }, db)).rejects.toThrow('incomplete');
    expect((await reload(campaign.id)).status).toBe('partial');
    const firstWinner = provider.send.mock.calls[3][0];
    await runCampaignSendJob({ campaignId: campaign.id, clientId: client.id }, db);
    expect(provider.send.mock.calls[5][0]).toEqual(firstWinner);
    expect(provider.send.mock.calls.slice(3).every(call => call[0].subject === 'Subject B')).toBe(true);
    expect(provider.send.mock.calls.some(call => call[0].to === 'later@test.local')).toBe(false);
    expect(await reload(campaign.id)).toMatchObject({ status: 'sent', totalSent: 4 });
    const winners = await db.select().from(emailCampaignSends).where(and(eq(emailCampaignSends.campaignId, campaign.id), eq(emailCampaignSends.abVariant, 'winner')));
    expect(winners).toHaveLength(2);
  });

  it('does not promote a partially delivered initial test even when forced by an operator', async () => {
    const { campaign } = await fixture(true);
    provider.send.mockResolvedValueOnce({ data: null, error: { message: 'initial A failed' } });
    await executeCampaignSend(campaign.id, campaign);
    await expect(executeAbPromotion(campaign.id, await reload(campaign.id))).rejects.toThrow('incomplete');
    expect((await reload(campaign.id)).abDecidedAt).toBeNull();
  });

  it('an accepted send followed by a real receipt failure retries the exact persisted payload and key', async () => {
    const { campaign } = await fixture(false, 1);
    const sql = getTestSql();
    await sql.unsafe(`CREATE FUNCTION fail_campaign_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'receipt unavailable'; END $$`);
    await sql.unsafe('CREATE TRIGGER fail_campaign_receipt BEFORE INSERT ON email_campaign_sends FOR EACH ROW EXECUTE FUNCTION fail_campaign_receipt()');
    try {
      await expect(executeCampaignSend(campaign.id, campaign)).rejects.toMatchObject({ cause: { message: 'receipt unavailable' } });
      expect(await db.select().from(emailCampaignSends).where(eq(emailCampaignSends.campaignId, campaign.id))).toHaveLength(0);
      expect(await db.select().from(emailCampaignDeliveryIntents).where(eq(emailCampaignDeliveryIntents.campaignId, campaign.id))).toHaveLength(1);
    } finally {
      await sql.unsafe('DROP TRIGGER fail_campaign_receipt ON email_campaign_sends');
      await sql.unsafe('DROP FUNCTION fail_campaign_receipt()');
    }
    // Simulate out-of-band content/address edits: even those cannot replace an
    // existing provider intent after an uncertain acceptance.
    await db.update(emailCampaigns).set({ htmlContent: '<p>Changed</p>', subject: 'Changed' }).where(eq(emailCampaigns.id, campaign.id));
    await executeCampaignSend(campaign.id, await reload(campaign.id));
    expect(provider.send.mock.calls[1][0]).toEqual(provider.send.mock.calls[0][0]);
    expect((await reload(campaign.id)).totalSent).toBe(1);
  });

  it('expired ambiguous intents require review and cannot send outside the provider window', async () => {
    const { campaign, subscribers } = await fixture(false, 1);
    await campaignDeliveryPayload(campaign.id, subscribers[0].id, { from: 'sender@test.local', to: subscribers[0].email, subject: 'Original', text: 'Original' });
    await db.update(emailCampaignDeliveryIntents).set({ firstAttemptAt: new Date(Date.now() - 23 * 3600_000) })
      .where(eq(emailCampaignDeliveryIntents.campaignId, campaign.id));
    await expect(executeCampaignSend(campaign.id, campaign)).rejects.toThrow('delivery_requires_review');
    expect(provider.send).not.toHaveBeenCalled();
    expect((await reload(campaign.id)).status).toBe('partial');
  });

  it('a failed intent persistence cannot call the provider; completed retries finalize without sending', async () => {
    const { campaign, subscribers } = await fixture(false, 1);
    await expect(campaignDeliveryPayload(campaign.id, -1, { from: 'sender@test.local', to: 'x@test.local', subject: 'x' })).rejects.toThrow();
    expect(provider.send).not.toHaveBeenCalled();
    await executeCampaignSend(campaign.id, campaign);
    const result = await executeCampaignSend(campaign.id, await reload(campaign.id));
    expect(result).toEqual({ sent: 0, failed: 0, total: 0 });
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(await db.select().from(emailCampaignSends).where(eq(emailCampaignSends.subscriberId, subscribers[0].id))).toHaveLength(1);
    const events = await db.select().from(automationJobs).where(eq(automationJobs.clientId, campaign.clientId!));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: 'email.campaign.sent', status: 'pending', payload: { campaignId: campaign.id, totalSent: 1 } });
  });

  it('rolls terminal status back when its durable event fails, then recovers without another provider call', async () => {
    const { campaign } = await fixture(false, 1);
    const sql = getTestSql();
    await sql.unsafe(`CREATE FUNCTION fail_campaign_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'event unavailable'; END $$`);
    await sql.unsafe('CREATE TRIGGER fail_campaign_event BEFORE INSERT ON automation_jobs FOR EACH ROW EXECUTE FUNCTION fail_campaign_event()');
    try {
      await expect(executeCampaignSend(campaign.id, campaign)).rejects.toMatchObject({ cause: { message: 'event unavailable' } });
      expect((await reload(campaign.id)).status).toBe('sending');
      expect(await db.select().from(emailCampaignSends).where(eq(emailCampaignSends.campaignId, campaign.id))).toHaveLength(1);
    } finally {
      await sql.unsafe('DROP TRIGGER fail_campaign_event ON automation_jobs');
      await sql.unsafe('DROP FUNCTION fail_campaign_event()');
    }
    expect(await executeCampaignSend(campaign.id, await reload(campaign.id))).toEqual({ sent: 0, failed: 0, total: 0 });
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect((await reload(campaign.id)).status).toBe('sent');
    expect(await db.select().from(automationJobs).where(eq(automationJobs.clientId, campaign.clientId!))).toHaveLength(1);
  });

  it('legacy partially delivered A/B campaigns require reconciliation rather than recomputing cohorts', async () => {
    const { campaign, subscribers } = await fixture(true);
    await db.insert(emailCampaignSends).values({ campaignId: campaign.id, subscriberId: subscribers[0].id, abVariant: 'a', resendEmailId: 'historical' });
    await expect(executeCampaignSend(campaign.id, campaign)).rejects.toThrow('legacy A/B cohort');
    expect(provider.send).not.toHaveBeenCalled();
    expect((await reload(campaign.id)).dispatchPlan).toBeNull();
  });
});
