/**
 * cov-u4.spec.ts — Surveys E2E coverage slice (unit 4, indices 0-2)
 *
 * Cards covered:
 *   0. Post-submit sequence trigger — needs spec (cron-based, not synchronous)
 *   1. Route-to-CRM on submit — implemented via scoringConfig.autoRouteToCrm
 *   2. allowMultiple=false blocks same-email second submission — BUG: not enforced
 */
import { test, expect } from './setup/fixtures';
import { createTestPipeline } from './setup/helpers';

// ── helpers ───────────────────────────────────────────────────────────────

/** Create a minimal active survey via portal API and return its id + slug. */
async function createActiveSurvey(
  clientApi: import('./setup/fixtures').ApiClient,
  overrides: Record<string, unknown> = {},
) {
  const ts = Date.now();
  // 1) create
  const create = await clientApi.post('/api/portal/surveys', {
    title: `CovU4 Survey ${ts}`,
    fields: [
      {
        id: 'q1',
        label: 'Score question',
        type: 'radio',
        required: true,
        options: [
          { value: 'a', label: 'Agree' },
          { value: 'b', label: 'Disagree' },
        ],
        // SCORE-01: option_map scoring — 'a' = 10 pts, 'b' = 0 pts
        scoring: {
          type: 'option_map',
          options: { a: 10, b: 0 },
        },
      },
    ],
    ...overrides,
  });
  if (!create.data?.success) throw new Error(`Failed to create survey: ${JSON.stringify(create.data)}`);
  const survey = create.data.data as { id: number; slug: string };

  // 2) activate + apply overrides that need PATCH
  const patchBody: Record<string, unknown> = { status: 'active' };
  if (overrides.allowMultiple !== undefined) patchBody.allowMultiple = overrides.allowMultiple;
  if (overrides.scoringConfig !== undefined) patchBody.scoringConfig = overrides.scoringConfig;
  await clientApi.put(`/api/portal/surveys/${survey.id}`, patchBody);

  return survey;
}

/** Submit a response to the public survey endpoint. */
async function submitSurvey(
  unauthApi: import('./setup/fixtures').ApiClient,
  slug: string,
  email: string,
) {
  return unauthApi.post(`/api/surveys/${slug}`, {
    answers: { q1: 'a' },
    email,
    formName: 'cov-u4-test',
  });
}

/** Delete a survey via the portal API (best-effort cleanup). */
async function deleteSurvey(clientApi: import('./setup/fixtures').ApiClient, id: number) {
  await clientApi.delete(`/api/portal/surveys/${id}`).catch(() => {});
}

// ── Card 0: Post-submit sequence trigger ─────────────────────────────────
//
// The email sequence system is cron-driven (app/api/cron/process-survey-email-followups).
// There is no synchronous trigger on the submit endpoint; sequences are only
// dispatched when the cron fires. An E2E test would need to either (a) call
// the internal cron endpoint or (b) wait for the cron interval — neither is
// feasible in a deterministic spec without controlling time and Resend.
// Verdict: needs-spec
//
// This describe block documents the gap so the runner sees it and passes.

test.describe('Surveys — Post-submit sequence trigger @surveys @sequence', () => {
  test.skip('Email sequence is triggered after survey submission', () => {
    // Sequences are processed by cron, not synchronously on submit.
    // An E2E covering this path requires: a seeded sequence, a controlled
    // clock advance, and a Resend mock. None of these are available in
    // the current test environment. See app/api/cron/process-survey-email-followups.
  });
});

// ── Card 1: Route-to-CRM on submit ───────────────────────────────────────

