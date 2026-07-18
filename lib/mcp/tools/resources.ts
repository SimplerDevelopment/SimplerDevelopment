/**
 * MCP resources — read-only context documents for AI clients.
 *
 * Resources differ from tools: a tool is *called* to perform an action; a
 * resource is *attached* as read-only context, addressed by a stable URI.
 * Capable clients (Claude Code/Desktop) surface these as @-mentionable
 * context; less-capable clients ignore them — so a resource must never be the
 * ONLY way to reach a capability (everything here is also reachable via tools).
 *
 * Tenancy: tenant-scoped resources are gated on `hasScope(ctx.scopes, ...)` the
 * same way tools are — a resource that reads tenant data is the same leak risk
 * as a tool. Unscoped keys simply don't see them in resources/list, and every
 * query is filtered by `ctx.client.id`.
 *
 * Drift guard: the registered URI set is locked by
 * `tests/unit/mcp-tool-registry-baseline.test.ts` (EXPECTED_RESOURCES).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { services, clientServices } from '@/lib/db/schema';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import { handleBrandingGetProfile, handleBrandingGetMessaging } from '@/lib/branding/mcp-tools';
import { BLOCKS_SCHEMA_REFERENCE } from '../blocks-schema';

export function registerResourceDocs(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── blocks://schema — static visual-editor block reference ───────────────
  // Used by AI clients to author valid `blocks` arrays for posts_create /
  // posts_update. Unscoped + static (no tenant data), so always registered.
  server.registerResource(
    'blocks-schema',
    'blocks://schema',
    {
      title: 'Visual editor block schema',
      description:
        'Reference for the Block types accepted by posts_create and posts_update. Includes field shapes for hero, cta, stats, columns, card-grid, html-render (ACF-style fields/values/loop with template annotations data-field/data-repeat/data-group/data-loop), etc., plus worked examples.',
      mimeType: 'text/markdown',
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: 'text/markdown', text: BLOCKS_SCHEMA_REFERENCE }],
    }),
  );

  // ── brand://default — this client's default brand profile + messaging ────
  // Lets a client read voice/colours/fonts ONCE instead of threading brand
  // through every content tool. Gated like branding_get_profile.
  hasScope(ctx.scopes, 'branding:read') && server.registerResource(
    'brand-default',
    'brand://default',
    {
      title: 'Default brand profile',
      description:
        'The default brand profile for this client — colours, fonts, logos, button style, plus messaging (voice, taglines). Read this before authoring pages, decks, or emails so output matches the brand.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const [{ profile }, { messaging }] = await Promise.all([
        handleBrandingGetProfile({ clientId }, {}),
        handleBrandingGetMessaging({ clientId }, {}),
      ]);
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({ profile, messaging }, null, 2),
        }],
      };
    },
  );

  // ── catalog://services — agency catalogue + this client's entitlements ────
  // Tells the client which serviceId values are valid AND which features are
  // actually enabled for this tenant (active subscriptions). Gated like
  // service_catalog_list.
  hasScope(ctx.scopes, 'services:read') && server.registerResource(
    'service-catalog',
    'catalog://services',
    {
      title: 'Service catalog & entitlements',
      description:
        'The services the agency offers (catalog) plus this client\'s active subscriptions (entitlements). Use to know which serviceId values are valid and which feature categories are enabled for this tenant.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const catalog = await db
        .select({
          id: services.id,
          name: services.name,
          slug: services.slug,
          category: services.category,
          price: services.price,
          billingCycle: services.billingCycle,
        })
        .from(services)
        .where(eq(services.active, true))
        .orderBy(services.name);

      const entitlements = await db
        .select({
          serviceId: clientServices.serviceId,
          status: clientServices.status,
          category: services.category,
          name: services.name,
        })
        .from(clientServices)
        .innerJoin(services, eq(services.id, clientServices.serviceId))
        .where(and(eq(clientServices.clientId, clientId), eq(clientServices.status, 'active')));

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(
            { catalog, entitlements, enabledCategories: [...new Set(entitlements.map(e => e.category))] },
            null,
            2,
          ),
        }],
      };
    },
  );

  // ── portal://capabilities — what this connection can do ──────────────────
  // A richer `whoami` as readable context: the granted scopes split into the
  // read/write domains they unlock. Unscoped (only echoes the caller's own
  // grant + client identity, like whoami), so always registered.
  server.registerResource(
    'portal-capabilities',
    'portal://capabilities',
    {
      title: 'Connection capabilities',
      description:
        'The authenticated client and the scopes granted to this MCP connection, split into the domains you can read and write. Read this to know which tool families will succeed before calling them.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const reads = new Set<string>();
      const writes = new Set<string>();
      const wildcard = ctx.scopes.includes('*');
      for (const s of ctx.scopes) {
        const [domain, action] = s.split(':');
        if (!domain || domain === '*') continue;
        (action === 'write' ? writes : reads).add(domain);
      }
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify({
            client: { id: ctx.client.id, company: ctx.client.company },
            scopes: ctx.scopes,
            fullAccess: wildcard,
            readDomains: [...reads].sort(),
            writeDomains: [...writes].sort(),
          }, null, 2),
        }],
      };
    },
  );
}
