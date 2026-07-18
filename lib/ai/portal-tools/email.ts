/**
 * Email-marketing AI tools — campaigns, lists, subscribers, segments.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import {
  emailCampaigns, emailLists, emailSubscribers, emailSegments,
} from '@/lib/db/schema';
import crypto from 'crypto';
import { eq, and, desc, sql } from 'drizzle-orm';

export const emailTools: Anthropic.Tool[] = [
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

export type EmailHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const emailHandlers: Record<string, EmailHandler> = {
  get_my_email_campaigns: async (_input, clientId, _userId) => {
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
  },

  get_my_email_lists: async (_input, clientId, _userId) => {
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
  },

  create_email_campaign: async (input, clientId, _userId) => {
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
  },

  update_email_campaign: async (input, clientId, _userId) => {
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
  },

  get_email_campaign_details: async (input, clientId, _userId) => {
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
  },

  add_email_subscriber: async (input, clientId, _userId) => {
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
  },

  get_email_segments: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: emailSegments.id, name: emailSegments.name, description: emailSegments.description,
      rules: emailSegments.rules, matchType: emailSegments.matchType,
      subscriberCount: emailSegments.subscriberCount, createdAt: emailSegments.createdAt,
    }).from(emailSegments).where(eq(emailSegments.clientId, clientId)).orderBy(desc(emailSegments.createdAt));
    return rows;
  },

  create_email_segment: async (input, clientId, _userId) => {
    let rules: { field: string; operator: string; value: string }[] = [];
    if (input.rules) { try { rules = JSON.parse(input.rules as string); } catch { return { error: 'Invalid rules JSON' }; } }
    const [segment] = await db.insert(emailSegments).values({
      clientId, name: (input.name as string).trim(),
      description: (input.description as string)?.trim() || null,
      rules, matchType: (input.match_type as string) || 'all',
    }).returning();
    return { success: true, segmentId: segment.id, message: `Segment "${segment.name}" created.` };
  },
};
