/**
 * Portal Publishing / Editorial Content Calendar — golden-path E2E (@critical).
 *
 * Covers the REAL supported API surface:
 *   - Campaign CRUD: create (201), read, update, delete
 *   - Auth gating: unauthenticated card routes return 401; publishing routes
 *     (getPublishingSession) redirect with 307 — tested using maxRedirects:0
 *   - Permission gating: manage_campaigns blocked for non-admin member
 *   - Card lifecycle in the publishing project: create (200) → stage moves →
 *     card.column_changed activity → link brain_note artifact
 *   - Calendar contract: GET returns { success, data } envelope, accepts date
 *     range, EXCLUDES cards with null scheduledFor; a card scheduled via
 *     PATCH /cards/:id { scheduledFor } appears in the feed (and drops off
 *     when unscheduled)
 *   - Email channel linkage (the only card↔campaign API surface that exists)
 *
 * STATUS CODES CONFIRMED AGAINST ACTUAL HANDLERS:
 *   POST /api/portal/cards                    → 200 (no explicit status → 200)
 *   POST /api/portal/publishing/campaigns     → 201
 *   GET/POST publishing/* (no session)        → 307 redirect (getPublishingSession → redirect())
 *   POST /api/portal/cards (no session)       → 401 (uses auth() directly)
 *
 * Cleanup order (reversed by runCleanups): artifact link → card → campaign
 */
import { test, expect, request as playwrightRequest } from './setup/fixtures';
import {
  runCleanups,
  createTestTeamMember,
} from './setup/helpers';

const PREFIX = 'PUB-E2E-';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ── Shared column-resolution helper ──────────────────────────────────────────

interface Column { id: number; name: string; order: number }

/**
 * Bootstrap publishing project and resolve all stage column IDs.
 * Returns { projectId, columns, ideaColId, draftColId, inReviewColId,
 *           scheduledColId, publishedColId }
 */
async function resolvePublishingColumns(
  adminApi: { get: (path: string) => Promise<{ status: number; data: { data?: unknown } }> },
) {
  // Trigger bootstrap — idempotent
  await adminApi.get('/api/portal/publishing/campaigns');

  // Find the publishing project
  const projectsRes = await adminApi.get('/api/portal/projects');
  const projects = (projectsRes.data?.data ?? []) as Array<{ id: number; name: string; systemKind?: string }>;
  const pub = projects.find(p => p.systemKind === 'publishing' || p.name === 'Publishing');
  if (!pub) throw new Error('Publishing project not found after bootstrap');

  // Resolve columns
  const colsRes = await adminApi.get(`/api/portal/projects/${pub.id}/columns`);
  const columns = (colsRes.data?.data ?? []) as Column[];

  const findCol = (name: string) => {
    const col = columns.find(c => c.name === name);
    if (!col) throw new Error(`Column "${name}" not found in publishing project`);
    return col.id;
  };

  return {
    projectId: pub.id,
    columns,
    ideaColId: findCol('Idea'),
    draftColId: findCol('Draft'),
    inReviewColId: findCol('In Review'),
    scheduledColId: findCol('Scheduled'),
    publishedColId: findCol('Published'),
  };
}

// ── Campaign lifecycle ────────────────────────────────────────────────────────

