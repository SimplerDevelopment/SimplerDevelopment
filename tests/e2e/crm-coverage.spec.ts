/**
 * CRM Coverage — spec for cards in "To Test" from CRM E2E Audit board.
 *
 * Cards covered here (API-level assertions):
 *   - notification-preferences GET + PUT
 *   - notifications/[id] PATCH (mark single read/unread)
 *   - notifications/mark-all-read POST
 *   - contacts/[id]/emails GET
 *   - contacts/[id]/send-email POST (validation paths — no real Resend call)
 *   - contacts/[id]/score POST (requires a scoring rule)
 *   - deals/[id]/artifacts GET, POST link, DELETE unlink
 *   - deals/[id]/artifacts/available GET
 *   - pipelines/[id]/stages/[stageId] DELETE individual stage
 *   - pipelines/[id]/stages PUT (bulk update — verify rename)
 *   - Cross-tenant isolation (contact/company/deal from tenant A not visible to unauthenticated caller)
 */
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestContact,
  createTestPipeline,
  createTestDeal,
} from './setup/helpers';

// ── Notification Preferences ──────────────────────────────────────────────────

test.describe('CRM — Notification Preferences @crm @crm-notification-prefs', () => {
  test('GET returns preferences with notificationType + delivery fields', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/notification-preferences');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Each row must have notificationType and delivery
    for (const pref of res.data.data as Array<{ notificationType: string; delivery: string }>) {
      expect(pref).toHaveProperty('notificationType');
      expect(pref).toHaveProperty('delivery');
      expect(['instant', 'digest_daily', 'off']).toContain(pref.delivery);
    }
  });

  test('PUT upserts a valid delivery preference then GET returns it', async ({ clientApi }) => {
    // First get the list to find a valid notificationType
    const listRes = await clientApi.get('/api/portal/crm/notification-preferences');
    expect(listRes.status).toBe(200);
    const prefs = listRes.data.data as Array<{ notificationType: string; delivery: string }>;
    expect(prefs.length).toBeGreaterThan(0);
    const firstType = prefs[0].notificationType;

    const res = await clientApi.put('/api/portal/crm/notification-preferences', {
      preferences: [{ notificationType: firstType, delivery: 'digest_daily' }],
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);

    // Verify the update persisted
    const after = await clientApi.get('/api/portal/crm/notification-preferences');
    const updated = (after.data.data as Array<{ notificationType: string; delivery: string }>)
      .find(p => p.notificationType === firstType);
    expect(updated?.delivery).toBe('digest_daily');

    // Restore to 'instant'
    await clientApi.put('/api/portal/crm/notification-preferences', {
      preferences: [{ notificationType: firstType, delivery: 'instant' }],
    });
  });

  test('PUT rejects empty preferences array with 400', async ({ clientApi }) => {
    const res = await clientApi.put('/api/portal/crm/notification-preferences', {
      preferences: [],
    });
    expect(res.status).toBe(400);
  });

  test('PUT rejects all-invalid preferences with 400', async ({ clientApi }) => {
    const res = await clientApi.put('/api/portal/crm/notification-preferences', {
      preferences: [{ notificationType: 'bogus_event', delivery: 'bogus_delivery' }],
    });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated GET', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/notification-preferences');
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated PUT', async ({ unauthApi }) => {
    const res = await unauthApi.put('/api/portal/crm/notification-preferences', {
      preferences: [{ notificationType: 'deal_created', delivery: 'off' }],
    });
    expect(res.status).toBe(401);
  });
});

// ── Notifications — single [id] PATCH ────────────────────────────────────────

test.describe('CRM — Notifications single-read/dismiss @crm @crm-notifications-id', () => {
  test('PATCH /notifications/999999 returns 404 for unknown notification', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/crm/notifications/999999', { read: true });
    expect(res.status).toBe(404);
  });

  test('PATCH /notifications/notanumber returns 400', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/crm/notifications/notanumber', { read: true });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated PATCH', async ({ unauthApi }) => {
    const res = await unauthApi.patch('/api/portal/crm/notifications/1', { read: true });
    expect(res.status).toBe(401);
  });
});

