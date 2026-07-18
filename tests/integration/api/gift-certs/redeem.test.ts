/**
 * Gift Certificate redemption flow.
 *
 * Two surface areas exercise redemption:
 *   1. POST /api/public/gift-certificates/validate
 *      — pure validator. Rejects invalid code / wrong-context redeemableAt /
 *        expired / fully-redeemed certs.
 *   2. POST /api/public/booking/[slug]/book
 *      — actually redeems against a booking. With page.price <= remainingAmount,
 *        the booking total goes to 0, so no Stripe is dialled. We assert:
 *          * remainingAmount is decremented
 *          * a gift_certificate_redemptions row is written with context='booking'
 *          * status flips to 'fully_redeemed' when the cert hits 0
 *          * a SECOND attempt to redeem the same (now empty) cert FAILS at the
 *            validate step and the cert stays at 0 / fully_redeemed.
 *
 * Dependencies that hit the network are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/email/booking-emails', () => ({
  sendGuestConfirmation: vi.fn().mockResolvedValue(undefined),
  sendHostNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/google-calendar', () => ({
  createCalendarEvent: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/zoom', () => ({
  createZoomMeeting: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/lib/branding', () => ({
  getBrandingByBookingPageSlug: vi.fn().mockResolvedValue(null),
  brandingToCssVars: vi.fn().mockReturnValue({}),
  getBrandingByClientId: vi.fn().mockResolvedValue({}),
  getBrandingByProfileId: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/automation', () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

import { callHandler } from '../../../helpers/call-handler';
import { sessionForNewClientUser, type TenantCtx } from '../../../helpers/session';
import { getTestSql, TEST_SCHEMA } from '../../../helpers/test-db';

async function seedCert(ctx: TenantCtx, opts: {
  amount?: number; remaining?: number; status?: string; code?: string;
  redeemableAt?: 'booking' | 'store' | 'both';
  expiresAt?: Date | null;
} = {}): Promise<{ id: number; code: string }> {
  const sql = getTestSql();
  const code = opts.code ?? `CERT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 999)}`;
  const amount = opts.amount ?? 5000;
  const expires = opts.expiresAt === undefined ? null : opts.expiresAt;
  const [row] = await sql<{ id: number; code: string }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.gift_certificates (
      client_id, code, initial_amount, remaining_amount, status,
      purchaser_name, purchaser_email, payment_status, redeemable_at, expires_at
    ) VALUES (
      ${ctx.client.id}, ${code}, ${amount},
      ${opts.remaining ?? amount},
      ${opts.status ?? 'active'},
      'Test Purchaser', 'p@test.local',
      'paid', ${opts.redeemableAt ?? 'both'},
      ${expires}
    ) RETURNING id, code
  `;
  return row;
}

async function seedBookingPage(ctx: TenantCtx, price: number): Promise<{ pageId: number; slug: string }> {
  const sql = getTestSql();
  const slug = `gc-page-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  const availability = JSON.stringify([0, 1, 2, 3, 4, 5, 6].map(day => ({
    day, startTime: '00:00', endTime: '23:59', enabled: true,
  })));
  const [p] = await sql<{ id: number }[]>`
    INSERT INTO ${sql(TEST_SCHEMA)}.booking_pages (
      client_id, title, slug, duration, max_advance_days, min_notice_mins,
      timezone, availability, active, price, max_guests, checkin_enabled,
      enable_discount_codes, enable_add_ons, enable_gift_certificates,
      enable_waivers, require_waiver_before_booking, allow_staff_selection,
      buffer_before, buffer_after, conference_type, google_calendar_sync,
      color
    ) VALUES (
      ${ctx.client.id}, 'GC Page', ${slug}, 30, 60, 60,
      'UTC', ${availability}::jsonb, true,
      ${price}, null, false,
      false, false, true,
      false, false, false,
      0, 0, 'none', false, '#000000'
    ) RETURNING id
  `;
  return { pageId: p.id, slug };
}

function futureSlot(daysAhead = 3): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

describe('Gift cert validate — POST /api/public/gift-certificates/validate @gift-certs @public', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('gc-validate'); });

  it('400 when code is missing', async () => {
    const route = await import('@/app/api/public/gift-certificates/validate/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: {} },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/required/i);
  });

  it('400 for unknown code', async () => {
    const route = await import('@/app/api/public/gift-certificates/validate/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { code: 'CERT-NONE', context: 'booking' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/invalid/i);
  });

  it('200 with remainingAmount when cert is active', async () => {
    const cert = await seedCert(A, { amount: 8000 });
    const route = await import('@/app/api/public/gift-certificates/validate/route');
    const res = await callHandler<{ success: boolean; data: { code: string; initialAmount: number; remainingAmount: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { code: cert.code, context: 'booking' } },
    );
    expect(res.status).toBe(200);
    expect(res.data?.data.remainingAmount).toBe(8000);
  });

  it('400 when cert is expired', async () => {
    const cert = await seedCert(A, { amount: 1000, expiresAt: new Date(Date.now() - 1000) });
    const route = await import('@/app/api/public/gift-certificates/validate/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { code: cert.code, context: 'booking' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.message).toMatch(/expired/i);
  });

  it('400 when cert is fully redeemed (remaining=0)', async () => {
    const cert = await seedCert(A, { amount: 1000, remaining: 0, status: 'fully_redeemed' });
    const route = await import('@/app/api/public/gift-certificates/validate/route');
    const res = await callHandler<{ success: boolean; message: string }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { code: cert.code, context: 'booking' } },
    );
    expect(res.status).toBe(400);
    // Either "invalid/inactive" (status filter rejects it) or "fully redeemed" — both
    // are valid rejections. Just assert it's not a success.
    expect(res.data?.success).toBe(false);
  });

  it('400 when context does not match redeemableAt', async () => {
    const cert = await seedCert(A, { amount: 1000, redeemableAt: 'store' });
    const route = await import('@/app/api/public/gift-certificates/validate/route');
    const res = await callHandler<{ success: boolean }>(
      route as unknown as Record<string, unknown>, 'POST',
      { body: { code: cert.code, context: 'booking' } },
    );
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
  });
});

describe('Gift cert booking redemption — POST /api/public/booking/[slug]/book @gift-certs @public', () => {
  let A: TenantCtx;
  beforeEach(async () => { A = await sessionForNewClientUser('gc-redeem'); });

  it('partial redemption: deducts cert balance, writes redemption row, status stays active', async () => {
    const cert = await seedCert(A, { amount: 5000, redeemableAt: 'booking' });
    const { slug } = await seedBookingPage(A, 2000); // booking price < cert balance

    const route = await import('@/app/api/public/booking/[slug]/book/route');
    const res = await callHandler<{ success: boolean; data: { id?: number; total: number } }>(
      route as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: {
        name: 'Guest',
        email: 'guest@test.local',
        startTime: futureSlot().toISOString(),
        giftCertificateCode: cert.code,
      }},
    );
    expect(res.status).toBe(200);
    expect(res.data?.success).toBe(true);

    const sql = getTestSql();
    const [row] = await sql<{ remaining_amount: number; status: string }[]>`
      SELECT remaining_amount, status FROM ${sql(TEST_SCHEMA)}.gift_certificates WHERE id = ${cert.id}
    `;
    expect(row.remaining_amount).toBe(3000); // 5000 - 2000
    expect(row.status).toBe('active');

    const redemptions = await sql<{ amount: number; context: string }[]>`
      SELECT amount, context FROM ${sql(TEST_SCHEMA)}.gift_certificate_redemptions
      WHERE gift_certificate_id = ${cert.id}
    `;
    expect(redemptions.length).toBe(1);
    expect(redemptions[0].amount).toBe(2000);
    expect(redemptions[0].context).toBe('booking');
  });

  it('full redemption flips status to fully_redeemed and prevents re-use (double-redeem fails)', async () => {
    const cert = await seedCert(A, { amount: 2000, redeemableAt: 'booking' });
    const { slug } = await seedBookingPage(A, 2000); // exact match → cert covers it all

    // 1st booking — drains the cert to 0
    const bookRoute = await import('@/app/api/public/booking/[slug]/book/route');
    const r1 = await callHandler<{ success: boolean }>(
      bookRoute as unknown as Record<string, unknown>, 'POST',
      { params: { slug }, body: {
        name: 'Alice',
        email: 'alice@test.local',
        startTime: futureSlot(3).toISOString(),
        giftCertificateCode: cert.code,
      }},
    );
    expect(r1.status).toBe(200);
    expect(r1.data?.success).toBe(true);

    const sql = getTestSql();
    const [afterFirst] = await sql<{ remaining_amount: number; status: string }[]>`
      SELECT remaining_amount, status FROM ${sql(TEST_SCHEMA)}.gift_certificates WHERE id = ${cert.id}
    `;
    expect(afterFirst.remaining_amount).toBe(0);
    expect(afterFirst.status).toBe('fully_redeemed');

    // 2nd attempt — VALIDATE must reject the empty cert
    const validateRoute = await import('@/app/api/public/gift-certificates/validate/route');
    const r2 = await callHandler<{ success: boolean; message: string }>(
      validateRoute as unknown as Record<string, unknown>, 'POST',
      { body: { code: cert.code, context: 'booking' } },
    );
    expect(r2.status).toBe(400);
    expect(r2.data?.success).toBe(false);

    // The cert state is unchanged after the failed validate — and exactly ONE
    // redemption row exists. No second redemption can leak through.
    const [afterDouble] = await sql<{ remaining_amount: number; status: string }[]>`
      SELECT remaining_amount, status FROM ${sql(TEST_SCHEMA)}.gift_certificates WHERE id = ${cert.id}
    `;
    expect(afterDouble.remaining_amount).toBe(0);                  // unchanged
    expect(afterDouble.status).toBe('fully_redeemed');             // unchanged

    // Exactly ONE redemption row should exist for this cert.
    const redemptions = await sql<{ id: number }[]>`
      SELECT id FROM ${sql(TEST_SCHEMA)}.gift_certificate_redemptions
      WHERE gift_certificate_id = ${cert.id}
    `;
    expect(redemptions.length).toBe(1);
  });
});
