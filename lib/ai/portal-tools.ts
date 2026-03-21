import { db } from '@/lib/db';
import {
  projects, kanbanColumns, kanbanCards, sprints,
  invoices, invoiceItems, supportTickets, ticketMessages,
  kanbanCardFiles, clients, users,
} from '@/lib/db/schema';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import type Anthropic from '@anthropic-ai/sdk';

export const PORTAL_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_my_projects',
    description: 'Get all projects for this client with status, due dates, and sprint/card progress summary.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_project_board',
    description: 'Get the kanban board for a project — columns with card counts by column.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'number', description: 'The project ID' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'get_sprint_progress',
    description: 'Get the active sprint progress for a project — cards done vs. total, goal, and dates.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'number', description: 'The project ID' },
      },
      required: ['project_id'],
    },
  },
  {
    name: 'get_my_invoices',
    description: 'Get all invoices for this client including amounts, status, and due dates.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_my_tickets',
    description: 'Get all support tickets for this client with status and last activity.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_project_files',
    description: 'List files attached to a specific project.',
    input_schema: {
      type: 'object' as const,
      properties: {
        project_id: { type: 'number', description: 'The project ID' },
      },
      required: ['project_id'],
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
];

export async function executePortalTool(
  name: string,
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
): Promise<unknown> {
  switch (name) {
    case 'get_my_projects': {
      const rows = await db.select().from(projects).where(eq(projects.clientId, clientId)).orderBy(desc(projects.createdAt));
      return rows.map(p => ({
        id: p.id,
        name: p.name,
        status: p.status,
        startDate: p.startDate,
        dueDate: p.dueDate,
      }));
    }

    case 'get_project_board': {
      const projectId = input.project_id as number;
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!project) return { error: 'Project not found' };

      const columns = await db.select().from(kanbanColumns)
        .where(eq(kanbanColumns.projectId, projectId)).orderBy(kanbanColumns.order);
      const cards = await db.select({ id: kanbanCards.id, columnId: kanbanCards.columnId })
        .from(kanbanCards).where(eq(kanbanCards.projectId, projectId));

      const cardsByColumn = cards.reduce<Record<number, number>>((acc, c) => {
        acc[c.columnId] = (acc[c.columnId] ?? 0) + 1;
        return acc;
      }, {});

      return {
        project: { name: project.name, status: project.status },
        columns: columns.map(col => ({ name: col.name, cardCount: cardsByColumn[col.id] ?? 0 })),
        totalCards: cards.length,
      };
    }

    case 'get_sprint_progress': {
      const projectId = input.project_id as number;
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!project) return { error: 'Project not found' };

      const sprintList = await db.select().from(sprints)
        .where(eq(sprints.projectId, projectId)).orderBy(sprints.order);

      if (sprintList.length === 0) return { message: 'No sprints set up for this project.' };

      const activeSprint = sprintList.find(s => s.status === 'active');
      const targetSprint = activeSprint ?? sprintList[sprintList.length - 1];

      const sprintCards = await db.select({ id: kanbanCards.id, columnId: kanbanCards.columnId })
        .from(kanbanCards).where(eq(kanbanCards.sprintId, targetSprint.id));

      // Get "done" column — last column by order
      const columns = await db.select().from(kanbanColumns)
        .where(eq(kanbanColumns.projectId, projectId)).orderBy(desc(kanbanColumns.order)).limit(1);
      const doneColumnId = columns[0]?.id;
      const doneCount = doneColumnId ? sprintCards.filter(c => c.columnId === doneColumnId).length : 0;

      return {
        sprint: {
          name: targetSprint.name,
          status: targetSprint.status,
          goal: targetSprint.goal,
          startDate: targetSprint.startDate,
          endDate: targetSprint.endDate,
        },
        totalCards: sprintCards.length,
        doneCards: doneCount,
        remainingCards: sprintCards.length - doneCount,
      };
    }

    case 'get_my_invoices': {
      const rows = await db.select({
        id: invoices.id,
        number: invoices.number,
        status: invoices.status,
        total: invoices.total,
        dueDate: invoices.dueDate,
        paidAt: invoices.paidAt,
        createdAt: invoices.createdAt,
      }).from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.createdAt));

      return rows.map(inv => ({
        ...inv,
        totalDollars: (inv.total / 100).toFixed(2),
      }));
    }

    case 'get_my_tickets': {
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
    }

    case 'get_project_files': {
      const projectId = input.project_id as number;
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!project) return { error: 'Project not found' };

      const files = await db.select({
        id: kanbanCardFiles.id,
        originalName: kanbanCardFiles.originalName,
        mimeType: kanbanCardFiles.mimeType,
        fileSize: kanbanCardFiles.fileSize,
        createdAt: kanbanCardFiles.createdAt,
      }).from(kanbanCardFiles)
        .where(eq(kanbanCardFiles.projectId, projectId))
        .orderBy(desc(kanbanCardFiles.createdAt));

      return { project: project.name, fileCount: files.length, files };
    }

    case 'create_support_ticket': {
      const { subject, body, priority, category } = input as {
        subject: string; body: string; priority: string; category: string;
      };

      // Get the highest existing ticket number for this client
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
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
