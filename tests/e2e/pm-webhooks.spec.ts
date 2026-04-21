/**
 * PM Webhooks — Phase 5 + SSRF hardening
 *
 * Covers: create webhook (secret revealed once), list (secret redacted),
 * patch toggle, delete, SSRF rejection of private/loopback URLs.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestKanbanProject } from './setup/helpers';

test.describe('PM Webhooks @pm @webhooks', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('create reveals full secret; list redacts it', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/projects/${project.id}/webhooks`, {
      url: 'https://example.com/hook',
      events: ['card.created'],
    });
    expect(create.status).toBe(201);
    const fullSecret = create.data.data.secret as string;
    expect(fullSecret.length).toBe(64); // 32 bytes hex
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/project-webhooks/${create.data.data.id}`).catch(() => {});
    });

    const list = await clientApi.get(`/api/portal/projects/${project.id}/webhooks`);
    expect(list.status).toBe(200);
    const hook = (list.data.data as Array<{ id: number; secret: string }>).find(h => h.id === create.data.data.id);
    expect(hook?.secret).toMatch(/…$/);
    expect(hook?.secret.length ?? 0).toBeLessThan(fullSecret.length);
  });

  test('rejects private/loopback URLs via SSRF guard', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);

    const cases = [
      'http://127.0.0.1/hook',
      'http://localhost/hook',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.1/x',
      'http://192.168.1.1/x',
      'http://172.16.0.1/x',
      'http://[::1]/x',
      'file:///etc/passwd',
      'ftp://example.com/hook',
    ];
    for (const url of cases) {
      const res = await clientApi.post(`/api/portal/projects/${project.id}/webhooks`, { url });
      expect(res.status, `expected 400 for ${url}`).toBe(400);
      expect(res.data.success).toBe(false);
    }
  });

  test('toggle active via PATCH resets failure_count', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/projects/${project.id}/webhooks`, {
      url: 'https://example.com/hook',
    });
    const hookId = create.data.data.id;
    cleanups.push(async () => { await clientApi.delete(`/api/portal/project-webhooks/${hookId}`).catch(() => {}); });

    const pause = await clientApi.patch(`/api/portal/project-webhooks/${hookId}`, { active: false });
    expect(pause.data.data.active).toBe(false);

    const resume = await clientApi.patch(`/api/portal/project-webhooks/${hookId}`, { active: true });
    expect(resume.data.data.active).toBe(true);
    expect(resume.data.data.failureCount).toBe(0);
  });

  test('delete removes the webhook', async ({ clientApi }) => {
    const { project, cleanup } = await createTestKanbanProject(clientApi);
    cleanups.push(cleanup);

    const create = await clientApi.post(`/api/portal/projects/${project.id}/webhooks`, {
      url: 'https://example.com/hook',
    });
    const hookId = create.data.data.id;

    const del = await clientApi.delete(`/api/portal/project-webhooks/${hookId}`);
    expect(del.status).toBe(200);

    const list = await clientApi.get(`/api/portal/projects/${project.id}/webhooks`);
    expect((list.data.data as Array<{ id: number }>).find(h => h.id === hookId)).toBeUndefined();
  });
});
