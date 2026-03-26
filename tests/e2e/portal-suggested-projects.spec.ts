/**
 * Portal Suggested Projects API E2E Tests
 *
 * Tests for /api/portal/suggested-projects and /api/portal/suggested-project-requests
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Portal Suggested Projects @suggested-projects', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /suggested-projects lists available projects', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/suggested-projects');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /suggested-projects rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/suggested-projects');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Suggested Project Requests @suggested-projects @requests', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('POST /suggested-project-requests submits a request', async ({ clientApi }) => {
    // First get available suggested projects
    const projects = await clientApi.get('/api/portal/suggested-projects');
    if (!projects.data.data?.length) {
      test.skip(); // no suggested projects seeded
      return;
    }
    const projectId = projects.data.data[0].id;

    const res = await clientApi.post('/api/portal/suggested-project-requests', {
      suggestedProjectId: projectId,
      message: `E2E test request ${Date.now()}`,
      answers: { budget: '5000-10000' },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.suggestedProjectId).toBe(projectId);
  });

  test('POST /suggested-project-requests rejects missing suggestedProjectId', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/suggested-project-requests', {
      message: 'No project ID',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /suggested-project-requests rejects invalid project ID', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/suggested-project-requests', {
      suggestedProjectId: 999999,
      message: 'Invalid project',
    });
    expect(res.status).toBe(404);
  });

  test('POST /suggested-project-requests rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/suggested-project-requests', {
      suggestedProjectId: 1,
    });
    expect(res.status).toBe(401);
  });
});
