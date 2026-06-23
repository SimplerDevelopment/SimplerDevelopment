/**
 * MCP tools — chat.
 *
 * Manage the embeddable web chat widget: list widgets, browse conversations,
 * read message threads, and reply as an agent.
 *
 * Tenancy: chatWidgets, chatConversations, and chatMessages are all keyed by
 * clientId. Every query is scoped to ctx.client.id. For id-addressed operations
 * the row's clientId is verified against ctx.client.id before read or write to
 * prevent IDOR cross-tenant leaks.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chatWidgets, chatConversations, chatMessages } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { json, denied, requireScope } from '../types';

export function registerChatTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── WIDGETS ────────────────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'chat:read') && server.registerTool(
    'chat_widgets_list',
    {
      title: 'List chat widgets',
      description: 'List all chat widgets configured for this client.',
      inputSchema: {},
    },
    async () => {
      if (!requireScope(ctx, 'chat:read')) return denied('chat:read');
      const rows = await db.select({
        id: chatWidgets.id,
        siteId: chatWidgets.siteId,
        enabled: chatWidgets.enabled,
        greetingMessage: chatWidgets.greetingMessage,
        position: chatWidgets.position,
        primaryColor: chatWidgets.primaryColor,
        createdAt: chatWidgets.createdAt,
      }).from(chatWidgets)
        .where(eq(chatWidgets.clientId, clientId))
        .orderBy(chatWidgets.id);
      return json(rows);
    }
  );

  // ── CONVERSATIONS ──────────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'chat:read') && server.registerTool(
    'chat_conversations_list',
    {
      title: 'List chat conversations',
      description: 'List chat conversations for this client. Optionally filter by widgetId or status.',
      inputSchema: {
        widgetId: z.number().int().optional().describe('Filter to a specific widget.'),
        status: z.enum(['open', 'assigned', 'closed']).optional().describe('Filter by conversation status.'),
        limit: z.number().int().min(1).max(100).default(25).optional().describe('Max results (default 25, max 100).'),
      },
    },
    async ({ widgetId, status, limit }) => {
      if (!requireScope(ctx, 'chat:read')) return denied('chat:read');
      const conds = [eq(chatConversations.clientId, clientId)];
      if (widgetId !== undefined) conds.push(eq(chatConversations.widgetId, widgetId));
      if (status) conds.push(eq(chatConversations.status, status));
      const rows = await db.select({
        id: chatConversations.id,
        widgetId: chatConversations.widgetId,
        visitorName: chatConversations.visitorName,
        visitorEmail: chatConversations.visitorEmail,
        status: chatConversations.status,
        lastMessageAt: chatConversations.lastMessageAt,
      }).from(chatConversations)
        .where(and(...conds))
        .orderBy(desc(chatConversations.lastMessageAt))
        .limit(limit ?? 25);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'chat:read') && server.registerTool(
    'chat_conversations_get',
    {
      title: 'Get a chat conversation',
      description: 'Fetch a single chat conversation and its messages. Verifies the conversation belongs to the authenticated client.',
      inputSchema: {
        id: z.number().int().describe('Conversation ID.'),
      },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'chat:read')) return denied('chat:read');
      const [convo] = await db.select().from(chatConversations)
        .where(and(eq(chatConversations.id, id), eq(chatConversations.clientId, clientId)))
        .limit(1);
      if (!convo) return json({ error: 'Conversation not found or access denied.' });
      const messages = await db.select({
        id: chatMessages.id,
        authorKind: chatMessages.authorKind,
        authorName: chatMessages.authorName,
        body: chatMessages.body,
        occurredAt: chatMessages.occurredAt,
      }).from(chatMessages)
        .where(and(eq(chatMessages.conversationId, id), eq(chatMessages.clientId, clientId)))
        .orderBy(chatMessages.occurredAt);
      return json({ ...convo, messages });
    }
  );

  // ── WRITE TOOLS ────────────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'chat:write') && server.registerTool(
    'chat_conversation_reply',
    {
      title: 'Reply to a chat conversation',
      description: 'Send an agent reply to a visitor chat conversation. Verifies ownership before inserting.',
      inputSchema: {
        conversationId: z.number().int().describe('ID of the conversation to reply to.'),
        body: z.string().min(1).describe('Message body text.'),
      },
    },
    async ({ conversationId, body }) => {
      if (!requireScope(ctx, 'chat:write')) return denied('chat:write');
      // Ownership check
      const [convo] = await db.select({ id: chatConversations.id })
        .from(chatConversations)
        .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.clientId, clientId)))
        .limit(1);
      if (!convo) return json({ error: 'Conversation not found or access denied.' });
      const now = new Date();
      const [msg] = await db.insert(chatMessages).values({
        conversationId,
        clientId,
        authorKind: 'agent',
        authorUserId: ctx.userId,
        authorName: null,
        body,
        occurredAt: now,
      }).returning({ id: chatMessages.id });
      await db.update(chatConversations)
        .set({ lastMessageAt: now, updatedAt: now })
        .where(eq(chatConversations.id, conversationId));
      return json({ messageId: msg.id });
    }
  );

  hasScope(ctx.scopes, 'chat:write') && server.registerTool(
    'chat_conversation_update',
    {
      title: 'Update a chat conversation',
      description: 'Update the status and/or assigned user of a conversation. Verifies ownership before updating.',
      inputSchema: {
        id: z.number().int().describe('Conversation ID.'),
        status: z.enum(['open', 'assigned', 'closed']).optional().describe('New status.'),
        assignedUserId: z.number().int().nullable().optional().describe('User ID to assign, or null to unassign.'),
      },
    },
    async ({ id, status, assignedUserId }) => {
      if (!requireScope(ctx, 'chat:write')) return denied('chat:write');
      // Ownership check
      const [convo] = await db.select({ id: chatConversations.id, status: chatConversations.status })
        .from(chatConversations)
        .where(and(eq(chatConversations.id, id), eq(chatConversations.clientId, clientId)))
        .limit(1);
      if (!convo) return json({ error: 'Conversation not found or access denied.' });
      const now = new Date();
      const updates: Record<string, unknown> = { updatedAt: now };
      if (status !== undefined) {
        updates.status = status;
        if (status === 'closed') updates.closedAt = now;
      }
      if (assignedUserId !== undefined) updates.assignedUserId = assignedUserId;
      const [updated] = await db.update(chatConversations)
        .set(updates)
        .where(eq(chatConversations.id, id))
        .returning({ id: chatConversations.id, status: chatConversations.status });
      return json({ id: updated.id, status: updated.status });
    }
  );
}
