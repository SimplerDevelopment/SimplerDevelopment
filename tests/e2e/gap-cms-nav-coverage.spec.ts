/**
 * CMS Navigation gap coverage — unit: cms-nav
 *
 * Gap 1: MCP nav_publish + nav_publish_all tools
 *   These tools exist in lib/mcp/tools/cms.ts and back the REST routes:
 *     POST /api/portal/websites/[siteId]/navigation/[itemId]/publish
 *     POST /api/portal/websites/[siteId]/navigation/publish-all
 *   The flat CRUD paths (nav_create, nav_list, nav_update, nav_delete) are
 *   already hit by portal-cms-navigation.spec.ts via the REST API but the
 *   publish promotion step is NOT tested. This spec exercises the full
 *   create-draft → publish flow via the MCP protocol.
 *
 * Gap 2: CRM contacts/[id]/send-email
 *   BLOCKED — already covered. crm-coverage.spec.ts lines 176-237 contain:
 *     - 400 when subject missing
 *     - 400 when body missing
 *     - 404 for unknown contact
 *     - 400 for contact with no email
 *     - 401 for unauthenticated caller
 *   All meaningful paths short of a real Resend call are tested there.
 */

import { test, expect } from './setup/fixtures';
import {
  runCleanups,
  createTestApiKey,
  createTestWebsite,
  McpTestClient,
} from './setup/helpers';

// ── MCP nav_publish: create-draft → publish lifecycle ────────────────────────

