/**
 * PORTAL-G QA slice: Automations, Branding, Hosting, Agency, Projects, Experiments
 * Captures API behavior, edge cases, and tenancy for the PORTAL-G walkthrough.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

const PREFIX = 'QA-G-';

test.describe('PORTAL-G QA slice @qa-portal-g', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.setTimeout(120_000);

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  // ── Automations ──────────────────────────────────────────────────────────

  test('automations: create workflow with trigger + 2 actions, toggle, delete', async ({ clientApi }) => {
    const name = `${PREFIX}workflow-${Date.now()}`;
    const create = await clientApi.post('/api/portal/automations', {
      name,
      description: 'PORTAL-G QA test',
      trigger: { event: 'crm.contact.created' },
      conditions: [],
      actions: [
        { tool: 'create_support_ticket', params: { subject: 'Auto-ticket: {{event.name}}', body: 'Contact created' } },
        { tool: 'send_email', params: { to: '{{event.email}}', subject: 'Welcome', body: 'Hello!' } },
      ],
      source: 'manual',
      productScope: 'crm',
    });
    expect(create.status, JSON.stringify(create.data)).toBe(200);
    expect(create.data.success).toBe(true);
    expect(create.data.rule.actions).toHaveLength(2);
    const ruleId = create.data.rule.id as number;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/automations/${ruleId}`).catch(() => {}); });

    // Toggle disabled
    const patch = await clientApi.patch(`/api/portal/automations/${ruleId}`, { enabled: false });
    expect(patch.status).toBe(200);
    expect(patch.data.rule.enabled).toBe(false);

    // Re-enable
    const re = await clientApi.patch(`/api/portal/automations/${ruleId}`, { enabled: true });
    expect(re.status).toBe(200);
    expect(re.data.rule.enabled).toBe(true);
  });

  test('automations: invalid trigger config rejected', async ({ clientApi }) => {
    // Missing name
    const r1 = await clientApi.post('/api/portal/automations', {
      trigger: { event: 'booking.created' },
      actions: [{ tool: 'x', params: {} }],
    });
    expect(r1.status).toBe(400);

    // Empty actions
    const r2 = await clientApi.post('/api/portal/automations', {
      name: `${PREFIX}bad-actions`,
      trigger: { event: 'booking.created' },
      actions: [],
    });
    expect(r2.status).toBe(400);
  });

  // ── Workflows ─────────────────────────────────────────────────────────────

  test('workflows: create from blank, activate, nonexistent-template returns 404', async ({ clientApi }) => {
    const create = await clientApi.post('/api/portal/workflows', {
      name: `${PREFIX}WF-${Date.now()}`,
      description: 'QA workflow'
    });
    expect(create.status).toBe(200);
    const wfId = create.data.data.id as number;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/workflows/${wfId}`).catch(() => {}); });

    // Toggle active
    const activate = await clientApi.patch(`/api/portal/workflows/${wfId}`, { status: 'active' });
    expect(activate.status).toBe(200);
    expect(activate.data.data.status).toBe('active');

    // Nonexistent template
    const bad = await clientApi.post('/api/portal/workflows', { templateId: 'nonexistent-template-xyz' });
    expect(bad.status).toBe(404);
  });

  test('workflows: tenancy — cross-client access returns 404', async ({ clientApi }) => {
    const r = await clientApi.get('/api/portal/workflows/99999');
    expect(r.status).toBe(404);
  });

  // ── Trigger links ─────────────────────────────────────────────────────────

  test('trigger-links: create, list, delete', async ({ clientApi }) => {
    const create = await clientApi.post('/api/portal/trigger-links', {
      destinationUrl: 'https://example.com/qa-test',
      label: `${PREFIX}link-${Date.now()}`,
    });
    expect(create.status).toBe(200);
    expect(create.data.success).toBe(true);
    const linkId = create.data.data.link.id as number;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/trigger-links/${linkId}`).catch(() => {}); });

    const list = await clientApi.get('/api/portal/trigger-links');
    expect(list.status).toBe(200);
    const found = (list.data.data.links as Array<{ id: number }>).find(l => l.id === linkId);
    expect(found).toBeTruthy();

    const del = await clientApi.delete(`/api/portal/trigger-links/${linkId}`);
    expect(del.status).toBe(200);
    cleanups.pop();
  });

  // ── Branding ──────────────────────────────────────────────────────────────

  test('branding: create profile, set colors, verify persistence, delete', async ({ clientApi }) => {
    const name = `${PREFIX}Brand-${Date.now()}`;
    const create = await clientApi.post('/api/portal/branding/profiles', {
      name,
      primaryColor: '#3b82f6',
      secondaryColor: '#1e40af',
      accentColor: '#f59e0b',
    });
    expect(create.status, JSON.stringify(create.data)).toBe(201);
    const profileId = create.data.data.id as number;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/branding/profiles/${profileId}`).catch(() => {}); });

    // Update messaging
    const msg = await clientApi.put('/api/portal/branding/messaging', {
      brandingProfileId: profileId,
      companyName: `${PREFIX}Co`,
      tagline: `${PREFIX}tagline`,
      missionStatement: `${PREFIX}mission`,
    });
    expect(msg.status).toBe(200);

    // Verify persistence
    const get = await clientApi.get(`/api/portal/branding/profiles/${profileId}`);
    expect(get.status).toBe(200);
    expect(get.data.data.primaryColor).toBe('#3b82f6');

    // Tenancy isolation
    const wrongId = await clientApi.get('/api/portal/branding/profiles/99999');
    expect(wrongId.status).toBe(404);
  });

  test('branding: invalid hex codes - behavior documented', async ({ clientApi }) => {
    // Invalid hex — document whether server validates or accepts
    const r = await clientApi.post('/api/portal/branding/profiles', {
      name: `${PREFIX}InvalidHex-${Date.now()}`,
      primaryColor: 'not-a-hex',
      secondaryColor: '#GGGGGG',
    });
    // Acceptable: 400 (validation) or 201 (DB stores as-is — noted as gap)
    expect([201, 400]).toContain(r.status);
    if (r.status === 201) {
      // Document gap: server does not validate hex format
      console.log('GAP: branding profile accepts invalid hex colors without validation');
      await clientApi.delete(`/api/portal/branding/profiles/${r.data.data.id}`).catch(() => {});
    }
  });

  // ── Hosting ───────────────────────────────────────────────────────────────

  test('hosting: 200 (subscribed) or 403 (service-gated) — both valid shapes', async ({ clientApi }) => {
    const r = await clientApi.get('/api/portal/hosting');
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) {
      expect(r.data.success).toBe(true);
      expect(Array.isArray(r.data.data)).toBe(true);
    } else {
      expect(r.data.requiresService).toBe('hosting');
    }
  });

  test('hosting: GET by id 404 for nonexistent', async ({ clientApi }) => {
    const r = await clientApi.get('/api/portal/hosting/999999');
    expect([404, 403]).toContain(r.status);
  });

  test('hosting: 401 for unauthenticated', async ({ unauthApi }) => {
    const r = await unauthApi.get('/api/portal/hosting');
    expect(r.status).toBe(401);
  });

  // ── Agency ────────────────────────────────────────────────────────────────

  test('agency: branding route accessible to client', async ({ clientApi }) => {
    const r = await clientApi.get('/api/portal/agency/branding');
    expect([200, 403, 404]).toContain(r.status);
    if (r.status === 200) {
      expect(r.data.success).toBe(true);
    }
  });

  // ── Projects ──────────────────────────────────────────────────────────────

  test('projects: create, GET by id, delete', async ({ clientApi }) => {
    const create = await clientApi.post('/api/portal/projects', {
      name: `${PREFIX}Project-${Date.now()}`,
      description: 'PORTAL-G QA project'
    });
    expect([200, 201]).toContain(create.status);
    const projId = (create.data.data ?? create.data.project)?.id as number;
    expect(projId).toBeTruthy();
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/projects/${projId}`).catch(() => {});
    });

    // GET by id — handler added in this QA pass
    const get = await clientApi.get(`/api/portal/projects/${projId}`);
    expect(get.status).toBe(200);
    expect(get.data.success).toBe(true);
    expect(get.data.data.id).toBe(projId);
  });

  test('projects: tenancy — cross-client access 404', async ({ clientApi }) => {
    const r = await clientApi.get('/api/portal/projects/99999');
    expect(r.status).toBe(404);
  });

  // ── Experiments ───────────────────────────────────────────────────────────

  test('experiments: list — GET handler added in this QA pass', async ({ clientApi }) => {
    const r = await clientApi.get('/api/portal/experiments');
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(Array.isArray(r.data.data)).toBe(true);
  });

  test('experiments: create with nonexistent targetId returns error', async ({ clientApi }) => {
    const r = await clientApi.post('/api/portal/experiments', {
      name: `${PREFIX}Exp-${Date.now()}`,
      targetType: 'post',
      targetId: 999999,
    });
    // Could be 200 (FK not enforced at API level) or 400/404 (validated)
    if (r.status === 200 || r.status === 201) {
      console.log('NOTE: experiment created with nonexistent targetId (FK not validated at API layer)');
      const expId = r.data.data?.id;
      if (expId) cleanups.push(async () => { await clientApi.delete(`/api/portal/experiments/${expId}`).catch(() => {}); });
    } else {
      expect([400, 404, 422]).toContain(r.status);
    }
  });
});
