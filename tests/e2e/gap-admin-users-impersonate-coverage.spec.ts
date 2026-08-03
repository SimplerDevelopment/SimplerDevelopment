/**
 * Admin user-management + impersonation privilege-escalation gap coverage.
 *
 * Regression for two adversarial-audit findings
 * (docs/audits/portal-e2e-adversarial-audit-2026-06-25.md):
 *
 *  - admin-users-editor-privilege-escalation
 *      POST /api/users and PUT /api/users/:id accepted `admin | editor`
 *      callers AND accepted `role: 'admin'` in the body, so an editor-role
 *      staff user could create a new admin or self-promote to admin. User
 *      mutation is now admin-only (requireAdmin); editors get 403.
 *
 *  - admin-impersonation-editor-role-inconsistent
 *      POST /api/admin/portal/clients/:id/impersonate gated on isStaffRole
 *      (admin | employee | editor) while the admin UI gates on
 *      requireStaffSession (admin | employee). An editor could POST a guessed
 *      clientId to mint a valid impersonation cookie. The route now uses
 *      requireStaffSession, so editors get 401 — matching the admin-UI gate.
 *
 * These holes reopen if either route widens its caller gate again, so this
 * spec asserts: 403/401 for editor + unauthenticated callers, and 200/201 for
 * the legitimate admin caller.
 */

import { test, expect } from './setup/fixtures';
import { ApiClient } from './setup/api-client';
import { runCleanups } from './setup/helpers';

test.describe('Admin users + impersonation privilege escalation @gap @auth @admin-users @impersonation', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('editor-role staff cannot create/modify users or impersonate', async ({ adminApi }) => {
    // Admin provisions a real editor-role account (admin is allowed → 201).
    const editorEmail = `editor-esc-${Date.now()}@example.com`;
    const editorPassword = 'editor-esc-pw-123';
    const createEditor = await adminApi.post('/api/users', {
      name: 'Escalation Test Editor',
      email: editorEmail,
      password: editorPassword,
      role: 'editor',
      active: true,
    });
    expect(createEditor.status).toBe(201);
    const editorId = createEditor.data.data.id as number;
    cleanups.push(async () => {
      await adminApi.delete(`/api/users/${editorId}`);
    });

    // Log in as that editor.
    const editorApi = new ApiClient(editorEmail, editorPassword);
    await editorApi.ensure();
    cleanups.push(async () => {
      await editorApi.dispose();
    });

    // Pick a real client id for the impersonation attempt (auth is checked
    // before the client lookup, so any id yields 401 — but use a real one
    // when available to prove the rejection is the auth gate, not a 404).
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const clients = (clientsRes.data?.data ?? []) as Array<{ id: number }>;
    const targetClientId = clients.length > 0 ? clients[0].id : 1;

    // (a) Editor cannot create an admin (privilege escalation).
    const createAdmin = await editorApi.post('/api/users', {
      name: 'Sneaky Admin',
      email: `sneaky-admin-${Date.now()}@example.com`,
      password: 'sneaky-pw-123',
      role: 'admin',
      active: true,
    });
    expect(createAdmin.status).toBe(403);

    // (b) Editor cannot create any user at all (mutation is admin-only).
    const createEditor2 = await editorApi.post('/api/users', {
      name: 'Another Editor',
      email: `another-editor-${Date.now()}@example.com`,
      password: 'another-pw-123',
      role: 'editor',
      active: true,
    });
    expect(createEditor2.status).toBe(403);

    // (c) Editor cannot self-promote to admin via PUT.
    const selfPromote = await editorApi.put(`/api/users/${editorId}`, { role: 'admin' });
    expect(selfPromote.status).toBe(403);

    // (d) Editor cannot delete a user.
    const deleteAttempt = await editorApi.delete(`/api/users/${editorId}`);
    expect(deleteAttempt.status).toBe(403);

    // (e) Editor cannot mint an impersonation cookie (matches admin-UI gate).
    const impersonate = await editorApi.post(
      `/api/admin/portal/clients/${targetClientId}/impersonate`,
    );
    expect(impersonate.status).toBe(401);

    // Confirm the editor was NOT promoted and still exists (delete failed).
    const stillEditor = await adminApi.get(`/api/users/${editorId}`);
    expect(stillEditor.status).toBe(200);
    expect(stillEditor.data.data.role).toBe('editor');
  });

  test('unauthenticated caller cannot create users or impersonate', async ({ unauthApi }) => {
    const createRes = await unauthApi.post('/api/users', {
      name: 'Anon',
      email: `anon-${Date.now()}@example.com`,
      password: 'anon-pw-123',
      role: 'admin',
      active: true,
    });
    expect(createRes.status).toBe(401);

    const impersonateRes = await unauthApi.post('/api/admin/portal/clients/1/impersonate');
    expect(impersonateRes.status).toBe(401);
  });

  test('admin (legit caller) can still create, modify, and delete users', async ({ adminApi }) => {
    const email = `admin-created-${Date.now()}@example.com`;
    const create = await adminApi.post('/api/users', {
      name: 'Admin Created User',
      email,
      password: 'created-pw-123',
      role: 'editor',
      active: true,
    });
    expect(create.status).toBe(201);
    const id = create.data.data.id as number;

    const update = await adminApi.put(`/api/users/${id}`, { name: 'Renamed By Admin' });
    expect(update.status).toBe(200);
    expect(update.data.data.name).toBe('Renamed By Admin');

    const del = await adminApi.delete(`/api/users/${id}`);
    expect(del.status).toBe(200);
  });

  test('admin (legit caller) can still start impersonation', async ({ adminApi }) => {
    const clientsRes = await adminApi.get('/api/admin/portal/clients');
    const clients = (clientsRes.data?.data ?? []) as Array<{ id: number }>;
    if (clients.length === 0) {
      test.skip();
      return;
    }
    const res = await adminApi.post(`/api/admin/portal/clients/${clients[0].id}/impersonate`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Clean up the impersonation cookie side-effect.
    cleanups.push(async () => {
      await adminApi.post('/api/portal/impersonate/stop');
    });
  });
});
