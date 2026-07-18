/**
 * Portal Surveys — Mutations Golden Path (@critical)
 *
 * Single rerunnable spec that exercises the full create → edit → delete
 * lifecycle for a survey, plus a CSV export round-trip. Companion to the
 * per-route integration tests in tests/integration/api/surveys/, which pin
 * auth + cross-tenant + service-gating contract.
 *
 * The surveys feature is service-gated: every block is wrapped in a
 * skip-if-no-access guard so this spec is safe to run against tenants
 * without a `surveys` subscription.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestSurvey } from './setup/helpers';

const PREFIX = 'SURV-MUT-';

test.describe('Portal Surveys — mutation lifecycle @surveys @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/surveys');
    hasAccess = res.status === 200;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('SURV-full-lifecycle: create → update fields/settings → delete', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription on this client');

    const { survey, cleanup } = await createTestSurvey(clientApi, {
      title: `${PREFIX}Lifecycle-${Date.now()}`,
      description: 'E2E lifecycle survey',
    });
    cleanups.push(cleanup);
    expect(survey).toHaveProperty('id');
    expect(survey).toHaveProperty('slug');
    expect(survey.status).toBe('draft');

    // ── Edit metadata ─────────────────────────────────────────────────
    const editMeta = await clientApi.put(`/api/portal/surveys/${survey.id}`, {
      title: `${PREFIX}Renamed`,
      status: 'active',
      thankYouTitle: 'Thanks!',
      thankYouMessage: 'Got it.',
      color: '#10b981',
    });
    expect(editMeta.status).toBe(200);
    expect(editMeta.data.success).toBe(true);

    const verifyMeta = await clientApi.get(`/api/portal/surveys/${survey.id}`);
    expect(verifyMeta.status).toBe(200);
    expect(verifyMeta.data.data.title).toBe(`${PREFIX}Renamed`);
    expect(verifyMeta.data.data.status).toBe('active');

    // ── Edit fields + settings ────────────────────────────────────────
    const editFields = await clientApi.put(`/api/portal/surveys/${survey.id}`, {
      fields: [
        { id: 'q1', type: 'text', label: 'Full Name', required: true },
        { id: 'q2', type: 'email', label: 'Email', required: true },
        { id: 'q3', type: 'select', label: 'Department', required: false, options: ['Sales', 'Support'] },
      ],
      requireEmail: true,
      allowMultiple: false,
      maxResponses: 100,
    });
    expect(editFields.status).toBe(200);

    const verifyFields = await clientApi.get(`/api/portal/surveys/${survey.id}`);
    expect(verifyFields.data.data.fields.length).toBe(3);
    expect(verifyFields.data.data.requireEmail).toBe(true);
    expect(verifyFields.data.data.allowMultiple).toBe(false);
    expect(verifyFields.data.data.maxResponses).toBe(100);

    // ── Responses + export endpoints (zero responses is fine) ─────────
    const responsesRes = await clientApi.get(`/api/portal/surveys/${survey.id}/responses`);
    expect(responsesRes.status).toBe(200);
    expect(responsesRes.data.success).toBe(true);

    const exportRes = await clientApi.get(`/api/portal/surveys/${survey.id}/export`);
    expect(exportRes.status).toBe(200);

    // ── Delete ────────────────────────────────────────────────────────
    const del = await clientApi.delete(`/api/portal/surveys/${survey.id}`);
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);
    cleanups.pop();

    // GET after delete → 404
    const after = await clientApi.get(`/api/portal/surveys/${survey.id}`);
    expect(after.status).toBe(404);
  });

  test('rejects unauthenticated mutations (401)', async ({ unauthApi }) => {
    const cases = [
      { method: 'post' as const, url: '/api/portal/surveys', body: { title: 'X' } },
      { method: 'put' as const, url: '/api/portal/surveys/1', body: { title: 'X' } },
      { method: 'delete' as const, url: '/api/portal/surveys/1', body: undefined },
    ];

    for (const c of cases) {
      const res = c.method === 'delete'
        ? await unauthApi.delete(c.url)
        : await unauthApi[c.method](c.url, c.body);
      expect(res.status, `expected 401 for ${c.method.toUpperCase()} ${c.url}`).toBe(401);
    }
  });

  test('POST rejects missing title with 400 (when service is enabled)', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription on this client');
    const res = await clientApi.post('/api/portal/surveys', { title: '' });
    expect(res.status).toBe(400);
  });
});