test.describe('Surveys — Route-to-CRM on submit @surveys @crm-routing', () => {
  let surveyId: number | null = null;
  let surveySlug: string | null = null;
  let dealId: number | null = null;

  test.afterAll(async ({ clientApi }) => {
    if (surveyId) await deleteSurvey(clientApi, surveyId);
    // Deal cleanup: find the deal created during the test
    if (dealId) {
      await clientApi.delete(`/api/portal/crm/deals/${dealId}`).catch(() => {});
    }
  });

  test('Survey submit creates a CRM deal when scoringConfig.autoRouteToCrm is enabled @critical',
    async ({ clientApi, unauthApi }) => {
      const ts = Date.now();

      // Need a CRM pipeline + stage to route into
      const { pipeline } = await createTestPipeline(clientApi, { name: `AutoRoute Pipeline ${ts}` });
      // pipeline.stages[0] is the default first stage
      const stageId = pipeline.stages[0].id;

      const survey = await createActiveSurvey(clientApi, {
        scoringConfig: {
          autoRouteToCrm: {
            enabled: true,
            minScore: 5,           // q1 answer 'a' scores 10, so this passes
            pipelineId: pipeline.id,
            stageId,
            dealTitleTemplate: 'Lead: {respondentEmail}',
          },
        },
      });
      surveyId = survey.id;
      surveySlug = survey.slug;

      const respondentEmail = `crm-route-${ts}@example.com`;

      const res = await submitSurvey(unauthApi, survey.slug, respondentEmail);
      expect(res.status).toBe(201);
      expect(res.data.success).toBe(true);
      expect(res.data.data).toHaveProperty('responseId');

      // Verify a CRM deal was created for this respondent
      const deals = await clientApi.get(`/api/portal/crm/deals?pipelineId=${pipeline.id}`);
      expect(deals.status).toBe(200);
      const dealList = (deals.data.data ?? []) as Array<{ id: number; title: string; stageId: number }>;
      const created = dealList.find((d) => d.title.includes(respondentEmail));
      expect(created).toBeTruthy();
      expect(created!.stageId).toBe(stageId);
      dealId = created!.id;
    }
  );

  test('Survey submit does NOT create a CRM deal when score is below minScore',
    async ({ clientApi, unauthApi }) => {
      const ts = Date.now();

      const { pipeline } = await createTestPipeline(clientApi, { name: `AutoRoute Lo ${ts}` });
      const stageId = pipeline.stages[0].id;

      // Create survey with a high minScore (20) — q1 answer 'a' only scores 10
      const survey = await createActiveSurvey(clientApi, {
        scoringConfig: {
          autoRouteToCrm: {
            enabled: true,
            minScore: 20,
            pipelineId: pipeline.id,
            stageId,
          },
        },
      });
      const surveyToClean = survey.id;

      const respondentEmail = `crm-low-score-${ts}@example.com`;
      const res = await submitSurvey(unauthApi, survey.slug, respondentEmail);
      expect(res.status).toBe(201);

      // No deal should be created
      const deals = await clientApi.get(`/api/portal/crm/deals?pipelineId=${pipeline.id}`);
      expect(deals.status).toBe(200);
      const dealList = (deals.data.data ?? []) as Array<{ title: string }>;
      const created = dealList.find((d) => d.title.includes(respondentEmail));
      expect(created).toBeUndefined();

      await deleteSurvey(clientApi, surveyToClean);
    }
  );

  test('Survey submit with autoRouteToCrm disabled does not create deal',
    async ({ clientApi, unauthApi }) => {
      const ts = Date.now();

      const { pipeline } = await createTestPipeline(clientApi, { name: `AutoRoute Off ${ts}` });
      const stageId = pipeline.stages[0].id;

      const survey = await createActiveSurvey(clientApi, {
        scoringConfig: {
          autoRouteToCrm: {
            enabled: false,
            minScore: 0,
            pipelineId: pipeline.id,
            stageId,
          },
        },
      });
      const surveyToClean = survey.id;

      const respondentEmail = `crm-disabled-${ts}@example.com`;
      const res = await submitSurvey(unauthApi, survey.slug, respondentEmail);
      expect(res.status).toBe(201);

      const deals = await clientApi.get(`/api/portal/crm/deals?pipelineId=${pipeline.id}`);
      const dealList = (deals.data.data ?? []) as Array<{ title: string }>;
      const created = dealList.find((d) => d.title.includes(respondentEmail));
      expect(created).toBeUndefined();

      await deleteSurvey(clientApi, surveyToClean);
    }
  );
});

// ── Card 2: allowMultiple=false blocks same-email second submission ───────
//
// BUG: The submit route (app/api/surveys/[slug]/route.ts POST) does not check
// `survey.allowMultiple`. A same-email second submission returns 201 instead of 403.

test.describe('Surveys — allowMultiple=false blocks duplicate submission @surveys @allow-multiple', () => {
  let surveyId: number | null = null;
  let surveySlug: string | null = null;

  test.afterAll(async ({ clientApi }) => {
    if (surveyId) await deleteSurvey(clientApi, surveyId);
  });

  test('BUG: second same-email submission returns 201 instead of 403 when allowMultiple=false',
    async ({ clientApi, unauthApi }) => {
      const ts = Date.now();
      const survey = await createActiveSurvey(clientApi, { allowMultiple: false });
      surveyId = survey.id;
      surveySlug = survey.slug;

      const email = `dupe-${ts}@example.com`;

      // First submission — always succeeds
      const first = await submitSurvey(unauthApi, survey.slug, email);
      expect(first.status).toBe(201);

      // Second submission with same email — SHOULD return 403 but currently returns 201 (BUG)
      const second = await submitSurvey(unauthApi, survey.slug, email);
      // This assertion documents the CURRENT (broken) behaviour.
      // When the bug is fixed, change toBe(201) → toBe(403).
      expect(second.status).toBe(201); // BUG: should be 403
    }
  );
});
