/**
 * MCP scope-filtered tool listing
 *
 * Verifies that tools/list is trimmed per-caller based on the API key's scope
 * set. A narrowly-scoped key should not see tools it cannot call — that keeps
 * the per-session context window below ~22k tokens for full-scope keys.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey, McpTestClient } from './setup/helpers';

test.describe('MCP tools/list is scope-filtered @mcp @scopes', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('full-access (*) key sees the complete tool surface', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['*'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    // Sanity floor — the platform ships ~150+ tools; anything below this
    // suggests a regression in the registration loop, not scope filtering.
    expect(tools.length).toBeGreaterThan(120);
    // `whoami` is unscoped and must always be visible.
    expect(tools.some((t) => t.name === 'whoami')).toBe(true);
  });

  test('crm:read-only key sees a narrow slice, not the full catalog', async ({ clientApi }) => {
    const { keyRecord: narrow, cleanup: narrowCleanup } = await createTestApiKey(clientApi, {
      scopes: ['crm:read'],
    });
    cleanups.push(narrowCleanup);
    const { keyRecord: full, cleanup: fullCleanup } = await createTestApiKey(clientApi, {
      scopes: ['*'],
    });
    cleanups.push(fullCleanup);

    const narrowMcp = await new McpTestClient(narrow.key).init();
    cleanups.push(() => narrowMcp.dispose());
    const fullMcp = await new McpTestClient(full.key).init();
    cleanups.push(() => fullMcp.dispose());

    const narrowTools = (await narrowMcp.listTools()).tools;
    const fullTools = (await fullMcp.listTools()).tools;

    // Narrow key sees a strict subset of the full catalog.
    expect(narrowTools.length).toBeLessThan(fullTools.length);
    // And substantially fewer — real token savings, not a few-tool trim.
    expect(narrowTools.length).toBeLessThan(fullTools.length / 2);

    // Every narrow-visible tool name must also be in the full set.
    const fullNames = new Set(fullTools.map((t) => t.name));
    for (const t of narrowTools) {
      expect(fullNames.has(t.name)).toBe(true);
    }

    // crm read tools are present; crm write tools are not.
    const names = new Set(narrowTools.map((t) => t.name));
    expect(names.has('crm_contacts_search')).toBe(true);
    expect(names.has('crm_deals_list')).toBe(true);
    expect(names.has('crm_contacts_create')).toBe(false);
    expect(names.has('crm_deals_create')).toBe(false);
    // Off-domain write tools are also hidden.
    expect(names.has('projects_create')).toBe(false);
    expect(names.has('posts_create')).toBe(false);
  });

  test('approvals:manage key sees approvals tools; a key without it does not', async ({ clientApi }) => {
    // Listing approvals requires `approvals:read`; approve/reject need
    // `approvals:manage`. Reviewers typically hold both.
    const { keyRecord: withApprovals, cleanup: a } = await createTestApiKey(clientApi, {
      scopes: ['approvals:read', 'approvals:manage'],
    });
    cleanups.push(a);
    const { keyRecord: withoutApprovals, cleanup: b } = await createTestApiKey(clientApi, {
      scopes: ['crm:read'],
    });
    cleanups.push(b);

    const withMcp = await new McpTestClient(withApprovals.key).init();
    cleanups.push(() => withMcp.dispose());
    const withoutMcp = await new McpTestClient(withoutApprovals.key).init();
    cleanups.push(() => withoutMcp.dispose());

    const withToolNames = new Set((await withMcp.listTools()).tools.map((t) => t.name));
    const withoutToolNames = new Set((await withoutMcp.listTools()).tools.map((t) => t.name));

    expect(withToolNames.has('approvals_list')).toBe(true);
    expect(withToolNames.has('approvals_approve')).toBe(true);
    expect(withoutToolNames.has('approvals_list')).toBe(false);
    expect(withoutToolNames.has('approvals_approve')).toBe(false);
  });
});
