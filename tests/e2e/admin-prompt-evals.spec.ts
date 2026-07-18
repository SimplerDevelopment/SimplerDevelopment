/**
 * Prompt Eval Dashboard — admin write-flow E2E (Phase 4).
 *
 * Exercises the high-blast-radius write path over the real API: create a draft
 * version → promote it (active pointer moves, prior version archived, soft
 * regression gate returned) → roll back → and confirm the audit log recorded
 * each action. Plus the admin-only guard on writes.
 *
 * Self-seeds the eval schema (see ensureEvalSchema) since those tables aren't in
 * the drizzle migration chain.
 */
import { test, expect } from './setup/fixtures';
import { ensureEvalSchema } from './setup/ensure-eval-schema';

interface Version {
  id: number;
  version: number;
  status: 'draft' | 'active' | 'archived';
  body: string;
}

test.describe('Admin Prompt Eval Dashboard @admin @prompt-evals @critical', () => {
  test.beforeAll(() => {
    ensureEvalSchema();
  });

  test('create draft → promote → rollback drives the active version and writes audit entries', async ({ adminApi }) => {
    // Pick a registry prompt that has an active version.
    const list = await adminApi.get('/api/admin/prompts');
    expect(list.status).toBe(200);
    expect(list.data.success).toBe(true);
    const row = (list.data.data as Array<{ id: number; activeVersionId: number | null }>).find(
      (p) => p.activeVersionId != null,
    );
    expect(row, 'expected a seeded prompt with an active version').toBeTruthy();
    const promptId = row!.id;

    // Current active version + its body (basis for the draft).
    const before = await adminApi.get(`/api/admin/prompts/${promptId}`);
    expect(before.status).toBe(200);
    const activeBefore: number = before.data.data.prompt.activeVersionId;
    const activeVer = (before.data.data.versions as Version[]).find((v) => v.id === activeBefore);
    const baseBody = activeVer?.body ?? 'You are a helpful assistant.';

    // 1) Create a DRAFT version.
    const draftRes = await adminApi.post(`/api/admin/prompts/${promptId}/versions`, {
      body: `${baseBody}\n# e2e-${Date.now()}`,
      notes: 'e2e promote-flow draft',
    });
    expect([200, 201]).toContain(draftRes.status);
    expect(draftRes.data.success).toBe(true);
    const draftVersionId: number = draftRes.data.data.version.id;
    expect(Number.isInteger(draftVersionId)).toBe(true);
    expect(draftVersionId).not.toBe(activeBefore);

    // 2) Promote the draft — active pointer moves, regression gate returned.
    const promoteRes = await adminApi.post(`/api/admin/prompts/${promptId}/promote`, {
      versionId: draftVersionId,
    });
    expect(promoteRes.status).toBe(200);
    expect(promoteRes.data.success).toBe(true);
    expect(promoteRes.data.data.activeVersionId).toBe(draftVersionId);
    expect(promoteRes.data.data).toHaveProperty('regression');

    const afterPromote = await adminApi.get(`/api/admin/prompts/${promptId}`);
    expect(afterPromote.data.data.prompt.activeVersionId).toBe(draftVersionId);
    const verAfter = afterPromote.data.data.versions as Version[];
    expect(verAfter.find((v) => v.id === draftVersionId)?.status).toBe('active');
    expect(verAfter.find((v) => v.id === activeBefore)?.status).toBe('archived');

    // 3) Roll back to the prior version.
    const rollbackRes = await adminApi.post(`/api/admin/prompts/${promptId}/rollback`, {
      versionId: activeBefore,
    });
    expect(rollbackRes.status).toBe(200);
    expect(rollbackRes.data.data.activeVersionId).toBe(activeBefore);

    const afterRollback = await adminApi.get(`/api/admin/prompts/${promptId}`);
    expect(afterRollback.data.data.prompt.activeVersionId).toBe(activeBefore);

    // 4) Audit log recorded each write.
    const audit = await adminApi.get(`/api/admin/prompts/${promptId}/audit`);
    expect(audit.status).toBe(200);
    const actions = (audit.data.data as Array<{ action: string }>).map((e) => e.action);
    expect(actions).toContain('create_draft');
    expect(actions).toContain('promote');
    expect(actions).toContain('rollback');
  });

  test('write ops reject a non-admin caller', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/admin/prompts/1/promote', { versionId: 1 });
    expect(res.status).toBe(401);
    expect(res.data.success).toBe(false);
  });
});
