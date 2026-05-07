/**
 * Group / class bookings — E2E.
 *
 * Creates a booking page with bookingType='group' and groupCapacity=3, then:
 *   1. books 3 attendees against the same slot via the public flow,
 *   2. asserts a 4th attempt is rejected with 409 Conflict.
 *
 * Uses the public booking endpoint (POST /api/public/booking/:slug/book) which
 * is unauthenticated — exactly what real customers hit. Page creation +
 * promotion to group mode go through the authenticated portal API as the
 * standard test client.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

test.describe('Group bookings @booking @group', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('rejects a 4th booking when groupCapacity=3', async ({ clientApi, unauthApi }) => {
    // 1. Create a booking page (defaults to bookingType='individual')
    const title = `Group Class ${Date.now()}`;
    const create = await clientApi.post('/api/portal/tools/booking', {
      title,
      description: 'E2E group-booking capacity test',
      duration: 60,
    });
    expect(create.status).toBe(200);
    expect(create.data.success).toBe(true);
    const pageId = create.data.data.id as number;
    const slug = create.data.data.slug as string;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/tools/booking/${pageId}`).catch(() => {});
    });

    // 2. Promote to group mode with capacity=3 and ensure the page is active.
    //    minNoticeMins=0 + maxAdvanceDays=365 keeps the slot reachable from
    //    whatever wall-clock time the test runs at.
    const update = await clientApi.put(`/api/portal/tools/booking/${pageId}`, {
      bookingType: 'group',
      groupCapacity: 3,
      assignmentMode: 'fixed',
      minNoticeMins: 0,
      maxAdvanceDays: 365,
      // 24/7 availability so the slot below is guaranteed valid
      availability: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        day,
        startTime: '00:00',
        endTime: '23:59',
        enabled: true,
      })),
    });
    expect(update.status).toBe(200);
    expect(update.data.success).toBe(true);
    expect(update.data.data.bookingType).toBe('group');
    expect(update.data.data.groupCapacity).toBe(3);

    // Choose a slot ~7 days out, on the hour, in UTC. The booking endpoint
    // accepts ISO strings and converts internally.
    const slotStart = new Date();
    slotStart.setUTCDate(slotStart.getUTCDate() + 7);
    slotStart.setUTCHours(15, 0, 0, 0);
    const startTime = slotStart.toISOString();

    // 3. Book 3 attendees, one per request — each request consumes one seat.
    for (let i = 0; i < 3; i++) {
      const res = await unauthApi.post(`/api/public/booking/${slug}/book`, {
        name: `Attendee ${i + 1}`,
        email: `attendee${i + 1}.${Date.now()}@example.com`,
        startTime,
        seats: 1,
        attendees: [
          {
            name: `Attendee ${i + 1}`,
            email: `attendee${i + 1}.${Date.now()}@example.com`,
          },
        ],
      });
      expect(res.status, `attendee #${i + 1} should succeed`).toBe(200);
      expect(res.data.success).toBe(true);
    }

    // 4. The 4th attempt must be rejected with HTTP 409 (slot full).
    const overflow = await unauthApi.post(`/api/public/booking/${slug}/book`, {
      name: 'Overflow Attendee',
      email: `overflow.${Date.now()}@example.com`,
      startTime,
      seats: 1,
      attendees: [
        { name: 'Overflow Attendee', email: `overflow.${Date.now()}@example.com` },
      ],
    });
    expect(overflow.status).toBe(409);
    expect(overflow.data.success).toBe(false);
    expect(typeof overflow.data.message).toBe('string');
  });
});
