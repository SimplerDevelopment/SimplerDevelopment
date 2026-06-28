/**
 * Approval-token cross-tenant leak regression spec
 *   @gap @approve-token-tenancy @tenancy @critical
 *
 * Gaps covered (docs/audits/portal-e2e-adversarial-audit-2026-06-25.md):
 *   - approve-email-campaign-no-clientid-scope
 *   - approve-post-no-clientid-scope
 *   - approve-block-template-no-clientid-scope
 *
 * The public approval page (`app/approve/[token]/page.tsx`) loads the previewed
 * entity (post / email_campaign / block_template) BY ID. The token is the only
 * credential and it carries the client the approval link is scoped to
 * (`link.clientId`). Before the fix, the loader fetched these three entity
 * shapes WITHOUT confirming they belong to that client — so a token minted for
 * client B could render client A's draft content by pointing entityId at A's
 * row (defense-in-depth against any clientId/entityId divergence).
 *
 * The loader query is now tenant-scoped:
 *   - email_campaign / block_template → `AND clientId = link.clientId`
 *   - post (no clientId column) → websiteId must resolve to a clientWebsites
 *     row owned by `link.clientId`.
 * On mismatch the preview collapses to the `missing` shape ("Not found").
 *
 * We construct the cross-tenant scenario with direct SQL because the MCP path
 * that mints approval links always ties `link.clientId` to the entity's owner —
 * there's no API surface to produce a divergent link. (Mirrors the postgres.js
 * pattern in portal-my-tasks.spec.ts; Playwright doesn't load the `@/` alias,
 * so we can't import `@/lib/db`.)
 *
 * Each entity type asserts BOTH directions:
 *   - leak link  (clientId = B, entityId = A's row) → "Not found", secret hidden
 *   - legit link (clientId = A, entityId = A's row) → entity title rendered
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestWebsite } from './setup/helpers';
import postgres from 'postgres';
import crypto from 'crypto';
import 'dotenv/config';

let sql: ReturnType<typeof postgres> | null = null;
function db() {
  if (!sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not set; required for approve-token tenancy DB setup.');
    }
    sql = postgres(process.env.DATABASE_URL, { max: 2, idle_timeout: 5 });
  }
  return sql;
}

test.afterAll(async () => {
  if (sql) {
    await sql.end({ timeout: 5 });
    sql = null;
  }
});

interface ApiClientLike {
  get: (path: string) => Promise<{ data: unknown; status: number }>;
  post: (path: string, body?: Record<string, unknown>) => Promise<{ data: unknown; status: number }>;
}

async function getActiveClientId(api: ApiClientLike): Promise<number> {
  const res = (await api.get('/api/portal/clients')) as { data: { activeClientId: number | null } | null };
  const id = res.data?.activeClientId;
  if (!id) throw new Error('No activeClientId returned for clientApi');
  return id;
}

/** Find any client row that is NOT `selfId` to play the "attacker" tenant. */
async function findOtherClientId(selfId: number): Promise<number | null> {
  const rows = await db()<{ id: number }[]>`
    SELECT id FROM clients WHERE id <> ${selfId} ORDER BY id LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

/** Insert an approval link row directly so its clientId can diverge from the
 *  entity owner — the divergence the MCP minting path can never produce. */
async function insertApprovalLink(input: {
  clientId: number;
  entityType: 'post' | 'email_campaign' | 'block_template';
  entityId: number;
}): Promise<{ token: string; cleanup: () => Promise<void> }> {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const rows = await db()<{ id: number }[]>`
    INSERT INTO mcp_approval_links (token, client_id, link_type, entity_type, entity_id, status, expires_at)
    VALUES (${token}, ${input.clientId}, 'entity', ${input.entityType}, ${input.entityId}, 'pending', ${expiresAt})
    RETURNING id
  `;
  const id = rows[0].id;
  const cleanup = async () => {
    try { await db()`DELETE FROM mcp_approval_links WHERE id = ${id}`; } catch { /* best effort */ }
  };
  return { token, cleanup };
}

test.describe('Approval-token cross-tenant leak regression @gap @approve-token-tenancy @tenancy @critical', () => {
  let cleanups: Array<() => Promise<void>> = [];
  test.afterEach(async () => { await runCleanups(cleanups); cleanups = []; });

  test('email_campaign: a token scoped to another client cannot preview the campaign', async ({ page, clientApi }) => {
    const clientA = await getActiveClientId(clientApi);
    const clientB = await findOtherClientId(clientA);
    if (!clientB) { test.skip(true, 'Need a second client row to simulate cross-tenant access'); return; }

    // An email list owned by client A (campaigns require a listId FK).
    const ts = Date.now();
    const listRes = await clientApi.post('/api/portal/email/lists', {
      name: `Approve Tenancy List ${ts}`,
      description: 'E2E approve-token tenancy',
    });
    expect([200, 201]).toContain(listRes.status);
    const listId = (listRes.data as { data: { id: number } }).data.id;
    // Cleanups run LIFO — push list-delete FIRST so it runs LAST (the campaign
    // FK on list_id is `restrict`, so the campaign must be gone before the list).
    cleanups.push(async () => { try { await db()`DELETE FROM email_lists WHERE id = ${listId}`; } catch {} });

    const secret = `Secret Campaign ${ts}`;
    const campRows = await db()<{ id: number }[]>`
      INSERT INTO email_campaigns (name, subject, from_name, from_email, list_id, client_id, html_content, status)
      VALUES (${secret}, ${`Subj ${ts}`}, 'E2E', 'e2e@example.com', ${listId}, ${clientA}, ${`<p>${secret}</p>`}, 'draft')
      RETURNING id
    `;
    const campaignId = campRows[0].id;
    cleanups.push(async () => { try { await db()`DELETE FROM email_campaigns WHERE id = ${campaignId}`; } catch {} });

    // Leak attempt: link belongs to client B but points at A's campaign.
    const leak = await insertApprovalLink({ clientId: clientB, entityType: 'email_campaign', entityId: campaignId });
    cleanups.push(leak.cleanup);
    await page.goto(`/approve/${leak.token}`);
    await expect(page.locator('body')).toContainText('Not found');
    await expect(page.locator('body')).not.toContainText(secret);

    // Legit: link owned by client A renders the campaign.
    const legit = await insertApprovalLink({ clientId: clientA, entityType: 'email_campaign', entityId: campaignId });
    cleanups.push(legit.cleanup);
    await page.goto(`/approve/${legit.token}`);
    await expect(page.locator('body')).toContainText(secret);
  });

  test('block_template: a token scoped to another client cannot preview the template', async ({ page, clientApi }) => {
    const clientA = await getActiveClientId(clientApi);
    const clientB = await findOtherClientId(clientA);
    if (!clientB) { test.skip(true, 'Need a second client row to simulate cross-tenant access'); return; }

    const ts = Date.now();
    const secret = `Secret Template ${ts}`;
    const tplRows = await db()<{ id: number }[]>`
      INSERT INTO block_templates (name, slug, category, scope, blocks, client_id)
      VALUES (${secret}, ${`secret-template-${ts}`}, 'custom', 'block', ${'[]'}::json, ${clientA})
      RETURNING id
    `;
    const templateId = tplRows[0].id;
    cleanups.push(async () => { try { await db()`DELETE FROM block_templates WHERE id = ${templateId}`; } catch {} });

    const leak = await insertApprovalLink({ clientId: clientB, entityType: 'block_template', entityId: templateId });
    cleanups.push(leak.cleanup);
    await page.goto(`/approve/${leak.token}`);
    await expect(page.locator('body')).toContainText('Not found');
    await expect(page.locator('body')).not.toContainText(secret);

    const legit = await insertApprovalLink({ clientId: clientA, entityType: 'block_template', entityId: templateId });
    cleanups.push(legit.cleanup);
    await page.goto(`/approve/${legit.token}`);
    await expect(page.locator('body')).toContainText(secret);
  });

  test('post: a token scoped to another client cannot preview the post', async ({ page, clientApi }) => {
    const clientA = await getActiveClientId(clientApi);
    const clientB = await findOtherClientId(clientA);
    if (!clientB) { test.skip(true, 'Need a second client row to simulate cross-tenant access'); return; }

    // A website owned by client A — posts scope to a client via websiteId.
    const { website } = await createTestWebsite(clientApi);
    const websiteId = website.id as number;

    const ts = Date.now();
    const secret = `Secret Post ${ts}`;
    const postRows = await db()<{ id: number }[]>`
      INSERT INTO posts (title, slug, post_type, content, published, website_id)
      VALUES (${secret}, ${`secret-post-${ts}`}, 'page', ${`<p>${secret}</p>`}, false, ${websiteId})
      RETURNING id
    `;
    const postId = postRows[0].id;
    cleanups.push(async () => { try { await db()`DELETE FROM posts WHERE id = ${postId}`; } catch {} });

    const leak = await insertApprovalLink({ clientId: clientB, entityType: 'post', entityId: postId });
    cleanups.push(leak.cleanup);
    await page.goto(`/approve/${leak.token}`);
    await expect(page.locator('body')).toContainText('Not found');
    await expect(page.locator('body')).not.toContainText(secret);

    const legit = await insertApprovalLink({ clientId: clientA, entityType: 'post', entityId: postId });
    cleanups.push(legit.cleanup);
    await page.goto(`/approve/${legit.token}`);
    await expect(page.locator('body')).toContainText(secret);
  });
});