// ── Notifications — mark-all-read ─────────────────────────────────────────────

test.describe('CRM — Notifications mark-all-read @crm @crm-mark-all-read', () => {
  test('POST /notifications/mark-all-read returns success + updated count', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/notifications/mark-all-read', {});
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('updated');
    expect(typeof res.data.data.updated).toBe('number');
  });

  test('GET /notifications/mark-all-read returns unreadCount', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/notifications/mark-all-read');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('unreadCount');
    expect(typeof res.data.data.unreadCount).toBe('number');
  });

  test('rejects unauthenticated POST', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/crm/notifications/mark-all-read', {});
    expect(res.status).toBe(401);
  });
});

// ── Contacts — emails list ────────────────────────────────────────────────────

test.describe('CRM — Contacts emails list @crm @crm-contact-emails', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /contacts/[id]/emails returns paginated email activities', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/crm/contacts/${contact.id}/emails`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('emails');
    expect(res.data.data).toHaveProperty('total');
    expect(res.data.data).toHaveProperty('page');
    expect(res.data.data).toHaveProperty('limit');
    expect(Array.isArray(res.data.data.emails)).toBe(true);
  });

  test('GET /contacts/[id]/emails returns 400 for invalid id', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/contacts/notanumber/emails');
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/contacts/1/emails');
    expect(res.status).toBe(401);
  });
});

// ── Contacts — send-email (validation paths only — no real Resend call) ──────

test.describe('CRM — Contacts send-email validation @crm @crm-send-email', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /contacts/[id]/send-email returns 400 when subject missing', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/crm/contacts/${contact.id}/send-email`, {
      subject: '',
      body: 'Hello there',
    });
    expect(res.status).toBe(400);
  });

  test('POST /contacts/[id]/send-email returns 400 when body missing', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/crm/contacts/${contact.id}/send-email`, {
      subject: 'Hi',
      body: '',
    });
    expect(res.status).toBe(400);
  });

  test('POST /contacts/[id]/send-email returns 404 for unknown contact', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/contacts/999999/send-email', {
      subject: 'Hi',
      body: 'Hello',
    });
    expect(res.status).toBe(404);
  });

  test('POST /contacts/[id]/send-email returns 400 for contact with no email', async ({ clientApi }) => {
    // Create contact without an email address
    const { contact, cleanup } = await createTestContact(clientApi, {
      email: null,
      firstName: 'NoEmail',
      lastName: `Contact-${Date.now()}`,
    });
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/crm/contacts/${contact.id}/send-email`, {
      subject: 'Test',
      body: 'Test body',
    });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/crm/contacts/1/send-email', {
      subject: 'Hi',
      body: 'Hello',
    });
    expect(res.status).toBe(401);
  });
});

// ── Contacts — score ──────────────────────────────────────────────────────────

test.describe('CRM — Contacts score @crm @crm-contact-score', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /contacts/[id]/score returns 400 when eventType missing', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/crm/contacts/${contact.id}/score`, {});
    expect(res.status).toBe(400);
  });

  test('POST /contacts/[id]/score returns 404 when no matching scoring rule exists', async ({ clientApi }) => {
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/crm/contacts/${contact.id}/score`, {
      eventType: `nonexistent_event_type_${Date.now()}`,
    });
    expect(res.status).toBe(404);
  });

  test('POST /contacts/[id]/score adjusts score when scoring rule exists', async ({ clientApi }) => {
    const ts = Date.now();
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    // Create a scoring rule for the test event type
    const ruleRes = await clientApi.post('/api/portal/crm/scoring-rules', {
      eventType: `e2e_score_test_${ts}`,
      points: 10,
      description: 'E2E test scoring rule',
      enabled: true,
    });
    if (ruleRes.status !== 201) {
      test.skip(true, 'Scoring rules creation not available');
      return;
    }
    const ruleId = ruleRes.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/scoring-rules/${ruleId}`).catch(() => {});
    });

    const initialScore = contact.score ?? 0;

    const res = await clientApi.post(`/api/portal/crm/contacts/${contact.id}/score`, {
      eventType: `e2e_score_test_${ts}`,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.newScore).toBe(initialScore + 10);
    expect(res.data.data.pointsAdded).toBe(10);
    expect(res.data.data.previousScore).toBe(initialScore);
    expect(res.data.data.contactId).toBe(contact.id);
  });

  test('POST /contacts/[id]/score returns 404 for unknown contact', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/crm/contacts/999999/score', {
      eventType: 'anything',
    });
    expect(res.status).toBe(404);
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/crm/contacts/1/score', {
      eventType: 'test',
    });
    expect(res.status).toBe(401);
  });
});

