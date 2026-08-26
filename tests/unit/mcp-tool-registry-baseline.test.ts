/**
 * MCP tool-registry baseline.
 *
 * Locks in the exact set of tool names that buildMcpServer() registers when a
 * full-access ('*') key is presented, plus the scope-filter behaviour for
 * narrowly-scoped keys. This is the safety harness for the lib/mcp/server.ts
 * refactor — every tool name, scope guard, and minimum config field must
 * survive the move from the monolith into per-domain tool modules.
 *
 * Unit-layer on purpose: the registry assertion only builds the server and reads
 * tool NAMES (handlers never run), so it needs no DB — `@/lib/db` is mocked to
 * dodge its import-time DATABASE_URL throw. Living in tests/unit/ means it runs
 * in the DEFAULT gate, so tool drift fails on every commit (it previously sat in
 * the integration layer, out of the default gate, and drifted red unseen — 131 tools).
 *
 * @critical
 */
import { describe, it, expect, vi } from 'vitest';
import type { PortalMcpContext } from '@/lib/mcp-auth';

// Mock @/lib/auth before the @/lib/mcp/server import chain reaches it via
// portal-auth → @/lib/auth → next-auth. We never call any of these tools so
// the auth module's actual behaviour is irrelevant for the registry assertion.
vi.mock('@/lib/auth', () => ({ auth: vi.fn() }));
// brain adapter eagerly fires getOrCreateBrainProfile() at registration time;
// the per-worker test schema does not migrate brain_profiles, which would
// raise an unhandled rejection. The promise is fire-and-forget so a no-op
// stub keeps the registry assertion clean without changing what gets
// registered.
vi.mock('@/lib/brain/profiles', () => ({
  getOrCreateBrainProfile: vi.fn(async () => ({ id: 1, clientId: 1 })),
  getBrainProfile: vi.fn(async () => ({ id: 1, clientId: 1 })),
}));
// `@/lib/db` throws at import if DATABASE_URL is unset (lib/db/index.ts). Tool
// handlers reference `db` but never execute here (we only read registered NAMES),
// so a no-op stub lets this run DB-free in the unit gate.
vi.mock('@/lib/db', () => ({ db: {} }));

import { buildMcpServer } from '@/lib/mcp/server';

// Stable list of every tool that should register under '*' scope. Built from
// the baseline state of lib/mcp/server.ts + the per-feature MCP adapters
// (branding, storefront, brain, post-types, approvals). Ordering does not
// matter — the assertion is on set membership.
import { MCP_TOOL_NAMES as EXPECTED_TOOLS } from '../fixtures/mcp-tool-names';

/**
 * Stable list of every resource URI buildMcpServer() registers under '*'.
 * Resources are read-only context docs (see lib/mcp/tools/resources.ts) and
 * drift the same way tools do — lock the URI set here too.
 *   - blocks://schema, portal://capabilities — unscoped, always registered
 *   - brand://default — gated on branding:read
 *   - catalog://services — gated on services:read
 */
const EXPECTED_RESOURCES: readonly string[] = [
  'blocks://schema',
  'brand://default',
  'catalog://services',
  'portal://capabilities',
];

/**
 * Stable list of every prompt name buildMcpServer() registers under '*'.
 * Prompts are user-triggered guided workflows (see lib/mcp/tools/prompts.ts),
 * each gated on a representative scope. Lock the name set so drift fails red.
 *   - draft-page     — gated on sites:write
 *   - triage-tickets — gated on tickets:read
 *   - weekly-digest  — gated on projects:read
 */
const EXPECTED_PROMPTS: readonly string[] = [
  'draft-page',
  'triage-tickets',
  'weekly-digest',
];

/** Build a fake context with a chosen scope set. Doesn't hit the DB. */
function makeCtx(scopes: string[]): PortalMcpContext {
  return {
    userId: 1,
    keyId: 1,
    scopes,
    // Minimal client shape that the constructor's `instructions` template uses.
    // Real DB queries from tool handlers are never invoked in this spec — we
    // only introspect the registered tool registry.
    client: {
      id: 1,
      company: 'Baseline Test Co',
    } as PortalMcpContext['client'],
  };
}

/**
 * Reach into McpServer's private `_registeredTools` to introspect what was
 * registered without invoking transport. The shape is `Record<string,
 * RegisteredTool>` where each value carries `description`, `inputSchema`,
 * `callback`, etc. Documented in node_modules/@modelcontextprotocol/sdk
 * but not part of the public API — the assertion is therefore stricter than
 * a tools/list round-trip and catches drift even before the transport is
 * stood up.
 */
