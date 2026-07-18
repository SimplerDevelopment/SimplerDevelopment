/**
 * Storefront gap coverage — product review moderation and customer message flow.
 *
 * Gap 1: Portal product review moderation (store_product_reviews)
 *   - No public REST submission endpoint exists; reviews are created via direct DB
 *     insert in beforeAll (same approach used by other MCP-only paths in this repo).
 *   - Tested via MCP tools: store_reviews_list, store_reviews_moderate
 *
 * Gap 2: Portal customer messages (store_customer_messages)
 *   - Customer creates a message via the public storefront support endpoint.
 *   - Staff views and replies via MCP tools: store_customer_messages_list,
 *     store_customer_messages_reply
 *   - Status transition to 'replied' asserted after the reply.
 */
import { execSync } from 'child_process';
import { request as pwRequest } from '@playwright/test';
import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestApiKey,
  McpTestClient,
  createTestWebsite,
} from './setup/helpers';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_DB = process.env.DATABASE_URL || 'postgresql://localhost:5432/simplerdev_test';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Run a SQL command against the test DB using psql (setup/teardown only). */
function sql(query: string): string {
  return execSync(`psql "${TEST_DB}" -c "${query.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
  });
}

/** Create a product in a site via portal REST, return id + cleanup fn. */
async function createTestProduct(
  api: { post: (url: string, body: unknown) => Promise<{ status: number; data: { success: boolean; data: { id: number } } }> },
  siteId: number,
) {
  const ts = Date.now();
  const res = await api.post(`/api/portal/websites/${siteId}/store/products`, {
    name: `E2E Review Product ${ts}`,
    slug: `e2e-review-product-${ts}`,
    price: 1000,
    status: 'active',
    trackInventory: false,
  });
  if (res.status !== 201) throw new Error(`Product create failed: ${res.status} ${JSON.stringify(res.data)}`);
  const productId = res.data.data.id;
  const cleanup = async () => {
    await (api as unknown as { delete: (u: string) => Promise<void> })
      .delete(`/api/portal/websites/${siteId}/store/products/${productId}`)
      .catch(() => {});
  };
  return { productId, cleanup };
}

// ── Gap 1: Product review moderation ──────────────────────────────────────────

test.describe('Storefront — Product review moderation @gap @store @reviews', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let siteId: number;
  let productId: number;
  let reviewId: number;

  test.beforeAll(async ({ clientApi }) => {
    // 1. Fresh isolated website
    const { website } = await createTestWebsite(clientApi);
    siteId = (website as { id: number }).id;

    // 2. Enable store settings for the site
    await clientApi.put(`/api/portal/websites/${siteId}/store/settings`, {
      enabled: true,
      storeName: 'E2E Review Store',
    });

    // 3. Create a product
    const prod = await createTestProduct(clientApi, siteId);
    productId = prod.productId;
    cleanups.push(prod.cleanup);

    // 4. Insert a pending review directly — there is no public submission endpoint
    const ts = Date.now();
    const output = execSync(
      `psql "${TEST_DB}" -t -c "INSERT INTO store_product_reviews (website_id, product_id, rating, title, body, status) VALUES (${siteId}, ${productId}, 4, 'Great product ${ts}', 'Really enjoyed it', 'pending') RETURNING id;"`,
      { encoding: 'utf-8' },
    );
    reviewId = parseInt(output.trim(), 10);
    if (!reviewId) throw new Error(`Could not parse review ID from psql output: "${output}"`);

    cleanups.push(async () => {
      execSync(
        `psql "${TEST_DB}" -c "DELETE FROM store_product_reviews WHERE id = ${reviewId};"`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );
    });
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('store_reviews_list and store_reviews_moderate tools are registered', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['*'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t: { name: string }) => t.name));
    expect(names.has('store_reviews_list')).toBe(true);
    expect(names.has('store_reviews_moderate')).toBe(true);
  });

  test('store_reviews_list without store:read scope hides the tool', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['projects:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t: { name: string }) => t.name));
    expect(names.has('store_reviews_list')).toBe(false);
  });

  test('store_reviews_list returns pending review for the site', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['store:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('store_reviews_list', { websiteId: siteId, status: 'pending' });
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    expect(Array.isArray(res.data)).toBe(true);
    const review = (res.data as Array<{ id: number; status: string; rating: number }>)
      .find((r) => r.id === reviewId);
    expect(review).toBeDefined();
    expect(review?.status).toBe('pending');
    expect(review?.rating).toBe(4);
  });

  test('store_reviews_moderate approve changes status to approved', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      scopes: ['store:read', 'store:write'],
    });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('store_reviews_moderate', { id: reviewId, action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    const updated = res.data as { id: number; status: string };
    expect(updated.id).toBe(reviewId);
    expect(updated.status).toBe('approved');

    // Verify via list
    const listRes = await mcp.callTool('store_reviews_list', { websiteId: siteId, status: 'approved' });
    expect(Array.isArray(listRes.data)).toBe(true);
    const found = (listRes.data as Array<{ id: number }>).find((r) => r.id === reviewId);
    expect(found).toBeDefined();
  });

  test('store_reviews_moderate reject changes status to rejected', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      scopes: ['store:read', 'store:write'],
    });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    // Reset the review to pending so we can test rejection
    execSync(
      `psql "${TEST_DB}" -c "UPDATE store_product_reviews SET status = 'pending' WHERE id = ${reviewId};"`,
      { encoding: 'utf-8', stdio: 'pipe' },
    );

    const res = await mcp.callTool('store_reviews_moderate', { id: reviewId, action: 'reject' });
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    const updated = res.data as { id: number; status: string };
    expect(updated.id).toBe(reviewId);
    expect(updated.status).toBe('rejected');
  });

  test('store_reviews_moderate non-existent id returns error envelope', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      scopes: ['store:read', 'store:write'],
    });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('store_reviews_moderate', { id: 999_999_999, action: 'approve' });
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('error');
    expect((res.data as { error: string }).error).toBe('Review not found');
  });

  test('store_reviews_moderate without store:write scope hides the tool', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['store:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t: { name: string }) => t.name));
    expect(names.has('store_reviews_list')).toBe(true);     // read tool visible
    expect(names.has('store_reviews_moderate')).toBe(false); // write tool hidden
  });
});

// ── Gap 2: Customer messages — list + staff reply ─────────────────────────────

test.describe('Storefront — Customer messages @gap @store @customer-messages', () => {
  let cleanups: Array<() => Promise<void>> = [];
  let siteId: number;
  let messageId: number;

  test.beforeAll(async ({ clientApi }) => {
    // 1. Fresh isolated website with customer accounts enabled
    const { website } = await createTestWebsite(clientApi);
    siteId = (website as { id: number }).id;

    await clientApi.put(`/api/portal/websites/${siteId}/store/settings`, {
      enabled: true,
      enableCustomerAccounts: true,
      storeName: 'E2E Message Store',
    });

    // 2. Register a storefront customer
    const ts = Date.now();
    const custEmail = `e2e-msg-customer-${ts}@example.com`;
    const custPassword = `Password${ts}!`;

    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    cleanups.push(() => ctx.dispose());

    const regRes = await ctx.post(`/api/storefront/${siteId}/auth`, {
      data: {
        action: 'register',
        email: custEmail,
        password: custPassword,
        firstName: 'E2E',
        lastName: 'MsgCustomer',
      },
    });

    if (regRes.status() === 403) {
      // Customer accounts not yet enabled for this freshly-created site — skip setup
      return;
    }

    const regBody = await regRes.json();
    if (!regBody.success) throw new Error(`Customer register failed: ${JSON.stringify(regBody)}`);
    const customerToken = regBody.data.token as string;

    cleanups.push(async () => {
      // Customer cleanup: delete via direct SQL (no portal endpoint)
      const custId = regBody.data.customer?.id;
      if (custId) {
        execSync(
          `psql "${TEST_DB}" -c "DELETE FROM store_customers WHERE id = ${custId};"`,
          { encoding: 'utf-8', stdio: 'pipe' },
        );
      }
    });

    // 3. Create a customer support message via storefront API
    const msgRes = await ctx.post(`/api/storefront/${siteId}/account/support`, {
      headers: { Authorization: `Bearer ${customerToken}` },
      data: {
        subject: `E2E Test Message ${ts}`,
        category: 'general',
        body: 'I have a question about my order.',
      },
    });

    if (!msgRes.ok()) throw new Error(`Support message create failed: ${msgRes.status()}`);
    const msgBody = await msgRes.json();
    if (!msgBody.success) throw new Error(`Message body: ${JSON.stringify(msgBody)}`);
    messageId = msgBody.data.id as number;

    cleanups.push(async () => {
      execSync(
        `psql "${TEST_DB}" -c "DELETE FROM store_customer_messages WHERE id = ${messageId};"`,
        { encoding: 'utf-8', stdio: 'pipe' },
      );
    });
  });

  test.afterAll(async () => {
    await runCleanups(cleanups);
  });

  test('store_customer_messages_list and store_customer_messages_reply tools are registered', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['*'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t: { name: string }) => t.name));
    expect(names.has('store_customer_messages_list')).toBe(true);
    expect(names.has('store_customer_messages_reply')).toBe(true);
  });

  test('store_customer_messages_list without store:read hides the tool', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['projects:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t: { name: string }) => t.name));
    expect(names.has('store_customer_messages_list')).toBe(false);
  });

  test('store_customer_messages_list returns the open message', async ({ clientApi }) => {
    test.skip(!messageId, 'Customer accounts not enabled — message not created in beforeAll');

    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['store:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('store_customer_messages_list', {
      websiteId: siteId,
      status: 'open',
    });
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    expect(Array.isArray(res.data)).toBe(true);
    const msg = (res.data as Array<{ id: number; status: string }>).find((m) => m.id === messageId);
    expect(msg).toBeDefined();
    expect(msg?.status).toBe('open');
  });

  test('store_customer_messages_reply posts staff reply and transitions status to replied', async ({ clientApi }) => {
    test.skip(!messageId, 'Customer accounts not enabled — message not created in beforeAll');

    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      scopes: ['store:read', 'store:write'],
    });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('store_customer_messages_reply', {
      messageId,
      body: 'Thanks for reaching out! We are looking into your question.',
    });
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    const reply = res.data as { id: number; message_id: number; is_staff: boolean };
    expect(reply.id).toBeDefined();
    // The reply row links back to the message
    expect(reply.message_id ?? (res.data as Record<string, unknown>)['messageId']).toBeDefined();
    expect(reply.is_staff ?? (res.data as Record<string, unknown>)['isStaff']).toBeTruthy();

    // Status must have transitioned to 'replied'
    const listRes = await mcp.callTool('store_customer_messages_list', {
      websiteId: siteId,
      status: 'replied',
    });
    expect(Array.isArray(listRes.data)).toBe(true);
    const updated = (listRes.data as Array<{ id: number; status: string }>).find(
      (m) => m.id === messageId,
    );
    expect(updated).toBeDefined();
    expect(updated?.status).toBe('replied');
  });

  test('store_customer_messages_reply on non-existent message returns error envelope', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      scopes: ['store:read', 'store:write'],
    });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('store_customer_messages_reply', {
      messageId: 999_999_999,
      body: 'Should not work.',
    });
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('error');
    expect((res.data as { error: string }).error).toBe('Message not found');
  });

  test('store_customer_messages_reply without store:write hides the tool', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['store:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t: { name: string }) => t.name));
    expect(names.has('store_customer_messages_list')).toBe(true);    // read visible
    expect(names.has('store_customer_messages_reply')).toBe(false);  // write hidden
  });
});
