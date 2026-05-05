/**
 * Portal Booking Internals — golden-path coverage for the booking page's
 * sub-resources (bookings, addons, members, waivers, quotes, date overrides).
 *
 * Marked @critical so it runs in the golden-path subset (`bun test:critical`).
 *
 * Resource IDs created here all use the `BKG-INT-` prefix in their identifying
 * string fields where possible, so a stale-data sweep can find leaks. Cleanup
 * runs in reverse order via `runCleanups`.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

const PFX = 'BKG-INT-';

async function createBookingPage(api: import('./setup/api-client').ApiClient, label: string) {
  const title = `${PFX}${label}-${Date.now()}`;
  const res = await api.post('/api/portal/tools/booking', {
    title,
    description: 'E2E booking-internals page',
    duration: 30,
    timezone: 'UTC',
  });
  if (!res.data?.success) throw new Error(`Failed to create booking page: ${res.data?.message}`);
  const page = res.data.data as { id: number; slug: string; title: string };
  const cleanup = async () => {
    await api.delete(`/api/portal/tools/booking/${page.id}`).catch(() => {});
  };
  return { page, cleanup };
}

test.describe('Portal Booking Internals — bookings @booking @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('list bookings on a page returns []', async ({ clientApi }) => {
    const { page, cleanup } = await createBookingPage(clientApi, 'list');
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/tools/booking/${page.id}/bookings`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('list bookings on a foreign page is 404 (cross-tenant)', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/tools/booking/999999/bookings');
    expect(res.status).toBe(404);
  });

  test('list bookings rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/tools/booking/1/bookings');
    expect(res.status).toBe(401);
  });
});

test.describe('Portal Booking Internals — add-ons @booking @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('create -> edit price -> delete add-on', async ({ clientApi }) => {
    const { page, cleanup } = await createBookingPage(clientApi, 'addons');
    cleanups.push(cleanup);

    // Create
    const created = await clientApi.post(`/api/portal/tools/booking/${page.id}/add-ons`, {
      source: 'custom',
      name: `${PFX}T-shirt`,
      description: 'Souvenir T-shirt',
      price: 2500,
    });
    expect(created.status).toBe(201);
    expect(created.data.success).toBe(true);
    const addOnId = created.data.data.id;

    // Update price
    const updated = await clientApi.put(`/api/portal/tools/booking/${page.id}/add-ons/${addOnId}`, {
      price: 3000,
      active: false,
    });
    expect(updated.status).toBe(200);
    expect(updated.data.data.price).toBe(3000);
    expect(updated.data.data.active).toBe(false);

    // List shows it
    const list = await clientApi.get(`/api/portal/tools/booking/${page.id}/add-ons`);
    expect(list.status).toBe(200);
    expect(list.data.data.find((a: { id: number }) => a.id === addOnId)).toBeTruthy();

    // Delete
    const del = await clientApi.delete(`/api/portal/tools/booking/${page.id}/add-ons/${addOnId}`);
    expect(del.status).toBe(200);

    // Deleted: PUT now 404
    const after = await clientApi.put(`/api/portal/tools/booking/${page.id}/add-ons/${addOnId}`, { name: 'gone' });
    expect(after.status).toBe(404);
  });

  test('add-on POST rejects custom without name+price', async ({ clientApi }) => {
    const { page, cleanup } = await createBookingPage(clientApi, 'addons-bad');
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/tools/booking/${page.id}/add-ons`, {
      source: 'custom',
      name: `${PFX}Missing-price`,
    });
    expect(res.status).toBe(400);
  });
});

test.describe('Portal Booking Internals — date overrides @booking @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('create -> list -> delete a blocked date override', async ({ clientApi }) => {
    const { page, cleanup } = await createBookingPage(clientApi, 'overrides');
    cleanups.push(cleanup);

    const date = '2027-03-15';
    const created = await clientApi.post(`/api/portal/tools/booking/${page.id}/date-overrides`, {
      date, type: 'blocked', note: `${PFX}holiday`,
    });
    expect(created.status).toBe(201);
    const overrideId = created.data.data.id;

    const list = await clientApi.get(`/api/portal/tools/booking/${page.id}/date-overrides`);
    expect(list.status).toBe(200);
    expect(list.data.data.find((o: { id: number }) => o.id === overrideId)).toBeTruthy();

    const del = await clientApi.delete(`/api/portal/tools/booking/${page.id}/date-overrides/${overrideId}`);
    expect(del.status).toBe(200);
  });

  test('rejects type=available without start/end times', async ({ clientApi }) => {
    const { page, cleanup } = await createBookingPage(clientApi, 'overrides-bad');
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/tools/booking/${page.id}/date-overrides`, {
      date: '2027-04-01', type: 'available',
    });
    expect(res.status).toBe(400);
  });
});

test.describe('Portal Booking Internals — quotes @booking @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('create quote -> edit -> delete', async ({ clientApi }) => {
    const ts = Date.now();
    const created = await clientApi.post('/api/portal/tools/booking/quotes', {
      title: `${PFX}Quote-${ts}`,
      price: 25000,
      customerName: `${PFX}Customer ${ts}`,
      customerEmail: `bkg-int-${ts}@example.com`,
      lineItems: [{ name: 'Premium package', quantity: 1, unitPrice: 25000 }],
    });
    expect(created.status).toBe(201);
    expect(created.data.success).toBe(true);
    const quoteId = created.data.data.id;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/tools/booking/quotes/${quoteId}`).catch(() => {});
    });

    // Edit price
    const updated = await clientApi.put(`/api/portal/tools/booking/quotes/${quoteId}`, {
      price: 30000,
      status: 'paid',
    });
    expect(updated.status).toBe(200);
    expect(updated.data.data.price).toBe(30000);
    expect(updated.data.data.status).toBe('paid');

    // List includes it
    const list = await clientApi.get('/api/portal/tools/booking/quotes');
    expect(list.status).toBe(200);
    expect(list.data.data.find((q: { id: number }) => q.id === quoteId)).toBeTruthy();

    // Delete
    const del = await clientApi.delete(`/api/portal/tools/booking/quotes/${quoteId}`);
    expect(del.status).toBe(200);
  });

  test('quote POST rejects missing required fields', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/tools/booking/quotes', {
      title: `${PFX}NoEmail`,
      price: 10000,
      customerName: `${PFX}Nameless`,
    });
    expect(res.status).toBe(400);
  });
});

test.describe('Portal Booking Internals — members @booking @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('GET members shape (members + teamMembers)', async ({ clientApi }) => {
    const { page, cleanup } = await createBookingPage(clientApi, 'members');
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/tools/booking/${page.id}/members`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data.members)).toBe(true);
    expect(Array.isArray(res.data.data.teamMembers)).toBe(true);
  });

  test('POST member rejects missing userId', async ({ clientApi }) => {
    const { page, cleanup } = await createBookingPage(clientApi, 'members-bad');
    cleanups.push(cleanup);

    const res = await clientApi.post(`/api/portal/tools/booking/${page.id}/members`, {});
    expect(res.status).toBe(400);
  });

  test('DELETE member without memberId param is 400', async ({ clientApi }) => {
    const { page, cleanup } = await createBookingPage(clientApi, 'members-rm');
    cleanups.push(cleanup);

    const res = await clientApi.delete(`/api/portal/tools/booking/${page.id}/members`);
    expect(res.status).toBe(400);
  });
});

test.describe('Portal Booking Internals — waivers @booking @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('GET waivers list returns []', async ({ clientApi }) => {
    const { page, cleanup } = await createBookingPage(clientApi, 'waivers');
    cleanups.push(cleanup);

    const res = await clientApi.get(`/api/portal/tools/booking/${page.id}/waivers`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET waivers rejects unauthed', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/tools/booking/1/waivers');
    expect(res.status).toBe(401);
  });

  test('GET waivers cross-tenant 404', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/tools/booking/9999999/waivers');
    expect(res.status).toBe(404);
  });
});
