/**
 * Integration tests for `/api/cron/booking-reminders`.
 *
 * Coverage:
 *   Auth surface:
 *     - 401 without credentials
 *     - 401 with the wrong bearer
 *     - 200 with `Authorization: Bearer ${CRON_SECRET}`
 *     - 200 with `x-vercel-cron: 1` (platform-signed)
 *   Selection:
 *     - Picks confirmed bookings starting in 23–25h
 *     - Skips bookings outside the window
 *     - Skips bookings with reminder_sent_at already set
 *     - Skips non-confirmed (cancelled) bookings
 *   Idempotency:
 *     - Successful send stamps reminder_sent_at
 *     - Re-running the cron is a no-op for the same booking
 *
 * The actual email send is mocked — we only care that the cron *would have*
 * picked the booking and stamped reminder_sent_at on the way out.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email/booking-emails', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@/lib/email/booking-emails')>();
  return {
    ...orig,
    sendBookingReminder: vi.fn().mockResolvedValue(undefined),
    loadBookingBrand: vi.fn().mockResolvedValue(null),
  };
});

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';
import { sendBookingReminder } from '@/lib/email/booking-emails';
const mockedSend = sendBookingReminder as unknown as ReturnType<typeof vi.fn>;

const CRON_SECRET = 'test-cron-secret-' + Math.random().toString(36).slice(2);

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET;
  mockedSend.mockClear();
});

async function seedBookingPage(clientId: number): Promise<number> {
  const sql = getTestSql();
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.booking_pages
      (client_id, title, slug, active, duration, price, timezone, availability, questions)
    VALUES (
      ${clientId}, 'Cron Test', ${'cron-test-' + Date.now()}, true, 30, 0,
      'America/New_York', '{}'::json, '[]'::json
    )
    RETURNING id
  `;
  return row.id;
}

async function seedBooking(
  clientId: number,
  bookingPageId: number,
  opts: {
    startsInHours: number;
    status?: 'confirmed' | 'cancelled';
    reminderSentAt?: Date | null;
  },
): Promise<number> {
  const sql = getTestSql();
  // Use UTC math so the test isn't sensitive to the DB server's TZ setting —
  // cron's `now` is a JS Date (UTC), so the booking start_time has to live in
  // the same coordinate system.
  const [row] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.bookings (
      booking_page_id, client_id, guest_name, guest_email,
      start_time, end_time, timezone, status, cancel_token, payment_status,
      reminder_sent_at
    ) VALUES (
      ${bookingPageId}, ${clientId},
      'Cron Guest', 'cron-guest@test.local',
      (NOW() AT TIME ZONE 'UTC' + ${opts.startsInHours + ' hours'}::interval),
      (NOW() AT TIME ZONE 'UTC' + ${opts.startsInHours + 0.5 + ' hours'}::interval),
      'America/New_York',
      ${opts.status ?? 'confirmed'},
      ${'tok-' + Math.random().toString(36).slice(2)},
      'free',
      ${opts.reminderSentAt ?? null}
    )
    RETURNING id
  `;
  return row.id;
}

async function getRoute() {
  return await import('@/app/api/cron/booking-reminders/route');
}

describe('GET /api/cron/booking-reminders — auth', () => {
  it('401 without auth', async () => {
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: {} },
    );
    expect(res.status).toBe(401);
  });

  it('401 with wrong bearer', async () => {
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: 'Bearer not-the-secret' } },
    );
    expect(res.status).toBe(401);
  });

  it('200 with correct bearer', async () => {
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.status).toBe(200);
  });

  it('200 with x-vercel-cron header', async () => {
    const route = await getRoute();
    const res = await callHandler(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { 'x-vercel-cron': '1' } },
    );
    expect(res.status).toBe(200);
  });
});

describe('GET /api/cron/booking-reminders — selection + idempotency', () => {
  let A: TenantCtx;
  beforeEach(async () => {
    A = await sessionForNewClientUser('cron-reminders');
  });

  it('picks a confirmed booking starting in 24h', async () => {
    const pageId = await seedBookingPage(A.client.id);
    const bookingId = await seedBooking(A.client.id, pageId, { startsInHours: 24 });

    const route = await getRoute();
    const res = await callHandler<{ success: boolean; data: { scanned: number; sent: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.sent).toBe(1);
    expect(mockedSend).toHaveBeenCalledTimes(1);

    const sql = getTestSql();
    const [row] = await sql<{ reminder_sent_at: Date | null }[]>`
      SELECT reminder_sent_at FROM ${sql(TEST_SCHEMA)}.bookings WHERE id = ${bookingId}
    `;
    expect(row.reminder_sent_at).not.toBeNull();
  });

  it('skips a booking starting in 12h (under the window)', async () => {
    const pageId = await seedBookingPage(A.client.id);
    await seedBooking(A.client.id, pageId, { startsInHours: 12 });

    const route = await getRoute();
    const res = await callHandler<{ success: boolean; data: { sent: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.data?.data.sent).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('skips a booking starting in 48h (over the window)', async () => {
    const pageId = await seedBookingPage(A.client.id);
    await seedBooking(A.client.id, pageId, { startsInHours: 48 });

    const route = await getRoute();
    const res = await callHandler<{ success: boolean; data: { sent: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.data?.data.sent).toBe(0);
  });

  it('skips a booking whose reminder is already sent', async () => {
    const pageId = await seedBookingPage(A.client.id);
    await seedBooking(A.client.id, pageId, {
      startsInHours: 24,
      reminderSentAt: new Date(),
    });

    const route = await getRoute();
    const res = await callHandler<{ success: boolean; data: { sent: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.data?.data.sent).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('skips a cancelled booking even if start_time is in the window', async () => {
    const pageId = await seedBookingPage(A.client.id);
    await seedBooking(A.client.id, pageId, {
      startsInHours: 24,
      status: 'cancelled',
    });

    const route = await getRoute();
    const res = await callHandler<{ success: boolean; data: { sent: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.data?.data.sent).toBe(0);
  });

  it('idempotent — second invocation is a no-op for the same booking', async () => {
    const pageId = await seedBookingPage(A.client.id);
    await seedBooking(A.client.id, pageId, { startsInHours: 24 });

    const route = await getRoute();
    const r1 = await callHandler<{ success: boolean; data: { sent: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(r1.data?.data.sent).toBe(1);

    mockedSend.mockClear();

    const r2 = await callHandler<{ success: boolean; data: { sent: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(r2.data?.data.sent).toBe(0);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('failed send leaves reminder_sent_at NULL for retry', async () => {
    const pageId = await seedBookingPage(A.client.id);
    const bookingId = await seedBooking(A.client.id, pageId, { startsInHours: 24 });

    mockedSend.mockRejectedValueOnce(new Error('Resend boom'));

    const route = await getRoute();
    const res = await callHandler<{ success: boolean; data: { sent: number; failed: number } }>(
      route as unknown as Record<string, unknown>, 'GET',
      { headers: { authorization: `Bearer ${CRON_SECRET}` } },
    );
    expect(res.data?.data.sent).toBe(0);
    expect(res.data?.data.failed).toBe(1);

    const sql = getTestSql();
    const [row] = await sql<{ reminder_sent_at: Date | null }[]>`
      SELECT reminder_sent_at FROM ${sql(TEST_SCHEMA)}.bookings WHERE id = ${bookingId}
    `;
    expect(row.reminder_sent_at).toBeNull();
  });
});
