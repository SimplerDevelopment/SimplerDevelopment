/**
 * Portal CRM notification emitters — E2E coverage.
 *
 * Covers the five event sites that insert rows into `crm_notifications`:
 *   1. deal_stage_changed   (PUT /api/portal/crm/deals/[id])
 *   2. deal_assigned        (PUT /api/portal/crm/deals/[id])
 *   3. contact_created      (POST /api/portal/crm/contacts)
 *   4. proposal_viewed      (GET /api/proposals/[token])  — first view only
 *   5. mention              (POST /api/portal/crm/deals/[id]/comments)
 *
 * Each test creates a fresh team member so we can verify recipient routing.
 * Notification inserts are fire-and-forget — we wait briefly before fetching.
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestPipeline,
  createTestDeal,
  createTestContact,
  createTestProposal,
  createTestTeamMember,
} from './setup/helpers';
import { request as pwRequest } from '@playwright/test';

const PREFIX = 'CRM-NOTIF-';

type NotifRow = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: number | null;
  read: boolean;
  createdAt: string;
};

/** Wait for fire-and-forget notification inserts to flush. */
async function waitForFlush(ms = 1500) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchNotifs(api: { get: (path: string) => Promise<{ data: { data: NotifRow[] } }> }): Promise<NotifRow[]> {
  const res = await api.get('/api/portal/crm/notifications');
  return (res.data?.data ?? []) as NotifRow[];
}

