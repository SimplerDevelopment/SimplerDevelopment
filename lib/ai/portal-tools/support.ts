/**
 * Support-ticket AI tools.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { supportTickets, ticketMessages } from '@/lib/db/schema';
import { eq, and, desc, asc } from 'drizzle-orm';

export const supportTools: Anthropic.Tool[] = [
  {
    name: 'get_my_tickets',
    description: 'Get all support tickets for this client with status and last activity.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_ticket_details',
    description: 'Get full details for a single support ticket including all messages.',
    input_schema: {
      type: 'object' as const,
      properties: { ticket_id: { type: 'number', description: 'The ticket ID' } },
      required: ['ticket_id'],
    },
  },
  {
    name: 'create_support_ticket',
    description: 'Create a support ticket. Only call this AFTER the client has explicitly confirmed the details.',
    input_schema: {
      type: 'object' as const,
      properties: {
        subject: { type: 'string', description: 'Short ticket subject' },
        body: { type: 'string', description: 'Full description of the issue or request' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
        category: { type: 'string', enum: ['general', 'billing', 'technical', 'domain', 'hosting'] },
      },
      required: ['subject', 'body', 'priority', 'category'],
    },
  },
  {
    name: 'reply_to_ticket',
    description: 'Add a reply message to an existing support ticket. Only call AFTER the client confirms the reply content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ticket_id: { type: 'number', description: 'The ticket ID to reply to' },
        body: { type: 'string', description: 'The reply message content' },
      },
      required: ['ticket_id', 'body'],
    },
  },
];

export type SupportHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const supportHandlers: Record<string, SupportHandler> = {
  get_my_tickets: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: supportTickets.id,
      number: supportTickets.number,
      subject: supportTickets.subject,
      status: supportTickets.status,
      priority: supportTickets.priority,
      category: supportTickets.category,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
    }).from(supportTickets).where(eq(supportTickets.clientId, clientId)).orderBy(desc(supportTickets.createdAt));
    return rows;
  },

  get_ticket_details: async (input, clientId, _userId) => {
    const ticketId = input.ticket_id as number;
    const [ticket] = await db.select().from(supportTickets)
      .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.clientId, clientId))).limit(1);
    if (!ticket) return { error: 'Ticket not found' };

    const messages = await db.select({
      id: ticketMessages.id,
      body: ticketMessages.body,
      isInternal: ticketMessages.isInternal,
      createdAt: ticketMessages.createdAt,
      authorId: ticketMessages.authorId,
    }).from(ticketMessages)
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(asc(ticketMessages.createdAt));

    // Filter out internal staff notes — clients shouldn't see those
    const clientMessages = messages.filter(m => !m.isInternal);

    return {
      id: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      createdAt: ticket.createdAt,
      messages: clientMessages.map(m => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        authorId: m.authorId,
      })),
    };
  },

  create_support_ticket: async (input, clientId, userId) => {
    const { subject, body, priority, category } = input as {
      subject: string; body: string; priority: string; category: string;
    };

    const [last] = await db.select({ number: supportTickets.number })
      .from(supportTickets).where(eq(supportTickets.clientId, clientId))
      .orderBy(desc(supportTickets.number)).limit(1);

    const ticketNumber = (last?.number ?? 0) + 1;

    const [ticket] = await db.insert(supportTickets).values({
      number: ticketNumber,
      clientId,
      subject,
      status: 'open',
      priority,
      category,
      createdBy: userId,
    }).returning();

    await db.insert(ticketMessages).values({
      ticketId: ticket.id,
      authorId: userId,
      body,
      isInternal: false,
    });

    return {
      success: true,
      ticketId: ticket.id,
      ticketNumber,
      message: `Ticket #${ticketNumber} created successfully.`,
    };
  },

  reply_to_ticket: async (input, clientId, userId) => {
    const ticketId = input.ticket_id as number;
    const body = input.body as string;

    const [ticket] = await db.select().from(supportTickets)
      .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.clientId, clientId))).limit(1);
    if (!ticket) return { error: 'Ticket not found' };

    await db.insert(ticketMessages).values({
      ticketId,
      authorId: userId,
      body,
      isInternal: false,
    });

    // If ticket was resolved/closed, reopen it
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      await db.update(supportTickets).set({ status: 'open', updatedAt: new Date() })
        .where(eq(supportTickets.id, ticketId));
    } else {
      await db.update(supportTickets).set({ updatedAt: new Date() })
        .where(eq(supportTickets.id, ticketId));
    }

    return { success: true, ticketId, message: `Reply added to ticket #${ticket.number}.` };
  },
};
