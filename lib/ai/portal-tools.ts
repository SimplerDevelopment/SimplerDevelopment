import { db } from '@/lib/db';
import {
  projects, kanbanColumns, kanbanCards, sprints,
  invoices, invoiceItems, supportTickets, ticketMessages,
  kanbanCardFiles, kanbanCardComments, clients, users,
  services, clientServices, clientWebsites, posts,
  categories, tags, media, hostedSites,
  emailCampaigns, emailLists, emailSubscribers,
  pitchDecks, bookingPages, bookings,
  suggestedProjects, suggestedProjectRequests,
  serviceRequests, clientMembers, paymentMethods,
} from '@/lib/db/schema';
import { eq, and, desc, asc, sql, isNull, or } from 'drizzle-orm';
import type Anthropic from '@anthropic-ai/sdk';

// ─── TOOL DEFINITIONS ────────────────────────────────────────────────────────

export const PORTAL_TOOLS: Anthropic.Tool[] = [
  // ── READ: Dashboard ──
  {
    name: 'get_dashboard_summary',
    description: 'Get a high-level dashboard summary: active project count, open ticket count, unpaid invoices, amount due, and recent activity.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ── READ: Projects ──
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
      properties: { project_id: { type: 'number', description: 'The project ID' } },
      required: ['project_id'],
    },
  },
  {
    name: 'get_project_cards',
    description: 'Get all cards in a project with their details (title, description, column, priority, assignee, due date).',
    input_schema: {
      type: 'object' as const,
      properties: { project_id: { type: 'number', description: 'The project ID' } },
      required: ['project_id'],
    },
  },
  {
    name: 'get_sprint_progress',
    description: 'Get the active sprint progress for a project — cards done vs. total, goal, and dates.',
    input_schema: {
      type: 'object' as const,
      properties: { project_id: { type: 'number', description: 'The project ID' } },
      required: ['project_id'],
    },
  },
  {
    name: 'get_project_files',
    description: 'List files attached to a specific project.',
    input_schema: {
      type: 'object' as const,
      properties: { project_id: { type: 'number', description: 'The project ID' } },
      required: ['project_id'],
    },
  },

  // ── READ: Invoices & Billing ──
  {
    name: 'get_my_invoices',
    description: 'Get all invoices for this client including amounts, status, and due dates.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_invoice_details',
    description: 'Get full details for a single invoice including line items.',
    input_schema: {
      type: 'object' as const,
      properties: { invoice_id: { type: 'number', description: 'The invoice ID' } },
      required: ['invoice_id'],
    },
  },
  {
    name: 'get_payment_methods',
    description: 'Get saved payment methods (cards on file) for this client.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ── READ: Support Tickets ──
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

  // ── READ: Services ──
  {
    name: 'get_services_catalog',
    description: 'Get available services the client can subscribe to, with pricing and features.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_my_services',
    description: 'Get services the client is currently subscribed to.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ── READ: Websites / CMS ──
  {
    name: 'get_my_websites',
    description: 'Get all client websites with page counts and deployment status.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_website_pages',
    description: 'Get all pages/posts for a specific website.',
    input_schema: {
      type: 'object' as const,
      properties: { website_id: { type: 'number', description: 'The website ID' } },
      required: ['website_id'],
    },
  },
  {
    name: 'get_website_categories',
    description: 'Get all categories for a specific website.',
    input_schema: {
      type: 'object' as const,
      properties: { website_id: { type: 'number', description: 'The website ID' } },
      required: ['website_id'],
    },
  },
  {
    name: 'get_website_tags',
    description: 'Get all tags for a specific website.',
    input_schema: {
      type: 'object' as const,
      properties: { website_id: { type: 'number', description: 'The website ID' } },
      required: ['website_id'],
    },
  },
  {
    name: 'get_website_media',
    description: 'Get all media files for a specific website.',
    input_schema: {
      type: 'object' as const,
      properties: { website_id: { type: 'number', description: 'The website ID' } },
      required: ['website_id'],
    },
  },

  // ── READ: Hosting ──
  {
    name: 'get_my_hosted_sites',
    description: 'Get all hosted sites for this client with status, domain, plan, and DNS info.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ── READ: Email Marketing ──
  {
    name: 'get_my_email_campaigns',
    description: 'Get all email campaigns for this client with stats.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_my_email_lists',
    description: 'Get all email lists for this client with subscriber counts.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ── READ: Pitch Decks ──
  {
    name: 'get_my_pitch_decks',
    description: 'Get all pitch decks for this client with status and slide count.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ── READ: Booking Pages ──
  {
    name: 'get_my_booking_pages',
    description: 'Get all booking pages for this client with settings and upcoming booking counts.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_bookings_for_page',
    description: 'Get all bookings for a specific booking page.',
    input_schema: {
      type: 'object' as const,
      properties: { booking_page_id: { type: 'number', description: 'The booking page ID' } },
      required: ['booking_page_id'],
    },
  },

  // ── READ: Suggested Projects ──
  {
    name: 'get_suggested_projects',
    description: 'Get suggested projects the client can request (pre-built project templates).',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ── READ: Team ──
  {
    name: 'get_my_team',
    description: 'Get all team members with their roles for this client account.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ── READ: Profile ──
  {
    name: 'get_my_profile',
    description: 'Get the current user profile and client account details.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },

  // ── WRITE: Support Tickets ──
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

  // ── WRITE: Kanban Cards ──
  {
    name: 'add_card_comment',
    description: 'Add a comment to a kanban card. Only call AFTER the client confirms the comment content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'number', description: 'The card ID' },
        body: { type: 'string', description: 'The comment text' },
      },
      required: ['card_id', 'body'],
    },
  },

  // ── WRITE: Website Pages ──
  {
    name: 'create_website_page',
    description: 'Create a new page/post on a client website. Only call AFTER the client confirms the details.',
    input_schema: {
      type: 'object' as const,
      properties: {
        website_id: { type: 'number', description: 'The website ID' },
        title: { type: 'string', description: 'Page title' },
        slug: { type: 'string', description: 'URL slug for the page' },
        post_type: { type: 'string', enum: ['page', 'blog', 'landing'], description: 'Type of page' },
        excerpt: { type: 'string', description: 'Short excerpt/summary (optional)' },
        published: { type: 'boolean', description: 'Whether to publish immediately' },
      },
      required: ['website_id', 'title', 'slug', 'post_type'],
    },
  },
  {
    name: 'publish_page',
    description: 'Publish or unpublish a page/post. Confirm with client first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'The post/page ID' },
        published: { type: 'boolean', description: 'true to publish, false to unpublish' },
      },
      required: ['post_id', 'published'],
    },
  },

  // ── WRITE: Website Categories ──
  {
    name: 'create_website_category',
    description: 'Create a new category on a client website. Confirm with client first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        website_id: { type: 'number', description: 'The website ID' },
        name: { type: 'string', description: 'Category name' },
        slug: { type: 'string', description: 'URL slug' },
        description: { type: 'string', description: 'Category description (optional)' },
      },
      required: ['website_id', 'name', 'slug'],
    },
  },

  // ── WRITE: Website Tags ──
  {
    name: 'create_website_tag',
    description: 'Create a new tag on a client website. Confirm with client first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        website_id: { type: 'number', description: 'The website ID' },
        name: { type: 'string', description: 'Tag name' },
        slug: { type: 'string', description: 'URL slug' },
      },
      required: ['website_id', 'name', 'slug'],
    },
  },

  // ── WRITE: Service Requests ──
  {
    name: 'request_service',
    description: 'Submit a request for a service from the catalog. Only call AFTER the client confirms.',
    input_schema: {
      type: 'object' as const,
      properties: {
        service_id: { type: 'number', description: 'The service ID to request' },
        message: { type: 'string', description: 'Additional message or notes from client' },
      },
      required: ['service_id'],
    },
  },

  // ── WRITE: Suggested Project Requests ──
  {
    name: 'request_suggested_project',
    description: 'Submit a request for a suggested project. Only call AFTER the client confirms.',
    input_schema: {
      type: 'object' as const,
      properties: {
        suggested_project_id: { type: 'number', description: 'The suggested project ID' },
        message: { type: 'string', description: 'Additional message or notes from client' },
      },
      required: ['suggested_project_id'],
    },
  },

  // ── WRITE: Profile ──
  {
    name: 'update_profile',
    description: 'Update the client profile (name, company, phone, website, address). Only update fields the client explicitly asked to change. Confirm first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Full name' },
        company: { type: 'string', description: 'Company name' },
        phone: { type: 'string', description: 'Phone number' },
        website: { type: 'string', description: 'Website URL' },
        address: { type: 'string', description: 'Address' },
      },
      required: [],
    },
  },

  // ── WRITE: Team ──
  {
    name: 'invite_team_member',
    description: 'Invite a new team member to the client account. Only call AFTER the client confirms name, email, and role.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Full name of the new member' },
        email: { type: 'string', description: 'Email address' },
        role: { type: 'string', enum: ['admin', 'member', 'viewer'], description: 'Role to assign' },
      },
      required: ['name', 'email', 'role'],
    },
  },

  // ── NAVIGATION ──
  {
    name: 'navigate_to',
    description: `Navigate the user to a specific portal page and optionally focus a UI section. Use this when the user wants to go somewhere, or when an action is better done through the UI (e.g. paying an invoice, editing a page in the block editor, uploading media, connecting Google, managing email campaign design).

Available routes:
- /portal/dashboard
- /portal/projects
- /portal/projects/{id} (optionally with section: board, files, sprints)
- /portal/billing (optionally with section: invoices, payment-methods)
- /portal/tickets
- /portal/tickets/new
- /portal/tickets/{id}
- /portal/services
- /portal/services/{id}/request
- /portal/websites
- /portal/websites/{id}
- /portal/websites/{id}/posts/new
- /portal/websites/{id}/posts/{postId}/edit
- /portal/websites/{id}/categories
- /portal/websites/{id}/tags
- /portal/websites/{id}/media
- /portal/websites/{id}/settings
- /portal/hosting
- /portal/hosting/{id}
- /portal/email/campaigns
- /portal/email/campaigns/new
- /portal/email/campaigns/{id}
- /portal/email/lists
- /portal/tools/pitch-decks
- /portal/tools/pitch-decks/new
- /portal/tools/pitch-decks/{id}
- /portal/tools/booking
- /portal/tools/booking/new
- /portal/tools/booking/{id}
- /portal/suggested-projects
- /portal/suggested-projects/{id}
- /portal/suggested-projects/{id}/request
- /portal/team
- /portal/settings/profile`,
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'The portal route path to navigate to (e.g. /portal/projects/5)' },
        section: { type: 'string', description: 'Optional UI section to focus/highlight (e.g. "board", "files", "sprints", "invoices", "payment-methods")' },
        message: { type: 'string', description: 'Brief instruction to the user about what to do on that page' },
      },
      required: ['path'],
    },
  },

  // ── NAVIGATION: Pay Invoice ──
  {
    name: 'pay_invoice',
    description: 'Navigate the user to pay a specific invoice. This opens the invoice with the pay button highlighted.',
    input_schema: {
      type: 'object' as const,
      properties: {
        invoice_id: { type: 'number', description: 'The invoice ID to pay' },
      },
      required: ['invoice_id'],
    },
  },
];

