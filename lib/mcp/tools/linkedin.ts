/**
 * MCP tools — LinkedIn (Phase A: personal-profile posting).
 *
 * DRAFT-ONLY by design. Agents can check connection status and create/list/edit
 * DRAFT posts; they cannot schedule or publish. Scheduling (the commit-to-
 * publish action) is a deliberate human step in the Publishing UI, and the
 * cron only publishes rows a human moved to status='scheduled'. This enforces
 * the chosen automation model: auto-draft → human review + schedule, never
 * auto-publish.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { linkedinPosts } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { getConnection } from '@/lib/linkedin/connections';
import { json, denied, requireScope, revalidateForWrite } from '../types';

const MAX_TEXT = 3000;

export function registerLinkedinTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;
  const userId = ctx.userId;

  hasScope(ctx.scopes, 'linkedin:read') && server.registerTool(
    'linkedin_status',
    {
      title: 'LinkedIn connection status',
      description:
        'Report whether the authenticated user has connected their LinkedIn account for posting (personal profile). Returns { connected, name, scopes }.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'linkedin:read')) return denied('linkedin:read');
      const conn = await getConnection(clientId, userId);
      return json(conn ? { connected: true, memberUrn: conn.memberUrn } : { connected: false });
    }
  );

  hasScope(ctx.scopes, 'linkedin:write') && server.registerTool(
    'linkedin_post_create',
    {
      title: 'Create a LinkedIn draft',
      description:
        'Create a DRAFT LinkedIn post for the authenticated user. Does NOT publish or schedule — the draft is reviewed and scheduled by a human in the Publishing UI. Put any link in `linkInComment`, never in the body (reach hygiene). Echoes { id, status }.',
      inputSchema: {
        text: z.string().min(1).max(MAX_TEXT),
        mediaType: z.enum(['none', 'image', 'document', 'video']).optional(),
        mediaUrl: z.string().url().optional(),
        linkInComment: z.string().url().optional(),
      },
    },
    async ({ text, mediaType, mediaUrl, linkInComment }) => {
      if (!requireScope(ctx, 'linkedin:write')) return denied('linkedin:write');
      const [row] = await db
        .insert(linkedinPosts)
        .values({
          clientId,
          userId,
          text,
          mediaType: mediaType ?? 'none',
          mediaUrl: mediaUrl ?? null,
          linkInComment: linkInComment ?? null,
          status: 'draft',
          createdByUserId: userId,
        })
        .returning({ id: linkedinPosts.id, status: linkedinPosts.status });
      revalidateForWrite('portal');
      return json({ id: row.id, status: row.status });
    }
  );

  hasScope(ctx.scopes, 'linkedin:write') && server.registerTool(
    'linkedin_post_update',
    {
      title: 'Edit a LinkedIn draft',
      description:
        'Update the text/media of an existing DRAFT LinkedIn post owned by the authenticated user. Only drafts are editable (scheduled/published posts are not). Echoes { id, status }.',
      inputSchema: {
        id: z.number().int().positive(),
        text: z.string().min(1).max(MAX_TEXT).optional(),
        mediaType: z.enum(['none', 'image', 'document', 'video']).optional(),
        mediaUrl: z.string().url().optional(),
        linkInComment: z.string().url().optional(),
      },
    },
    async ({ id, text, mediaType, mediaUrl, linkInComment }) => {
      if (!requireScope(ctx, 'linkedin:write')) return denied('linkedin:write');
      const [existing] = await db
        .select({ id: linkedinPosts.id, status: linkedinPosts.status })
        .from(linkedinPosts)
        .where(and(eq(linkedinPosts.id, id), eq(linkedinPosts.clientId, clientId), eq(linkedinPosts.userId, userId)))
        .limit(1);
      if (!existing) return json({ error: 'not_found' });
      if (existing.status !== 'draft') return json({ error: `not_editable: post is ${existing.status}` });
      const [row] = await db
        .update(linkedinPosts)
        .set({
          ...(text !== undefined ? { text } : {}),
          ...(mediaType !== undefined ? { mediaType } : {}),
          ...(mediaUrl !== undefined ? { mediaUrl } : {}),
          ...(linkInComment !== undefined ? { linkInComment } : {}),
          updatedAt: new Date(),
        })
        .where(eq(linkedinPosts.id, id))
        .returning({ id: linkedinPosts.id, status: linkedinPosts.status });
      revalidateForWrite('portal');
      return json({ id: row.id, status: row.status });
    }
  );

  hasScope(ctx.scopes, 'linkedin:read') && server.registerTool(
    'linkedin_post_list',
    {
      title: 'List LinkedIn posts',
      description:
        'List the authenticated user\'s LinkedIn posts (draft/scheduled/published), newest first. Slim projection.',
      inputSchema: {
        status: z.enum(['draft', 'scheduled', 'publishing', 'published', 'failed']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ status, limit }) => {
      if (!requireScope(ctx, 'linkedin:read')) return denied('linkedin:read');
      const where = status
        ? and(eq(linkedinPosts.clientId, clientId), eq(linkedinPosts.userId, userId), eq(linkedinPosts.status, status))
        : and(eq(linkedinPosts.clientId, clientId), eq(linkedinPosts.userId, userId));
      const rows = await db
        .select({
          id: linkedinPosts.id,
          status: linkedinPosts.status,
          text: linkedinPosts.text,
          scheduledAt: linkedinPosts.scheduledAt,
          publishedAt: linkedinPosts.publishedAt,
          permalink: linkedinPosts.permalink,
        })
        .from(linkedinPosts)
        .where(where)
        .orderBy(desc(linkedinPosts.id))
        .limit(limit ?? 25);
      return json({
        posts: rows.map((r) => ({
          ...r,
          text: r.text.length > 120 ? `${r.text.slice(0, 120)}…` : r.text,
        })),
      });
    }
  );
}
