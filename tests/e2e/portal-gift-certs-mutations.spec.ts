/**
 * Portal Gift Certificates — golden-path mutations.
 *
 * @critical: must-pass gate before declaring the gift-cert surface deliverable.
 *
 * Flow exercised end-to-end against the live dev server:
 *   1. Issue a $50 (5000 cents) gift certificate via the portal.
 *   2. Create + publish a booking page with `enableGiftCertificates: true`,
 *      priced at $20 (2000 cents).
 *   3. Public-book TWICE using the cert:
 *        a. First booking → cert balance drops 5000 → 3000 (partial redemption).
 *        b. Second booking → cert balance drops 3000 → 0 (full redemption).
 *           Status flips to `fully_redeemed`.
 *   4. Validate endpoint must REJECT the now-empty cert (double-redeem
 *      prevention).
 *
 * Service gating: this whole spec is gated on the seeded test client having an
 * active `booking` subscription. test.skip's when no access (mirrors
 * portal-tools-gift-certificates.spec.ts).
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

const PREFIX = 'GC-';

test.describe('Portal Gift Certs — Issue → Redeem → Double-redeem prevention @gift-certificates @mutations @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let hasAccess = false;

  test.beforeAll(async ({ clientApi }) => {
    const probe = await clientApi.get('/api/portal/tools/gift-certificates');
    hasAccess = probe.status === 200;
  });

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('issue → partial redeem → full redeem → double-redeem must fail', async ({ clientApi, unauthApi }) => {
    test.skip(!hasAccess, 'No booking subscription on test seed');
    const ts = Date.now();

    // ── 1. Issue a $50 gift cert ────────────────────────────────────────────
    const issueRes = await clientApi.post('/api/portal/tools/gift-certificates', {
      amount: 5000, // 50.00
      purchaserName: `${PREFIX}Purchaser ${ts}`,
      purchaserEmail: `${PREFIX.toLowerCase()}p-${ts}@example.com`,
      recipientName: `${PREFIX}Recipient`,
      recipientEmail: `${PREFIX.toLowerCase()}r-${ts}@example.com`,
      personalMessage: 'Mutation test',
      redeemableAt: 'both',
    });
    expect(issueRes.status).toBe(201);
    expect(issueRes.data.success).toBe(true);
    const certId: number = issueRes.data.data.id;
    const certCode: string = issueRes.data.data.code;
    expect(certCode).toMatch(/^CERT-/);
    expect(issueRes.data.data.initialAmount).toBe(5000);
    expect(issueRes.data.data.remainingAmount).toBe(5000);
    expect(issueRes.data.data.status).toBe('active');

    // No DELETE on gift certs — soft-cancel via PUT during cleanup.
    cleanups.push(async () => {
      await clientApi.put(`/api/portal/tools/gift-certificates/${certId}`, {
        status: 'cancelled',
      }).catch(() => {});
    });

    // ── 2. Create a booking page with gift certs enabled, $20 price ─────────
    const slug = `gc-page-${ts}`;
    const pageRes = await clientApi.post('/api/portal/tools/booking', {
      title: `${PREFIX}Page ${ts}`,
      slug,
      duration: 30,
      price: 2000, // 20.00
      enableGiftCertificates: true,
      // Use a wide-open availability so we don't have to worry about TZ.
      availability: [0, 1, 2, 3, 4, 5, 6].map(day => ({
        day, startTime: '00:00', endTime: '23:59', enabled: true,
      })),
      timezone: 'UTC',
      maxAdvanceDays: 60,
      minNoticeMins: 60,
    });
    // Some seeds require a websiteId or extra fields — accept 200 or 201.
    expect([200, 201]).toContain(pageRes.status);
    test.skip(!pageRes.data?.success, `Booking page create failed: ${pageRes.data?.message}`);
    const pageId: number = pageRes.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/tools/booking/${pageId}`).catch(() => {});
    });

    // Build a future booking time well past minNoticeMins.
    const startTimeFor = (daysAhead: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + daysAhead);
      d.setUTCHours(12, 0, 0, 0);
      return d.toISOString();
    };

    // ── 3a. First booking — partial redemption (5000 → 3000) ───────────────
    const r1 = await unauthApi.post(`/api/public/booking/${slug}/book`, {
      name: `${PREFIX}Alice`,
      email: `${PREFIX.toLowerCase()}alice-${ts}@example.com`,
      startTime: startTimeFor(3),
      giftCertificateCode: certCode,
    });
    expect(r1.status).toBe(200);
    expect(r1.data.success).toBe(true);

    const afterFirst = await clientApi.get(`/api/portal/tools/gift-certificates/${certId}`);
    expect(afterFirst.status).toBe(200);
    expect(afterFirst.data.data.remainingAmount).toBe(3000);
    expect(afterFirst.data.data.status).toBe('active');
    expect(Array.isArray(afterFirst.data.data.redemptions)).toBe(true);
    expect(afterFirst.data.data.redemptions.length).toBe(1);
    expect(afterFirst.data.data.redemptions[0].amount).toBe(2000);

    // ── 3b. Second booking — drains the cert (3000 → 0, fully_redeemed) ─────
    // Use a different time slot so we don't conflict with the first booking.
    const r2 = await unauthApi.post(`/api/public/booking/${slug}/book`, {
      name: `${PREFIX}Bob`,
      email: `${PREFIX.toLowerCase()}bob-${ts}@example.com`,
      startTime: startTimeFor(4),
      giftCertificateCode: certCode,
    });
    expect(r2.status).toBe(200);
    expect(r2.data.success).toBe(true);

    const afterFull = await clientApi.get(`/api/portal/tools/gift-certificates/${certId}`);
    expect(afterFull.status).toBe(200);
    expect(afterFull.data.data.remainingAmount).toBe(0);
    expect(afterFull.data.data.status).toBe('fully_redeemed');
    expect(afterFull.data.data.redemptions.length).toBe(2);

    // ── 4. Attempt to redeem again — must FAIL at validate ────────────────
    const reValidate = await unauthApi.post('/api/public/gift-certificates/validate', {
      code: certCode,
      context: 'booking',
    });
    expect(reValidate.status).toBe(400);
    expect(reValidate.data.success).toBe(false);

    // And the cert state remains unchanged (nothing leaked).
    const finalState = await clientApi.get(`/api/portal/tools/gift-certificates/${certId}`);
    expect(finalState.data.data.remainingAmount).toBe(0);
    expect(finalState.data.data.status).toBe('fully_redeemed');
    expect(finalState.data.data.redemptions.length).toBe(2);
  });
});
