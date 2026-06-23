/**
 * Portal-REST parity gap coverage @gap @portal-rest
 *
 * Exercises the new portal REST routes that mirror previously MCP-only logic:
 *   - GET   /api/portal/websites/[siteId]/store/reviews
 *   - PATCH /api/portal/websites/[siteId]/store/reviews/[reviewId]
 *   - GET   /api/portal/websites/[siteId]/store/customer-messages
 *   - POST  /api/portal/websites/[siteId]/store/customer-messages/[messageId]/reply
 *   - POST  /api/portal/surveys/[id]/fork
 *
 * Store rows (product/review/customer/message) are seeded directly via psql.
 * Cross-site isolation is checked by seeding a review/message on a SECOND site
 * the tenant also owns and confirming it is invisible to the first site's route.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, resolveClientSiteId, createTestWebsite, createTestSurvey } from './setup/helpers';
import { execSync } from 'child_process';

const TEST_DB = `postgresql://${process.env.USER ?? ''}@localhost:5432/simplerdev_test`;

function sql(q: string): string {
  return execSync(`psql "${TEST_DB}" -At -c "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();
}

async function seedProduct(websiteId: number): Promise<number> {
  const slug = `gap-rest-prod-${Date.now().toString(36)}-${Math.floor(performance.now())}`;
  return parseInt(
    sql(
      `INSERT INTO products (website_id, name, slug, price, track_inventory, quantity, status, featured, is_designable, designable, created_at, updated_at) ` +
        `VALUES (${websiteId}, 'Gap REST Product', '${slug}', 1000, false, 0, 'active', false, false, false, now(), now()) RETURNING id`,
    ),
    10,
  );
}

async function seedReview(websiteId: number, productId: number, status = 'pending'): Promise<number> {
  return parseInt(
    sql(
      `INSERT INTO store_product_reviews (website_id, product_id, rating, title, body, status, created_at) ` +
        `VALUES (${websiteId}, ${productId}, 5, 'Great', 'Nice product', '${status}', now()) RETURNING id`,
    ),
    10,
  );
}

async function seedCustomer(websiteId: number): Promise<number> {
  const email = `gap-rest-cust-${Date.now().toString(36)}-${Math.floor(performance.now())}@example.com`;
  return parseInt(
    sql(
      `INSERT INTO store_customers (website_id, email, password_hash, email_verified, status, order_count, total_spent, created_at, updated_at) ` +
        `VALUES (${websiteId}, '${email}', 'x', false, 'active', 0, 0, now(), now()) RETURNING id`,
    ),
    10,
  );
}

async function seedMessage(websiteId: number, customerId: number, status = 'open'): Promise<number> {
  return parseInt(
    sql(
      `INSERT INTO store_customer_messages (website_id, customer_id, subject, category, status, created_at, updated_at) ` +
        `VALUES (${websiteId}, ${customerId}, 'Need help', 'general', '${status}', now(), now()) RETURNING id`,
    ),
    10,
  );
}

test.describe('Portal-REST parity — store reviews @gap @portal-rest @store', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    siteId = await resolveClientSiteId(clientApi);
  });
  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('GET reviews returns 200 + array for the resolved site', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/reviews`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET reviews requires auth (401)', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/store/reviews`);
    expect(res.status).toBe(401);
  });

  test('PATCH moderate approves a pending review', async ({ clientApi }) => {
    const productId = await seedProduct(siteId);
    const reviewId = await seedReview(siteId, productId, 'pending');
    cleanups.push(async () => {
      sql(`DELETE FROM store_product_reviews WHERE id=${reviewId}`);
      sql(`DELETE FROM products WHERE id=${productId}`);
    });

    const res = await clientApi.patch(
      `/api/portal/websites/${siteId}/store/reviews/${reviewId}`,
      { status: 'approved' },
    );
    expect(res.status).toBe(200);
    expect(res.data.data.status).toBe('approved');
    expect(sql(`SELECT status FROM store_product_reviews WHERE id=${reviewId}`)).toBe('approved');
  });

  test('PATCH moderate rejects invalid status with 400', async ({ clientApi }) => {
    const res = await clientApi.patch(
      `/api/portal/websites/${siteId}/store/reviews/123`,
      { status: 'bogus' },
    );
    expect(res.status).toBe(400);
  });

  test('PATCH moderate 404 for unknown review id', async ({ clientApi }) => {
    const res = await clientApi.patch(
      `/api/portal/websites/${siteId}/store/reviews/999999`,
      { status: 'approved' },
    );
    expect(res.status).toBe(404);
  });

  test('PATCH moderate 401 unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.patch(
      `/api/portal/websites/${siteId}/store/reviews/123`,
      { status: 'approved' },
    );
    expect(res.status).toBe(401);
  });

  test('PATCH moderate cannot touch a review on a DIFFERENT site (404)', async ({ clientApi }) => {
    const { website: otherSite } = await createTestWebsite(clientApi);
    const productId = await seedProduct(otherSite.id);
    const reviewId = await seedReview(otherSite.id, productId, 'pending');
    cleanups.push(async () => {
      sql(`DELETE FROM store_product_reviews WHERE id=${reviewId}`);
      sql(`DELETE FROM products WHERE id=${productId}`);
    });
    // Moderate via the FIRST site's endpoint → review's websiteId mismatches → 404.
    const res = await clientApi.patch(
      `/api/portal/websites/${siteId}/store/reviews/${reviewId}`,
      { status: 'approved' },
    );
    expect(res.status).toBe(404);
    expect(sql(`SELECT status FROM store_product_reviews WHERE id=${reviewId}`)).toBe('pending');
  });
});

test.describe('Portal-REST parity — customer messages @gap @portal-rest @store', () => {
  let siteId: number;
  const cleanups: Array<() => Promise<void>> = [];

  test.beforeAll(async ({ clientApi }) => {
    siteId = await resolveClientSiteId(clientApi);
  });
  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('GET customer-messages returns 200 + array', async ({ clientApi }) => {
    const res = await clientApi.get(`/api/portal/websites/${siteId}/store/customer-messages`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET customer-messages requires auth (401)', async ({ unauthApi }) => {
    const res = await unauthApi.get(`/api/portal/websites/${siteId}/store/customer-messages`);
    expect(res.status).toBe(401);
  });

  test('POST reply posts a staff reply and sets status=replied', async ({ clientApi }) => {
    const customerId = await seedCustomer(siteId);
    const messageId = await seedMessage(siteId, customerId, 'open');
    cleanups.push(async () => {
      sql(`DELETE FROM store_customer_message_replies WHERE message_id=${messageId}`);
      sql(`DELETE FROM store_customer_messages WHERE id=${messageId}`);
      sql(`DELETE FROM store_customers WHERE id=${customerId}`);
    });

    const res = await clientApi.post(
      `/api/portal/websites/${siteId}/store/customer-messages/${messageId}/reply`,
      { body: 'Thanks for reaching out!' },
    );
    expect(res.status).toBe(200);
    expect(res.data.data.isStaff).toBe(true);
    expect(sql(`SELECT status FROM store_customer_messages WHERE id=${messageId}`)).toBe('replied');
  });

  test('POST reply rejects empty body with 400', async ({ clientApi }) => {
    const res = await clientApi.post(
      `/api/portal/websites/${siteId}/store/customer-messages/123/reply`,
      { body: '' },
    );
    expect(res.status).toBe(400);
  });

  test('POST reply 404 for unknown message id', async ({ clientApi }) => {
    const res = await clientApi.post(
      `/api/portal/websites/${siteId}/store/customer-messages/999999/reply`,
      { body: 'hello' },
    );
    expect(res.status).toBe(404);
  });

  test('POST reply 401 unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(
      `/api/portal/websites/${siteId}/store/customer-messages/123/reply`,
      { body: 'hello' },
    );
    expect(res.status).toBe(401);
  });

  test('POST reply cannot touch a message on a DIFFERENT site (404)', async ({ clientApi }) => {
    const { website: otherSite } = await createTestWebsite(clientApi);
    const customerId = await seedCustomer(otherSite.id);
    const messageId = await seedMessage(otherSite.id, customerId, 'open');
    cleanups.push(async () => {
      sql(`DELETE FROM store_customer_message_replies WHERE message_id=${messageId}`);
      sql(`DELETE FROM store_customer_messages WHERE id=${messageId}`);
      sql(`DELETE FROM store_customers WHERE id=${customerId}`);
    });
    const res = await clientApi.post(
      `/api/portal/websites/${siteId}/store/customer-messages/${messageId}/reply`,
      { body: 'hello' },
    );
    expect(res.status).toBe(404);
    expect(sql(`SELECT status FROM store_customer_messages WHERE id=${messageId}`)).toBe('open');
  });
});

test.describe('Portal-REST parity — survey fork @gap @portal-rest @surveys', () => {
  const cleanups: Array<() => Promise<void>> = [];
  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('POST fork creates a draft tied to the parent', async ({ clientApi }) => {
    const { survey: source, cleanup: srcCleanup } = await createTestSurvey(clientApi);
    cleanups.push(srcCleanup);
    const res = await clientApi.post(`/api/portal/surveys/${source.id}/fork`, {});
    expect(res.status).toBe(201);
    expect(res.data.success).toBe(true);
    expect(res.data.data.parentSurveyId).toBe(source.id);
    expect(res.data.data.status).toBe('draft');
    expect(res.data.data.id).not.toBe(source.id);
    const forkId = res.data.data.id;
    cleanups.push(async () => {
      sql(`DELETE FROM surveys WHERE id=${forkId}`);
    });
  });

  test('POST fork 404 for unknown survey id', async ({ clientApi }) => {
    const res = await clientApi.post(`/api/portal/surveys/999999/fork`, {});
    expect(res.status).toBe(404);
  });

  test('POST fork 401 unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post(`/api/portal/surveys/123/fork`, {});
    expect(res.status).toBe(401);
  });
});
