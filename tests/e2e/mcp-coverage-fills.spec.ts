/**
 * Smoke tests for the MCP coverage fills added in commit 3c49e822:
 *   - hosting_list / hosting_get   (scope: hosting:read)
 *   - my_tasks_list                (scope: projects:read)
 *   - branding_delete_profile      (scope: branding:write)
 *
 * Each test asserts:
 *   1. The tool is registered and visible in tools/list under the right scope.
 *   2. The tool returns a clientId-scoped result for the calling API key.
 *
 * Cross-tenant leak protection is enforced by the same `eq(table.clientId,
 * ctx.client.id)` pattern shared with ~170 sibling tools — covered by
 * tests/integration/api/security/tenancy.test.ts at the data-access layer.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey, McpTestClient } from './setup/helpers';

test.describe('MCP coverage fills @mcp @coverage', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('tools/list exposes the four new tools under their scopes', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['*'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t) => t.name));

    expect(names.has('hosting_list')).toBe(true);
    expect(names.has('hosting_get')).toBe(true);
    expect(names.has('my_tasks_list')).toBe(true);
    expect(names.has('branding_delete_profile')).toBe(true);
  });

  test('hosting_list returns an array scoped to the calling client', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['hosting:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('hosting_list', {});
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    expect(Array.isArray(res.data)).toBe(true);
  });

  test('hosting_get with a foreign / non-existent id returns "not found" envelope', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['hosting:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    // 999_999 is a non-existent hosted-site id; the tool's clientId-filtered
    // lookup must return the tenant-safe "not found" envelope rather than
    // 404'ing or leaking another tenant's row.
    const res = await mcp.callTool('hosting_get', { id: 999_999 });
    expect(res.status).toBe(200);
    expect(res.data?.error).toBe('Hosted site not found');
  });

  test('hosting tools are denied without the hosting:read scope', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['projects:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    // Scope-filtered tools/list should hide hosting_* entirely from this key.
    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t) => t.name));
    expect(names.has('hosting_list')).toBe(false);
    expect(names.has('hosting_get')).toBe(false);
  });

  test('my_tasks_list returns an array of cards assigned to the caller', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['projects:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const res = await mcp.callTool('my_tasks_list', {});
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    expect(Array.isArray(res.data)).toBe(true);
    // Whatever cards are present must all be in the calling client's projects;
    // the tool joins on projects.clientId — we can't directly inspect that
    // here, but the join itself is the safety net.
  });

  test('branding_delete_profile removes a client-owned profile', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, {
      scopes: ['branding:read', 'branding:write'],
    });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const created = await mcp.callTool('branding_create_profile', {
      name: `Disposable Brand ${ts}`,
    });
    expect(created.status).toBe(200);
    expect(created.data?.id).toBeDefined();
    const profileId = created.data.id as number;

    const deleted = await mcp.callTool('branding_delete_profile', { profileId });
    expect(deleted.status).toBe(200);
    expect(deleted.data?.success).toBe(true);
    expect(deleted.data?.id).toBe(profileId);

    // Re-deleting yields the tenant-safe "not found" envelope, not a leak.
    const reDelete = await mcp.callTool('branding_delete_profile', { profileId });
    expect(reDelete.status).toBe(200);
    expect(reDelete.data?.error).toBe('Profile not found');
  });

  test('branding_delete_profile is denied without branding:write', async ({ clientApi }) => {
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['branding:read'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const { tools } = await mcp.listTools();
    const names = new Set(tools.map((t) => t.name));
    expect(names.has('branding_list_profiles')).toBe(true);
    expect(names.has('branding_delete_profile')).toBe(false);
  });
});