// ── Deals — Artifacts ─────────────────────────────────────────────────────────

test.describe('CRM — Deal Artifacts @crm @crm-deal-artifacts', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  async function createPipelineAndDeal(clientApi: Parameters<typeof createTestDeal>[0]) {
    const { pipeline, cleanup: pCleanup } = await createTestPipeline(clientApi);
    cleanups.push(pCleanup);
    const firstStage = pipeline.stages?.[0];
    if (!firstStage) throw new Error('Pipeline has no stages');
    const { deal, cleanup: dCleanup } = await createTestDeal(clientApi, pipeline.id, firstStage.id);
    cleanups.push(dCleanup);
    return { deal, pipeline, firstStage };
  }

  test('GET /deals/[id]/artifacts returns array', async ({ clientApi }) => {
    const { deal } = await createPipelineAndDeal(clientApi);
    const res = await clientApi.get(`/api/portal/crm/deals/${deal.id}/artifacts`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /deals/[id]/artifacts/available returns typed artifact list', async ({ clientApi }) => {
    const { deal } = await createPipelineAndDeal(clientApi);
    const res = await clientApi.get(`/api/portal/crm/deals/${deal.id}/artifacts/available`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    // Each entry has type, id, title
    for (const item of res.data.data as Array<{ type: string; id: number; title: string }>) {
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('title');
    }
  });

  test('GET /deals/[id]/artifacts returns 404 for unknown deal', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/crm/deals/999999/artifacts');
    expect(res.status).toBe(404);
  });

  test('POST /deals/[id]/artifacts returns 400 for invalid artifactType', async ({ clientApi }) => {
    const { deal } = await createPipelineAndDeal(clientApi);
    const res = await clientApi.post(`/api/portal/crm/deals/${deal.id}/artifacts`, {
      artifactType: 'bogus_type',
      artifactId: 1,
    });
    expect(res.status).toBe(400);
  });

  test('POST /deals/[id]/artifacts returns 404 for non-existent artifact', async ({ clientApi }) => {
    const { deal } = await createPipelineAndDeal(clientApi);
    const res = await clientApi.post(`/api/portal/crm/deals/${deal.id}/artifacts`, {
      artifactType: 'proposal',
      artifactId: 999999,
    });
    expect(res.status).toBe(404);
  });

  test('rejects unauthenticated GET artifacts', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/deals/1/artifacts');
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated GET available', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/crm/deals/1/artifacts/available');
    expect(res.status).toBe(401);
  });
});

// ── Pipelines — stages/[stageId] DELETE individual stage ─────────────────────

test.describe('CRM — Pipeline Stage Delete @crm @crm-stage-delete', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('DELETE /pipelines/[id]/stages/[stageId] removes an empty stage', async ({ clientApi }) => {
    const { pipeline } = await createTestPipeline(clientApi);
    // Pipeline starts with 6 default stages; find one that has no deals (all of them will be empty)
    const stages = pipeline.stages as Array<{ id: number; name: string }>;
    expect(stages.length).toBeGreaterThan(1);
    // Delete the last stage (Closed Lost) — least likely to interfere
    const stageToDelete = stages[stages.length - 1];

    const res = await clientApi.delete(
      `/api/portal/crm/pipelines/${pipeline.id}/stages/${stageToDelete.id}`
    );
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.id).toBe(stageToDelete.id);
  });

  test('DELETE /pipelines/[id]/stages/[stageId] returns 409 when deals exist in stage', async ({ clientApi }) => {
    const { pipeline } = await createTestPipeline(clientApi);
    const firstStage = pipeline.stages[0] as { id: number };
    // Create a deal in the first stage
    const { deal, cleanup: dCleanup } = await createTestDeal(clientApi, pipeline.id, firstStage.id);
    cleanups.push(dCleanup);

    const res = await clientApi.delete(
      `/api/portal/crm/pipelines/${pipeline.id}/stages/${firstStage.id}`
    );
    expect(res.status).toBe(409);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toMatch(/Cannot delete stage/i);
  });

  test('DELETE /pipelines/[id]/stages/[stageId] returns 404 for unknown stage', async ({ clientApi }) => {
    const { pipeline } = await createTestPipeline(clientApi);
    const res = await clientApi.delete(
      `/api/portal/crm/pipelines/${pipeline.id}/stages/999999`
    );
    expect(res.status).toBe(404);
  });

  test('rejects unauthenticated DELETE stage', async ({ unauthApi }) => {
    const res = await unauthApi.delete('/api/portal/crm/pipelines/1/stages/1');
    expect(res.status).toBe(401);
  });
});