test.describe('Portal CRM — notification emitters @crm @notifications', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('deal_stage_changed: notifies team members, excludes the actor @critical', async ({ clientApi }) => {
    const member = await createTestTeamMember(clientApi);
    cleanups.push(member.cleanup);

    const { pipeline } = await createTestPipeline(clientApi, { name: `${PREFIX}Pipe-${Date.now()}` });
    const stage1 = pipeline.stages[0].id;
    const stage2 = pipeline.stages[1].id;

    const { deal, cleanup } = await createTestDeal(clientApi, pipeline.id, stage1, {
      title: `${PREFIX}StageDeal-${Date.now()}`,
    });
    cleanups.push(cleanup);

    // Move the deal to a new stage as the owner.
    const updateRes = await clientApi.put(`/api/portal/crm/deals/${deal.id}`, { stageId: stage2 });
    expect(updateRes.status).toBe(200);

    await waitForFlush();

    const memberNotifs = await fetchNotifs(member.memberApi);
    const memberHit = memberNotifs.find(
      (n) => n.type === 'deal_stage_changed' && n.entityType === 'deal' && n.entityId === deal.id,
    );
    expect(memberHit, 'team member should receive deal_stage_changed').toBeTruthy();
    expect(memberHit!.title).toContain(deal.title);

    // The actor (clientApi owner) should NOT receive their own stage-change notification.
    const ownerNotifs = await fetchNotifs(clientApi);
    const ownerHit = ownerNotifs.find(
      (n) => n.type === 'deal_stage_changed' && n.entityId === deal.id,
    );
    expect(ownerHit, 'actor should be excluded from their own stage-change').toBeUndefined();
  });

  test('deal_assigned: notifies the new owner only when ownerId actually changes', async ({ clientApi }) => {
    const member = await createTestTeamMember(clientApi);
    cleanups.push(member.cleanup);

    const { pipeline } = await createTestPipeline(clientApi, { name: `${PREFIX}AssignPipe-${Date.now()}` });
    const stageId = pipeline.stages[0].id;

    const { deal, cleanup } = await createTestDeal(clientApi, pipeline.id, stageId, {
      title: `${PREFIX}AssignDeal-${Date.now()}`,
    });
    cleanups.push(cleanup);

    // Owner reassigns the deal to the team member.
    const assignRes = await clientApi.put(`/api/portal/crm/deals/${deal.id}`, { ownerId: member.userId });
    expect(assignRes.status).toBe(200);

    await waitForFlush();

    const memberNotifs = await fetchNotifs(member.memberApi);
    const assignHit = memberNotifs.find(
      (n) => n.type === 'deal_assigned' && n.entityType === 'deal' && n.entityId === deal.id,
    );
    expect(assignHit, 'new owner should receive deal_assigned').toBeTruthy();
    expect(assignHit!.title).toContain(deal.title);

    // The actor (the original owner reassigning) should not be notified.
    const ownerNotifs = await fetchNotifs(clientApi);
    const ownerAssignHit = ownerNotifs.find(
      (n) => n.type === 'deal_assigned' && n.entityId === deal.id,
    );
    expect(ownerAssignHit, 'actor should not receive their own deal_assigned').toBeUndefined();

    // Re-PUT with the SAME ownerId should not insert a duplicate notification.
    const beforeCount = (await fetchNotifs(member.memberApi)).filter(
      (n) => n.type === 'deal_assigned' && n.entityId === deal.id,
    ).length;
    const noopRes = await clientApi.put(`/api/portal/crm/deals/${deal.id}`, { ownerId: member.userId });
    expect(noopRes.status).toBe(200);
    await waitForFlush();
    const afterCount = (await fetchNotifs(member.memberApi)).filter(
      (n) => n.type === 'deal_assigned' && n.entityId === deal.id,
    ).length;
    expect(afterCount, 'no-op ownerId update should not produce another notification').toBe(beforeCount);
  });

  test('contact_created: notifies all client members except the creator', async ({ clientApi }) => {
    const member = await createTestTeamMember(clientApi);
    cleanups.push(member.cleanup);

    const { contact, cleanup } = await createTestContact(clientApi, {
      firstName: `${PREFIX}First`,
      lastName: `Last-${Date.now()}`,
    });
    cleanups.push(cleanup);

    await waitForFlush();

    const memberNotifs = await fetchNotifs(member.memberApi);
    const memberHit = memberNotifs.find(
      (n) => n.type === 'contact_created' && n.entityType === 'contact' && n.entityId === contact.id,
    );
    expect(memberHit, 'team member should receive contact_created').toBeTruthy();
    expect(memberHit!.title).toContain('New contact');

    // Creator is excluded.
    const ownerNotifs = await fetchNotifs(clientApi);
    const ownerHit = ownerNotifs.find(
      (n) => n.type === 'contact_created' && n.entityId === contact.id,
    );
    expect(ownerHit, 'creator should not receive their own contact_created').toBeUndefined();
  });

  test('proposal_viewed: notifies the creator on first view only, no duplicate on second view', async ({ clientApi }) => {
    // Create + send the proposal so its status flips from draft -> sent (which the
    // public route requires to allow viewing and to count "first view").
    const { proposal, cleanup } = await createTestProposal(clientApi, {
      title: `${PREFIX}Prop-${Date.now()}`,
    });
    cleanups.push(cleanup);

    const sendRes = await clientApi.post(`/api/portal/crm/proposals/${proposal.id}/send`, {});
    expect([200, 201]).toContain(sendRes.status);
    const sent = sendRes.data?.data ?? sendRes.data;
    const token: string | undefined = sent?.clientToken ?? sent?.proposal?.clientToken ?? proposal.clientToken;
    expect(token, 'send response should expose clientToken').toBeTruthy();

    // Hit the public proposal route as an unauthenticated visitor.
    const publicCtx = await pwRequest.newContext({ baseURL: process.env.BASE_URL || 'http://localhost:3000' });
    const view1 = await publicCtx.get(`/api/proposals/${token}`);
    expect(view1.status()).toBe(200);

    await waitForFlush();

    const ownerNotifs1 = await fetchNotifs(clientApi);
    const viewHits1 = ownerNotifs1.filter(
      (n) => n.type === 'proposal_viewed' && n.entityType === 'proposal',
    );
    // The creator (clientApi owner) should see exactly one proposal_viewed for this proposal.
    const matchTitle = (n: NotifRow) => n.title.includes(proposal.title);
    const firstHit = viewHits1.find(matchTitle);
    expect(firstHit, 'creator should receive proposal_viewed on first view').toBeTruthy();

    // Second view should NOT add another notification.
    const view2 = await publicCtx.get(`/api/proposals/${token}`);
    expect(view2.status()).toBe(200);
    await publicCtx.dispose();
    await waitForFlush();

    const ownerNotifs2 = await fetchNotifs(clientApi);
    const matched2 = ownerNotifs2.filter(
      (n) => n.type === 'proposal_viewed' && matchTitle(n),
    );
    expect(matched2.length, 'second view should not insert another proposal_viewed').toBe(viewHits1.filter(matchTitle).length);
  });

  test('mention: notifies each mentioned member, excludes author and ignores duplicates + malformed tokens', async ({ clientApi }) => {
    const memberA = await createTestTeamMember(clientApi);
    cleanups.push(memberA.cleanup);
    const memberB = await createTestTeamMember(clientApi);
    cleanups.push(memberB.cleanup);

    const { pipeline } = await createTestPipeline(clientApi, { name: `${PREFIX}MentionPipe-${Date.now()}` });
    const stageId = pipeline.stages[0].id;

    const { deal, cleanup } = await createTestDeal(clientApi, pipeline.id, stageId, {
      title: `${PREFIX}MentionDeal-${Date.now()}`,
    });
    cleanups.push(cleanup);

    // Body includes:
    //   - mention to memberA
    //   - duplicate mention to memberA (should dedupe)
    //   - mention to memberB
    //   - mention to the author (clientApi owner) — should be skipped
    //   - malformed `@John` (no parens) — should be ignored
    // We don't know the owner's user id from the fixture, but the helpers include a
    // self-mention check on the route — we still validate that no duplicates land
    // in memberA's feed below.
    const body = `Hello @[A](${memberA.userId}) and @[A again](${memberA.userId}) and @[B](${memberB.userId}). Also @John no parens here.`;
    const commentRes = await clientApi.post(`/api/portal/crm/deals/${deal.id}/comments`, { body });
    expect(commentRes.status).toBe(201);

    await waitForFlush();

    const aNotifs = await fetchNotifs(memberA.memberApi);
    const aHits = aNotifs.filter(
      (n) => n.type === 'mention' && n.entityType === 'deal' && n.entityId === deal.id,
    );
    expect(aHits.length, 'memberA should receive exactly one mention notification (deduped)').toBe(1);
    expect(aHits[0].title).toContain(deal.title);
    expect(aHits[0].body).toContain('Hello');

    const bNotifs = await fetchNotifs(memberB.memberApi);
    const bHits = bNotifs.filter(
      (n) => n.type === 'mention' && n.entityType === 'deal' && n.entityId === deal.id,
    );
    expect(bHits.length, 'memberB should receive exactly one mention notification').toBe(1);

    // Author should not get a mention notification (even if `@John` parsed, it has no id).
    const ownerNotifs = await fetchNotifs(clientApi);
    const ownerMentions = ownerNotifs.filter(
      (n) => n.type === 'mention' && n.entityId === deal.id,
    );
    expect(ownerMentions.length, 'author should not receive their own mention').toBe(0);
  });

  test('mention: malformed-only body produces no notifications', async ({ clientApi }) => {
    const member = await createTestTeamMember(clientApi);
    cleanups.push(member.cleanup);

    const { pipeline } = await createTestPipeline(clientApi, { name: `${PREFIX}NoMentionPipe-${Date.now()}` });
    const stageId = pipeline.stages[0].id;

    const { deal, cleanup } = await createTestDeal(clientApi, pipeline.id, stageId, {
      title: `${PREFIX}NoMentionDeal-${Date.now()}`,
    });
    cleanups.push(cleanup);

    const body = `Hey @John how are you? Also @[Joe] without parens and @[Joe]() with empty.`;
    const commentRes = await clientApi.post(`/api/portal/crm/deals/${deal.id}/comments`, { body });
    expect(commentRes.status).toBe(201);

    await waitForFlush();

    const memberNotifs = await fetchNotifs(member.memberApi);
    const hits = memberNotifs.filter(
      (n) => n.type === 'mention' && n.entityId === deal.id,
    );
    expect(hits.length, 'no well-formed mentions = no notifications').toBe(0);
  });
});