test.describe('Portal Publishing — Campaign lifecycle @publishing @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(120_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /publishing/campaigns creates a campaign (adminApi)', async ({ adminApi }) => {
    const ts = Date.now();
    const res = await adminApi.post('/api/portal/publishing/campaigns', {
      name: `${PREFIX}Campaign-${ts}`,
      color: '#6366f1',
      description: 'E2E test campaign',
      status: 'active',
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    const campaign = res.data.data;
    expect(campaign).toHaveProperty('id');
    expect(campaign.name).toContain(PREFIX);
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/publishing/campaigns/${campaign.id}`).catch(() => {});
    });
  });

  test('GET /publishing/campaigns lists campaigns for the active client', async ({ adminApi }) => {
    const ts = Date.now();
    const createRes = await adminApi.post('/api/portal/publishing/campaigns', {
      name: `${PREFIX}List-${ts}`,
      color: '#10b981',
    });
    expect(createRes.status).toBe(201);
    const campaign = createRes.data.data;
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/publishing/campaigns/${campaign.id}`).catch(() => {});
    });

    const listRes = await adminApi.get('/api/portal/publishing/campaigns');
    expect(listRes.status).toBe(200);
    expect(listRes.data.success).toBe(true);
    const ids = (listRes.data.data as Array<{ id: number }>).map(c => c.id);
    expect(ids).toContain(campaign.id);
  });

  test('GET /publishing/campaigns/:id reads a single campaign', async ({ adminApi }) => {
    const ts = Date.now();
    const createRes = await adminApi.post('/api/portal/publishing/campaigns', {
      name: `${PREFIX}Get-${ts}`,
    });
    expect(createRes.status).toBe(201);
    const campaign = createRes.data.data;
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/publishing/campaigns/${campaign.id}`).catch(() => {});
    });

    const getRes = await adminApi.get(`/api/portal/publishing/campaigns/${campaign.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.success).toBe(true);
    expect(getRes.data.data.id).toBe(campaign.id);
  });

  test('PATCH /publishing/campaigns/:id updates campaign fields', async ({ adminApi }) => {
    const ts = Date.now();
    const createRes = await adminApi.post('/api/portal/publishing/campaigns', {
      name: `${PREFIX}Patch-${ts}`,
      status: 'active',
    });
    expect(createRes.status).toBe(201);
    const campaign = createRes.data.data;
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/publishing/campaigns/${campaign.id}`).catch(() => {});
    });

    const patchRes = await adminApi.patch(`/api/portal/publishing/campaigns/${campaign.id}`, {
      description: 'updated via E2E',
      status: 'completed',
    });
    expect(patchRes.status).toBe(200);
    expect(patchRes.data.success).toBe(true);
    expect(patchRes.data.data.status).toBe('completed');
    expect(patchRes.data.data.description).toBe('updated via E2E');
  });

  test('DELETE /publishing/campaigns/:id removes the campaign', async ({ adminApi }) => {
    const ts = Date.now();
    const createRes = await adminApi.post('/api/portal/publishing/campaigns', {
      name: `${PREFIX}Del-${ts}`,
    });
    expect(createRes.status).toBe(201);
    const campaign = createRes.data.data;
    // No cleanup push — the DELETE under test IS the cleanup.

    const delRes = await adminApi.delete(`/api/portal/publishing/campaigns/${campaign.id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.data.success).toBe(true);

    // Confirm it's gone
    const getRes = await adminApi.get(`/api/portal/publishing/campaigns/${campaign.id}`);
    expect(getRes.status).toBe(404);
  });

  test('POST /publishing/campaigns rejects unauthenticated (307 redirect to login)', async () => {
    // getPublishingSession() calls redirect('/portal/login') on no session,
    // which produces a 307. Playwright's APIRequestContext follows redirects by
    // default, so we create a bare context with maxRedirects:0 to observe it.
    const ctx = await playwrightRequest.newContext({
      baseURL: BASE_URL,
      extraHTTPHeaders: { 'Content-Type': 'application/json' },
    });
    try {
      const res = await ctx.post('/api/portal/publishing/campaigns', {
        data: { name: `${PREFIX}Unauth-${Date.now()}` },
        maxRedirects: 0,
      });
      // 307 = redirect to /portal/login (no session)
      expect(res.status()).toBe(307);
    } finally {
      await ctx.dispose();
    }
  });

  test('POST /publishing/campaigns rejects non-admin client (manage_campaigns gate)', async ({ adminApi }) => {
    // Provision a non-admin team member
    const { memberApi, cleanup: memberCleanup } = await createTestTeamMember(adminApi);
    cleanups.push(memberCleanup);

    const res = await memberApi.post('/api/portal/publishing/campaigns', {
      name: `${PREFIX}ForbiddenCampaign-${Date.now()}`,
    });
    // Non-admin members lack manage_campaigns — expect 403
    expect(res.status).toBe(403);
  });
});

