/**
 * MCP External-Agent Boundary — Project 197 @security
 *
 * Exhaustive coverage of the deterministic, no-LLM entry points that keep an
 * external MCP-connected agent from acting outside its granted authority:
 *
 *   1. A require_cms_approval credential calling a CMS/CRM WRITE tool STAGES
 *      the change (mcp_pending_changes) instead of applying it live — proven
 *      via GET /api/portal/approvals?status=pending, and by confirming the
 *      live entity list does NOT contain the staged content.
 *   2. Separation of duties (QAD-049 / MEB-003): the same credential that
 *      staged a change cannot approve it via the MCP `approvals_approve`
 *      tool — lib/mcp/self-approval.ts `isSelfApproval()` fires on a keyId
 *      match even when scope alone (`*`, which includes approvals:manage)
 *      would otherwise allow the call.
 *   3. Destructive scope tier: `crm_deals_delete` requires the `crm:delete`
 *      scope, distinct from `crm:write` — hidden from tools/list without it
 *      (registration itself is scope-gated, same mechanism proven for
 *      hosting_* tools in mcp-coverage-fills.spec.ts), callable and
 *      irreversible with it.
 *   4. `crm_deals_update` re-filters the mutation by `clientId` — a deal id
 *      belonging to another tenant returns the tenant-safe `{ error: 'Deal
 *      not found' }` envelope, never a leak or a cross-tenant write.
 *   5. Secure-by-default approval gate (MEB-006): a freshly created
 *      write-capable credential defaults to `require_cms_approval = true`
 *      unless the caller explicitly opts out. Proven directly against the
 *      portal API key route (`body.requireCmsApproval !== false` at
 *      app/api/portal/api-keys/route.ts). The OAuth-token equivalent
 *      (`scopesRequireApproval()` in lib/oauth/scopes.ts, wired at
 *      app/oauth/token/route.ts) is asserted `.skip` — see that test for why.
 *
 * Fixtures/harness mirrored exactly from tests/e2e/mcp-coverage-fills.spec.ts,
 * tests/e2e/auth-security-coverage.spec.ts, and
 * tests/e2e/gap-approve-token-tenancy-coverage.spec.ts: `clientApi` /
 * `unauthApi` fixtures from ./setup/fixtures, `McpTestClient` +
 * `createTestApiKey` + `runCleanups` from ./setup/helpers, and the
 * admin-provisions-a-second-client pattern from tests/e2e/cov-u32.spec.ts
 * (`adminApi.post('/api/admin/portal/clients', ...)` + a fresh `ApiClient`)
 * for the cross-tenant case, since ./setup/fixtures has no built-in second
 * tenant.
 */
import { test, expect } from './setup/fixtures';
import { ApiClient } from './setup/api-client';
import {
  runCleanups,
  createTestApiKey,
  createTestWebsite,
  createTestPipeline,
  createTestDeal,
  McpTestClient,
} from './setup/helpers';

// ── 1 + 2: stage-instead-of-apply, and separation of duties ────────────────

test.describe('MCP External-Agent Boundary — write staging @mcp @project-197 @security', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('require_cms_approval credential stages a CMS write instead of applying it; the pending row is visible via GET /api/portal/approvals?status=pending @security', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const title = `Boundary Staged Post ${ts}`;
    const slug = `boundary-staged-${ts}`;
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title,
      slug,
      content: 'Should not go live until approved',
    });

    // Staged, not applied.
    expect(staged.status).toBe(200);
    expect(staged.data.pending).toBe(true);
    expect(typeof staged.data.pendingId).toBe('number');
    expect(staged.data.status).toBe('pending');

    // The pending row is discoverable via the portal approvals REST surface.
    const pendingList = await clientApi.get('/api/portal/approvals?status=pending');
    expect(pendingList.status).toBe(200);
    expect(pendingList.data.success).toBe(true);
    const found = (pendingList.data.data as Array<{ id: number; entityType: string; operation: string; status: string }>)
      .find((r) => r.id === staged.data.pendingId);
    expect(found).toBeTruthy();
    expect(found?.entityType).toBe('post');
    expect(found?.operation).toBe('create');
    expect(found?.status).toBe('pending');

    // NOT applied to the live entity — the post must not exist in the
    // website's live posts list while the change sits pending.
    const livePosts = await clientApi.get(`/api/portal/cms/websites/${website.id}/posts`);
    expect(livePosts.status).toBe(200);
    const liveMatch = (livePosts.data.data as Array<{ slug: string }>).find((p) => p.slug === slug);
    expect(liveMatch).toBeUndefined();
  });

  test('a require_cms_approval credential cannot self-approve the change it staged (Separation of Duties) @security', async ({ clientApi }) => {
    const { website } = await createTestWebsite(clientApi);
    // `*` scope includes both the write scope AND approvals:manage — the
    // exact confused-deputy shape SoD exists to close (QAD-049): scope alone
    // is not a boundary when the same credential holds both.
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
      requireCmsApproval: true,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `SoD Test ${ts}`,
      slug: `sod-test-${ts}`,
      content: 'x',
    });
    expect(staged.data.pending).toBe(true);
    const pendingId = staged.data.pendingId as number;

    // Same credential attempts to approve its own staged change.
    const selfApprove = await mcp.callTool('approvals_approve', { id: pendingId });
    expect(selfApprove.data?.error).toMatch(/Separation of duties/i);

    // The change remains pending — the self-approve attempt did not apply it.
    const pendingList = await clientApi.get('/api/portal/approvals?status=pending');
    const found = (pendingList.data.data as Array<{ id: number; status: string }>).find((r) => r.id === pendingId);
    expect(found).toBeTruthy();
    expect(found?.status).toBe('pending');
  });
});