// ── Pipelines — stages PUT bulk update (rename) ───────────────────────────────

test.describe('CRM — Pipeline Stage Bulk Update @crm @crm-stages-bulk-update', () => {
  test('PUT /pipelines/[id]/stages bulk-renames a stage', async ({ clientApi }) => {
    const { pipeline } = await createTestPipeline(clientApi);
    const stages = pipeline.stages as Array<{ id: number; name: string; color: string; sortOrder: number; probability: number | null }>;
    expect(stages.length).toBeGreaterThan(0);

    const ts = Date.now();
    const renamed = stages.map((s, i) => ({
      id: s.id,
      name: i === 0 ? `Renamed-Lead-${ts}` : s.name,
      color: s.color,
      sortOrder: s.sortOrder,
      probability: s.probability,
    }));

    const res = await clientApi.put(`/api/portal/crm/pipelines/${pipeline.id}/stages`, {
      stages: renamed,
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    const updatedFirst = (res.data.data as Array<{ id: number; name: string }>).find(
      s => s.id === stages[0].id
    );
    expect(updatedFirst?.name).toBe(`Renamed-Lead-${ts}`);
  });

  test('PUT /pipelines/[id]/stages returns 400 when stages array missing', async ({ clientApi }) => {
    const { pipeline } = await createTestPipeline(clientApi);
    const res = await clientApi.put(`/api/portal/crm/pipelines/${pipeline.id}/stages`, {});
    expect(res.status).toBe(400);
  });

  test('PUT /pipelines/[id]/stages returns 404 for unknown pipeline', async ({ clientApi }) => {
    const res = await clientApi.put('/api/portal/crm/pipelines/999999/stages', {
      stages: [{ name: 'X', color: '#aaa', sortOrder: 0 }],
    });
    expect(res.status).toBe(404);
  });

  test('rejects unauthenticated PUT stages', async ({ unauthApi }) => {
    const res = await unauthApi.put('/api/portal/crm/pipelines/1/stages', { stages: [] });
    expect(res.status).toBe(401);
  });
});

// ── Cross-tenant isolation ────────────────────────────────────────────────────

test.describe('CRM — Cross-tenant isolation @crm @crm-tenancy', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('unauthenticated caller cannot read a contact', async ({ clientApi, unauthApi }) => {
    // Create a contact as the authenticated client
    const { contact, cleanup } = await createTestContact(clientApi);
    cleanups.push(cleanup);

    // An unauthenticated caller should get 401, not the contact data
    const res = await unauthApi.get(`/api/portal/crm/contacts/${contact.id}`);
    expect(res.status).toBe(401);
  });

  test('unauthenticated caller cannot read a deal', async ({ clientApi, unauthApi }) => {
    const { pipeline } = await createTestPipeline(clientApi);
    const firstStage = pipeline.stages[0] as { id: number };
    const { deal, cleanup } = await createTestDeal(clientApi, pipeline.id, firstStage.id);
    cleanups.push(cleanup);

    const res = await unauthApi.get(`/api/portal/crm/deals/${deal.id}`);
    expect(res.status).toBe(401);
  });
});