// ── Card lifecycle + stage moves ─────────────────────────────────────────────

test.describe('Portal Publishing — Card lifecycle and stage moves @publishing @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(180_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /cards returns 200 (not 201) for publishing-project column', async ({ adminApi }) => {
    const ts = Date.now();
    const { ideaColId } = await resolvePublishingColumns(adminApi);

    const cardRes = await adminApi.post('/api/portal/cards', {
      columnId: ideaColId,
      title: `${PREFIX}StatusCheck-${ts}`,
    });
    expect(cardRes.status).toBe(200);
    expect(cardRes.data.success).toBe(true);
    const card = cardRes.data.data as { id: number };
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/cards/${card.id}`).catch(() => {});
    });
  });

  test('full card lifecycle: create → stage moves → card.column_changed activity → brain_note artifact', async ({ adminApi }) => {
    const ts = Date.now();

    // ── 1. Bootstrap + resolve columns ──
    const { projectId, ideaColId, draftColId, inReviewColId, scheduledColId, publishedColId } =
      await resolvePublishingColumns(adminApi);
    expect(projectId).toBeGreaterThan(0);

    // ── 2. Create card in Idea column (POST returns 200 per actual handler) ──
    const cardRes = await adminApi.post('/api/portal/cards', {
      columnId: ideaColId,
      title: `${PREFIX}Card-${ts}`,
      description: 'E2E publishing lifecycle card',
      priority: 'medium',
    });
    expect(cardRes.status).toBe(200);
    expect(cardRes.data.success).toBe(true);
    const card = cardRes.data.data as { id: number; columnId: number };
    expect(card.columnId).toBe(ideaColId);
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/cards/${card.id}`).catch(() => {});
    });

    // ── 3. Move card: Idea → Draft ──
    const moveToDraft = await adminApi.patch(`/api/portal/cards/${card.id}/move`, {
      columnId: draftColId,
      order: 0,
    });
    expect(moveToDraft.status).toBe(200);
    expect(moveToDraft.data.data.columnId).toBe(draftColId);

    // ── 4. Move card: Draft → In Review ──
    const moveToInReview = await adminApi.patch(`/api/portal/cards/${card.id}/move`, {
      columnId: inReviewColId,
      order: 0,
    });
    expect(moveToInReview.status).toBe(200);
    expect(moveToInReview.data.data.columnId).toBe(inReviewColId);

    // ── 5. Move card: In Review → Scheduled ──
    const moveToScheduled = await adminApi.patch(`/api/portal/cards/${card.id}/move`, {
      columnId: scheduledColId,
      order: 0,
    });
    expect(moveToScheduled.status).toBe(200);
    expect(moveToScheduled.data.data.columnId).toBe(scheduledColId);

    // ── 6. Move card: Scheduled → Published ──
    const moveToPublished = await adminApi.patch(`/api/portal/cards/${card.id}/move`, {
      columnId: publishedColId,
      order: 0,
    });
    expect(moveToPublished.status).toBe(200);
    expect(moveToPublished.data.data.columnId).toBe(publishedColId);

    // ── 7. Verify activity log has card.column_changed entries ──
    const cardDetail = await adminApi.get(`/api/portal/cards/${card.id}`);
    expect(cardDetail.status).toBe(200);
    const activities = (cardDetail.data.data.activities as Array<{ type: string }>) ?? [];
    expect(activities.some(a => a.type === 'card.column_changed')).toBe(true);

    // ── 8. Link a brain_note artifact (valid type; cms_post is INVALID → 400) ──
    // brain_note requires an actual brain_note row on the client — skip silently
    // if none exists (teardown-safe: we registered card cleanup already).
    const availRes = await adminApi.get('/api/portal/cards/' + card.id + '/artifacts/available?type=brain_note');
    const notes = (availRes.data?.data ?? []) as Array<{ id: number }>;
    if (notes.length > 0) {
      const noteId = notes[0].id;
      const artifactRes = await adminApi.post(`/api/portal/cards/${card.id}/artifacts`, {
        artifactType: 'brain_note',
        artifactId: noteId,
        pinned: false,
      });
      expect(artifactRes.status).toBe(201);
      expect(artifactRes.data.success).toBe(true);
      const artifact = artifactRes.data.data as { id: number };
      cleanups.push(async () => {
        await adminApi.delete(`/api/portal/cards/${card.id}/artifacts`, { artifactDbId: artifact.id }).catch(() => {});
      });

      // Verify artifact appears in card detail
      const cardWithArtifact = await adminApi.get(`/api/portal/cards/${card.id}`);
      expect(cardWithArtifact.status).toBe(200);
      const artifacts = (cardWithArtifact.data.data.artifacts as Array<{ id: number }>) ?? [];
      expect(artifacts.some(a => a.id === artifact.id)).toBe(true);
    }
  });

  test('POST /cards rejects unauthenticated with 401 (not 307 — uses auth() directly)', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/cards', {
      columnId: 1,
      title: `${PREFIX}Unauth-${Date.now()}`,
    });
    // /api/portal/cards uses auth() directly → real 401 (no redirect)
    expect(res.status).toBe(401);
  });

  test('move card logs card.column_changed activity', async ({ adminApi }) => {
    const ts = Date.now();
    const { ideaColId, draftColId } = await resolvePublishingColumns(adminApi);

    const cardRes = await adminApi.post('/api/portal/cards', {
      columnId: ideaColId,
      title: `${PREFIX}MoveActivity-${ts}`,
    });
    expect(cardRes.status).toBe(200);
    const card = cardRes.data.data as { id: number };
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/cards/${card.id}`).catch(() => {});
    });

    const moveRes = await adminApi.patch(`/api/portal/cards/${card.id}/move`, {
      columnId: draftColId,
      order: 0,
    });
    expect(moveRes.status).toBe(200);
    expect(moveRes.data.data.columnId).toBe(draftColId);

    const detailRes = await adminApi.get(`/api/portal/cards/${card.id}`);
    expect(detailRes.status).toBe(200);
    const types = ((detailRes.data.data.activities as Array<{ type: string }>) ?? []).map(a => a.type);
    expect(types).toContain('card.column_changed');
  });

  test('cms_post is NOT a valid artifact type (returns 400)', async ({ adminApi }) => {
    const ts = Date.now();
    const { ideaColId } = await resolvePublishingColumns(adminApi);

    const cardRes = await adminApi.post('/api/portal/cards', {
      columnId: ideaColId,
      title: `${PREFIX}ArtifactTypeCheck-${ts}`,
    });
    expect(cardRes.status).toBe(200);
    const card = cardRes.data.data as { id: number };
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/cards/${card.id}`).catch(() => {});
    });

    const artifactRes = await adminApi.post(`/api/portal/cards/${card.id}/artifacts`, {
      artifactType: 'cms_post',
      artifactId: 1,
      pinned: false,
    });
    expect(artifactRes.status).toBe(400);
    expect(artifactRes.data.success).toBe(false);
  });
});