// ── 3: destructive scope tier (`:delete` distinct from `:write`) ───────────

test.describe('MCP External-Agent Boundary — destructive :delete scope tier @mcp @project-197 @security', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('crm_deals_delete is hidden from tools/list for a key with crm:write but no crm:delete scope @security', async ({ clientApi }) => {
    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['crm:write'],
      requireCmsApproval: false,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t) => t.name));
    // Sanity: crm:write tools ARE visible to this key...
    expect(names.has('crm_deals_update')).toBe(true);
    // ...but the crm:delete-gated destructive tool is not — registration
    // itself is scope-gated (hasScope(...) && server.registerTool(...)), the
    // same mechanism proven for hosting_* in mcp-coverage-fills.spec.ts.
    expect(names.has('crm_deals_delete')).toBe(false);
  });

  test('crm_deals_delete succeeds and permanently removes the deal once the key holds crm:delete @security', async ({ clientApi }) => {
    const { pipeline } = await createTestPipeline(clientApi);
    const stageId = pipeline.stages?.[0]?.id ?? pipeline.defaultStageId;
    const { deal } = await createTestDeal(clientApi, pipeline.id, stageId);
    // No deal-cleanup push — the delete under test removes it. If the
    // assertion fails before the delete call runs, the deal is an
    // acceptable, harmless test leak (consistent with other CRM specs).

    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, {
      scopes: ['crm:delete'],
      requireCmsApproval: false,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    expect(new Set(tools.map((t) => t.name)).has('crm_deals_delete')).toBe(true);

    const deleted = await mcp.callTool('crm_deals_delete', { dealId: deal.id });
    expect(deleted.status).toBe(200);
    expect(deleted.data?.deleted).toBe(true);

    // Gone for good — re-deleting yields the tenant-safe "not found" envelope.
    const reDelete = await mcp.callTool('crm_deals_delete', { dealId: deal.id });
    expect(reDelete.data?.error).toBe('Deal not found');
  });
});

// ── 4: crm_deals_update clientId re-filter (cross-tenant) ──────────────────

test.describe('MCP External-Agent Boundary — crm_deals_update cross-tenant re-filter @mcp @project-197 @tenancy @security', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test("crm_deals_update on another client's deal id returns 'Deal not found', not a cross-tenant leak @security", async ({ adminApi, clientApi }) => {
    // Client A (the seeded client@example.com) owns the deal under attack.
    const { pipeline } = await createTestPipeline(clientApi);
    const stageId = pipeline.stages?.[0]?.id ?? pipeline.defaultStageId;
    const { deal: clientADeal, cleanup: dealCleanup } = await createTestDeal(clientApi, pipeline.id, stageId, {
      title: 'Client A Secret Deal',
    });
    cleanups.push(dealCleanup);

    // Provision Client B via admin (mirrors tests/e2e/cov-u32.spec.ts's
    // cross-tenant pattern — ./setup/fixtures has no built-in second tenant).
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const clientBEmail = `client-b-mcp-boundary-${ts}-${rand}@example.com`;
    const clientBPassword = 'password123';
    const provision = await adminApi.post('/api/admin/portal/clients', {
      name: `Client B MCP Boundary ${ts}`,
      email: clientBEmail,
      password: clientBPassword,
      company: `Client B MCP Boundary Corp ${ts}`,
    });
    expect(provision.status).toBe(200);
    const clientBId = (provision.data.data.client as { id: number }).id;

    // Grant Client B a paid tier (category 'bundle') so the crm:write MCP
    // tool's requireService('crm') gate doesn't short-circuit before the
    // tenancy check under test — a fresh admin-created client has no active
    // subscription by default.
    //
    // The `/plan` route (used below by other tests) is scoped exclusively to
    // the three pricing-tier slugs (plan-starter/growth/scale from
    // lib/billing/domain-catalog.ts) — none of which exist as `services` rows
    // in the e2e-seeded DB (scripts/seed-admin-e2e.ts only ever inserts
    // monthly-maintenance, white-label-domain, and e2e-all-access-bundle), so
    // `catalog` comes back empty and there is no 'plan-starter' to find.
    // Grant the actual seeded bundle service instead — any active
    // category='bundle' subscription satisfies requireService() per
    // serviceCategoryMatches() (lib/portal-auth.ts) — via the generic
    // clientId+serviceId subscription-grant route, which (unlike `/plan` and
    // `/billing`'s add-module/set-bundle actions) isn't slug-restricted.
    const serviceCatalog = await adminApi.get('/api/admin/portal/services');
    expect(serviceCatalog.status).toBe(200);
    const bundleService = (serviceCatalog.data.data as Array<{ id: number; category: string; active: boolean }>)
      .find((s) => s.category === 'bundle' && s.active);
    expect(bundleService).toBeTruthy();
    const subscriptionGrant = await adminApi.post('/api/admin/portal/subscriptions', {
      clientId: clientBId,
      serviceId: bundleService!.id,
    });
    expect(subscriptionGrant.status).toBe(201);

    const clientBApi = new ApiClient(clientBEmail, clientBPassword);
    await clientBApi.ensure();
    cleanups.push(() => clientBApi.dispose());

    const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientBApi, {
      scopes: ['crm:write'],
      requireCmsApproval: false,
    });
    cleanups.push(keyCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    // Client B's credential tries to update Client A's deal by id.
    const attack = await mcp.callTool('crm_deals_update', {
      id: clientADeal.id,
      title: 'Hacked by Client B',
    });
    expect(attack.status).toBe(200);
    expect(attack.data?.error).toBe('Deal not found');

    // Client A's deal is untouched.
    const verify = await clientApi.get('/api/portal/crm/deals');
    const stillIntact = (verify.data.data as Array<{ id: number; title: string }>)
      .find((d) => d.id === clientADeal.id);
    expect(stillIntact?.title).toBe('Client A Secret Deal');
  });
});

