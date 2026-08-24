/**
 * MCP tools — per-tenant site redirects.
 *
 * Deliberately its own module rather than three more tools bolted onto
 * lib/mcp/tools/cms.ts. That file is already a god file sitting on a
 * "may shrink, never grow" size budget, and adding to it would have meant
 * re-baselining the guard — i.e. spending the budget rather than respecting
 * it. The per-domain registrar pattern exists exactly for this.
 *
 * What these manage: `site_redirects` rows, read on the request hot path via
 * the cached lookup in lib/sites/host-resolver.ts and applied by
 * lib/sites/redirect-policy.ts before middleware rewrites into the renderer.
 *
 * NOT managed here: host-to-host canonicalisation. That is driven by
 * `website_domains.isPrimary` (see website_domains_add), so "which domain is
 * the real one" has one source of truth rather than two that can disagree.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientWebsites, siteRedirects } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import {
  json,
  denied,
  requireScope,
  serviceDenied,
  requireService,
  revalidateForWrite,
} from '../types';

export function registerSiteRedirectTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // Same ownership gate as the website_domains tools: a websiteId on its own
  // says nothing about which tenant it belongs to.
  async function requireClientSite(websiteId: number) {
    const [site] = await db.select({ id: clientWebsites.id }).from(clientWebsites)
      .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
    return site ?? null;
  }

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'website_redirects_list',
    {
      title: 'List website redirects',
      description: 'List the per-tenant redirect rules for a website.',
      inputSchema: { websiteId: z.number() },
    },
    async ({ websiteId }) => {
      if (!requireScope(ctx, 'sites:read')) return denied('sites:read');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      const rows = await db.select().from(siteRedirects)
        .where(eq(siteRedirects.websiteId, websiteId));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'website_redirects_set',
    {
      title: 'Add or update a website redirect',
      description:
        'Create or update one redirect rule for a website. `fromPath` is matched EXACTLY (lowercased, no wildcards; the query string is ignored when matching and preserved on the redirect); re-using an existing fromPath updates that rule rather than adding a duplicate. `toPath` may be a path on the same site ("/") or an absolute URL. Domain-to-domain canonicalisation is NOT set here — mark the target domain isPrimary via website_domains_add and every other verified domain 301s to it automatically. Takes up to 60s to take effect (the host cache TTL).',
      inputSchema: {
        websiteId: z.number(),
        fromPath: z.string().min(1).describe('Path to redirect FROM, leading slash, e.g. "/services".'),
        toPath: z.string().min(1).describe('Path or absolute URL to redirect TO.'),
        statusCode: z.union([z.literal(301), z.literal(302)]).optional().describe('Defaults to 301.'),
        enabled: z.boolean().optional(),
      },
    },
    async ({ websiteId, fromPath, toPath, statusCode, enabled }) => {
      if (!requireScope(ctx, 'sites:write')) return denied('sites:write');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      if (!(await requireClientSite(websiteId))) return json({ error: 'Site not found' });
      const from = fromPath.trim().toLowerCase();
      if (!from.startsWith('/')) return json({ error: 'fromPath must start with "/"' });
      const to = toPath.trim();
      // A rule pointing at its own path is a redirect loop. Middleware refuses
      // to serve one, but there is no reason to let it be stored either.
      if (to.toLowerCase() === from) return json({ error: 'fromPath and toPath are identical' });
      const [row] = await db.insert(siteRedirects)
        .values({
          websiteId,
          fromPath: from,
          toPath: to,
          statusCode: statusCode ?? 301,
          enabled: enabled ?? true,
        })
        .onConflictDoUpdate({
          target: [siteRedirects.websiteId, siteRedirects.fromPath],
          set: { toPath: to, statusCode: statusCode ?? 301, enabled: enabled ?? true, updatedAt: new Date() },
        })
        .returning();
      revalidateForWrite('sites');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'sites:delete') && server.registerTool(
    'website_redirects_remove',
    {
      title: 'Remove a website redirect',
      description: 'Delete one redirect rule. Takes up to 60s to take effect (the host cache TTL).',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'sites:delete')) return denied('sites:delete');
      if (!(await requireService(clientId, 'websites'))) return serviceDenied('websites');
      const [existing] = await db
        .select({ id: siteRedirects.id })
        .from(siteRedirects)
        .innerJoin(clientWebsites, eq(clientWebsites.id, siteRedirects.websiteId))
        .where(and(eq(siteRedirects.id, id), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Redirect not found' });
      await db.delete(siteRedirects).where(eq(siteRedirects.id, id));
      revalidateForWrite('sites');
      return json({ success: true, id });
    }
  );
}