function getRegisteredTools(server: unknown): Record<string, {
  description?: string;
  title?: string;
  inputSchema?: unknown;
  handler: (...args: unknown[]) => unknown;
}> {
  return (server as { _registeredTools: Record<string, {
    description?: string;
    title?: string;
    inputSchema?: unknown;
    handler: (...args: unknown[]) => unknown;
  }> })._registeredTools;
}

/**
 * Reach into McpServer's private `_registeredResources` — a `Record<uri,
 * RegisteredResource>` where each value carries `name`, `metadata` (the
 * config), and `readCallback`. Same introspection approach as the tool
 * registry: stricter than a resources/list round-trip and catches drift before
 * the transport is stood up.
 */
function getRegisteredResources(server: unknown): Record<string, {
  name?: string;
  title?: string;
  metadata?: { title?: string; description?: string };
  readCallback: (...args: unknown[]) => unknown;
}> {
  return (server as { _registeredResources: Record<string, {
    name?: string;
    title?: string;
    metadata?: { title?: string; description?: string };
    readCallback: (...args: unknown[]) => unknown;
  }> })._registeredResources;
}

/**
 * Reach into McpServer's private `_registeredPrompts` — a `Record<name,
 * RegisteredPrompt>` carrying `title`, `description`, `argsSchema`, `callback`.
 */
function getRegisteredPrompts(server: unknown): Record<string, {
  title?: string;
  description?: string;
  callback: (...args: unknown[]) => unknown;
}> {
  return (server as { _registeredPrompts: Record<string, {
    title?: string;
    description?: string;
    callback: (...args: unknown[]) => unknown;
  }> })._registeredPrompts;
}

describe('MCP tool registry — baseline @critical', () => {
  it('registers exactly the expected tool surface for full-access keys', () => {
    const server = buildMcpServer(makeCtx(['*']));
    const registry = getRegisteredTools(server);
    const actual = new Set(Object.keys(registry));
    const expected = new Set(EXPECTED_TOOLS);

    // Every expected tool must be present.
    const missing: string[] = [];
    for (const name of expected) if (!actual.has(name)) missing.push(name);

    // No surprise tools should appear.
    const extra: string[] = [];
    for (const name of actual) if (!expected.has(name)) extra.push(name);

    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
    // Sanity: the set is non-trivial.
    expect(actual.size).toBeGreaterThanOrEqual(EXPECTED_TOOLS.length);
  });

  it('every registered tool has a callable handler and a config object', () => {
    const server = buildMcpServer(makeCtx(['*']));
    const registry = getRegisteredTools(server);
    for (const [name, tool] of Object.entries(registry)) {
      expect(typeof tool.handler, `tool ${name} missing handler`).toBe('function');
      // description and/or title is set on every tool we register.
      expect(
        typeof tool.description === 'string' || typeof tool.title === 'string',
        `tool ${name} missing description/title`,
      ).toBe(true);
    }
  });

  it('crm:read-only key sees crm reads but not crm writes nor off-domain tools', () => {
    const server = buildMcpServer(makeCtx(['crm:read']));
    const registry = getRegisteredTools(server);
    const names = new Set(Object.keys(registry));

    // crm reads visible
    expect(names.has('crm_contacts_search')).toBe(true);
    expect(names.has('crm_deals_list')).toBe(true);
    expect(names.has('crm_pipelines_list')).toBe(true);
    // crm writes hidden
    expect(names.has('crm_contacts_create')).toBe(false);
    expect(names.has('crm_deals_create')).toBe(false);
    // off-domain tools hidden
    expect(names.has('projects_create')).toBe(false);
    expect(names.has('posts_create')).toBe(false);
    expect(names.has('approvals_approve')).toBe(false);
    // whoami is unscoped — always visible
    expect(names.has('whoami')).toBe(true);
  });

  it('approvals:manage key sees the approvals surface; an unrelated key does not', () => {
    const withApprovals = getRegisteredTools(
      buildMcpServer(makeCtx(['approvals:read', 'approvals:manage'])),
    );
    const withoutApprovals = getRegisteredTools(buildMcpServer(makeCtx(['crm:read'])));

    expect(Object.keys(withApprovals)).toContain('approvals_list');
    expect(Object.keys(withApprovals)).toContain('approvals_approve');
    expect(Object.keys(withoutApprovals)).not.toContain('approvals_list');
    expect(Object.keys(withoutApprovals)).not.toContain('approvals_approve');
  });

  it('an empty-scope key sees only the unscoped meta + workflow-guide tools', () => {
    const server = buildMcpServer(makeCtx([]));
    const names = Object.keys(getRegisteredTools(server));
    // whoami + the workflow guides (list_workflows / get_workflow) are the only
    // unscoped tools — they carry no tenant data (static guided-content). Every
    // other registration is gated behind a `hasScope(ctx.scopes, ...)` guard.
    expect(names.sort()).toEqual(['get_workflow', 'list_workflows', 'whoami']);
  });

  it('narrower scope strictly trims the catalog (no new tool names)', () => {
    const fullNames = new Set(Object.keys(getRegisteredTools(buildMcpServer(makeCtx(['*'])))));
    const narrowNames = new Set(
      Object.keys(getRegisteredTools(buildMcpServer(makeCtx(['crm:read'])))),
    );
    expect(narrowNames.size).toBeLessThan(fullNames.size);
    // Every name visible to the narrow caller must also be visible to '*'.
    for (const n of narrowNames) {
      expect(fullNames.has(n), `narrow tool ${n} missing from full`).toBe(true);
    }
  });
});

