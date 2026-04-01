/**
 * Portal Surveys API E2E Tests
 *
 * Tests for /api/portal/surveys.
 * The surveys feature is service-gated — test client may or may not have access.
 * Tests are structured to pass in both scenarios.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

/** Attempt to create a survey, returns null if service-gated */
async function tryCreateSurvey(api: { post: Function; delete: Function }) {
  const ts = Date.now();
  const res = await api.post('/api/portal/surveys', {
    title: `Test Survey ${ts}`,
    description: 'E2E test survey',
    fields: [
      { id: 'q1', type: 'text', label: 'Your name', required: true },
      { id: 'q2', type: 'rating', label: 'Rate us', required: false },
    ],
  });
  if (res.status === 403) return null;
  if (!res.data?.success) throw new Error(`Failed to create survey: ${res.data?.message}`);
  const survey = res.data.data;
  return {
    survey,
    cleanup: async () => { await api.delete(`/api/portal/surveys/${survey.id}`).catch(() => {}); },
  };
}

test.describe('Portal Surveys — Service Gate @surveys', () => {
  test('returns 403 with upsell info when no subscription', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/surveys');
    if (res.status === 403) {
      expect(res.data.success).toBe(false);
      expect(res.data.message).toContain('subscription');
      expect(res.data).toHaveProperty('requiresService');
      expect(res.data).toHaveProperty('upsellUrl');
    } else {
      // Client has subscription — just verify it returns data
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
    }
  });

  test('rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/surveys');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Surveys — CRUD @surveys @critical', () => {
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

  test('POST creates a survey with fields', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await tryCreateSurvey(clientApi);
    expect(result).toBeTruthy();
    cleanups.push(result!.cleanup);

    const { survey } = result!;
    expect(survey).toHaveProperty('id');
    expect(survey.title).toContain('Test Survey');
    expect(survey).toHaveProperty('slug');
    expect(Array.isArray(survey.fields)).toBe(true);
    expect(survey.fields.length).toBe(2);
  });

  test('GET /surveys lists surveys', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await tryCreateSurvey(clientApi);
    if (result) cleanups.push(result.cleanup);

    const res = await clientApi.get('/api/portal/surveys');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /surveys/[id] returns survey detail', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await tryCreateSurvey(clientApi);
    expect(result).toBeTruthy();
    cleanups.push(result!.cleanup);

    const res = await clientApi.get(`/api/portal/surveys/${result!.survey.id}`);
    expect(res.status).toBe(200);
    expect(res.data.data).toHaveProperty('fields');
    expect(res.data.data).toHaveProperty('slug');
  });

  test('PUT /surveys/[id] updates survey', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await tryCreateSurvey(clientApi);
    expect(result).toBeTruthy();
    cleanups.push(result!.cleanup);

    const res = await clientApi.put(`/api/portal/surveys/${result!.survey.id}`, {
      title: 'Updated Survey Title',
      status: 'active',
      color: '#ef4444',
      thankYouTitle: 'Thanks!',
      thankYouMessage: 'We appreciate your feedback.',
    });
    expect(res.status).toBe(200);

    const verify = await clientApi.get(`/api/portal/surveys/${result!.survey.id}`);
    expect(verify.data.data.title).toBe('Updated Survey Title');
    expect(verify.data.data.status).toBe('active');
  });

  test('PUT /surveys/[id] updates fields and settings', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await tryCreateSurvey(clientApi);
    expect(result).toBeTruthy();
    cleanups.push(result!.cleanup);

    await clientApi.put(`/api/portal/surveys/${result!.survey.id}`, {
      fields: [
        { id: 'q1', type: 'text', label: 'Full Name', required: true },
        { id: 'q2', type: 'email', label: 'Email', required: true },
        { id: 'q3', type: 'select', label: 'Dept', required: false, options: ['Sales', 'Support'] },
      ],
      requireEmail: true,
      allowMultiple: false,
      maxResponses: 100,
    });

    const verify = await clientApi.get(`/api/portal/surveys/${result!.survey.id}`);
    expect(verify.data.data.fields.length).toBe(3);
    expect(verify.data.data.requireEmail).toBe(true);
  });

  test('DELETE /surveys/[id] removes a survey', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await tryCreateSurvey(clientApi);
    expect(result).toBeTruthy();

    const res = await clientApi.delete(`/api/portal/surveys/${result!.survey.id}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
  });

  test('POST rejects missing title', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const res = await clientApi.post('/api/portal/surveys', { title: '' });
    expect(res.status).toBe(400);
  });

  test('GET /surveys/[id]/responses returns responses', async ({ clientApi }) => {
    test.skip(!hasAccess, 'No surveys subscription');
    const result = await tryCreateSurvey(clientApi);
    expect(result).toBeTruthy();
    cleanups.push(result!.cleanup);

    const res = await clientApi.get(`/api/portal/surveys/${result!.survey.id}/responses`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });
});
