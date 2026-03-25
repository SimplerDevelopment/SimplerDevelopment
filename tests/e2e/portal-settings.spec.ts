/**
 * Portal Settings API E2E Tests
 *
 * Tests for /api/portal/settings/profile, /team, /billing
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Portal Settings — Profile @settings @critical', () => {
  test('GET /profile returns user and client data', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/settings/profile');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('name');
    expect(res.data.data).toHaveProperty('email');
    expect(res.data.data).toHaveProperty('company');
    expect(res.data.data).toHaveProperty('phone');
    expect(res.data.data).toHaveProperty('website');
    expect(res.data.data).toHaveProperty('address');
  });

  test('PATCH /profile updates profile fields', async ({ clientApi }) => {
    // Read current state
    const before = await clientApi.get('/api/portal/settings/profile');
    const original = before.data.data;

    // Update
    const res = await clientApi.patch('/api/portal/settings/profile', {
      name: original.name,
      email: original.email,
      company: `Updated Co ${Date.now()}`,
      phone: '(555) 999-0000',
      website: 'https://updated.example.com',
      address: '456 Test St',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);

    // Verify
    const after = await clientApi.get('/api/portal/settings/profile');
    expect(after.data.data.phone).toBe('(555) 999-0000');

    // Restore
    await clientApi.patch('/api/portal/settings/profile', original);
  });

  test('PATCH /profile rejects empty name', async ({ clientApi }) => {
    const before = await clientApi.get('/api/portal/settings/profile');
    const res = await clientApi.patch('/api/portal/settings/profile', {
      ...before.data.data,
      name: '',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /profile rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/settings/profile');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Settings — Team @settings @team', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('GET /team lists members with owner flag', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/settings/team');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
    expect(res.data).toHaveProperty('isOwner');

    // At least the current user should be a member (or found via clients.userId fallback)
    // isOwner should be true for the seed user
    expect(res.data.isOwner).toBe(true);
  });

  test('POST /team invites a new member and returns temp password', async ({ clientApi }) => {
    const email = `test-member-${Date.now()}@example.com`;
    const res = await clientApi.post('/api/portal/settings/team', {
      name: 'Test Member',
      email,
    });
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.isNewUser).toBe(true);
    expect(res.data.data.tempPassword).toBeTruthy();
    expect(res.data.data.email).toBe(email);

    // Register cleanup
    const memberId = res.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/settings/team/${memberId}`).catch(() => {});
    });
  });

  test('POST /team rejects duplicate member', async ({ clientApi }) => {
    const email = `test-dup-${Date.now()}@example.com`;

    // First invite
    const first = await clientApi.post('/api/portal/settings/team', { name: 'Dup Test', email });
    expect(first.status).toBe(201);
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/settings/team/${first.data.data.id}`).catch(() => {});
    });

    // Second invite — should fail
    const second = await clientApi.post('/api/portal/settings/team', { name: 'Dup Test', email });
    expect(second.status).toBe(400);
    expect(second.data.message).toContain('already');
  });

  test('POST /team rejects missing fields', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/settings/team', { name: '', email: '' });
    expect(res.status).toBe(400);
  });

  test('DELETE /team removes a member', async ({ clientApi }) => {
    const email = `test-remove-${Date.now()}@example.com`;
    const invite = await clientApi.post('/api/portal/settings/team', { name: 'Remove Me', email });
    expect(invite.status).toBe(201);
    const memberId = invite.data.data.id;

    const del = await clientApi.delete(`/api/portal/settings/team/${memberId}`);
    expect(del.status).toBe(200);
    expect(del.data.success).toBe(true);
  });

  test('GET /team rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/settings/team');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Settings — Billing @settings @billing', () => {
  test('GET /billing returns invoices and services', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/settings/billing');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('invoices');
    expect(res.data.data).toHaveProperty('services');
    expect(Array.isArray(res.data.data.invoices)).toBe(true);
    expect(Array.isArray(res.data.data.services)).toBe(true);
  });

  test('GET /billing rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/settings/billing');
    expect(res.status).toBe(401);
  });
});
