/**
 * CRM AI tools — contacts, companies, deals, activities, pipelines, proposals.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import {
  crmContacts, crmCompanies, crmDeals, crmActivities,
  crmPipelines, crmPipelineStages, crmProposals,
} from '@/lib/db/schema';
import type { ProposalLineItem } from '@/lib/db/schema';
import crypto from 'crypto';
import { eq, and, desc, asc, sql, inArray } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation/event-bus';
import { ensureDefaultPipeline } from '@/lib/crm/default-pipeline';

export const crmTools: Anthropic.Tool[] = [
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
    description: 'Create a new CRM deal. If pipeline_id/stage_id are omitted, the client\'s default pipeline and its first stage are used — useful for automation rules.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Deal title' },
        value: { type: 'number', description: 'Deal value in dollars (will be stored as cents)' },
        pipeline_id: { type: 'number', description: 'Pipeline ID (optional — defaults to client\'s default pipeline)' },
        stage_id: { type: 'number', description: 'Stage ID within the pipeline (optional — defaults to first stage)' },
        contact_id: { type: 'number', description: 'Associated contact ID' },
        company_id: { type: 'number', description: 'Associated company ID' },
        priority: { type: 'string', description: 'Priority: low, medium, high. Default: medium' },
        expected_close_date: { type: 'string', description: 'Expected close date (YYYY-MM-DD)' },
        notes: { type: 'string', description: 'Deal notes' },
      },
      required: ['title'],
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
];

export type CrmHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const crmHandlers: Record<string, CrmHandler> = {
  get_crm_contacts: async (input, clientId, _userId) => {
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
  },

  get_crm_contact_detail: async (input, clientId, _userId) => {
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
  },

  get_crm_companies: async (input, clientId, _userId) => {
    const search = input.search as string | undefined;
    const conditions = [eq(crmCompanies.clientId, clientId)];
    if (search) conditions.push(sql`${crmCompanies.name} ILIKE ${'%' + search + '%'}`);
    const rows = await db.select({
      id: crmCompanies.id, name: crmCompanies.name, domain: crmCompanies.domain,
      industry: crmCompanies.industry, size: crmCompanies.size, phone: crmCompanies.phone,
    }).from(crmCompanies).where(and(...conditions)).orderBy(asc(crmCompanies.name));
    return rows;
  },

  get_crm_deals: async (input, clientId, _userId) => {
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
  },

  get_crm_pipelines: async (_input, clientId, _userId) => {
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
  },

  get_crm_activities: async (input, clientId, _userId) => {
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
  },

  create_crm_contact: async (input, clientId, userId) => {
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
      // System-context calls (automation rules without a real signed-in
      // user) pass userId=0 — that's not a valid users.id and would trip
      // the FK. Coalesce to null so the row inserts with no owner.
      ownerId: userId > 0 ? userId : null,
    }).returning();
    emitEvent('crm.contact.created', clientId, userId, { id: contact.id, name: `${contact.firstName} ${contact.lastName || ''}`.trim(), email: contact.email });
    return { success: true, contactId: contact.id, message: `Contact "${contact.firstName} ${contact.lastName || ''}" created.` };
  },

  update_crm_contact: async (input, clientId, _userId) => {
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
  },

  create_crm_company: async (input, clientId, _userId) => {
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
  },

  create_crm_deal: async (input, clientId, userId) => {
    const valueCents = input.value ? Math.round(Number(input.value) * 100) : null;

    let pipelineId = input.pipeline_id ? Number(input.pipeline_id) : null;
    let stageId = input.stage_id ? Number(input.stage_id) : null;

    if (!pipelineId) {
      const pipeline = await ensureDefaultPipeline(clientId);
      pipelineId = pipeline.id;
    }

    if (!stageId) {
      const [firstStage] = await db.select({ id: crmPipelineStages.id }).from(crmPipelineStages)
        .where(eq(crmPipelineStages.pipelineId, pipelineId))
        .orderBy(asc(crmPipelineStages.sortOrder), asc(crmPipelineStages.id))
        .limit(1);
      if (!firstStage) {
        return { error: 'CRM pipeline has no stages. Add at least one stage in /portal/crm.' };
      }
      stageId = firstStage.id;
    }

    const [deal] = await db.insert(crmDeals).values({
      clientId,
      title: (input.title as string).trim(),
      value: valueCents,
      pipelineId,
      stageId,
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
  },

  update_crm_deal: async (input, clientId, userId) => {
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
  },

  log_crm_activity: async (input, clientId, _userId) => {
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
  },

  get_crm_proposals: async (input, clientId, _userId) => {
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
  },

  create_crm_proposal: async (input, clientId, userId) => {
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
  },

  send_crm_proposal: async (input, clientId, _userId) => {
    const propId = input.proposal_id as number;
    const [proposal] = await db.select({ id: crmProposals.id, status: crmProposals.status, clientToken: crmProposals.clientToken })
      .from(crmProposals).where(and(eq(crmProposals.id, propId), eq(crmProposals.clientId, clientId)));
    if (!proposal) return { error: 'Proposal not found' };
    if (proposal.status !== 'draft' && proposal.status !== 'sent') return { error: `Cannot send proposal with status "${proposal.status}"` };
    await db.update(crmProposals).set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() }).where(eq(crmProposals.id, propId));
    return { success: true, proposalUrl: `/proposal/${proposal.clientToken}`, message: 'Proposal sent.' };
  },
};
