/**
 * Brain calendar events — POST on /calendar/events; PATCH/DELETE on
 * /calendar/events/[id].
 *
 * Contract:
 *   - 401 unauth
 *   - POST: title + ISO startAt/endAt required (400 otherwise),
 *           endAt must be on/after startAt (400)
 *   - PATCH: 404 cross-tenant; 200 on own
 *   - DELETE: 404 cross-tenant; 200 on own; 404 on missing
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));

import { auth } from '@/lib/auth';
const mockedAuth = auth as unknown as Mock;

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedEvent(ctx: TenantCtx, overrides: { title?: string } = {}): Promise<{ id: number }> {
  const sql = getTestSql();
  const start = new Date(Date.now() + 60 * 60 * 1000);
  const end = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.brain_calendar_events (
      client_id, title, start_at, end_at, all_day, timezone, source
    ) VALUES (
      ${ctx.client.id},
      ${overrides.title ?? `event-${Date.now()}`},
      ${start},
      ${end},
      false,
      'UTC',
      'manual'
    )
    RETURNING id
  `;
  return row;
}

describe('Brain calendar — POST /calendar/events @brain @calendar', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-cal-create'); });

  it('401 when unauthenticated', async () => {
    mockedAuth.mockResolvedValue(null);
    const route = await import('@/app/api/portal/brain/calendar/events/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: {} },
    );
    expect(res.status).toBe(401);
  });

  it('400 missing title', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/calendar/events/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: '', startAt: new Date().toISOString(), endAt: new Date(Date.now() + 1000).toISOString() } },
    );
    expect(res.status).toBe(400);
  });

  it('400 missing startAt/endAt', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/calendar/events/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      { body: { title: 'x' } },
    );
    expect(res.status).toBe(400);
  });

  it('400 when endAt is before startAt', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/calendar/events/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: {
          title: 'inverted',
          startAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          endAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      },
    );
    expect(res.status).toBe(400);
  });

  it('creates an event scoped to the caller tenant', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/calendar/events/route');
    const res = await callHandler<{ success: boolean; data: { id: number } }>(
      route as unknown as Record<string, unknown>,
      'POST',
      {
        body: {
          title: 'Future event',
          startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          endAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          timezone: 'UTC',
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const [row] = await sql<{ client_id: number; title: string }[]>`
      SELECT client_id, title FROM ${sql(TEST_SCHEMA)}.brain_calendar_events WHERE id = ${res.data!.data.id}
    `;
    expect(row.client_id).toBe(A.client.id);
    expect(row.title).toBe('Future event');
  });
});

describe('Brain calendar — PATCH /calendar/events/[id] @brain @calendar', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-cal-patch'); });

  it('updates own event', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const e = await seedEvent(A, { title: 'before' });

    const route = await import('@/app/api/portal/brain/calendar/events/[id]/route');
    const res = await callHandler<{ success: boolean; data: { title: string } }>(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(e.id) }, body: { title: 'after' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.title).toBe('after');
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-cal-patch-b');
    const evB = await seedEvent(B, { title: 'foreign' });
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/calendar/events/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: String(evB.id) }, body: { title: 'hijack' } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const [row] = await sql<{ title: string }[]>`
      SELECT title FROM ${sql(TEST_SCHEMA)}.brain_calendar_events WHERE id = ${evB.id}
    `;
    expect(row.title).toBe('foreign');
  });

  it('400 invalid id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/calendar/events/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'PATCH',
      { params: { id: 'not-a-number' }, body: { title: 'x' } },
    );
    expect(res.status).toBe(400);
  });
});

describe('Brain calendar — DELETE /calendar/events/[id] @brain @calendar', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('brain-cal-del'); });

  it('deletes own event', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const e = await seedEvent(A);

    const route = await import('@/app/api/portal/brain/calendar/events/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(e.id) } },
    );
    expect(res.status).toBe(200);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_calendar_events WHERE id = ${e.id}
    `;
    expect(rows.length).toBe(0);
  });

  it('404 missing id', async () => {
    mockedAuth.mockResolvedValue(A.session);
    const route = await import('@/app/api/portal/brain/calendar/events/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: '999999' } },
    );
    expect(res.status).toBe(404);
  });

  it('404 cross-tenant', async () => {
    const B = await sessionForNewClientUser('brain-cal-del-b');
    const evB = await seedEvent(B);
    mockedAuth.mockResolvedValue(A.session);

    const route = await import('@/app/api/portal/brain/calendar/events/[id]/route');
    const res = await callHandler(
      route as unknown as Record<string, unknown>,
      'DELETE',
      { params: { id: String(evB.id) } },
    );
    expect(res.status).toBe(404);

    const sql = getTestSql();
    const rows = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.brain_calendar_events WHERE id = ${evB.id}
    `;
    expect(rows.length).toBe(1);
  });
});
