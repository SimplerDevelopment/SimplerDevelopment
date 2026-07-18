/**
 * Notification preferences — per-user opt-out + digest mode.
 *
 * Routes covered:
 *   - GET /api/portal/notifications/preferences  (fills defaults for missing rows)
 *   - PUT /api/portal/notifications/preferences  (upsert one type/delivery pair)
 *
 * Key invariants:
 *   - GET always returns one row per known type (defaults to `instant` when no
 *     preference row exists).
 *   - PUT validates `notificationType` against NOTIFICATION_TYPES and `delivery`
 *     against {instant, digest_daily, off}.
 *   - Preferences are scoped to (clientId, userId): tenant A cannot read or
 *     write tenant B's rows. Cross-tenant reads simply return defaults; PUT
 *     stores against the caller's own tenant.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../helpers/test-db';

interface PrefRow {
  notificationType: string;
  delivery: 'instant' | 'digest_daily' | 'off';
}

async function readPref(
  clientId: number,
  userId: number,
  notificationType: string,
): Promise<{ delivery: string } | undefined> {
  const sql = getTestSql();
  const [row] = await sql<{ delivery: string }[]>`
    SELECT delivery
    FROM ${sql(TEST_SCHEMA)}.notification_preferences
    WHERE client_id = ${clientId} AND user_id = ${userId} AND notification_type = ${notificationType}
  `;
  return row;
}

// ─── GET ────────────────────────────────────────────────────────────────────

describe('GET /api/portal/notifications/preferences', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('notif-prefs-get'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/notifications/preferences/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(401);
  });

  it('returns one row per known notification type, defaulting to instant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/notifications/preferences/route');
    const res = await callHandler<{ data: { items: PrefRow[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    const items = res.data?.data.items ?? [];
    // Should at minimum include the canonical types from the spec.
    const byType = Object.fromEntries(items.map((i) => [i.notificationType, i.delivery]));
    expect(byType['mention']).toBe('instant');
    expect(byType['deal_assigned']).toBe('instant');
    expect(byType['proposal_viewed']).toBe('instant');
    // No row should be missing a delivery.
    for (const item of items) {
      expect(['instant', 'digest_daily', 'off']).toContain(item.delivery);
    }
  });

  it('reflects stored rows for the caller', async () => {
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.notification_preferences (client_id, user_id, notification_type, delivery)
      VALUES (${A.client.id}, ${A.user.id}, 'mention', 'off')
    `;
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/notifications/preferences/route');
    const res = await callHandler<{ data: { items: PrefRow[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    const mention = (res.data?.data.items ?? []).find((i) => i.notificationType === 'mention');
    expect(mention?.delivery).toBe('off');
  });

  it('cross-tenant: tenant A does not see tenant B\'s preferences', async () => {
    const B = await sessionForNewClientUser('notif-prefs-b');
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.notification_preferences (client_id, user_id, notification_type, delivery)
      VALUES (${B.client.id}, ${B.user.id}, 'mention', 'off')
    `;
    // A reads — should still see default (instant), not B's "off".
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/notifications/preferences/route');
    const res = await callHandler<{ data: { items: PrefRow[] } }>(
      route as unknown as Record<string, unknown>,
      'GET',
    );
    expect(res.status).toBe(200);
    const mention = (res.data?.data.items ?? []).find((i) => i.notificationType === 'mention');
    expect(mention?.delivery).toBe('instant');
  });
});

// ─── PUT ────────────────────────────────────────────────────────────────────

describe('PUT /api/portal/notifications/preferences', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('notif-prefs-put'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/notifications/preferences/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PUT',
      { body: { notificationType: 'mention', delivery: 'off' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 on unknown notificationType', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/notifications/preferences/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { body: { notificationType: 'not_a_real_type', delivery: 'off' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/notificationType/i);
  });

  it('400 on unknown delivery', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/notifications/preferences/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { body: { notificationType: 'mention', delivery: 'sometimes' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/delivery/i);
  });

  it('400 on empty body', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/notifications/preferences/route');
    const res = await callHandler<{ message: string }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { body: null },
    );
    expect(res.status).toBe(400);
  });

  it('200 inserts when no row exists', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/notifications/preferences/route');
    const res = await callHandler<{ data: PrefRow }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { body: { notificationType: 'mention', delivery: 'off' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.delivery).toBe('off');
    const row = await readPref(A.client.id, A.user.id, 'mention');
    expect(row?.delivery).toBe('off');
  });

  it('200 updates when row exists (upsert)', async () => {
    const sql = getTestSql();
    await sql`
      INSERT INTO ${sql(TEST_SCHEMA)}.notification_preferences (client_id, user_id, notification_type, delivery)
      VALUES (${A.client.id}, ${A.user.id}, 'mention', 'off')
    `;
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/notifications/preferences/route');
    const res = await callHandler<{ data: PrefRow }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { body: { notificationType: 'mention', delivery: 'digest_daily' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.delivery).toBe('digest_daily');
    const row = await readPref(A.client.id, A.user.id, 'mention');
    expect(row?.delivery).toBe('digest_daily');
  });

  it('cross-tenant: PUT scopes to caller\'s tenant only', async () => {
    const B = await sessionForNewClientUser('notif-prefs-put-b');
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/notifications/preferences/route');
    const res = await callHandler<{ data: PrefRow }>(
      route as unknown as Record<string, unknown>,
      'PUT',
      { body: { notificationType: 'mention', delivery: 'off' } },
    );
    expect(res.status).toBe(200);
    // A's row exists
    expect(await readPref(A.client.id, A.user.id, 'mention')).toBeDefined();
    // B's row does not (was never created via A's PUT).
    expect(await readPref(B.client.id, B.user.id, 'mention')).toBeUndefined();
  });
});