describe('MCP resource registry — baseline @critical', () => {
  it('registers exactly the expected resource URIs for full-access keys', () => {
    const server = buildMcpServer(makeCtx(['*']));
    const actual = new Set(Object.keys(getRegisteredResources(server)));
    const expected = new Set(EXPECTED_RESOURCES);

    const missing = [...expected].filter((u) => !actual.has(u));
    const extra = [...actual].filter((u) => !expected.has(u));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('every registered resource has a read callback and a title/description', () => {
    const registry = getRegisteredResources(buildMcpServer(makeCtx(['*'])));
    for (const [uri, res] of Object.entries(registry)) {
      expect(typeof res.readCallback, `resource ${uri} missing readCallback`).toBe('function');
      const hasMeta = typeof res.metadata?.title === 'string' || typeof res.metadata?.description === 'string';
      expect(hasMeta, `resource ${uri} missing title/description`).toBe(true);
    }
  });

  it('an empty-scope key sees only the unscoped resources', () => {
    const uris = Object.keys(getRegisteredResources(buildMcpServer(makeCtx([])))).sort();
    // blocks://schema (static) and portal://capabilities (echoes own grant)
    // carry no tenant data and so register without a scope guard.
    expect(uris).toEqual(['blocks://schema', 'portal://capabilities']);
  });

  it('tenant-scoped resources appear only with their gating scope', () => {
    const branding = new Set(Object.keys(getRegisteredResources(buildMcpServer(makeCtx(['branding:read'])))));
    expect(branding.has('brand://default')).toBe(true);
    expect(branding.has('catalog://services')).toBe(false);

    const servicesScope = new Set(Object.keys(getRegisteredResources(buildMcpServer(makeCtx(['services:read'])))));
    expect(servicesScope.has('catalog://services')).toBe(true);
    expect(servicesScope.has('brand://default')).toBe(false);
  });
});

describe('MCP prompt registry — baseline @critical', () => {
  it('registers exactly the expected prompt names for full-access keys', () => {
    const actual = new Set(Object.keys(getRegisteredPrompts(buildMcpServer(makeCtx(['*'])))));
    const expected = new Set(EXPECTED_PROMPTS);

    const missing = [...expected].filter((n) => !actual.has(n));
    const extra = [...actual].filter((n) => !expected.has(n));
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it('every registered prompt has a callback and a title/description', () => {
    const registry = getRegisteredPrompts(buildMcpServer(makeCtx(['*'])));
    for (const [name, p] of Object.entries(registry)) {
      expect(typeof p.callback, `prompt ${name} missing callback`).toBe('function');
      const hasMeta = typeof p.title === 'string' || typeof p.description === 'string';
      expect(hasMeta, `prompt ${name} missing title/description`).toBe(true);
    }
  });

  it('an empty-scope key sees no prompts', () => {
    expect(Object.keys(getRegisteredPrompts(buildMcpServer(makeCtx([]))))).toEqual([]);
  });

  it('each prompt appears only with its gating scope', () => {
    const tickets = new Set(Object.keys(getRegisteredPrompts(buildMcpServer(makeCtx(['tickets:read'])))));
    expect(tickets.has('triage-tickets')).toBe(true);
    expect(tickets.has('draft-page')).toBe(false);
    expect(tickets.has('weekly-digest')).toBe(false);

    const sites = new Set(Object.keys(getRegisteredPrompts(buildMcpServer(makeCtx(['sites:write'])))));
    expect(sites.has('draft-page')).toBe(true);
    expect(sites.has('triage-tickets')).toBe(false);
  });
});
