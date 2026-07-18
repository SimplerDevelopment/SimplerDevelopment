/**
 * Surveys E2E Coverage — gaps-and-missing backlog
 *
 * Covers cards from the "Surveys E2E Audit" To Test lane that had no spec.
 * Each test is independent, cleans up its own data, and uses Date.now()
 * for unique identifiers.
 *
 * Fixture map:
 *   clientApi  — portal client@example.com (has surveys subscription)
 *   adminApi   — admin@example.com
 *   unauthApi  — no session
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestSurvey } from './setup/helpers';

const TAG = '@surveys @coverage';

// ── Pre-flight: check if surveys subscription is enabled ──────────────────────

test.describe(`Surveys Coverage ${TAG}`, () => {
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

  // ── Webhook CRUD + delivery audit log ─────────────────────────────────────

  test.describe('Webhook CRUD + delivery audit log', () => {
    test('POST creates a webhook, GET lists it, PUT updates it, GET /deliveries returns list, DELETE removes it', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Webhooks-${Date.now()}`,
        status: 'active',
      });
      cleanups.push(cleanup);

      // POST — create
      const create = await clientApi.post(`/api/portal/surveys/${survey.id}/webhooks`, {
        url: 'https://webhook.site/test-e2e',
        events: ['response.submitted'],
        enabled: true,
      });
      expect(create.status).toBe(201);
      expect(create.data.success).toBe(true);
      const hook = create.data.data;
      expect(hook).toHaveProperty('id');
      expect(hook.url).toBe('https://webhook.site/test-e2e');
      // Full secret returned once on creation
      expect(typeof hook.secret).toBe('string');
      expect(hook.secret.length).toBeGreaterThan(6);

      // GET collection — lists our hook
      const list = await clientApi.get(`/api/portal/surveys/${survey.id}/webhooks`);
      expect(list.status).toBe(200);
      expect(list.data.success).toBe(true);
      const found = list.data.data.find((h: { id: number }) => h.id === hook.id);
      expect(found).toBeTruthy();
      // Secret is redacted on list
      expect(found.secret).toMatch(/…$/);

      // GET single
      const single = await clientApi.get(`/api/portal/surveys/${survey.id}/webhooks/${hook.id}`);
      expect(single.status).toBe(200);
      expect(single.data.data.id).toBe(hook.id);
      expect(single.data.data.secret).toMatch(/…$/);

      // PUT — update
      const update = await clientApi.put(`/api/portal/surveys/${survey.id}/webhooks/${hook.id}`, {
        enabled: false,
      });
      expect(update.status).toBe(200);
      expect(update.data.success).toBe(true);
      expect(update.data.data.enabled).toBe(false);

      // GET /deliveries — no deliveries yet, but endpoint must exist and return 200
      const deliveries = await clientApi.get(
        `/api/portal/surveys/${survey.id}/webhooks/${hook.id}/deliveries`
      );
      expect(deliveries.status).toBe(200);
      expect(deliveries.data.success).toBe(true);
      expect(Array.isArray(deliveries.data.data)).toBe(true);

      // DELETE
      const del = await clientApi.delete(`/api/portal/surveys/${survey.id}/webhooks/${hook.id}`);
      expect(del.status).toBe(200);
      expect(del.data.success).toBe(true);

      // Verify gone
      const after = await clientApi.get(`/api/portal/surveys/${survey.id}/webhooks/${hook.id}`);
      expect(after.status).toBe(404);
    });

    test('POST /webhooks rejects invalid URL', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Webhook-Bad-${Date.now()}`,
      });
      cleanups.push(cleanup);

      const res = await clientApi.post(`/api/portal/surveys/${survey.id}/webhooks`, {
        url: 'not-a-url',
      });
      expect(res.status).toBe(400);
    });

    test('POST /webhooks rejects internal URL (SSRF guard)', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Webhook-SSRF-${Date.now()}`,
      });
      cleanups.push(cleanup);

      const res = await clientApi.post(`/api/portal/surveys/${survey.id}/webhooks`, {
        url: 'http://169.254.169.254/latest/meta-data',
      });
      expect(res.status).toBe(400);
    });

    test('unauthenticated cannot access webhooks', async ({ unauthApi }) => {
      const res = await unauthApi.get('/api/portal/surveys/1/webhooks');
      expect(res.status).toBe(401);
    });
  });

  // ── Email sequence CRUD ───────────────────────────────────────────────────

  test.describe('Email sequence CRUD', () => {
    test('POST creates a sequence, GET lists it, PUT updates delay/condition, DELETE removes it', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-EmailSeq-${Date.now()}`,
      });
      cleanups.push(cleanup);

      // POST create
      const create = await clientApi.post(
        `/api/portal/surveys/${survey.id}/email-sequences`,
        {
          subject: 'Thank you for completing our survey!',
          bodyHtml: '<p>We appreciate your feedback.</p>',
          delayHours: 24,
          conditionField: null,
          conditionValue: null,
          enabled: true,
        }
      );
      expect(create.status).toBe(201);
      expect(create.data.success).toBe(true);
      const seq = create.data.data;
      expect(seq).toHaveProperty('id');
      expect(seq.subject).toBe('Thank you for completing our survey!');
      expect(seq.delayHours).toBe(24);

      // GET collection
      const list = await clientApi.get(`/api/portal/surveys/${survey.id}/email-sequences`);
      expect(list.status).toBe(200);
      expect(list.data.success).toBe(true);
      const found = list.data.data.find((s: { id: number }) => s.id === seq.id);
      expect(found).toBeTruthy();

      // PUT update delay and condition
      const update = await clientApi.put(
        `/api/portal/surveys/${survey.id}/email-sequences/${seq.id}`,
        {
          delayHours: 48,
          conditionField: 'q1',
          conditionValue: 'Yes',
        }
      );
      expect(update.status).toBe(200);
      expect(update.data.success).toBe(true);
      expect(update.data.data.delayHours).toBe(48);
      expect(update.data.data.conditionField).toBe('q1');
      expect(update.data.data.conditionValue).toBe('Yes');

      // DELETE
      const del = await clientApi.delete(
        `/api/portal/surveys/${survey.id}/email-sequences/${seq.id}`
      );
      expect(del.status).toBe(200);
      expect(del.data.success).toBe(true);

      // Verify gone — list should no longer include it
      const after = await clientApi.get(`/api/portal/surveys/${survey.id}/email-sequences`);
      const stillThere = after.data.data.find((s: { id: number }) => s.id === seq.id);
      expect(stillThere).toBeUndefined();
    });

    test('POST /email-sequences rejects missing subject', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-EmailSeq-Bad-${Date.now()}`,
      });
      cleanups.push(cleanup);

      const res = await clientApi.post(
        `/api/portal/surveys/${survey.id}/email-sequences`,
        { bodyHtml: '<p>body</p>', delayHours: 0 }
      );
      expect(res.status).toBe(400);
    });

    test('unauthenticated cannot access email sequences', async ({ unauthApi }) => {
      const res = await unauthApi.get('/api/portal/surveys/1/email-sequences');
      expect(res.status).toBe(401);
    });
  });

  // ── AI summary GET (no responses = 400 on POST; GET before generate = null) ──

  test.describe('AI summary endpoint structure', () => {
    test('GET /ai-summary returns { success: true, data: null } when no summary exists', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-AISummary-${Date.now()}`,
      });
      cleanups.push(cleanup);

      const res = await clientApi.get(`/api/portal/surveys/${survey.id}/ai-summary`);
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data).toBeNull();
    });

    test('POST /ai-summary returns 400 when no responses exist', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-AISummary-NoResp-${Date.now()}`,
      });
      cleanups.push(cleanup);

      const res = await clientApi.post(`/api/portal/surveys/${survey.id}/ai-summary`, {});
      // Expecting 400 (no responses) or 402 (no AI credits) — both are valid
      // The implementation checks responses first before the plan gate on POST
      expect([400, 402]).toContain(res.status);
    });

    test('unauthenticated cannot access AI summary', async ({ unauthApi }) => {
      const res = await unauthApi.get('/api/portal/surveys/1/ai-summary');
      expect(res.status).toBe(401);
    });
  });

  // ── Partial response upsert ───────────────────────────────────────────────

  test.describe('Partial response upsert persists in-progress answers', () => {
    test('POST saves partial then GET returns saved answers, second POST updates them', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      // Create an active survey — partial route requires status=active
      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Partial-${Date.now()}`,
      });
      cleanups.push(cleanup);
      // Activate the survey
      await clientApi.put(`/api/portal/surveys/${survey.id}`, { status: 'active' });

      const sessionId = `test-session-${Date.now()}`;

      // POST — save partial
      const save = await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}/partial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          answers: { q1: 'Partial answer' },
          lastPage: 0,
          respondentEmail: null,
        }),
      });
      expect(save.status).toBe(200);
      const saveJson = await save.json();
      expect(saveJson.success).toBe(true);

      // GET — retrieve saved answers
      const get = await fetch(
        `${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}/partial?sessionId=${sessionId}`
      );
      expect(get.status).toBe(200);
      const getJson = await get.json();
      expect(getJson.success).toBe(true);
      expect(getJson.data).not.toBeNull();
      expect(getJson.data.answers.q1).toBe('Partial answer');
      expect(getJson.data.lastPage).toBe(0);

      // POST again — update answers
      const update = await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}/partial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          answers: { q1: 'Updated answer', q2: 5 },
          lastPage: 1,
        }),
      });
      expect(update.status).toBe(200);

      // Verify updated
      const get2 = await fetch(
        `${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}/partial?sessionId=${sessionId}`
      );
      const get2Json = await get2.json();
      expect(get2Json.data.answers.q1).toBe('Updated answer');
      expect(get2Json.data.answers.q2).toBe(5);
      expect(get2Json.data.lastPage).toBe(1);
    });

    test('POST /partial rejects missing sessionId', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Partial-BadSess-${Date.now()}`,
      });
      cleanups.push(cleanup);
      await clientApi.put(`/api/portal/surveys/${survey.id}`, { status: 'active' });

      const res = await fetch(`${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}/partial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: { q1: 'test' } }),
      });
      expect(res.status).toBe(400);
    });

    test('GET /partial returns data: null for unknown sessionId (no error)', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Partial-NullSess-${Date.now()}`,
      });
      cleanups.push(cleanup);
      await clientApi.put(`/api/portal/surveys/${survey.id}`, { status: 'active' });

      const res = await fetch(
        `${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}/partial?sessionId=nonexistent-session-${Date.now()}`
      );
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data).toBeNull();
    });
  });

  // ── Public aggregate results page ─────────────────────────────────────────

  test.describe('Public aggregate results page', () => {
    test('GET /results returns 404 when publishResults=false (default)', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Results-Private-${Date.now()}`,
      });
      cleanups.push(cleanup);
      await clientApi.put(`/api/portal/surveys/${survey.id}`, { status: 'active', publishResults: false });

      const res = await fetch(
        `${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}/results`
      );
      expect(res.status).toBe(404);
    });

    test('GET /results returns 200 with aggregated data when publishResults=true', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Results-Public-${Date.now()}`,
      });
      cleanups.push(cleanup);

      // Enable publishResults
      const update = await clientApi.put(`/api/portal/surveys/${survey.id}`, {
        status: 'active',
        publishResults: true,
      });
      expect(update.status).toBe(200);

      const res = await fetch(
        `${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}/results`
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      // Aggregate data shape: surveyTitle, totalResponses, questions
      expect(json.data).toHaveProperty('surveyTitle');
      expect(json.data).toHaveProperty('totalResponses');
      expect(json.data).toHaveProperty('questions');
      // Zero responses is fine — totalResponses should be 0
      expect(typeof json.data.totalResponses).toBe('number');
    });
  });

  // ── PDF completion certificate ────────────────────────────────────────────

  test.describe('PDF completion certificate', () => {
    test('GET /certificate returns 404 when certificateEnabled=false', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Cert-Disabled-${Date.now()}`,
      });
      cleanups.push(cleanup);
      await clientApi.put(`/api/portal/surveys/${survey.id}`, {
        status: 'active',
        certificateEnabled: false,
      });

      const res = await fetch(
        `${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}/certificate?responseId=1`
      );
      expect(res.status).toBe(404);
    });

    test('GET /certificate with certificateEnabled=true and valid responseId returns PDF', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const ts = Date.now();
      // Create an active survey with certificate enabled and submit a response
      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Cert-${ts}`,
        fields: [
          { id: 'q1', type: 'text', label: 'Your name', required: true },
        ],
      });
      cleanups.push(cleanup);

      await clientApi.put(`/api/portal/surveys/${survey.id}`, {
        status: 'active',
        certificateEnabled: true,
      });

      // Submit a response so we get a responseId
      const submitRes = await fetch(
        `${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers: { q1: `Cert Tester ${ts}` },
            formName: 'coverage-test',
            name: `Cert Tester ${ts}`,
          }),
        }
      );
      expect(submitRes.status).toBe(201);
      const submitJson = await submitRes.json();
      expect(submitJson.success).toBe(true);
      const responseId = submitJson.data.responseId;
      expect(typeof responseId).toBe('number');
      expect(submitJson.data.certificateEnabled).toBe(true);

      // Fetch the certificate
      const certRes = await fetch(
        `${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}/certificate?responseId=${responseId}`
      );
      expect(certRes.status).toBe(200);
      expect(certRes.headers.get('content-type')).toContain('application/pdf');
    });

    test('GET /certificate with certificateEnabled=true and unknown responseId returns 404', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Cert-Unknown-${Date.now()}`,
      });
      cleanups.push(cleanup);
      await clientApi.put(`/api/portal/surveys/${survey.id}`, {
        status: 'active',
        certificateEnabled: true,
      });

      const res = await fetch(
        `${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}/certificate?responseId=999999`
      );
      expect(res.status).toBe(404);
    });
  });

  // ── closesAt enforcement ──────────────────────────────────────────────────

  test.describe('closesAt enforcement', () => {
    test('submission rejected after survey closesAt timestamp', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const ts = Date.now();
      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-ClosesAt-${ts}`,
        fields: [{ id: 'q1', type: 'text', label: 'Name', required: true }],
      });
      cleanups.push(cleanup);

      // Set closesAt in the past
      const past = new Date(Date.now() - 60_000).toISOString();
      await clientApi.put(`/api/portal/surveys/${survey.id}`, {
        status: 'active',
        closesAt: past,
      });

      // Public GET should be blocked
      const getRes = await fetch(
        `${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}`
      );
      expect(getRes.status).toBe(403);
      const getJson = await getRes.json();
      expect(getJson.success).toBe(false);

      // POST submit should be blocked too
      const submitRes = await fetch(
        `${process.env.BASE_URL || 'http://localhost:3000'}/api/surveys/${survey.slug}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers: { q1: 'Late answer' },
            formName: 'coverage-test',
          }),
        }
      );
      expect(submitRes.status).toBe(403);
    });
  });

  // ── maxResponses cap ──────────────────────────────────────────────────────

  test.describe('maxResponses cap', () => {
    test('submission rejected when responseCount >= maxResponses', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const ts = Date.now();
      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-MaxResp-${ts}`,
        fields: [{ id: 'q1', type: 'text', label: 'Name', required: true }],
      });
      cleanups.push(cleanup);

      // Set maxResponses=1, activate
      await clientApi.put(`/api/portal/surveys/${survey.id}`, {
        status: 'active',
        maxResponses: 1,
      });

      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

      // First submission should succeed
      const first = await fetch(`${baseUrl}/api/surveys/${survey.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: { q1: `First ${ts}` },
          formName: 'coverage-test',
        }),
      });
      expect(first.status).toBe(201);

      // Second submission should be rejected
      const second = await fetch(`${baseUrl}/api/surveys/${survey.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: { q1: `Second ${ts}` },
          formName: 'coverage-test',
        }),
      });
      expect(second.status).toBe(403);
      const secondJson = await second.json();
      expect(secondJson.success).toBe(false);
    });
  });

  // ── allowMultiple=false blocks same-email second submission ───────────────

  test.describe('allowMultiple=false blocks duplicate email submissions', () => {
    test('second submission from same email returns 403 when allowMultiple=false', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const ts = Date.now();
      const email = `dup-test-${ts}@example.com`;

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-AllowMultiple-${ts}`,
        fields: [{ id: 'q1', type: 'text', label: 'Name', required: true }],
      });
      cleanups.push(cleanup);

      // Enable the flag + activate
      await clientApi.put(`/api/portal/surveys/${survey.id}`, {
        status: 'active',
        allowMultiple: false,
      });

      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

      // First submission — should succeed
      const first = await fetch(`${baseUrl}/api/surveys/${survey.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: { q1: `First submission ${ts}` },
          email,
          formName: 'coverage-test',
        }),
      });
      expect(first.status).toBe(201);
      const firstJson = await first.json();
      expect(firstJson.success).toBe(true);

      // Second submission from same email — should be blocked
      const second = await fetch(`${baseUrl}/api/surveys/${survey.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: { q1: `Second submission ${ts}` },
          email,
          formName: 'coverage-test',
        }),
      });
      expect(second.status).toBe(403);
      const secondJson = await second.json();
      expect(secondJson.success).toBe(false);
    });
  });

  // ── Cross-tenant isolation ────────────────────────────────────────────────

  test.describe('Cross-tenant isolation', () => {
    test('portal GET for own survey returns 200; GET for non-existent/other-tenant survey returns 404', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-XTenant-${Date.now()}`,
      });
      cleanups.push(cleanup);

      // Own survey — accessible
      const own = await clientApi.get(`/api/portal/surveys/${survey.id}`);
      expect(own.status).toBe(200);
      expect(own.data.data.id).toBe(survey.id);

      // A very high numeric ID that almost certainly belongs to no tenant
      const foreign = await clientApi.get('/api/portal/surveys/9999999');
      expect(foreign.status).toBe(404);
    });

    test('portal webhooks for foreign survey return 404', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const res = await clientApi.get('/api/portal/surveys/9999999/webhooks');
      expect(res.status).toBe(404);
    });

    test('portal email-sequences for foreign survey return 404', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const res = await clientApi.get('/api/portal/surveys/9999999/email-sequences');
      expect(res.status).toBe(404);
    });
  });

  // ── Scoring + conditional logic (route-to-CRM) ────────────────────────────

  test.describe('Scoring + conditional logic', () => {
    test('survey with scoring fields computes score on submit (score stored in response)', async ({ clientApi }) => {
      test.skip(!hasAccess, 'No surveys subscription on this client');

      const ts = Date.now();
      const { survey, cleanup } = await createTestSurvey(clientApi, {
        title: `SURV-COV-Score-${ts}`,
        fields: [
          {
            id: 'q1',
            type: 'select',
            label: 'How satisfied are you?',
            required: true,
            options: ['Very satisfied', 'Satisfied', 'Neutral', 'Unsatisfied'],
            scoring: {
              type: 'option_map',
              options: {
                'Very satisfied': 10,
                'Satisfied': 7,
                'Neutral': 4,
                'Unsatisfied': 1,
              },
            },
          },
        ],
      });
      cleanups.push(cleanup);

      await clientApi.put(`/api/portal/surveys/${survey.id}`, { status: 'active' });

      const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
      const submit = await fetch(`${baseUrl}/api/surveys/${survey.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: { q1: 'Very satisfied' },
          formName: 'coverage-test',
        }),
      });
      expect(submit.status).toBe(201);

      // Verify the response was stored with a score by reading responses via portal
      const responses = await clientApi.get(`/api/portal/surveys/${survey.id}/responses`);
      expect(responses.status).toBe(200);
      expect(responses.data.success).toBe(true);
      // Responses are nested at data.responses
      const rows = responses.data.data?.responses;
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBeGreaterThan(0);
      // The latest response should have score=10
      const lastResp = rows[rows.length - 1];
      expect(lastResp.score).toBe(10);
    });
  });

  // ── Fork survey (via MCP — no portal REST endpoint) ───────────────────────
  // The fork feature is implemented only as an MCP tool (surveys_fork), not as
  // a portal REST endpoint. The parentSurveyId column exists in the schema.
  // Testing MCP fork requires bearer + MCP scaffolding — covered by the MCP
  // registry baseline test, not here.

});
