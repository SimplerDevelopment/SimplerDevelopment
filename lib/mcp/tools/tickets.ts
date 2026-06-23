/**
 * MCP tools — tickets.
 *
 * Extracted from lib/mcp/server.ts during the per-domain refactor. The
 * registrar function below is invoked by buildMcpServer() and registers each
 * tool with its scope guard. Behavior is unchanged from the monolithic file.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  supportTickets,
  ticketMessages,
} from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import { assertSafeUrl } from '@/lib/ssrf-guard';
import { uploadToS3 } from '@/lib/s3/upload';
import {
  json,
  denied,
  requireScope,
  revalidateForWrite,
} from '../types';

export function registerTicketsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── SUPPORT TICKETS ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'tickets:read') && server.registerTool(
    'tickets_list',
    {
      title: 'List support tickets',
      description: 'List support tickets for the client.',
      inputSchema: {
        status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']).optional(),
        limit: z.number().min(1).max(200).default(50).optional(),
      },
    },
    async ({ status, limit = 50 }) => {
      if (!requireScope(ctx, 'tickets:read')) return denied('tickets:read');
      const rows = await db.select().from(supportTickets)
        .where(status
          ? and(eq(supportTickets.clientId, clientId), eq(supportTickets.status, status))
          : eq(supportTickets.clientId, clientId))
        .orderBy(desc(supportTickets.createdAt))
        .limit(limit);
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'tickets:read') && server.registerTool(
    'tickets_get',
    {
      title: 'Get ticket with messages',
      description: 'Fetch a support ticket and its message thread.',
      inputSchema: { id: z.number() },
    },
    async ({ id }) => {
      if (!requireScope(ctx, 'tickets:read')) return denied('tickets:read');
      const [ticket] = await db.select().from(supportTickets)
        .where(and(eq(supportTickets.id, id), eq(supportTickets.clientId, clientId))).limit(1);
      if (!ticket) return json({ error: 'Ticket not found' });
      const messages = await db.select().from(ticketMessages)
        .where(and(eq(ticketMessages.ticketId, id), eq(ticketMessages.isInternal, false)))
        .orderBy(ticketMessages.createdAt);
      return json({ ticket, messages });
    }
  );

  hasScope(ctx.scopes, 'tickets:write') && server.registerTool(
    'tickets_create',
    {
      title: 'Create support ticket',
      description: 'Open a new support ticket.',
      inputSchema: {
        subject: z.string().min(1),
        body: z.string().min(1),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        category: z.enum(['general', 'billing', 'technical', 'domain', 'hosting']).optional(),
      },
    },
    async ({ subject, body, priority = 'medium', category = 'general' }) => {
      if (!requireScope(ctx, 'tickets:write')) return denied('tickets:write');
      const [{ maxNum }] = await db
        .select({ maxNum: sql<number>`coalesce(max(${supportTickets.number}), 0)` })
        .from(supportTickets).where(eq(supportTickets.clientId, clientId));
      const [ticket] = await db.insert(supportTickets).values({
        clientId,
        number: (maxNum ?? 0) + 1,
        subject,
        priority,
        category,
        createdBy: ctx.userId,
      }).returning();
      await db.insert(ticketMessages).values({
        ticketId: ticket.id,
        authorId: ctx.userId,
        body,
      });
      revalidateForWrite('portal');
      return json(ticket);
    }
  );

  hasScope(ctx.scopes, 'tickets:write') && server.registerTool(
    'tickets_reply',
    {
      title: 'Reply to ticket',
      description: 'Append a message to a support ticket.',
      inputSchema: { id: z.number(), body: z.string().min(1) },
    },
    async ({ id, body }) => {
      if (!requireScope(ctx, 'tickets:write')) return denied('tickets:write');
      const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets)
        .where(and(eq(supportTickets.id, id), eq(supportTickets.clientId, clientId))).limit(1);
      if (!ticket) return json({ error: 'Ticket not found' });
      const [msg] = await db.insert(ticketMessages).values({
        ticketId: id,
        authorId: ctx.userId,
        body,
      }).returning();
      await db.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, id));
      revalidateForWrite('portal');
      return json(msg);
    }
  );

  hasScope(ctx.scopes, 'tickets:write') && server.registerTool(
    'tickets_update',
    {
      title: 'Update support ticket',
      description: 'Change ticket status, priority, category, or assignee. Setting status to "resolved" stamps resolvedAt.',
      inputSchema: {
        id: z.number(),
        status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        category: z.enum(['general', 'billing', 'technical', 'domain', 'hosting']).optional(),
        subject: z.string().min(1).optional(),
        assignedTo: z.number().nullable().optional().describe('User id; pass null to unassign.'),
      },
    },
    async ({ id, status, priority, category, subject, assignedTo }) => {
      if (!requireScope(ctx, 'tickets:write')) return denied('tickets:write');
      const [existing] = await db.select({ id: supportTickets.id, status: supportTickets.status })
        .from(supportTickets)
        .where(and(eq(supportTickets.id, id), eq(supportTickets.clientId, clientId))).limit(1);
      if (!existing) return json({ error: 'Ticket not found' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (status !== undefined) {
        patch.status = status;
        if (status === 'resolved' && existing.status !== 'resolved') patch.resolvedAt = new Date();
      }
      if (priority !== undefined) patch.priority = priority;
      if (category !== undefined) patch.category = category;
      if (subject !== undefined) patch.subject = subject;
      if (assignedTo !== undefined) patch.assignedTo = assignedTo;
      const [row] = await db.update(supportTickets).set(patch)
        .where(eq(supportTickets.id, id)).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'tickets:write') && server.registerTool(
    'tickets_attach_file_from_url',
    {
      title: 'Reply to ticket with a file attachment',
      description:
        'Download a remote file (http/https, 25 MB cap), upload it to S3, and post a new ticket message with the file attached. Optionally include a body.',
      inputSchema: {
        ticketId: z.number(),
        url: z.string().url(),
        body: z.string().optional().describe('Message body to accompany the file; defaults to a note referencing the filename.'),
        filename: z.string().optional().describe('Override; defaults to URL basename.'),
      },
    },
    async ({ ticketId, url, body, filename }) => {
      if (!requireScope(ctx, 'tickets:write')) return denied('tickets:write');
      const [ticket] = await db.select({ id: supportTickets.id }).from(supportTickets)
        .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.clientId, clientId))).limit(1);
      if (!ticket) return json({ error: 'Ticket not found' });

      try {
        await assertSafeUrl(url);
      } catch (err) {
        return json({ error: `URL rejected: ${(err as Error).message}` });
      }
      let resp: Response;
      try {
        resp = await fetch(url, { redirect: 'manual' });
        if (resp.status >= 300 && resp.status < 400) {
          return json({ error: 'Refusing to follow redirects on remote upload (SSRF guard).' });
        }
      } catch (err) {
        return json({ error: `Fetch failed: ${(err as Error).message}` });
      }
      if (!resp.ok) return json({ error: `Fetch returned ${resp.status}` });
      const buf = Buffer.from(await resp.arrayBuffer());
      const MAX_BYTES = 25 * 1024 * 1024;
      if (buf.length > MAX_BYTES) return json({ error: `File too large (${buf.length} bytes).` });
      const mimeType = resp.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream';
      const derivedName = filename
        ?? decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || 'upload');
      const uploaded = await uploadToS3(buf, derivedName, mimeType);

      const [msg] = await db.insert(ticketMessages).values({
        ticketId,
        authorId: ctx.userId,
        body: body || `Attached: ${derivedName}`,
        attachments: [{
          url: uploaded.url,
          filename: derivedName,
          mimeType: uploaded.mimeType,
          fileSize: uploaded.fileSize,
        }],
      }).returning();
      await db.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, ticketId));
      revalidateForWrite('portal');
      return json(msg);
    }
  );
}
