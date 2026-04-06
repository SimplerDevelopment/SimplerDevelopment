import { db } from '@/lib/db';
import {
  projects, kanbanColumns, kanbanCards, sprints,
  invoices, invoiceItems, supportTickets, ticketMessages,
  kanbanCardFiles, kanbanCardComments, clients, users,
  services, clientServices, clientWebsites, posts, postRevisions,
  categories, tags, media, hostedSites,
  emailCampaigns, emailLists, emailSubscribers,
  pitchDecks, bookingPages, bookings,
  suggestedProjects, suggestedProjectRequests,
  serviceRequests, clientMembers, paymentMethods,
  crmContacts, crmCompanies, crmDeals, crmActivities,
  crmPipelines, crmPipelineStages, crmProposals,
  surveys, surveyResponses,
  automationRules,
  emailSegments,
} from '@/lib/db/schema';
import type { SurveyFieldDef, ProposalLineItem, AutomationTrigger, AutomationCondition, AutomationAction } from '@/lib/db/schema';
import crypto from 'crypto';
import { eq, and, desc, asc, sql, isNull, or, inArray } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation/event-bus';
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
    description: 'Create a new page/post on a client website with optional block content. Only call AFTER the client confirms the details. For blog posts, generate appropriate blocks (heading, text, image, etc.).',
    input_schema: {
      type: 'object' as const,
      properties: {
        website_id: { type: 'number', description: 'The website ID' },
        title: { type: 'string', description: 'Page title' },
        slug: { type: 'string', description: 'URL slug for the page' },
        post_type: { type: 'string', enum: ['page', 'blog', 'landing'], description: 'Type of page' },
        excerpt: { type: 'string', description: 'Short excerpt/summary (optional)' },
        published: { type: 'boolean', description: 'Whether to publish immediately' },
        blocks: { type: 'string', description: 'Optional JSON string of block content array. If omitted, page starts empty.' },
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

  // ── READ: Page Content ──
  {
    name: 'get_page_content',
    description: 'Get the full block content (JSON) for a specific page/post. Returns the block editor data including all blocks and page settings.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'The post/page ID' },
      },
      required: ['post_id'],
    },
  },

  // ── WRITE: Page Content ──
  {
    name: 'update_page_blocks',
    description: 'Replace the full block content for a page/post. Pass the entire blocks JSON array. A revision is saved automatically. Use get_page_content first to read the current blocks, modify what you need, and pass the full array back.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'The post/page ID' },
        blocks: { type: 'string', description: 'The full blocks JSON array as a string' },
      },
      required: ['post_id', 'blocks'],
    },
  },
  {
    name: 'update_block_by_id',
    description: 'Update a single block within a page by its block ID. Pass only the fields you want to change — they will be merged into the existing block. For nested arrays like hero-slideshow slides, pass the full updated slides array. A revision is saved automatically.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'The post/page ID' },
        block_id: { type: 'string', description: 'The block ID within the page' },
        updates: { type: 'string', description: 'JSON string of fields to merge into the block (e.g. {"title": "New Title"} or {"slides": [...]})' },
      },
      required: ['post_id', 'block_id', 'updates'],
    },
  },
  {
    name: 'update_page_metadata',
    description: 'Update a page/post title, slug, excerpt, or post type. Only update fields the client explicitly asked to change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        post_id: { type: 'number', description: 'The post/page ID' },
        title: { type: 'string', description: 'New page title' },
        slug: { type: 'string', description: 'New URL slug' },
        excerpt: { type: 'string', description: 'New excerpt/summary' },
        post_type: { type: 'string', enum: ['page', 'blog', 'landing'], description: 'New post type' },
      },
      required: ['post_id'],
    },
  },

  // ── WRITE: Email Campaigns ──
  {
    name: 'create_email_campaign',
    description: 'Create a new email campaign as a draft. The client must have at least one email list. Confirm details with the client first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Internal campaign name' },
        subject: { type: 'string', description: 'Email subject line' },
        preview_text: { type: 'string', description: 'Preview text shown in inbox' },
        from_name: { type: 'string', description: 'Sender display name' },
        from_email: { type: 'string', description: 'Sender email address' },
        list_id: { type: 'number', description: 'Email list ID to send to' },
        html_content: { type: 'string', description: 'HTML email body content' },
      },
      required: ['name', 'subject', 'from_name', 'from_email', 'list_id', 'html_content'],
    },
  },
  {
    name: 'update_email_campaign',
    description: 'Update an existing draft email campaign. Only draft campaigns can be edited. Only update fields the client explicitly asked to change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        campaign_id: { type: 'number', description: 'The campaign ID' },
        name: { type: 'string', description: 'Internal campaign name' },
        subject: { type: 'string', description: 'Email subject line' },
        preview_text: { type: 'string', description: 'Preview text shown in inbox' },
        from_name: { type: 'string', description: 'Sender display name' },
        from_email: { type: 'string', description: 'Sender email address' },
        html_content: { type: 'string', description: 'HTML email body content' },
      },
      required: ['campaign_id'],
    },
  },
  {
    name: 'get_email_campaign_details',
    description: 'Get full details for a specific email campaign including content and stats.',
    input_schema: {
      type: 'object' as const,
      properties: { campaign_id: { type: 'number', description: 'The campaign ID' } },
      required: ['campaign_id'],
    },
  },

  // ── WRITE: Pitch Decks ──
  {
    name: 'create_pitch_deck',
    description: 'Create a new empty pitch deck. Confirm with client first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Deck title' },
        description: { type: 'string', description: 'Deck description' },
      },
      required: ['title'],
    },
  },
  {
    name: 'get_pitch_deck_slides',
    description: 'Get the full slide content for a specific pitch deck.',
    input_schema: {
      type: 'object' as const,
      properties: { deck_id: { type: 'number', description: 'The pitch deck ID' } },
      required: ['deck_id'],
    },
  },
  {
    name: 'update_pitch_deck_slide',
    description: 'Update a specific slide in a pitch deck by slide index. Pass only the fields to change — they will be merged into the existing slide.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deck_id: { type: 'number', description: 'The pitch deck ID' },
        slide_index: { type: 'number', description: 'Zero-based slide index' },
        updates: { type: 'string', description: 'JSON string of fields to merge into the slide' },
      },
      required: ['deck_id', 'slide_index', 'updates'],
    },
  },

  // ── WRITE: Booking Pages ──
  {
    name: 'create_booking_page',
    description: 'Create a new booking page. Confirm with client first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Booking page title' },
        slug: { type: 'string', description: 'URL slug for the booking page' },
        description: { type: 'string', description: 'Description shown to bookers' },
        duration: { type: 'number', description: 'Meeting duration in minutes (default 30)' },
      },
      required: ['title', 'slug'],
    },
  },
  {
    name: 'update_booking_page',
    description: 'Update an existing booking page. Only update fields the client explicitly asked to change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        booking_page_id: { type: 'number', description: 'The booking page ID' },
        title: { type: 'string', description: 'Booking page title' },
        description: { type: 'string', description: 'Description shown to bookers' },
        duration: { type: 'number', description: 'Meeting duration in minutes' },
        active: { type: 'boolean', description: 'Whether the booking page is active' },
      },
      required: ['booking_page_id'],
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

  // ── READ: CRM ──
  {
    name: 'get_crm_contacts',
    description: 'Get CRM contacts. Optionally filter by status or search by name/email.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Search by name or email' },
        status: { type: 'string', description: 'Filter by status: active, inactive, lead, customer' },
        limit: { type: 'number', description: 'Max results (default 25)' },
      },
      required: [],
    },
  },
  {
    name: 'get_crm_contact_detail',
    description: 'Get full details for a specific CRM contact including recent activities and deals.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contact_id: { type: 'number', description: 'The contact ID' },
      },
      required: ['contact_id'],
    },
  },
  {
    name: 'get_crm_companies',
    description: 'Get all CRM companies for this client.',
    input_schema: {
      type: 'object' as const,
      properties: {
        search: { type: 'string', description: 'Search by company name' },
      },
      required: [],
    },
  },
  {
    name: 'get_crm_deals',
    description: 'Get CRM deals. Optionally filter by status (open/won/lost) or pipeline.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Filter: open, won, or lost' },
        pipeline_id: { type: 'number', description: 'Filter by pipeline ID' },
      },
      required: [],
    },
  },
  {
    name: 'get_crm_pipelines',
    description: 'Get all CRM pipelines and their stages.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_crm_activities',
    description: 'Get recent CRM activities, optionally filtered by contact or deal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contact_id: { type: 'number', description: 'Filter by contact ID' },
        deal_id: { type: 'number', description: 'Filter by deal ID' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
      required: [],
    },
  },

  // ── WRITE: CRM ──
  {
    name: 'create_crm_contact',
    description: 'Create a new CRM contact. Confirm details with the user before calling.',
    input_schema: {
      type: 'object' as const,
      properties: {
        first_name: { type: 'string', description: 'First name' },
        last_name: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        title: { type: 'string', description: 'Job title' },
        company_id: { type: 'number', description: 'Company ID to associate' },
        source: { type: 'string', description: 'Lead source: web, referral, cold-call, event, social, email, other' },
        status: { type: 'string', description: 'Status: lead, active, customer, inactive. Default: lead' },
        notes: { type: 'string', description: 'Notes about this contact' },
      },
      required: ['first_name'],
    },
  },
  {
    name: 'update_crm_contact',
    description: 'Update an existing CRM contact. Only provide fields you want to change.',
    input_schema: {
      type: 'object' as const,
      properties: {
        contact_id: { type: 'number', description: 'The contact ID to update' },
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        email: { type: 'string' },
        phone: { type: 'string' },
        title: { type: 'string' },
        company_id: { type: 'number' },
        status: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['contact_id'],
    },
  },
  {
    name: 'create_crm_company',
    description: 'Create a new CRM company. Confirm details with the user before calling.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Company name' },
        domain: { type: 'string', description: 'Website domain' },
        industry: { type: 'string', description: 'Industry' },
        size: { type: 'string', description: 'Company size: 1-10, 11-50, 51-200, 201-500, 500+' },
        phone: { type: 'string', description: 'Phone number' },
        notes: { type: 'string', description: 'Notes' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_crm_deal',
    description: 'Create a new CRM deal. Confirm details with the user before calling.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Deal title' },
        value: { type: 'number', description: 'Deal value in dollars (will be stored as cents)' },
        pipeline_id: { type: 'number', description: 'Pipeline ID (use get_crm_pipelines to find)' },
        stage_id: { type: 'number', description: 'Stage ID within the pipeline' },
        contact_id: { type: 'number', description: 'Associated contact ID' },
        company_id: { type: 'number', description: 'Associated company ID' },
        priority: { type: 'string', description: 'Priority: low, medium, high. Default: medium' },
        expected_close_date: { type: 'string', description: 'Expected close date (YYYY-MM-DD)' },
        notes: { type: 'string', description: 'Deal notes' },
      },
      required: ['title', 'pipeline_id', 'stage_id'],
    },
  },
  {
    name: 'update_crm_deal',
    description: 'Update a CRM deal. Can change stage, status, value, etc.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'number', description: 'The deal ID to update' },
        title: { type: 'string' },
        value: { type: 'number', description: 'Value in dollars' },
        stage_id: { type: 'number', description: 'Move to this stage' },
        status: { type: 'string', description: 'Set status: open, won, lost' },
        priority: { type: 'string' },
        expected_close_date: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['deal_id'],
    },
  },
  {
    name: 'log_crm_activity',
    description: 'Log an activity (call, email, meeting, note, task) on a contact or deal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: { type: 'string', description: 'Activity type: call, email, meeting, note, task' },
        title: { type: 'string', description: 'Activity title/subject' },
        description: { type: 'string', description: 'Details or notes' },
        contact_id: { type: 'number', description: 'Associated contact ID' },
        deal_id: { type: 'number', description: 'Associated deal ID' },
      },
      required: ['type', 'title'],
    },
  },

  // ── READ/WRITE: Projects & Cards ──
  {
    name: 'create_project_card',
    description: 'Create a new card (task) in a project board column. Confirm with user first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        column_id: { type: 'number', description: 'Column ID to place the card in (use get_project_board to find columns)' },
        title: { type: 'string', description: 'Card title' },
        description: { type: 'string', description: 'Card description' },
        priority: { type: 'string', description: 'Priority: low, medium, high, urgent. Default: medium' },
        due_date: { type: 'string', description: 'Due date (YYYY-MM-DD)' },
      },
      required: ['column_id', 'title'],
    },
  },
  {
    name: 'update_project_card',
    description: 'Update a project card (title, description, priority, due date).',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'number', description: 'Card ID to update' },
        title: { type: 'string' }, description: { type: 'string' },
        priority: { type: 'string' }, due_date: { type: 'string' },
      },
      required: ['card_id'],
    },
  },
  {
    name: 'move_project_card',
    description: 'Move a card to a different column (e.g. from "To Do" to "In Progress").',
    input_schema: {
      type: 'object' as const,
      properties: {
        card_id: { type: 'number', description: 'Card ID to move' },
        column_id: { type: 'number', description: 'Destination column ID' },
      },
      required: ['card_id', 'column_id'],
    },
  },

  // ── READ/WRITE: Surveys ──
  {
    name: 'get_my_surveys',
    description: 'Get all surveys for this client.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_survey_details',
    description: 'Get a survey with its responses and stats.',
    input_schema: {
      type: 'object' as const,
      properties: { survey_id: { type: 'number', description: 'Survey ID' } },
      required: ['survey_id'],
    },
  },
  {
    name: 'create_survey',
    description: 'Create a new survey. Confirm details with user first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Survey title' },
        description: { type: 'string', description: 'Survey description' },
        fields: { type: 'string', description: 'JSON array of field objects: [{label, type (text|email|textarea|select|radio|checkbox|rating|number), required, options (for select/radio)}]' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_survey',
    description: 'Update a survey (title, description, status, fields).',
    input_schema: {
      type: 'object' as const,
      properties: {
        survey_id: { type: 'number', description: 'Survey ID' },
        title: { type: 'string' }, description: { type: 'string' },
        status: { type: 'string', description: 'draft, active, or closed' },
        fields: { type: 'string', description: 'JSON array of fields' },
      },
      required: ['survey_id'],
    },
  },

  // ── READ/WRITE: CRM Proposals ──
  {
    name: 'get_crm_proposals',
    description: 'Get CRM proposals. Optionally filter by status or deal.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', description: 'Filter: draft, sent, viewed, accepted, declined' },
        deal_id: { type: 'number', description: 'Filter by deal' },
      },
      required: [],
    },
  },
  {
    name: 'create_crm_proposal',
    description: 'Create a new CRM proposal. Confirm with user first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Proposal title' },
        contact_id: { type: 'number', description: 'Contact to send to' },
        company_id: { type: 'number', description: 'Company' },
        deal_id: { type: 'number', description: 'Associated deal' },
        summary: { type: 'string', description: 'Executive summary' },
        line_items: { type: 'string', description: 'JSON array: [{description, qty, unitPrice (cents)}]' },
        valid_until: { type: 'string', description: 'Expiry date (YYYY-MM-DD)' },
      },
      required: ['title'],
    },
  },
  {
    name: 'send_crm_proposal',
    description: 'Send a draft proposal to the contact. This marks it as sent and generates a shareable link.',
    input_schema: {
      type: 'object' as const,
      properties: { proposal_id: { type: 'number', description: 'Proposal ID to send' } },
      required: ['proposal_id'],
    },
  },

  // ── READ/WRITE: Automations ──
  {
    name: 'get_my_automations',
    description: 'Get all automation rules for this client.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_automation',
    description: 'Create an automation rule. Confirm with user first. Use get_my_automations to see examples of trigger/action format.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Rule name' },
        description: { type: 'string', description: 'What this rule does' },
        trigger: { type: 'string', description: 'JSON: {event: "crm.deal.won"} — event name from automation events' },
        conditions: { type: 'string', description: 'JSON array: [{field, operator, value}]' },
        actions: { type: 'string', description: 'JSON array: [{tool: "create_support_ticket", params: {subject: "...", body: "...", priority: "medium", category: "general"}}]' },
      },
      required: ['name', 'trigger', 'actions'],
    },
  },
  {
    name: 'toggle_automation',
    description: 'Enable or disable an automation rule.',
    input_schema: {
      type: 'object' as const,
      properties: {
        rule_id: { type: 'number', description: 'Automation rule ID' },
        enabled: { type: 'boolean', description: 'true to enable, false to disable' },
      },
      required: ['rule_id', 'enabled'],
    },
  },

  // ── WRITE: Email Subscribers & Segments ──
  {
    name: 'add_email_subscriber',
    description: 'Add a subscriber to an email list. Use get_my_email_lists to find list IDs.',
    input_schema: {
      type: 'object' as const,
      properties: {
        list_id: { type: 'number', description: 'Email list ID' },
        email: { type: 'string', description: 'Subscriber email' },
        name: { type: 'string', description: 'Subscriber name' },
      },
      required: ['list_id', 'email'],
    },
  },
  {
    name: 'get_email_segments',
    description: 'Get all email segments for this client.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'create_email_segment',
    description: 'Create an email segment with filter rules.',
    input_schema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Segment name' },
        description: { type: 'string', description: 'Segment description' },
        rules: { type: 'string', description: 'JSON array: [{field, operator, value}]' },
        match_type: { type: 'string', description: 'all or any. Default: all' },
      },
      required: ['name'],
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
      const blocksStr = input.blocks as string | undefined;

      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Website not found' };

      let content = '[]';
      if (blocksStr) {
        try {
          const parsed = JSON.parse(blocksStr);
          if (!Array.isArray(parsed)) return { error: 'blocks must be a JSON array' };
          content = JSON.stringify(parsed);
        } catch { return { error: 'Invalid JSON in blocks' }; }
      }

      const [post] = await db.insert(posts).values({
        title,
        slug,
        postType,
        excerpt: excerpt ?? null,
        content,
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

    // ── READ: Page Content ──
    case 'get_page_content': {
      const postId = input.post_id as number;
      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!post || !post.websiteId) return { error: 'Page not found' };

      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Page does not belong to your website' };

      let blocks: unknown = [];
      try {
        blocks = typeof post.content === 'string' ? JSON.parse(post.content) : post.content;
      } catch {
        blocks = [];
      }

      return {
        postId: post.id,
        title: post.title,
        slug: post.slug,
        postType: post.postType,
        published: post.published,
        website: site.name,
        blocks,
      };
    }

    // ── WRITE: Page Content ──
    case 'update_page_blocks': {
      const postId = input.post_id as number;
      const blocksStr = input.blocks as string;

      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!post || !post.websiteId) return { error: 'Page not found' };

      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Page does not belong to your website' };

      // Validate JSON
      let parsed: unknown;
      try { parsed = JSON.parse(blocksStr); } catch { return { error: 'Invalid JSON in blocks' }; }
      if (!Array.isArray(parsed)) return { error: 'blocks must be a JSON array' };

      const newContent = JSON.stringify(parsed);

      // Save revision
      await db.insert(postRevisions).values({
        postId,
        content: post.content,
        title: post.title,
        trigger: 'manual',
        createdBy: userId,
      });

      await db.update(posts).set({ content: newContent, updatedAt: new Date() })
        .where(eq(posts.id, postId));

      return { success: true, message: `Page "${post.title}" blocks updated. ${parsed.length} blocks saved.` };
    }

    case 'update_block_by_id': {
      const postId = input.post_id as number;
      const blockId = input.block_id as string;
      const updatesStr = input.updates as string;

      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!post || !post.websiteId) return { error: 'Page not found' };

      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Page does not belong to your website' };

      let updates: Record<string, unknown>;
      try { updates = JSON.parse(updatesStr); } catch { return { error: 'Invalid JSON in updates' }; }

      let blocks: Array<Record<string, unknown>>;
      try {
        blocks = typeof post.content === 'string' ? JSON.parse(post.content) : post.content;
      } catch {
        return { error: 'Could not parse existing page content' };
      }

      // Find block by ID — search top-level and inside sections/columns
      let found = false;
      function findAndUpdate(blockList: Array<Record<string, unknown>>): void {
        for (const block of blockList) {
          if (block.id === blockId) {
            Object.assign(block, updates);
            found = true;
            return;
          }
          // Search nested blocks in sections
          if (Array.isArray(block.blocks)) {
            findAndUpdate(block.blocks as Array<Record<string, unknown>>);
            if (found) return;
          }
          // Search nested blocks in columns
          if (Array.isArray(block.columns)) {
            for (const col of block.columns as Array<Record<string, unknown>>) {
              if (Array.isArray(col.blocks)) {
                findAndUpdate(col.blocks as Array<Record<string, unknown>>);
                if (found) return;
              }
            }
          }
          // Search nested blocks in tabs
          if (Array.isArray(block.tabs)) {
            for (const tab of block.tabs as Array<Record<string, unknown>>) {
              if (Array.isArray(tab.blocks)) {
                findAndUpdate(tab.blocks as Array<Record<string, unknown>>);
                if (found) return;
              }
            }
          }
        }
      }

      findAndUpdate(blocks);
      if (!found) return { error: `Block with ID "${blockId}" not found on this page` };

      // Save revision
      await db.insert(postRevisions).values({
        postId,
        content: post.content,
        title: post.title,
        trigger: 'manual',
        createdBy: userId,
      });

      await db.update(posts).set({ content: JSON.stringify(blocks), updatedAt: new Date() })
        .where(eq(posts.id, postId));

      return { success: true, message: `Block "${blockId}" updated on page "${post.title}".` };
    }

    case 'update_page_metadata': {
      const postId = input.post_id as number;
      const [post] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!post || !post.websiteId) return { error: 'Page not found' };

      const [site] = await db.select().from(clientWebsites)
        .where(and(eq(clientWebsites.id, post.websiteId), eq(clientWebsites.clientId, clientId))).limit(1);
      if (!site) return { error: 'Page does not belong to your website' };

      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) update.title = input.title;
      if (input.slug !== undefined) update.slug = input.slug;
      if (input.excerpt !== undefined) update.excerpt = input.excerpt;
      if (input.post_type !== undefined) update.postType = input.post_type;

      await db.update(posts).set(update).where(eq(posts.id, postId));

      return { success: true, message: `Page metadata updated.` };
    }

    // ── WRITE: Email Campaigns ──
    case 'create_email_campaign': {
      const name = input.name as string;
      const subject = input.subject as string;
      const previewText = input.preview_text as string | undefined;
      const fromName = input.from_name as string;
      const fromEmail = input.from_email as string;
      const listId = input.list_id as number;
      const htmlContent = input.html_content as string;

      // Verify list belongs to client
      const [list] = await db.select().from(emailLists)
        .where(and(eq(emailLists.id, listId), eq(emailLists.clientId, clientId))).limit(1);
      if (!list) return { error: 'Email list not found' };

      const [campaign] = await db.insert(emailCampaigns).values({
        name,
        subject,
        previewText: previewText ?? null,
        fromName,
        fromEmail,
        listId,
        htmlContent,
        clientId,
        status: 'draft',
      }).returning();

      return { success: true, campaignId: campaign.id, message: `Campaign "${name}" created as draft.` };
    }

    case 'update_email_campaign': {
      const campaignId = input.campaign_id as number;
      const [campaign] = await db.select().from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!campaign) return { error: 'Campaign not found' };
      if (campaign.status !== 'draft') return { error: `Campaign is "${campaign.status}" and cannot be edited. Only draft campaigns can be updated.` };

      const update: Record<string, unknown> = {};
      if (input.name !== undefined) update.name = input.name;
      if (input.subject !== undefined) update.subject = input.subject;
      if (input.preview_text !== undefined) update.previewText = input.preview_text;
      if (input.from_name !== undefined) update.fromName = input.from_name;
      if (input.from_email !== undefined) update.fromEmail = input.from_email;
      if (input.html_content !== undefined) update.htmlContent = input.html_content;

      await db.update(emailCampaigns).set(update).where(eq(emailCampaigns.id, campaignId));

      return { success: true, message: `Campaign "${campaign.name}" updated.` };
    }

    case 'get_email_campaign_details': {
      const campaignId = input.campaign_id as number;
      const [campaign] = await db.select().from(emailCampaigns)
        .where(and(eq(emailCampaigns.id, campaignId), eq(emailCampaigns.clientId, clientId))).limit(1);
      if (!campaign) return { error: 'Campaign not found' };

      return {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        previewText: campaign.previewText,
        fromName: campaign.fromName,
        fromEmail: campaign.fromEmail,
        status: campaign.status,
        htmlContent: campaign.htmlContent,
        totalSent: campaign.totalSent,
        totalOpened: campaign.totalOpened,
        totalClicked: campaign.totalClicked,
        sentAt: campaign.sentAt,
        scheduledAt: campaign.scheduledAt,
        createdAt: campaign.createdAt,
      };
    }

    // ── WRITE: Pitch Decks ──
    case 'create_pitch_deck': {
      const title = input.title as string;
      const description = input.description as string | undefined;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const [deck] = await db.insert(pitchDecks).values({
        clientId,
        title,
        slug,
        description: description ?? null,
        status: 'draft',
        slides: [],
        formatVersion: 2,
      }).returning();

      return { success: true, deckId: deck.id, message: `Pitch deck "${title}" created.` };
    }

    case 'get_pitch_deck_slides': {
      const deckId = input.deck_id as number;
      const [deck] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!deck) return { error: 'Pitch deck not found' };

      return {
        id: deck.id,
        title: deck.title,
        status: deck.status,
        slideCount: Array.isArray(deck.slides) ? deck.slides.length : 0,
        slides: deck.slides,
      };
    }

    case 'update_pitch_deck_slide': {
      const deckId = input.deck_id as number;
      const slideIndex = input.slide_index as number;
      const updatesStr = input.updates as string;

      const [deck] = await db.select().from(pitchDecks)
        .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, clientId))).limit(1);
      if (!deck) return { error: 'Pitch deck not found' };

      let updates: Record<string, unknown>;
      try { updates = JSON.parse(updatesStr); } catch { return { error: 'Invalid JSON in updates' }; }

      const slides = Array.isArray(deck.slides) ? [...deck.slides] : [];
      if (slideIndex < 0 || slideIndex >= slides.length) {
        return { error: `Slide index ${slideIndex} out of range (deck has ${slides.length} slides)` };
      }

      slides[slideIndex] = { ...slides[slideIndex], ...updates };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.update(pitchDecks).set({ slides: slides as any, updatedAt: new Date() })
        .where(eq(pitchDecks.id, deckId));

      return { success: true, message: `Slide ${slideIndex + 1} of "${deck.title}" updated.` };
    }

    // ── WRITE: Booking Pages ──
    case 'create_booking_page': {
      const title = input.title as string;
      const slug = input.slug as string;
      const description = input.description as string | undefined;
      const duration = input.duration as number | undefined;

      const [page] = await db.insert(bookingPages).values({
        clientId,
        title,
        slug,
        description: description ?? null,
        duration: duration ?? 30,
      }).returning();

      return { success: true, bookingPageId: page.id, message: `Booking page "${title}" created.` };
    }

    case 'update_booking_page': {
      const bookingPageId = input.booking_page_id as number;
      const [page] = await db.select().from(bookingPages)
        .where(and(eq(bookingPages.id, bookingPageId), eq(bookingPages.clientId, clientId))).limit(1);
      if (!page) return { error: 'Booking page not found' };

      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) update.title = input.title;
      if (input.description !== undefined) update.description = input.description;
      if (input.duration !== undefined) update.duration = input.duration;
      if (input.active !== undefined) update.active = input.active;

      await db.update(bookingPages).set(update).where(eq(bookingPages.id, bookingPageId));

      return { success: true, message: `Booking page "${page.title}" updated.` };
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

    // ── READ: CRM ──
    case 'get_crm_contacts': {
      const search = input.search as string | undefined;
      const status = input.status as string | undefined;
      const limit = Math.min((input.limit as number) || 25, 100);
      const conditions = [eq(crmContacts.clientId, clientId)];
      if (search) conditions.push(sql`(${crmContacts.firstName} ILIKE ${'%' + search + '%'} OR ${crmContacts.lastName} ILIKE ${'%' + search + '%'} OR ${crmContacts.email} ILIKE ${'%' + search + '%'})`);
      if (status) conditions.push(eq(crmContacts.status, status));
      const rows = await db.select({
        id: crmContacts.id, firstName: crmContacts.firstName, lastName: crmContacts.lastName,
        email: crmContacts.email, phone: crmContacts.phone, title: crmContacts.title,
        status: crmContacts.status, source: crmContacts.source, score: crmContacts.score,
        companyId: crmContacts.companyId, companyName: crmCompanies.name,
      }).from(crmContacts)
        .leftJoin(crmCompanies, eq(crmContacts.companyId, crmCompanies.id))
        .where(and(...conditions))
        .orderBy(desc(crmContacts.updatedAt)).limit(limit);
      return { contacts: rows, total: rows.length };
    }

    case 'get_crm_contact_detail': {
      const contactId = input.contact_id as number;
      const [contact] = await db.select({
        id: crmContacts.id, firstName: crmContacts.firstName, lastName: crmContacts.lastName,
        email: crmContacts.email, phone: crmContacts.phone, title: crmContacts.title,
        status: crmContacts.status, source: crmContacts.source, score: crmContacts.score,
        notes: crmContacts.notes, companyName: crmCompanies.name,
        createdAt: crmContacts.createdAt, lastContactedAt: crmContacts.lastContactedAt,
      }).from(crmContacts)
        .leftJoin(crmCompanies, eq(crmContacts.companyId, crmCompanies.id))
        .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, clientId)));
      if (!contact) return { error: 'Contact not found' };
      const activities = await db.select({
        id: crmActivities.id, type: crmActivities.type, title: crmActivities.title,
        description: crmActivities.description, createdAt: crmActivities.createdAt,
      }).from(crmActivities)
        .where(and(eq(crmActivities.clientId, clientId), eq(crmActivities.contactId, contactId)))
        .orderBy(desc(crmActivities.createdAt)).limit(10);
      const deals = await db.select({
        id: crmDeals.id, title: crmDeals.title, value: crmDeals.value,
        status: crmDeals.status, stageName: crmPipelineStages.name,
      }).from(crmDeals)
        .leftJoin(crmPipelineStages, eq(crmDeals.stageId, crmPipelineStages.id))
        .where(and(eq(crmDeals.clientId, clientId), eq(crmDeals.contactId, contactId)));
      return { contact, activities, deals };
    }

    case 'get_crm_companies': {
      const search = input.search as string | undefined;
      const conditions = [eq(crmCompanies.clientId, clientId)];
      if (search) conditions.push(sql`${crmCompanies.name} ILIKE ${'%' + search + '%'}`);
      const rows = await db.select({
        id: crmCompanies.id, name: crmCompanies.name, domain: crmCompanies.domain,
        industry: crmCompanies.industry, size: crmCompanies.size, phone: crmCompanies.phone,
      }).from(crmCompanies).where(and(...conditions)).orderBy(asc(crmCompanies.name));
      return rows;
    }

    case 'get_crm_deals': {
      const status = input.status as string | undefined;
      const pipelineId = input.pipeline_id as number | undefined;
      const conditions = [eq(crmDeals.clientId, clientId)];
      if (status) conditions.push(eq(crmDeals.status, status));
      if (pipelineId) conditions.push(eq(crmDeals.pipelineId, pipelineId));
      const rows = await db.select({
        id: crmDeals.id, title: crmDeals.title, value: crmDeals.value,
        status: crmDeals.status, priority: crmDeals.priority,
        contactFirstName: crmContacts.firstName, contactLastName: crmContacts.lastName,
        companyName: crmCompanies.name, stageName: crmPipelineStages.name,
        expectedCloseDate: crmDeals.expectedCloseDate, createdAt: crmDeals.createdAt,
      }).from(crmDeals)
        .leftJoin(crmContacts, eq(crmDeals.contactId, crmContacts.id))
        .leftJoin(crmCompanies, eq(crmDeals.companyId, crmCompanies.id))
        .leftJoin(crmPipelineStages, eq(crmDeals.stageId, crmPipelineStages.id))
        .where(and(...conditions))
        .orderBy(desc(crmDeals.createdAt));
      return rows.map(d => ({ ...d, contactName: [d.contactFirstName, d.contactLastName].filter(Boolean).join(' ') || null }));
    }

    case 'get_crm_pipelines': {
      const pipes = await db.select({
        id: crmPipelines.id, name: crmPipelines.name, isDefault: crmPipelines.isDefault,
      }).from(crmPipelines).where(eq(crmPipelines.clientId, clientId)).orderBy(asc(crmPipelines.id));
      const stageRows = pipes.length > 0
        ? await db.select({
            id: crmPipelineStages.id, pipelineId: crmPipelineStages.pipelineId,
            name: crmPipelineStages.name, sortOrder: crmPipelineStages.sortOrder,
          }).from(crmPipelineStages)
            .where(inArray(crmPipelineStages.pipelineId, pipes.map(p => p.id)))
            .orderBy(asc(crmPipelineStages.sortOrder))
        : [];
      return pipes.map(p => ({
        ...p,
        stages: stageRows.filter(s => s.pipelineId === p.id),
      }));
    }

    case 'get_crm_activities': {
      const contactId = input.contact_id as number | undefined;
      const dealId = input.deal_id as number | undefined;
      const limit = Math.min((input.limit as number) || 20, 50);
      const conditions = [eq(crmActivities.clientId, clientId)];
      if (contactId) conditions.push(eq(crmActivities.contactId, contactId));
      if (dealId) conditions.push(eq(crmActivities.dealId, dealId));
      const rows = await db.select({
        id: crmActivities.id, type: crmActivities.type, title: crmActivities.title,
        description: crmActivities.description, createdAt: crmActivities.createdAt,
      }).from(crmActivities).where(and(...conditions))
        .orderBy(desc(crmActivities.createdAt)).limit(limit);
      return rows;
    }

    // ── WRITE: CRM ──
    case 'create_crm_contact': {
      const { first_name, last_name, email, phone, title, company_id, source, status, notes } = input as Record<string, string | number | undefined>;
      const [contact] = await db.insert(crmContacts).values({
        clientId,
        firstName: (first_name as string).trim(),
        lastName: (last_name as string)?.trim() || null,
        email: (email as string)?.trim() || null,
        phone: (phone as string)?.trim() || null,
        title: (title as string)?.trim() || null,
        companyId: company_id ? Number(company_id) : null,
        source: (source as string)?.trim() || null,
        status: (status as string) || 'lead',
        notes: (notes as string)?.trim() || null,
        ownerId: userId,
      }).returning();
      emitEvent('crm.contact.created', clientId, userId, { id: contact.id, name: `${contact.firstName} ${contact.lastName || ''}`.trim(), email: contact.email });
      return { success: true, contactId: contact.id, message: `Contact "${contact.firstName} ${contact.lastName || ''}" created.` };
    }

    case 'update_crm_contact': {
      const contactId = input.contact_id as number;
      const [existing] = await db.select({ id: crmContacts.id }).from(crmContacts)
        .where(and(eq(crmContacts.id, contactId), eq(crmContacts.clientId, clientId)));
      if (!existing) return { error: 'Contact not found' };
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.first_name !== undefined) updates.firstName = (input.first_name as string).trim();
      if (input.last_name !== undefined) updates.lastName = (input.last_name as string).trim() || null;
      if (input.email !== undefined) updates.email = (input.email as string).trim() || null;
      if (input.phone !== undefined) updates.phone = (input.phone as string).trim() || null;
      if (input.title !== undefined) updates.title = (input.title as string).trim() || null;
      if (input.company_id !== undefined) updates.companyId = input.company_id ? Number(input.company_id) : null;
      if (input.status !== undefined) updates.status = input.status as string;
      if (input.notes !== undefined) updates.notes = (input.notes as string).trim() || null;
      await db.update(crmContacts).set(updates).where(eq(crmContacts.id, contactId));
      return { success: true, message: `Contact updated.` };
    }

    case 'create_crm_company': {
      const [company] = await db.insert(crmCompanies).values({
        clientId,
        name: (input.name as string).trim(),
        domain: (input.domain as string)?.trim() || null,
        industry: (input.industry as string)?.trim() || null,
        size: (input.size as string)?.trim() || null,
        phone: (input.phone as string)?.trim() || null,
        notes: (input.notes as string)?.trim() || null,
      }).returning();
      return { success: true, companyId: company.id, message: `Company "${company.name}" created.` };
    }

    case 'create_crm_deal': {
      const valueCents = input.value ? Math.round(Number(input.value) * 100) : null;
      const [deal] = await db.insert(crmDeals).values({
        clientId,
        title: (input.title as string).trim(),
        value: valueCents,
        pipelineId: input.pipeline_id as number,
        stageId: input.stage_id as number,
        contactId: input.contact_id ? Number(input.contact_id) : null,
        companyId: input.company_id ? Number(input.company_id) : null,
        priority: (input.priority as string) || 'medium',
        expectedCloseDate: input.expected_close_date ? new Date(input.expected_close_date as string) : null,
        notes: (input.notes as string)?.trim() || null,
        ownerId: userId,
        status: 'open',
      }).returning();
      emitEvent('crm.deal.created', clientId, userId, { id: deal.id, title: deal.title, value: deal.value });
      return { success: true, dealId: deal.id, message: `Deal "${deal.title}" created.` };
    }

    case 'update_crm_deal': {
      const dealId = input.deal_id as number;
      const [existing] = await db.select({ id: crmDeals.id, status: crmDeals.status }).from(crmDeals)
        .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId)));
      if (!existing) return { error: 'Deal not found' };
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = (input.title as string).trim();
      if (input.value !== undefined) updates.value = Math.round(Number(input.value) * 100);
      if (input.stage_id !== undefined) updates.stageId = input.stage_id as number;
      if (input.status !== undefined) {
        updates.status = input.status as string;
        if (input.status === 'won' || input.status === 'lost') updates.closedAt = new Date();
      }
      if (input.priority !== undefined) updates.priority = input.priority as string;
      if (input.expected_close_date !== undefined) updates.expectedCloseDate = input.expected_close_date ? new Date(input.expected_close_date as string) : null;
      if (input.notes !== undefined) updates.notes = (input.notes as string).trim() || null;
      await db.update(crmDeals).set(updates).where(eq(crmDeals.id, dealId));
      const newStatus = input.status as string | undefined;
      if (newStatus === 'won') emitEvent('crm.deal.won', clientId, userId, { id: dealId });
      else if (newStatus === 'lost') emitEvent('crm.deal.lost', clientId, userId, { id: dealId });
      else emitEvent('crm.deal.updated', clientId, userId, { id: dealId });
      return { success: true, message: `Deal updated.` };
    }

    case 'log_crm_activity': {
      const [activity] = await db.insert(crmActivities).values({
        clientId,
        type: (input.type as string).trim(),
        title: (input.title as string).trim(),
        description: (input.description as string)?.trim() || null,
        contactId: input.contact_id ? Number(input.contact_id) : null,
        dealId: input.deal_id ? Number(input.deal_id) : null,
      }).returning();
      if (input.contact_id) {
        await db.update(crmContacts).set({ lastContactedAt: new Date() }).where(eq(crmContacts.id, Number(input.contact_id)));
      }
      return { success: true, activityId: activity.id, message: `Activity logged: ${activity.title}` };
    }

    // ── Projects & Cards ──
    case 'create_project_card': {
      const colId = input.column_id as number;
      const [col] = await db.select({ id: kanbanColumns.id, projectId: kanbanColumns.projectId })
        .from(kanbanColumns).where(eq(kanbanColumns.id, colId));
      if (!col) return { error: 'Column not found' };
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, col.projectId), eq(projects.clientId, clientId)));
      if (!proj) return { error: 'Project not found or access denied' };
      const [countRow] = await db.select({ c: sql<number>`count(*)::int` }).from(kanbanCards).where(eq(kanbanCards.columnId, colId));
      const [card] = await db.insert(kanbanCards).values({
        columnId: colId,
        projectId: col.projectId,
        title: (input.title as string).trim(),
        description: (input.description as string)?.trim() || null,
        priority: (input.priority as string) || 'medium',
        dueDate: input.due_date ? new Date(input.due_date as string) : null,
        order: countRow?.c ?? 0,
        createdBy: userId,
      }).returning();
      return { success: true, cardId: card.id, message: `Card "${card.title}" created.` };
    }

    case 'update_project_card': {
      const cardId = input.card_id as number;
      const [card] = await db.select({ id: kanbanCards.id, projectId: kanbanCards.projectId })
        .from(kanbanCards).where(eq(kanbanCards.id, cardId));
      if (!card) return { error: 'Card not found' };
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId)));
      if (!proj) return { error: 'Access denied' };
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = (input.title as string).trim();
      if (input.description !== undefined) updates.description = (input.description as string).trim() || null;
      if (input.priority !== undefined) updates.priority = input.priority as string;
      if (input.due_date !== undefined) updates.dueDate = input.due_date ? new Date(input.due_date as string) : null;
      await db.update(kanbanCards).set(updates).where(eq(kanbanCards.id, cardId));
      return { success: true, message: 'Card updated.' };
    }

    case 'move_project_card': {
      const cardId = input.card_id as number;
      const destColId = input.column_id as number;
      const [card] = await db.select({ id: kanbanCards.id, projectId: kanbanCards.projectId })
        .from(kanbanCards).where(eq(kanbanCards.id, cardId));
      if (!card) return { error: 'Card not found' };
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, card.projectId), eq(projects.clientId, clientId)));
      if (!proj) return { error: 'Access denied' };
      const [countRow] = await db.select({ c: sql<number>`count(*)::int` }).from(kanbanCards).where(eq(kanbanCards.columnId, destColId));
      await db.update(kanbanCards).set({ columnId: destColId, order: countRow?.c ?? 0, updatedAt: new Date() }).where(eq(kanbanCards.id, cardId));
      return { success: true, message: 'Card moved.' };
    }

    // ── Surveys ──
    case 'get_my_surveys': {
      const rows = await db.select({
        id: surveys.id, title: surveys.title, slug: surveys.slug,
        status: surveys.status, description: surveys.description,
        createdAt: surveys.createdAt, updatedAt: surveys.updatedAt,
      }).from(surveys).where(eq(surveys.clientId, clientId)).orderBy(desc(surveys.updatedAt));
      return rows;
    }

    case 'get_survey_details': {
      const surveyId = input.survey_id as number;
      const [survey] = await db.select().from(surveys)
        .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId)));
      if (!survey) return { error: 'Survey not found' };
      const responses = await db.select().from(surveyResponses)
        .where(eq(surveyResponses.surveyId, surveyId)).orderBy(desc(surveyResponses.createdAt)).limit(50);
      const [stats] = await db.select({
        total: sql<number>`count(*)::int`,
        withEmail: sql<number>`count(respondent_email)::int`,
      }).from(surveyResponses).where(eq(surveyResponses.surveyId, surveyId));
      return { survey, responses, stats };
    }

    case 'create_survey': {
      const title = (input.title as string).trim();
      const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const slug = `${baseSlug}-${Date.now().toString(36)}`;
      let fields: SurveyFieldDef[] = [];
      if (input.fields) { try { fields = JSON.parse(input.fields as string); } catch { return { error: 'Invalid fields JSON' }; } }
      const [survey] = await db.insert(surveys).values({
        clientId, title, slug,
        description: (input.description as string)?.trim() || null,
        fields, createdBy: userId,
      }).returning();
      emitEvent('survey.created', clientId, userId, { id: survey.id, title });
      return { success: true, surveyId: survey.id, slug: survey.slug, message: `Survey "${title}" created. Share link: /s/${survey.slug}` };
    }

    case 'update_survey': {
      const surveyId = input.survey_id as number;
      const [existing] = await db.select({ id: surveys.id }).from(surveys)
        .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId)));
      if (!existing) return { error: 'Survey not found' };
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = (input.title as string).trim();
      if (input.description !== undefined) updates.description = (input.description as string).trim() || null;
      if (input.status !== undefined) updates.status = input.status as string;
      if (input.fields !== undefined) { try { updates.fields = JSON.parse(input.fields as string); } catch { return { error: 'Invalid fields JSON' }; } }
      await db.update(surveys).set(updates).where(eq(surveys.id, surveyId));
      return { success: true, message: 'Survey updated.' };
    }

    // ── CRM Proposals ──
    case 'get_crm_proposals': {
      const conditions = [eq(crmProposals.clientId, clientId)];
      if (input.status) conditions.push(eq(crmProposals.status, input.status as string));
      if (input.deal_id) conditions.push(eq(crmProposals.dealId, input.deal_id as number));
      const rows = await db.select({
        id: crmProposals.id, title: crmProposals.title, status: crmProposals.status,
        contactFirstName: crmContacts.firstName, contactLastName: crmContacts.lastName,
        companyName: crmCompanies.name, dealTitle: crmDeals.title,
        sentAt: crmProposals.sentAt, viewCount: crmProposals.viewCount,
        createdAt: crmProposals.createdAt,
      }).from(crmProposals)
        .leftJoin(crmContacts, eq(crmProposals.contactId, crmContacts.id))
        .leftJoin(crmCompanies, eq(crmProposals.companyId, crmCompanies.id))
        .leftJoin(crmDeals, eq(crmProposals.dealId, crmDeals.id))
        .where(and(...conditions)).orderBy(desc(crmProposals.createdAt));
      return rows.map(r => ({ ...r, contactName: [r.contactFirstName, r.contactLastName].filter(Boolean).join(' ') || null }));
    }

    case 'create_crm_proposal': {
      let lineItems: ProposalLineItem[] = [];
      if (input.line_items) { try { lineItems = JSON.parse(input.line_items as string); } catch { return { error: 'Invalid line_items JSON' }; } }
      const clientToken = crypto.randomBytes(32).toString('hex');
      const [proposal] = await db.insert(crmProposals).values({
        clientId, title: (input.title as string).trim(),
        contactId: input.contact_id ? Number(input.contact_id) : null,
        companyId: input.company_id ? Number(input.company_id) : null,
        dealId: input.deal_id ? Number(input.deal_id) : null,
        summary: (input.summary as string)?.trim() || null,
        lineItems, fees: [], sections: [],
        currency: 'USD', status: 'draft', clientToken,
        validUntil: input.valid_until ? new Date(input.valid_until as string) : null,
        createdBy: userId,
      }).returning();
      return { success: true, proposalId: proposal.id, message: `Proposal "${proposal.title}" created as draft.` };
    }

    case 'send_crm_proposal': {
      const propId = input.proposal_id as number;
      const [proposal] = await db.select({ id: crmProposals.id, status: crmProposals.status, clientToken: crmProposals.clientToken })
        .from(crmProposals).where(and(eq(crmProposals.id, propId), eq(crmProposals.clientId, clientId)));
      if (!proposal) return { error: 'Proposal not found' };
      if (proposal.status !== 'draft' && proposal.status !== 'sent') return { error: `Cannot send proposal with status "${proposal.status}"` };
      await db.update(crmProposals).set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() }).where(eq(crmProposals.id, propId));
      return { success: true, proposalUrl: `/proposal/${proposal.clientToken}`, message: 'Proposal sent.' };
    }

    // ── Automations ──
    case 'get_my_automations': {
      const rows = await db.select({
        id: automationRules.id, name: automationRules.name, description: automationRules.description,
        trigger: automationRules.trigger, conditions: automationRules.conditions, actions: automationRules.actions,
        enabled: automationRules.enabled, executionCount: automationRules.executionCount,
        lastExecutedAt: automationRules.lastExecutedAt,
      }).from(automationRules).where(eq(automationRules.clientId, clientId)).orderBy(desc(automationRules.createdAt));
      return rows;
    }

    case 'create_automation': {
      let trigger: AutomationTrigger, conditions: AutomationCondition[] = [], actions: AutomationAction[];
      try { trigger = JSON.parse(input.trigger as string); } catch { return { error: 'Invalid trigger JSON' }; }
      try { actions = JSON.parse(input.actions as string); } catch { return { error: 'Invalid actions JSON' }; }
      if (input.conditions) { try { conditions = JSON.parse(input.conditions as string); } catch { return { error: 'Invalid conditions JSON' }; } }
      if (!Array.isArray(actions) || actions.length === 0) return { error: 'At least one action is required' };
      const [rule] = await db.insert(automationRules).values({
        clientId, name: (input.name as string).trim(),
        description: (input.description as string)?.trim() || null,
        trigger, conditions, actions,
        source: 'ai', createdBy: userId,
      }).returning();
      return { success: true, ruleId: rule.id, message: `Automation "${rule.name}" created and enabled.` };
    }

    case 'toggle_automation': {
      const ruleId = input.rule_id as number;
      const enabled = input.enabled as boolean;
      const [rule] = await db.select({ id: automationRules.id }).from(automationRules)
        .where(and(eq(automationRules.id, ruleId), eq(automationRules.clientId, clientId)));
      if (!rule) return { error: 'Automation rule not found' };
      await db.update(automationRules).set({ enabled, updatedAt: new Date() }).where(eq(automationRules.id, ruleId));
      return { success: true, message: `Automation ${enabled ? 'enabled' : 'disabled'}.` };
    }

    // ── Email Subscribers & Segments ──
    case 'add_email_subscriber': {
      const listId = input.list_id as number;
      const email = (input.email as string).trim().toLowerCase();
      const [list] = await db.select({ id: emailLists.id }).from(emailLists)
        .where(and(eq(emailLists.id, listId), eq(emailLists.clientId, clientId)));
      if (!list) return { error: 'Email list not found' };
      const [existing] = await db.select({ id: emailSubscribers.id }).from(emailSubscribers)
        .where(and(eq(emailSubscribers.listId, listId), eq(emailSubscribers.email, email)));
      if (existing) return { error: 'Already subscribed to this list' };
      const token = crypto.randomBytes(16).toString('hex');
      const [sub] = await db.insert(emailSubscribers).values({
        listId, email, name: (input.name as string)?.trim() || null, unsubscribeToken: token,
      }).returning();
      return { success: true, subscriberId: sub.id, message: `${email} added to list.` };
    }

    case 'get_email_segments': {
      const rows = await db.select({
        id: emailSegments.id, name: emailSegments.name, description: emailSegments.description,
        rules: emailSegments.rules, matchType: emailSegments.matchType,
        subscriberCount: emailSegments.subscriberCount, createdAt: emailSegments.createdAt,
      }).from(emailSegments).where(eq(emailSegments.clientId, clientId)).orderBy(desc(emailSegments.createdAt));
      return rows;
    }

    case 'create_email_segment': {
      let rules: { field: string; operator: string; value: string }[] = [];
      if (input.rules) { try { rules = JSON.parse(input.rules as string); } catch { return { error: 'Invalid rules JSON' }; } }
      const [segment] = await db.insert(emailSegments).values({
        clientId, name: (input.name as string).trim(),
        description: (input.description as string)?.trim() || null,
        rules, matchType: (input.match_type as string) || 'all',
      }).returning();
      return { success: true, segmentId: segment.id, message: `Segment "${segment.name}" created.` };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
