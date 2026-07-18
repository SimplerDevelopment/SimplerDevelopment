/**
 * Admin Booking API E2E Tests
 *
 * Tests for /api/admin/portal/booking
 * Returns booking pages, upcoming bookings, and stats across all clients.
 */
import { test, expect } from './setup/fixtures';

test.describe('Admin Booking @admin @booking', () => {
  test('GET /booking returns pages array and upcoming bookings array', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/booking');
    if (res.status !== 200) console.log('Booking API error:', JSON.stringify(res.data));
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data).toHaveProperty('pages');
    expect(res.data).toHaveProperty('upcomingBookings');
    expect(res.data).toHaveProperty('stats');
    expect(Array.isArray(res.data.pages)).toBe(true);
    expect(Array.isArray(res.data.upcomingBookings)).toBe(true);
  });

  test('stats has totalPages, activePages, totalUpcoming', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/booking');
    const { stats } = res.data;
    expect(stats).toHaveProperty('totalPages');
    expect(stats).toHaveProperty('activePages');
    expect(stats).toHaveProperty('totalUpcoming');
    expect(typeof stats.totalPages).toBe('number');
    expect(typeof stats.activePages).toBe('number');
    expect(typeof stats.totalUpcoming).toBe('number');
  });

  test('each page has expected fields', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/booking');

    if (res.data.pages.length > 0) {
      const page = res.data.pages[0];
      expect(page).toHaveProperty('id');
      expect(page).toHaveProperty('title');
      expect(page).toHaveProperty('slug');
      expect(page).toHaveProperty('duration');
      expect(page).toHaveProperty('active');
      expect(page).toHaveProperty('timezone');
      expect(page).toHaveProperty('company');
      expect(page).toHaveProperty('clientName');
      expect(page).toHaveProperty('totalBookings');
      expect(page).toHaveProperty('upcomingBookings');
    }
  });

  test('upcoming bookings have expected fields', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/portal/booking');

    if (res.data.upcomingBookings.length > 0) {
      const booking = res.data.upcomingBookings[0];
      expect(booking).toHaveProperty('id');
      expect(booking).toHaveProperty('guestName');
      expect(booking).toHaveProperty('guestEmail');
      expect(booking).toHaveProperty('startTime');
      expect(booking).toHaveProperty('endTime');
      expect(booking).toHaveProperty('status');
      expect(booking).toHaveProperty('bookingPageTitle');
      expect(booking).toHaveProperty('company');
      expect(booking).toHaveProperty('clientName');
    }
  });

  test('rejects client role (401)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/admin/portal/booking');
    expect(res.status).toBe(401);
  });

  test('rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/portal/booking');
    expect(res.status).toBe(401);
  });
});