// ── 5: secure-by-default approval gate on freshly minted credentials ───────

test.describe('MCP External-Agent Boundary — secure-by-default approval gate (MEB-006) @mcp @project-197 @security', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('a portal API key created without an explicit require_cms_approval flag defaults to true and stages its writes @security', async ({ clientApi }) => {
    // Call the route directly (bypassing the createTestApiKey helper, which
    // always sends an explicit requireCmsApproval) so the field is omitted
    // from the body entirely — proving the route's own default, not a test
    // helper's default. app/api/portal/api-keys/route.ts:
    //   const requireCmsApproval = body.requireCmsApproval !== false;
    const ts = Date.now();
    const name = `Default Approval Key ${ts}`;
    const created = await clientApi.post('/api/portal/api-keys', {
      name,
      scopes: ['*'],
      // requireCmsApproval intentionally omitted.
    });
    // POST /api/portal/api-keys returns 201 Created (app/api/portal/api-keys/
    // route.ts), consistent with every other create-a-key assertion in the
    // suite (e.g. tests/e2e/cov-u61.spec.ts) — not 200.
    expect(created.status).toBe(201);
    expect(created.data.success).toBe(true);
    const rawKey = created.data.data.key as string;
    const keyId = created.data.data.id as number;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/api-keys?id=${keyId}`).catch(() => {});
    });

    // Confirm the stored flag defaulted to true.
    const list = await clientApi.get('/api/portal/api-keys');
    const record = (list.data.data as Array<{ id: number; requireCmsApproval: boolean }>)
      .find((k) => k.id === keyId);
    expect(record?.requireCmsApproval).toBe(true);

    // Functional proof: a write through this key stages instead of applying.
    const { website } = await createTestWebsite(clientApi);
    const mcp = await new McpTestClient(rawKey).init();
    cleanups.push(() => mcp.dispose());
    const staged = await mcp.callTool('posts_create', {
      websiteId: website.id,
      title: `Default-Gated Post ${ts}`,
      slug: `default-gated-${ts}`,
      content: 'x',
    });
    expect(staged.data.pending).toBe(true);
  });

  // @security TODO(model-stub): the OAuth-token equivalent of the above
  // (app/oauth/token/route.ts calling scopesRequireApproval() from
  // lib/oauth/scopes.ts to set oauth_access_tokens.require_cms_approval=true
  // for any token holding `*`/`:write`/`:send`/`:delete` scopes, per MEB-006)
  // cannot be driven end-to-end in this harness: app/oauth/token/route.ts
  // only implements the `authorization_code` and `refresh_token` grants — no
  // `client_credentials` shortcut — so minting a real access token requires a
  // full PKCE authorization-code dance through the browser-rendered
  // app/oauth/authorize/page.tsx consent screen. tests/e2e/setup/helpers.ts
  // has no helper for that flow (only createTestApiKey for portal_api_keys),
  // and no test-only route mints an oauth_access_tokens row directly.
  // scopesRequireApproval() itself is deterministically covered at the unit
  // layer: tests/unit/oauth-scopes-approval.test.ts.
  test.skip('a freshly issued OAuth access token with a write-capable scope defaults require_cms_approval=true @security', async () => {
    // Intentionally left unimplemented — see TODO above.
  });
});
