/**
 * Portal Project Webhooks — single-resource endpoint extras
 *
 * pm-webhooks.spec.ts already covers list/create (incl. SSRF), the active
 * toggle PATCH, and DELETE happy path. This file fills the remaining gaps on
 * /api/portal/project-webhooks/[id]:
 *   - PATCH: update url (incl. SSRF rejection on update), update events list
 *   - PATCH/DELETE: 404 for unknown id
 *   - PATCH/DELETE: 401 unauthenticated
 *
 * Note: the [id] route does NOT export GET — only PATCH and DELETE — so there
 * is no detail-fetch test here.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject } from './setup/helpers';

async function createWebhook(api: import('./setup/api-client').ApiClient, projectId: number, body?: Record<string, unknown>) {
  const res = await api.post(`/api/portal/projects/${projectId}/webhooks`, {
    url: 'https://example.com/hook',
    events: ['card.created'],
    ...body,
  });
  if (!res.data?.success) throw new Error(`Failed to create webhook: ${res.data?.message}`);
  return res.data.data as { id: number; url: string; events: string[]; active: boolean; secret: string };
}

test.describe('Portal Project Webhooks — single-resource @webhooks @pm', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('PATCH updates URL and persists in subsequent list', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);
    const hook = await createWebhook(clientApi, project.id);
    cleanups.push(async () => { await clientApi.delete(`/api/portal/project-webhooks/${hook.id}`).catch(() => {}); });

    const newUrl = `https://example.com/hook-${Date.now()}`;
    const res = await clientApi.patch(`/api/portal/project-webhooks/${hook.id}`, { url: newUrl });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.url).toBe(newUrl);
    // Secret stays redacted on PATCH response
    expect(String(res.data.data.secret)).toMatch(/…$/);

    const list = await clientApi.get(`/api/portal/projects/${project.id}/webhooks`);
    const found = (list.data.data as Array<{ id: number; url: string }>).find(h => h.id === hook.id);
    expect(found?.url).toBe(newUrl);
  });

  test('PATCH rejects SSRF-unsafe URL on update', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);
    const hook = await createWebhook(clientApi, project.id);
    cleanups.push(async () => { await clientApi.delete(`/api/portal/project-webhooks/${hook.id}`).catch(() => {}); });

    const cases = [
      'http://127.0.0.1/evil',
      'http://169.254.169.254/latest/meta-data',
      'file:///etc/passwd',
    ];
    for (const url of cases) {
      const res = await clientApi.patch(`/api/portal/project-webhooks/${hook.id}`, { url });
      expect(res.status, `expected 400 for ${url}`).toBe(400);
      expect(res.data.success).toBe(false);
    }
  });

  test('PATCH replaces the events array', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);
    const hook = await createWebhook(clientApi, project.id, { events: ['card.created'] });
    cleanups.push(async () => { await clientApi.delete(`/api/portal/project-webhooks/${hook.id}`).catch(() => {}); });

    const res = await clientApi.patch(`/api/portal/project-webhooks/${hook.id}`, {
      events: ['card.updated', 'card.commented'],
    });
    expect(res.status).toBe(200);
    expect(res.data.data.events).toEqual(['card.updated', 'card.commented']);
  });

  test('PATCH filters out non-string events', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);
    const hook = await createWebhook(clientApi, project.id);
    cleanups.push(async () => { await clientApi.delete(`/api/portal/project-webhooks/${hook.id}`).catch(() => {}); });

    const res = await clientApi.patch(`/api/portal/project-webhooks/${hook.id}`, {
      events: ['card.created', 123, null, 'card.commented'] as unknown as string[],
    });
    expect(res.status).toBe(200);
    expect(res.data.data.events).toEqual(['card.created', 'card.commented']);
  });

  test('PATCH returns 404 for unknown webhook id', async ({ clientApi }) => {
    const res = await clientApi.patch(`/api/portal/project-webhooks/999999999`, { active: false });
    expect(res.status).toBe(404);
  });

  test('DELETE returns 404 for unknown webhook id', async ({ clientApi }) => {
    const res = await clientApi.delete(`/api/portal/project-webhooks/999999999`);
    expect(res.status).toBe(404);
  });

  test('PATCH rejects unauthenticated', async ({ unauthApi, clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);
    const hook = await createWebhook(clientApi, project.id);
    cleanups.push(async () => { await clientApi.delete(`/api/portal/project-webhooks/${hook.id}`).catch(() => {}); });

    const res = await unauthApi.patch(`/api/portal/project-webhooks/${hook.id}`, { active: false });
    expect(res.status).toBe(401);
  });

  test('DELETE rejects unauthenticated', async ({ unauthApi, clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);
    const hook = await createWebhook(clientApi, project.id);
    cleanups.push(async () => { await clientApi.delete(`/api/portal/project-webhooks/${hook.id}`).catch(() => {}); });

    const res = await unauthApi.delete(`/api/portal/project-webhooks/${hook.id}`);
    expect(res.status).toBe(401);
  });
});