// ── Calendar contract ─────────────────────────────────────────────────────────

test.describe('Portal Publishing — Calendar contract @publishing @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(120_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('schedule a card via PATCH scheduledFor → appears on calendar → unschedule → gone', async ({ adminApi }) => {
    const ts = Date.now();
    const { ideaColId } = await resolvePublishingColumns(adminApi);

    const cardRes = await adminApi.post('/api/portal/cards', {
      columnId: ideaColId,
      title: `${PREFIX}Sched-${ts}`,
    });
    expect(cardRes.status).toBe(200);
    const card = cardRes.data.data as { id: number };
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/cards/${card.id}`).catch(() => {});
    });

    // Schedule the card onto a date inside the query window.
    const scheduledFor = new Date(ts + 2 * 86400_000).toISOString();
    const patch = await adminApi.patch(`/api/portal/cards/${card.id}`, { scheduledFor });
    expect(patch.status).toBe(200);
    expect(patch.data.data.scheduledFor).not.toBeNull();
    expect(new Date(patch.data.data.scheduledFor).toISOString()).toBe(scheduledFor);

    const start = new Date(ts - 60_000).toISOString();
    const end = new Date(ts + 7 * 86400_000).toISOString();
    const inRange = await adminApi.get(
      `/api/portal/publishing/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    );
    expect(inRange.status).toBe(200);
    const scheduledIds = (inRange.data.data as Array<{ id: number }>).map(e => e.id);
    expect(scheduledIds).toContain(card.id);

    // Unschedule (null) → the card must drop off the calendar feed.
    const unschedule = await adminApi.patch(`/api/portal/cards/${card.id}`, { scheduledFor: null });
    expect(unschedule.status).toBe(200);
    expect(unschedule.data.data.scheduledFor).toBeNull();

    const afterClear = await adminApi.get(
      `/api/portal/publishing/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    );
    expect(afterClear.status).toBe(200);
    const clearedIds = (afterClear.data.data as Array<{ id: number }>).map(e => e.id);
    expect(clearedIds).not.toContain(card.id);
  });

  test('GET /publishing/calendar returns success envelope with entries array', async ({ adminApi }) => {
    const ts = Date.now();
    const start = new Date(ts - 86400_000).toISOString();
    const end = new Date(ts + 7 * 86400_000).toISOString();

    const res = await adminApi.get(
      `/api/portal/publishing/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /publishing/calendar requires start and end params', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/publishing/calendar');
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /publishing/calendar rejects invalid date values', async ({ adminApi }) => {
    const res = await adminApi.get('/api/portal/publishing/calendar?start=not-a-date&end=also-not-a-date');
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /publishing/calendar excludes cards with null scheduledFor', async ({ adminApi }) => {
    const ts = Date.now();
    const { ideaColId } = await resolvePublishingColumns(adminApi);

    // Create a card WITHOUT setting scheduledFor — no API exists to set it
    const cardRes = await adminApi.post('/api/portal/cards', {
      columnId: ideaColId,
      title: `${PREFIX}NoSched-${ts}`,
    });
    expect(cardRes.status).toBe(200);
    const card = cardRes.data.data as { id: number };
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/cards/${card.id}`).catch(() => {});
    });

    const start = new Date(ts - 60_000).toISOString();
    const end = new Date(ts + 7 * 86400_000).toISOString();
    const res = await adminApi.get(
      `/api/portal/publishing/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const ids = (res.data.data as Array<{ id: number }>).map(e => e.id);
    // Card with null scheduledFor must NOT appear in calendar
    expect(ids).not.toContain(card.id);
  });

  test('GET /publishing/calendar rejects unauthenticated (307 redirect to login)', async () => {
    const start = new Date().toISOString();
    const end = new Date(Date.now() + 86400_000).toISOString();
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
    try {
      const res = await ctx.get(
        `/api/portal/publishing/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { maxRedirects: 0 },
      );
      expect(res.status()).toBe(307);
    } finally {
      await ctx.dispose();
    }
  });
});

// ── Email channel linkage ─────────────────────────────────────────────────────

test.describe('Portal Publishing — Email channel linkage @publishing @mutations', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(120_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /publishing/channels/email links an email_campaign artifact to a card', async ({ adminApi }) => {
    const ts = Date.now();

    // Bootstrap columns
    const { ideaColId } = await resolvePublishingColumns(adminApi);

    // Create a card
    const cardRes = await adminApi.post('/api/portal/cards', {
      columnId: ideaColId,
      title: `${PREFIX}EmailLink-${ts}`,
    });
    expect(cardRes.status).toBe(200);
    const card = cardRes.data.data as { id: number };
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/cards/${card.id}`).catch(() => {});
    });

    // Check if any email campaigns exist for this client (available endpoint)
    const availRes = await adminApi.get('/api/portal/publishing/channels/email?available=1');
    expect(availRes.status).toBe(200);
    const emailCampaigns = (availRes.data?.data?.campaigns ?? []) as Array<{ id: number }>;

    if (emailCampaigns.length === 0) {
      // No email campaigns available to link — document the skip reason
      test.skip(true, 'No email_campaign artifacts available for this test client; seed at least one draft/scheduled email campaign to cover this path');
      return;
    }

    const emailCampaignId = emailCampaigns[0].id;
    const linkRes = await adminApi.post('/api/portal/publishing/channels/email', {
      cardId: card.id,
      campaignId: emailCampaignId,
    });
    // Handler returns 200 on success (no explicit status code → NextResponse.json default)
    expect(linkRes.status).toBe(200);
    expect(linkRes.data.success).toBe(true);

    // Cleanup: unlink
    cleanups.push(async () => {
      await adminApi.delete(
        `/api/portal/publishing/channels/email?cardId=${card.id}&campaignId=${emailCampaignId}`,
      ).catch(() => {});
    });
  });
});

