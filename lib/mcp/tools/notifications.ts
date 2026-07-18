/**
 * MCP tools — notifications.
 *
 * In-app notification inbox for the authenticated portal user. The notifications
 * table is keyed by userId (not clientId) — every query is scoped to
 * ctx.userId, not ctx.client.id.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notifications } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { json, denied, requireScope } from '../types';

export function registerNotificationsTools(server: McpServer, ctx: PortalMcpContext): void {
  const userId = ctx.userId;

  hasScope(ctx.scopes, 'notifications:read') && server.registerTool(
    'notifications_list',
    {
      title: 'List notifications',
      description: 'List in-app notifications for the authenticated user. Optionally filter to unread only.',
      inputSchema: {
        unreadOnly: z.boolean().optional().describe('When true, return only unread notifications.'),
        limit: z.number().int().min(1).max(100).default(25).optional().describe('Max results (default 25, max 100).'),
      },
    },
    async ({ unreadOnly, limit }) => {
      if (!requireScope(ctx, 'notifications:read')) return denied('notifications:read');
      const conds = [eq(notifications.userId, userId)];
      if (unreadOnly) conds.push(isNull(notifications.readAt));
      const rows = await db.select({
        id: notifications.id,
        kind: notifications.kind,
        title: notifications.title,
        body: notifications.body,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
      }).from(notifications)
        .where(and(...conds))
        .orderBy(desc(notifications.createdAt))
        .limit(limit ?? 25);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'notifications:write') && server.registerTool(
    'notifications_mark_read',
    {
      title: 'Mark notifications read',
      description: 'Mark a single notification (by id) or all unread notifications as read. Exactly one of id or all must be provided.',
      inputSchema: {
        id: z.number().int().optional().describe('ID of a specific notification to mark read.'),
        all: z.boolean().optional().describe('When true, mark ALL unread notifications read.'),
      },
    },
    async ({ id, all }) => {
      if (!requireScope(ctx, 'notifications:write')) return denied('notifications:write');
      if ((id === undefined) === (all === undefined || all === false)) {
        return json({ error: 'Provide exactly one of id or all:true.' });
      }
      const now = new Date();
      if (id !== undefined) {
        const result = await db.update(notifications)
          .set({ readAt: now })
          .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
          .returning({ id: notifications.id });
        return json({ updated: result.length });
      } else {
        // all === true
        const result = await db.update(notifications)
          .set({ readAt: now })
          .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
          .returning({ id: notifications.id });
        return json({ updated: result.length });
      }
    }
  );
}
