/**
 * Portal Settings — Mutations Golden Path
 *
 * One end-to-end flow that exercises the load-bearing settings mutations
 * through the live HTTP stack with a real client session cookie:
 *
 *   1. Profile PATCH       — flip name, observe via GET, restore.
 *   2. Team invite         — POST /settings/team, then DELETE the new member.
 *                            (Resend emails are fire-and-forget in the route;
 *                             /api/portal/settings/team uses tempPassword,
 *                             not Resend, so no live email is sent.)
 *   3. API-key create+revoke — verifies plaintext key is returned ONCE, then
 *                              not present anywhere on subsequent GET.
 *
 * Tagged @critical so it runs in the QA gate (`bun test:critical`).
 *
 * Companion to integration-API tests in tests/integration/api/settings/.
 * Those pin per-route auth + cross-tenant; this spec proves the cookie-based
 * stack works end-to-end without leaking credentials.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey } from './setup/helpers';

test.describe('Portal Settings Mutations — golden path @settings @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('SETTINGS-full-lifecycle: profile → team invite → api-key create+revoke', async ({ clientApi }) => {
    // ── 1. Profile: PATCH name → assert via GET → restore ────────────────
    const before = await clientApi.get('/api/portal/settings/profile');
    expect(before.status).toBe(200);
    expect(before.data.success).toBe(true);
    const original = before.data.data;
    const newName = `SETTINGS-Edited-${Date.now()}`;

    const patch = await clientApi.patch('/api/portal/settings/profile', {
      ...original,
      name: newName,
    });
    expect(patch.status).toBe(200);
    expect(patch.data.success).toBe(true);

    cleanups.push(async () => {
      // Restore original profile so the seed user keeps a sane name across runs.
      await clientApi.patch('/api/portal/settings/profile', original).catch(() => {});
    });

    const after = await clientApi.get('/api/portal/settings/profile');
    expect(after.status).toBe(200);
    expect(after.data.data.name).toBe(newName);

    // ── 2. Team: invite a fresh member, observe via GET, then DELETE ────
    const inviteEmail = `SETTINGS-member-${Date.now()}@example.com`;
    const invite = await clientApi.post('/api/portal/settings/team', {
      name: 'SETTINGS Member',
      email: inviteEmail,
    });
    expect(invite.status).toBe(201);
    expect(invite.data.success).toBe(true);
    expect(invite.data.data.isNewUser).toBe(true);
    expect(invite.data.data.tempPassword).toBeTruthy();
    expect(invite.data.data.email).toBe(inviteEmail);
    const memberId = invite.data.data.id;

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/settings/team/${memberId}`).catch(() => {});
    });

    const list = await clientApi.get('/api/portal/settings/team');
    expect(list.status).toBe(200);
    const found = list.data.data.find((m: { email: string }) => m.email === inviteEmail);
    expect(found).toBeTruthy();

    const remove = await clientApi.delete(`/api/portal/settings/team/${memberId}`);
    expect(remove.status).toBe(200);

    const afterRemove = await clientApi.get('/api/portal/settings/team');
    expect(afterRemove.data.data.find((m: { email: string }) => m.email === inviteEmail)).toBeFalsy();

    // ── 3. API key: create → assert plaintext returned once → revoke ────
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      name: `SETTINGS-Key-${Date.now()}`,
    });
    cleanups.push(keyCleanup);
    const plaintext: string = keyRecord.key;
    expect(plaintext).toMatch(/^sd_mcp_/);
    expect(typeof keyRecord.id).toBe('number');

    // Listing keys must NEVER re-expose the plaintext.
    const keyList = await clientApi.get('/api/portal/api-keys');
    expect(keyList.status).toBe(200);
    const listed = keyList.data.data.find((k: { id: number }) => k.id === keyRecord.id);
    expect(listed).toBeTruthy();
    for (const v of Object.values(listed)) {
      expect(v).not.toBe(plaintext);
    }

    const revoke = await clientApi.delete(`/api/portal/api-keys?id=${keyRecord.id}`);
    expect(revoke.status).toBe(200);
    const postRevoke = await clientApi.get('/api/portal/api-keys');
    const revoked = postRevoke.data.data.find((k: { id: number }) => k.id === keyRecord.id);
    if (revoked) expect(revoked.active).toBe(false);
  });
});