// ─── TOOL EXECUTION ──────────────────────────────────────────────────────────

export async function executePortalTool(
  name: string,
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
): Promise<unknown> {
  switch (name) {

    // ── READ: Dashboard ──
    case 'get_dashboard_summary': {
      const [projectRows, ticketRows, invoiceRows] = await Promise.all([
        db.select({ id: projects.id, status: projects.status })
          .from(projects).where(eq(projects.clientId, clientId)),
        db.select({ id: supportTickets.id, status: supportTickets.status })
          .from(supportTickets).where(eq(supportTickets.clientId, clientId)),
        db.select({ id: invoices.id, status: invoices.status, total: invoices.total })
          .from(invoices).where(eq(invoices.clientId, clientId)),
      ]);
      const activeProjects = projectRows.filter(p => p.status === 'active').length;
      const openTickets = ticketRows.filter(t => t.status === 'open' || t.status === 'in_progress').length;
      const unpaidInvoices = invoiceRows.filter(i => i.status === 'sent' || i.status === 'overdue');
      const amountDue = unpaidInvoices.reduce((sum, i) => sum + i.total, 0);
      return {
        activeProjects,
        totalProjects: projectRows.length,
        openTickets,
        totalTickets: ticketRows.length,
        unpaidInvoiceCount: unpaidInvoices.length,
        amountDueDollars: (amountDue / 100).toFixed(2),
      };
    }

    // ── READ: Projects ──
    case 'get_my_projects': {
      const rows = await db.select().from(projects).where(eq(projects.clientId, clientId)).orderBy(desc(projects.createdAt));
      return rows.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
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
        columns: columns.map(col => ({ id: col.id, name: col.name, cardCount: cardsByColumn[col.id] ?? 0 })),
        totalCards: cards.length,
      };
    }

    case 'get_project_cards': {
      const projectId = input.project_id as number;
      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!project) return { error: 'Project not found' };

      const columns = await db.select().from(kanbanColumns)
        .where(eq(kanbanColumns.projectId, projectId)).orderBy(kanbanColumns.order);
      const columnMap = Object.fromEntries(columns.map(c => [c.id, c.name]));

      const cards = await db.select({
        id: kanbanCards.id,
        title: kanbanCards.title,
        description: kanbanCards.description,
        columnId: kanbanCards.columnId,
        priority: kanbanCards.priority,
        dueDate: kanbanCards.dueDate,
        assignedTo: kanbanCards.assignedTo,
        order: kanbanCards.order,
      }).from(kanbanCards).where(eq(kanbanCards.projectId, projectId)).orderBy(kanbanCards.order);

      return cards.map(c => ({
        ...c,
        column: columnMap[c.columnId] ?? 'Unknown',
      }));
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

    // ── READ: Invoices & Billing ──
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

    case 'get_invoice_details': {
      const invoiceId = input.invoice_id as number;
      const [inv] = await db.select().from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, clientId))).limit(1);
      if (!inv) return { error: 'Invoice not found' };

      const items = await db.select().from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, invoiceId));

      return {
        id: inv.id,
        number: inv.number,
        status: inv.status,
        subtotalDollars: (inv.subtotal / 100).toFixed(2),
        taxDollars: (inv.tax / 100).toFixed(2),
        totalDollars: (inv.total / 100).toFixed(2),
        dueDate: inv.dueDate,
        paidAt: inv.paidAt,
        notes: inv.notes,
        items: items.map(it => ({
          description: it.description,
          quantity: it.quantity,
          unitPriceDollars: (it.unitPrice / 100).toFixed(2),
          totalDollars: (it.total / 100).toFixed(2),
        })),
      };
    }

    case 'get_payment_methods': {
      const rows = await db.select({
        id: paymentMethods.id,
        brand: paymentMethods.brand,
        last4: paymentMethods.last4,
        expMonth: paymentMethods.expMonth,
        expYear: paymentMethods.expYear,
        isDefault: paymentMethods.isDefault,
      }).from(paymentMethods).where(eq(paymentMethods.clientId, clientId));
      return rows;
    }

    // ── READ: Support Tickets ──
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

    case 'get_ticket_details': {
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
    }

    // ── READ: Services ──
    case 'get_services_catalog': {
      const rows = await db.select({
        id: services.id,
        name: services.name,
        slug: services.slug,
        description: services.description,
        category: services.category,
        price: services.price,
        billingCycle: services.billingCycle,
        features: services.features,
      }).from(services).where(eq(services.active, true));

      return rows.map(s => ({
        ...s,
        priceDollars: (s.price / 100).toFixed(2),
      }));
    }

    case 'get_my_services': {
      const rows = await db.select({
        id: clientServices.id,
        serviceId: clientServices.serviceId,
        status: clientServices.status,
        startDate: clientServices.startDate,
        renewalDate: clientServices.renewalDate,
        serviceName: services.name,
        serviceCategory: services.category,
        price: services.price,
        billingCycle: services.billingCycle,
      }).from(clientServices)
        .innerJoin(services, eq(services.id, clientServices.serviceId))
        .where(eq(clientServices.clientId, clientId));

      return rows.map(r => ({
        ...r,
        priceDollars: (r.price / 100).toFixed(2),
      }));
    }

    // ── READ: Websites / CMS ──
    case 'get_my_websites': {
      const rows = await db.select({
        id: clientWebsites.id,
        name: clientWebsites.name,
        domain: clientWebsites.domain,
        subdomain: clientWebsites.subdomain,
        description: clientWebsites.description,
        deploymentStatus: clientWebsites.deploymentStatus,
        vercelDomain: clientWebsites.vercelDomain,
      }).from(clientWebsites).where(eq(clientWebsites.clientId, clientId));

      // Get page counts per website
      const result = [];
      for (const site of rows) {
        const [countRow] = await db.select({ count: sql<number>`count(*)` })
          .from(posts).where(eq(posts.websiteId, site.id));
        result.push({ ...site, pageCount: countRow?.count ?? 0 });
      }
      return result;
    }

    case 'get_website_pages': {
      const websiteId = input.website_id as number;
      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Website not found' };

      const rows = await db.select({
        id: posts.id,
        title: posts.title,
        slug: posts.slug,
        postType: posts.postType,
        published: posts.published,
        publishedAt: posts.publishedAt,
        updatedAt: posts.updatedAt,
      }).from(posts).where(eq(posts.websiteId, websiteId)).orderBy(desc(posts.updatedAt));

      return { website: site.name, pages: rows };
    }

    case 'get_website_categories': {
      const websiteId = input.website_id as number;
      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Website not found' };

      const rows = await db.select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
      }).from(categories).where(eq(categories.websiteId, websiteId));
      return rows;
    }

    case 'get_website_tags': {
      const websiteId = input.website_id as number;
      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Website not found' };

      const rows = await db.select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
      }).from(tags).where(eq(tags.websiteId, websiteId));
      return rows;
    }

    case 'get_website_media': {
      const websiteId = input.website_id as number;
      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Website not found' };

      const rows = await db.select({
        id: media.id,
        filename: media.filename,
        mimeType: media.mimeType,
        fileSize: media.fileSize,
        url: media.url,
        alt: media.alt,
        createdAt: media.createdAt,
      }).from(media).where(eq(media.websiteId, websiteId)).orderBy(desc(media.createdAt));
      return rows;
    }

    // ── READ: Hosting ──
    case 'get_my_hosted_sites': {
      const rows = await db.select({
        id: hostedSites.id,
        name: hostedSites.name,
        customDomain: hostedSites.customDomain,
        railwayDomain: hostedSites.railwayDomain,
        status: hostedSites.status,
        plan: hostedSites.plan,
        renewalDate: hostedSites.renewalDate,
        dnsInstructions: hostedSites.dnsInstructions,
      }).from(hostedSites).where(eq(hostedSites.clientId, clientId));
      return rows;
    }

    // ── READ: Email Marketing ──
    case 'get_my_email_campaigns': {
      const rows = await db.select({
        id: emailCampaigns.id,
        name: emailCampaigns.name,
        subject: emailCampaigns.subject,
        status: emailCampaigns.status,
        totalSent: emailCampaigns.totalSent,
        totalOpened: emailCampaigns.totalOpened,
        totalClicked: emailCampaigns.totalClicked,
        sentAt: emailCampaigns.sentAt,
        scheduledAt: emailCampaigns.scheduledAt,
        createdAt: emailCampaigns.createdAt,
      }).from(emailCampaigns).where(eq(emailCampaigns.clientId, clientId)).orderBy(desc(emailCampaigns.createdAt));
      return rows;
    }

    case 'get_my_email_lists': {
      const rows = await db.select({
        id: emailLists.id,
        name: emailLists.name,
        description: emailLists.description,
        createdAt: emailLists.createdAt,
      }).from(emailLists).where(eq(emailLists.clientId, clientId));

      const result = [];
      for (const list of rows) {
        const [countRow] = await db.select({ count: sql<number>`count(*)` })
          .from(emailSubscribers)
          .where(and(eq(emailSubscribers.listId, list.id), eq(emailSubscribers.status, 'active')));
        result.push({ ...list, subscriberCount: countRow?.count ?? 0 });
      }
      return result;
    }

    // ── READ: Pitch Decks ──
    case 'get_my_pitch_decks': {
      const rows = await db.select({
        id: pitchDecks.id,
        title: pitchDecks.title,
        slug: pitchDecks.slug,
        description: pitchDecks.description,
        status: pitchDecks.status,
        slides: pitchDecks.slides,
        createdAt: pitchDecks.createdAt,
        updatedAt: pitchDecks.updatedAt,
      }).from(pitchDecks).where(eq(pitchDecks.clientId, clientId)).orderBy(desc(pitchDecks.updatedAt));

      return rows.map(d => ({
        id: d.id,
        title: d.title,
        slug: d.slug,
        description: d.description,
        status: d.status,
        slideCount: Array.isArray(d.slides) ? d.slides.length : 0,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));
    }

    // ── READ: Booking Pages ──
    case 'get_my_booking_pages': {
      const rows = await db.select({
        id: bookingPages.id,
        title: bookingPages.title,
        slug: bookingPages.slug,
        description: bookingPages.description,
        duration: bookingPages.duration,
        active: bookingPages.active,
        color: bookingPages.color,
        createdAt: bookingPages.createdAt,
      }).from(bookingPages).where(eq(bookingPages.clientId, clientId));

      const result = [];
      for (const page of rows) {
        const [countRow] = await db.select({ count: sql<number>`count(*)` })
          .from(bookings)
          .where(and(
            eq(bookings.bookingPageId, page.id),
            eq(bookings.status, 'confirmed'),
          ));
        result.push({ ...page, upcomingBookings: countRow?.count ?? 0 });
      }
      return result;
    }

    case 'get_bookings_for_page': {
      const bookingPageId = input.booking_page_id as number;
      const [page] = await db.select().from(bookingPages)
        .where(and(eq(bookingPages.id, bookingPageId), eq(bookingPages.clientId, clientId))).limit(1);
      if (!page) return { error: 'Booking page not found' };

      const rows = await db.select({
        id: bookings.id,
        guestName: bookings.guestName,
        guestEmail: bookings.guestEmail,
        startTime: bookings.startTime,
        endTime: bookings.endTime,
        status: bookings.status,
        answers: bookings.answers,
        createdAt: bookings.createdAt,
      }).from(bookings).where(eq(bookings.bookingPageId, bookingPageId)).orderBy(desc(bookings.startTime));
      return { bookingPage: page.title, bookings: rows };
    }

    // ── READ: Suggested Projects ──
    case 'get_suggested_projects': {
      const rows = await db.select({
        id: suggestedProjects.id,
        title: suggestedProjects.title,
        description: suggestedProjects.description,
        category: suggestedProjects.category,
        estimatedPrice: suggestedProjects.estimatedPrice,
        estimatedTimeline: suggestedProjects.estimatedTimeline,
        features: suggestedProjects.features,
        icon: suggestedProjects.icon,
      }).from(suggestedProjects)
        .where(and(
          eq(suggestedProjects.active, true),
          or(isNull(suggestedProjects.clientId), eq(suggestedProjects.clientId, clientId)),
        ))
        .orderBy(suggestedProjects.order);

      return rows.map(p => ({
        ...p,
        estimatedPriceDollars: p.estimatedPrice ? (p.estimatedPrice / 100).toFixed(2) : 'Quote on request',
      }));
    }

    // ── READ: Team ──
    case 'get_my_team': {
      const rows = await db.select({
        id: clientMembers.id,
        role: clientMembers.role,
        createdAt: clientMembers.createdAt,
        userName: users.name,
        userEmail: users.email,
        userId: users.id,
      }).from(clientMembers)
        .innerJoin(users, eq(users.id, clientMembers.userId))
        .where(eq(clientMembers.clientId, clientId));
      return rows;
    }

    // ── READ: Profile ──
    case 'get_my_profile': {
      const [client] = await db.select({
        id: clients.id,
        company: clients.company,
        phone: clients.phone,
        website: clients.website,
        address: clients.address,
        userName: users.name,
        userEmail: users.email,
      }).from(clients)
        .innerJoin(users, eq(users.id, clients.userId))
        .where(eq(clients.id, clientId)).limit(1);
      return client ?? { error: 'Profile not found' };
    }

    // ── WRITE: Support Tickets ──
    case 'create_support_ticket': {
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
    }

    case 'reply_to_ticket': {
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
    }

    // ── WRITE: Kanban Card Comments ──
    case 'add_card_comment': {
      const cardId = input.card_id as number;
      const body = input.body as string;

      // Verify the card belongs to a project owned by this client
      const [card] = await db.select({ id: kanbanCards.id, projectId: kanbanCards.projectId })
        .from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
      if (!card) return { error: 'Card not found' };

      const [project] = await db.select().from(projects)
        .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId))).limit(1);
      if (!project) return { error: 'Card does not belong to your project' };

      await db.insert(kanbanCardComments).values({
        cardId,
        userId,
        body,
      });

      return { success: true, message: 'Comment added.' };
    }

    // ── WRITE: Website Pages ──
    case 'create_website_page': {
      const websiteId = input.website_id as number;
      const title = input.title as string;
      const slug = input.slug as string;
      const postType = (input.post_type as string) || 'page';
      const excerpt = input.excerpt as string | undefined;
      const published = input.published as boolean | undefined;

      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Website not found' };

      const [post] = await db.insert(posts).values({
        title,
        slug,
        postType,
        excerpt: excerpt ?? null,
        content: '[]', // empty block content
        published: published ?? false,
        publishedAt: published ? new Date() : null,
        websiteId,
      }).returning();

      return {
        success: true,
        postId: post.id,
        message: `Page "${title}" created${published ? ' and published' : ' as draft'}.`,
      };
    }

    case 'publish_page': {
      const postId = input.post_id as number;
      const published = input.published as boolean;

      // Verify the post belongs to a website owned by this client
      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!post || !post.websiteId) return { error: 'Page not found' };

      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Page does not belong to your website' };

      await db.update(posts).set({
        published,
        publishedAt: published ? new Date() : null,
        updatedAt: new Date(),
      }).where(eq(posts.id, postId));

      return { success: true, message: `Page "${post.title}" ${published ? 'published' : 'unpublished'}.` };
    }

    // ── WRITE: Website Categories ──
    case 'create_website_category': {
      const websiteId = input.website_id as number;
      const name = input.name as string;
      const slug = input.slug as string;
      const description = input.description as string | undefined;

      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Website not found' };

      const [cat] = await db.insert(categories).values({
        name,
        slug,
        description: description ?? null,
        websiteId,
      }).returning();

      return { success: true, categoryId: cat.id, message: `Category "${name}" created.` };
    }

    // ── WRITE: Website Tags ──
    case 'create_website_tag': {
      const websiteId = input.website_id as number;
      const name = input.name as string;
      const slug = input.slug as string;

      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Website not found' };

      const [tag] = await db.insert(tags).values({
        name,
        slug,
        websiteId,
      }).returning();

      return { success: true, tagId: tag.id, message: `Tag "${name}" created.` };
    }

    // ── WRITE: Service Requests ──
    case 'request_service': {
      const serviceId = input.service_id as number;
      const message = input.message as string | undefined;

      const [svc] = await db.select().from(services)
        .where(and(eq(services.id, serviceId), eq(services.active, true))).limit(1);
      if (!svc) return { error: 'Service not found' };

      const [req] = await db.insert(serviceRequests).values({
        serviceId,
        clientId,
        message: message ?? null,
        status: 'pending',
      }).returning();

      return { success: true, requestId: req.id, message: `Request for "${svc.name}" submitted. The team will review it shortly.` };
    }

    // ── WRITE: Suggested Project Requests ──
    case 'request_suggested_project': {
      const suggestedProjectId = input.suggested_project_id as number;
      const message = input.message as string | undefined;

      const [sp] = await db.select().from(suggestedProjects)
        .where(and(eq(suggestedProjects.id, suggestedProjectId), eq(suggestedProjects.active, true))).limit(1);
      if (!sp) return { error: 'Suggested project not found' };

      const [req] = await db.insert(suggestedProjectRequests).values({
        suggestedProjectId,
        clientId,
        message: message ?? null,
        status: 'pending',
      }).returning();

      return { success: true, requestId: req.id, message: `Request for "${sp.title}" submitted. The team will review it shortly.` };
    }

    // ── WRITE: Profile ──
    case 'update_profile': {
      const { name, company, phone, website, address } = input as {
        name?: string; company?: string; phone?: string; website?: string; address?: string;
      };

      // Update user name if provided
      if (name) {
        const [client] = await db.select({ userId: clients.userId })
          .from(clients).where(eq(clients.id, clientId)).limit(1);
        if (client) {
          await db.update(users).set({ name, updatedAt: new Date() })
            .where(eq(users.id, client.userId));
        }
      }

      // Update client fields if provided
      const clientUpdate: Record<string, unknown> = { updatedAt: new Date() };
      if (company !== undefined) clientUpdate.company = company;
      if (phone !== undefined) clientUpdate.phone = phone;
      if (website !== undefined) clientUpdate.website = website;
      if (address !== undefined) clientUpdate.address = address;

      await db.update(clients).set(clientUpdate)
        .where(eq(clients.id, clientId));

      return { success: true, message: 'Profile updated.' };
    }

    // ── WRITE: Team ──
    case 'invite_team_member': {
      const name = input.name as string;
      const email = input.email as string;
      const role = input.role as string;

      // Check if user already exists
      let [existingUser] = await db.select().from(users)
        .where(eq(users.email, email)).limit(1);

      if (!existingUser) {
        // Create a new user with a temporary password (they'll need to set it up)
        const bcrypt = await import('bcryptjs');
        const tempPassword = await bcrypt.hash(Math.random().toString(36).slice(2), 10);
        [existingUser] = await db.insert(users).values({
          name,
          email,
          password: tempPassword,
          role: 'client',
        }).returning();
      }

      // Check if already a member
      const [existing] = await db.select().from(clientMembers)
        .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, existingUser.id))).limit(1);
      if (existing) return { error: `${email} is already a team member.` };

      await db.insert(clientMembers).values({
        clientId,
        userId: existingUser.id,
        role,
        invitedBy: userId,
      });

      return { success: true, message: `${name} (${email}) invited as ${role}.` };
    }

    // ── NAVIGATION ──
    case 'navigate_to': {
      return {
        action: 'navigate',
        path: input.path,
        section: input.section ?? null,
        message: input.message ?? null,
      };
    }

    case 'pay_invoice': {
      const invoiceId = input.invoice_id as number;
      const [inv] = await db.select({ id: invoices.id, number: invoices.number, status: invoices.status })
        .from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.clientId, clientId))).limit(1);
      if (!inv) return { error: 'Invoice not found' };
      if (inv.status === 'paid') return { message: `Invoice ${inv.number} is already paid.` };
      if (inv.status === 'draft' || inv.status === 'cancelled') return { error: `Invoice ${inv.number} is ${inv.status} and cannot be paid.` };

      return {
        action: 'navigate',
        path: `/portal/billing`,
        section: `invoice-${inv.id}`,
        message: `Click "Pay Now" on invoice ${inv.number} to proceed to checkout.`,
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