// ── Permission gating ─────────────────────────────────────────────────────────

test.describe('Portal Publishing — Permission gating @publishing @permissions', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(120_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /publishing/permissions is readable by owner (adminApi)', async ({ adminApi }) => {
    // Trigger bootstrap before hitting permissions route
    await adminApi.get('/api/portal/publishing/campaigns');

    const res = await adminApi.get('/api/portal/publishing/permissions');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('members');
    expect(res.data.data).toHaveProperty('grants');
  });

  test('GET /publishing/permissions rejects unauthenticated (307 redirect to login)', async () => {
    const ctx = await playwrightRequest.newContext({ baseURL: BASE_URL });
    try {
      const res = await ctx.get('/api/portal/publishing/permissions', { maxRedirects: 0 });
      expect(res.status()).toBe(307);
    } finally {
      await ctx.dispose();
    }
  });

  test('grant + revoke manage_campaigns permission for a team member', async ({ adminApi }) => {
    // Provision non-admin member
    const { memberApi, userId, cleanup: memberCleanup } = await createTestTeamMember(adminApi);
    cleanups.push(memberCleanup);

    // Trigger bootstrap
    await adminApi.get('/api/portal/publishing/campaigns');

    // Verify member is denied manage_campaigns initially
    const beforeGrant = await memberApi.post('/api/portal/publishing/campaigns', {
      name: `${PREFIX}BeforeGrant-${Date.now()}`,
    });
    expect(beforeGrant.status).toBe(403);

    // Grant manage_campaigns
    const grantRes = await adminApi.post('/api/portal/publishing/permissions/grant', {
      userId,
      permissionKey: 'manage_campaigns',
    });
    expect(grantRes.status).toBe(200);
    expect(grantRes.data.success).toBe(true);
    expect(grantRes.data.data.granted).toBe(true);

    // Member should now be able to create campaigns — expect exactly 201
    const ts = Date.now();
    const afterGrantRes = await memberApi.post('/api/portal/publishing/campaigns', {
      name: `${PREFIX}AfterGrant-${ts}`,
    });
    expect(afterGrantRes.status).toBe(201);
    const createdId = afterGrantRes.data.data.id;
    cleanups.push(async () => {
      await adminApi.delete(`/api/portal/publishing/campaigns/${createdId}`).catch(() => {});
    });

    // Revoke manage_campaigns
    const revokeRes = await adminApi.post('/api/portal/publishing/permissions/revoke', {
      userId,
      permissionKey: 'manage_campaigns',
    });
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.data.success).toBe(true);
    expect(revokeRes.data.data.revoked).toBe(true);

    // Member should be denied again after revoke
    const afterRevokeRes = await memberApi.post('/api/portal/publishing/campaigns', {
      name: `${PREFIX}AfterRevoke-${Date.now()}`,
    });
    expect(afterRevokeRes.status).toBe(403);
  });
});