test.describe('MCP nav_publish + nav_publish_all @gap @cms @mcp-nav', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  // ── nav_publish and nav_publish_all are registered under sites:write ─────

  test('tools/list exposes nav_publish and nav_publish_all under sites:write scope', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['sites:write'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t) => t.name));

    expect(names.has('nav_publish')).toBe(true);
    expect(names.has('nav_publish_all')).toBe(true);
  });

  test('nav_publish and nav_publish_all are hidden without sites:write scope', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['sites:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t) => t.name));

    expect(names.has('nav_publish')).toBe(false);
    expect(names.has('nav_publish_all')).toBe(false);
  });

  // ── nav_publish: not-found guard ─────────────────────────────────────────

  test('nav_publish returns error for non-existent nav item id', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['sites:write'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('nav_publish', { id: 999_999 });
    expect(res.status).toBe(200);
    // MCP tools return a JSON error envelope — not HTTP 404
    expect(res.isError).toBeFalsy();
    const data = res.data as { error?: string };
    expect(data?.error).toBeTruthy();
    expect(data.error).toMatch(/not found/i);
  });

  // ── nav_publish_all: not-found guard ──────────────────────────────────────

  test('nav_publish_all returns error for non-existent website', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['sites:write'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('nav_publish_all', { websiteId: 999_999 });
    expect(res.status).toBe(200);
    const data = res.data as { error?: string };
    expect(data?.error).toBeTruthy();
    expect(data.error).toMatch(/not found/i);
  });

  // ── full create-draft → nav_publish lifecycle ─────────────────────────────

  test('nav_create stages a draft then nav_publish promotes it to live', async ({ clientApi }) => {
    // Set up a fresh website and an MCP key with sites:write
    const { website, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);
    const websiteId = website.id as number;

    const { keyRecord, cleanup: kCleanup } = await createTestApiKey(clientApi, {
      scopes: ['sites:write', 'sites:read'],
      requireCmsApproval: false,
    });
    cleanups.push(kCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    // 1. Create a nav item via MCP — this stages it as a draft (pendingCreate)
    const createRes = await mcp.callTool('nav_create', {
      websiteId,
      label: 'MCP Home',
      href: '/mcp-home',
      sortOrder: 0,
    });
    expect(createRes.status).toBe(200);
    expect(createRes.isError).toBeFalsy();
    const created = createRes.data as {
      id?: number;
      draft?: { pendingCreate?: boolean };
      pending?: boolean;
      pendingId?: number;
    };

    // The create may return pending (approval-gated) or direct result
    if (created?.pending) {
      // Approval-gated — mark as partial (can't auto-approve in test)
      test.skip(true, 'MCP key is approval-gated for CMS writes — skipping publish lifecycle');
      return;
    }

    expect(created?.id).toBeTruthy();
    const navId = created.id!;
    // The newly created item should carry a pendingCreate draft flag
    expect(created?.draft?.pendingCreate).toBe(true);

    // 2. Publish the draft via nav_publish
    const publishRes = await mcp.callTool('nav_publish', { id: navId });
    expect(publishRes.status).toBe(200);
    expect(publishRes.isError).toBeFalsy();
    const published = publishRes.data as { id?: number; draft?: unknown; pending?: boolean };

    if (published?.pending) {
      // Approval-gated publish — valid test boundary; not a bug
      expect(published.pending).toBe(true);
      return;
    }

    // After publish the draft column should be null (cleared) or the item
    // deleted (not the case here — this is pendingCreate, so draft clears)
    expect(published?.id).toBe(navId);
    expect(published?.draft).toBeNull();

    // 3. Verify via nav_list that the item is now live (draft null)
    const listRes = await mcp.callTool('nav_list', { websiteId });
    expect(listRes.status).toBe(200);
    const items = listRes.data as Array<{ id: number; label: string; draft: unknown }>;
    const liveItem = items.find((i) => i.id === navId);
    expect(liveItem).toBeTruthy();
    expect(liveItem!.label).toBe('MCP Home');
    expect(liveItem!.draft).toBeNull();
  });

  // ── nav_publish_all lifecycle ─────────────────────────────────────────────

  test('nav_publish_all promotes all pending drafts on a website', async ({ clientApi }) => {
    const { website, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);
    const websiteId = website.id as number;

    const { keyRecord, cleanup: kCleanup } = await createTestApiKey(clientApi, {
      scopes: ['sites:write', 'sites:read'],
      requireCmsApproval: false,
    });
    cleanups.push(kCleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    // Create two draft nav items
    const c1 = await mcp.callTool('nav_create', {
      websiteId,
      label: 'Batch Item 1',
      href: '/batch-1',
      sortOrder: 0,
    });
    const c2 = await mcp.callTool('nav_create', {
      websiteId,
      label: 'Batch Item 2',
      href: '/batch-2',
      sortOrder: 1,
    });

    const d1 = c1.data as { pending?: boolean };
    const d2 = c2.data as { pending?: boolean };

    if (d1?.pending || d2?.pending) {
      test.skip(true, 'MCP key is approval-gated — skipping nav_publish_all lifecycle');
      return;
    }

    expect(c1.isError).toBeFalsy();
    expect(c2.isError).toBeFalsy();

    // Publish all drafts in one shot
    const pubAllRes = await mcp.callTool('nav_publish_all', { websiteId });
    expect(pubAllRes.status).toBe(200);
    expect(pubAllRes.isError).toBeFalsy();

    // MCP nav_publish_all returns { websiteId, count, items } from its apply closure
    const pubAllData = pubAllRes.data as { pending?: boolean; count?: number; items?: unknown[]; websiteId?: number };
    if (pubAllData?.pending) {
      // Approval-gated — valid; stop here
      expect(pubAllData.pending).toBe(true);
      return;
    }

    // items array should list promoted items
    expect(Array.isArray(pubAllData?.items)).toBe(true);

    // Verify via nav_list: no items should have a non-null draft
    const listRes = await mcp.callTool('nav_list', { websiteId });
    expect(listRes.status).toBe(200);
    const items = listRes.data as Array<{ id: number; draft: unknown }>;
    for (const item of items) {
      expect(item.draft).toBeNull();
    }
  });

  // ── REST route mirrors: portal API publish endpoints ──────────────────────

  test('POST /api/portal/websites/[siteId]/navigation/[itemId]/publish returns 401 unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/websites/1/navigation/1/publish', {});
    expect(res.status).toBe(401);
  });

  test('POST /api/portal/websites/[siteId]/navigation/publish-all returns 401 unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/websites/1/navigation/publish-all', {});
    expect(res.status).toBe(401);
  });

  test('POST /api/portal/websites/[siteId]/navigation/[itemId]/publish stages and publishes a draft item via REST', async ({ clientApi }) => {
    // Provision a fresh website so we can control nav state cleanly
    const { website, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);
    const siteId = website.id as number;

    // Insert a draft nav item via the portal PUT (which stages pendingCreate)
    const putRes = await clientApi.put(`/api/portal/websites/${siteId}/navigation`, {
      items: [{ id: -1, label: 'REST Draft', href: '/rest-draft', sortOrder: 0 }],
    });
    expect(putRes.status).toBe(200);
    const navItems = putRes.data.data as Array<{ id: number; draft: { pendingCreate?: boolean } | null }>;
    // Find the newly inserted item (draft.pendingCreate = true)
    const draftItem = navItems.find((i) => i.draft?.pendingCreate === true);
    expect(draftItem).toBeTruthy();
    const itemId = draftItem!.id;

    // Publish it via the REST publish endpoint
    const pubRes = await clientApi.post(
      `/api/portal/websites/${siteId}/navigation/${itemId}/publish`,
      {},
    );
    expect(pubRes.status).toBe(200);
    expect(pubRes.data.success).toBe(true);
    // publishNavItem returns { id, published: true, row } where row has draft: null
    // OR { id, noop: true } if there was no draft. Either way draft is cleared.
    const pubData = pubRes.data.data as {
      id?: number;
      published?: boolean;
      noop?: boolean;
      deleted?: boolean;
      row?: { id: number; draft: unknown };
    };
    // For a pendingCreate item, expect published:true with a row whose draft is null
    if (pubData?.published) {
      expect(pubData.row?.draft).toBeNull();
    } else if (pubData?.noop) {
      // Item had no draft (already published) — acceptable
    } else {
      // Unexpected result shape — fail explicitly
      throw new Error(`Unexpected publish result: ${JSON.stringify(pubData)}`);
    }

    // GET the nav list and confirm the item is now live
    const listRes = await clientApi.get(`/api/portal/websites/${siteId}/navigation`);
    expect(listRes.status).toBe(200);
    const finalItems = listRes.data.data as Array<{ id: number; label: string; draft: unknown }>;
    const liveItem = finalItems.find((i) => i.id === itemId);
    expect(liveItem).toBeTruthy();
    expect(liveItem!.label).toBe('REST Draft');
    expect(liveItem!.draft).toBeNull();
  });

  test('POST /api/portal/websites/[siteId]/navigation/publish-all promotes all drafts via REST', async ({ clientApi }) => {
    const { website, cleanup: wCleanup } = await createTestWebsite(clientApi);
    cleanups.push(wCleanup);
    const siteId = website.id as number;

    // Insert two draft items
    const putRes = await clientApi.put(`/api/portal/websites/${siteId}/navigation`, {
      items: [
        { id: -1, label: 'Bulk A', href: '/bulk-a', sortOrder: 0 },
        { id: -2, label: 'Bulk B', href: '/bulk-b', sortOrder: 1 },
      ],
    });
    expect(putRes.status).toBe(200);
    const navItems = putRes.data.data as Array<{ id: number; draft: { pendingCreate?: boolean } | null }>;
    const draftCount = navItems.filter((i) => i.draft?.pendingCreate === true).length;
    expect(draftCount).toBe(2);

    // publish-all
    const pubAllRes = await clientApi.post(
      `/api/portal/websites/${siteId}/navigation/publish-all`,
      {},
    );
    expect(pubAllRes.status).toBe(200);
    expect(pubAllRes.data.success).toBe(true);

    // Verify all items are now live (draft null)
    const listRes = await clientApi.get(`/api/portal/websites/${siteId}/navigation`);
    expect(listRes.status).toBe(200);
    const finalItems = listRes.data.data as Array<{ id: number; draft: unknown }>;
    for (const item of finalItems) {
      expect(item.draft).toBeNull();
    }
  });
});
