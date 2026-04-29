/**
 * Brain → CRM auto-linking step. Runs after processMeetingTranscript on
 * inbound brain emails when brain_profiles.auto_link_crm is true. Three jobs:
 *   1. Auto-upsert the sender as a crm_contact and link the meeting's
 *      participant row to that contact.
 *   2. Auto-link brain_meetings.companyId when the sender's email domain
 *      matches exactly one crm_companies row (ambiguous → review queue).
 *   3. Use brain-wide context (searchBrain) + CRM state to ask Claude for
 *      contact classification, deal links, and brain-aware action items —
 *      all of which land in brain_ai_review_items for human approval.
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { eq, and, or, desc, sql } from 'drizzle-orm';
import {
  brainAiJobs,
  brainAiReviewItems,
  brainMeetings,
  brainMeetingParticipants,
  crmContacts,
  crmCompanies,
  crmDeals,
  crmActivities,
  type BrainAiJobStatus,
  type BrainReviewItemPayload,
  type BrainReviewItemType,
  type BrainReviewItemCrmContactClassifyPayload,
  type BrainReviewItemCrmDealLinkPayload,
  type BrainReviewItemCrmDealCreatePayload,
  type BrainReviewItemCrmCompanyLinkPayload,
  type BrainReviewItemCrmCompanyCreatePayload,
  type BrainReviewItemTaskPayload,
} from '@/lib/db/schema';
import { searchBrain } from '@/lib/brain/search';
import { upsertContactByEmail } from '@/lib/crm/contacts';
import { findCompanyByDomain } from '@/lib/crm/companies';
import { domainFromEmail, parseDisplayName, isPersonalDomain, capitalize } from '@/lib/crm/parse';
import { logAudit } from '@/lib/brain/audit';
import { hasCredits, deductCredits } from '@/lib/ai-credits';
import type { MeetingExtraction } from '@/lib/ai/meeting-processor';

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is not set in environment variables.');
}
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 2048;
const ESTIMATED_CREDITS = 600;

// Cap context payload sizes so a single noisy email can't blow the prompt.
const SEARCH_HITS = 10;
const RECENT_DEALS = 5;
const RECENT_ACTIVITIES = 5;
const BODY_EXCERPT_CHARS = 2000;

export interface ClassifyAndLinkCrmArgs {
  clientId: number;
  meetingId: number;
  userId: number;
  extraction: MeetingExtraction;
  /** The brain_meetings.sourceMetadata blob. For email source we read senderEmail + from from here. */
  sourceMetadata: Record<string, unknown> | null | undefined;
  /** The brain_meetings.title — used as the email subject in the prompt. */
  meetingTitle: string;
  /** The brain_meetings.transcript — raw email body, excerpted into the prompt. */
  transcript: string | null;
}

export interface ClassifyAndLinkCrmResult {
  jobId: number;
  reviewItemIds: number[];
  appliedLinks: {
    contactId?: number;
    contactCreated?: boolean;
    companyId?: number;
  };
  skipped?: 'no_sender_email' | 'no_credits';
}

interface ClassifyClaudeOutput {
  contactClassification?: {
    proposedStatus?: 'active' | 'inactive' | 'lead' | 'customer';
    proposedSeniority?: string;
    proposedDepartment?: string;
    proposedTitle?: string;
    confidence?: 'high' | 'medium' | 'low';
    rationale?: string;
  };
  dealLinks?: Array<{
    action: 'link' | 'create';
    dealId?: number;
    proposedTitle?: string;
    proposedValue?: number;
    rationale?: string;
  }>;
  brainAwareTasks?: Array<{
    title: string;
    description?: string;
    relatesToBrainHit?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }>;
}

const SYSTEM_PROMPT = `You analyze inbound business email against a company's CRM and brain history. You ground every decision in the provided context — never invent CRM ids, company names, or deal details that aren't shown to you.

Return JSON only — no preamble, no markdown fences. Match this exact schema:

{
  "contactClassification"?: {
    "proposedStatus"?: "active" | "inactive" | "lead" | "customer",
    "proposedSeniority"?: string,
    "proposedDepartment"?: string,
    "proposedTitle"?: string,
    "confidence": "high" | "medium" | "low",
    "rationale": string
  },
  "dealLinks"?: [{
    "action": "link" | "create",
    "dealId"?: number,           // required when action = "link"; must match an id in <openDeals>
    "proposedTitle"?: string,    // required when action = "create"
    "proposedValue"?: number,    // cents
    "rationale": string
  }],
  "brainAwareTasks"?: [{         // ONLY include action items whose existence is justified by <brainHits>, not by the email body alone
    "title": string,
    "description"?: string,
    "relatesToBrainHit"?: string,
    "priority"?: "low" | "medium" | "high" | "urgent"
  }]
}

Rules:
- Omit any field you have no signal for. Empty arrays and missing optional fields are valid — don't pad.
- For dealLinks, only propose "link" when the email clearly references one of the listed open deals. Only propose "create" when there's a concrete signal of a new sales opportunity (RFP, request for pricing, scope inquiry).
- For brainAwareTasks, only include items the transcript-only AI would have missed — e.g. "this is a follow-up on commitment X from <date>". Do NOT re-emit ordinary tasks already extracted from the email body.
- For contactClassification, only return high confidence when the rationale points at a clear durable signal ("Replied to invoice → customer"; "Asked for pricing tiers → lead"). Otherwise use medium/low.
- relationship pollution is the main risk: when uncertain, return nothing for that field.`;

export async function classifyAndLinkCrm(args: ClassifyAndLinkCrmArgs): Promise<ClassifyAndLinkCrmResult> {
  const meta = (args.sourceMetadata ?? {}) as {
    from?: string;
    to?: string;
    senderEmail?: string;
  };
  const senderEmail = (meta.senderEmail ?? '').toLowerCase();
  if (!senderEmail || !senderEmail.includes('@')) {
    return { jobId: -1, reviewItemIds: [], appliedLinks: {}, skipped: 'no_sender_email' };
  }

  if (!(await hasCredits(args.clientId, ESTIMATED_CREDITS))) {
    return { jobId: -1, reviewItemIds: [], appliedLinks: {}, skipped: 'no_credits' };
  }

  const senderDomain = domainFromEmail(senderEmail);
  const fromHeader = typeof meta.from === 'string' ? meta.from : undefined;
  const subject = args.meetingTitle ?? '';
  const bodyExcerpt = (args.transcript ?? '').slice(0, BODY_EXCERPT_CHARS);

  // 1. Auto-upsert sender contact (always — safe baseline).
  const { contactId, created } = await upsertContactByEmail({
    clientId: args.clientId,
    email: senderEmail,
    displayName: fromHeader,
  });

  // 2. Resolve company by domain. Only auto-link on unambiguous match.
  const domainMatches = senderDomain
    ? await findCompanyByDomain({ clientId: args.clientId, domain: senderDomain })
    : [];
  let appliedCompanyId: number | undefined;
  if (domainMatches.length === 1) {
    appliedCompanyId = domainMatches[0].id;
    await db.update(brainMeetings)
      .set({ companyId: appliedCompanyId, updatedAt: new Date() })
      .where(and(eq(brainMeetings.id, args.meetingId), eq(brainMeetings.clientId, args.clientId)));
    // Link the contact to the company too if it didn't already have one.
    if (created) {
      await db.update(crmContacts)
        .set({ companyId: appliedCompanyId, updatedAt: new Date() })
        .where(eq(crmContacts.id, contactId));
    }
  }

  // Ensure a participant row points at this contact with role 'sender'.
  await ensureSenderParticipant({
    meetingId: args.meetingId,
    contactId,
    senderEmail,
    fromHeader,
  });

  // 3. Build context bundle for Claude.
  const [contactRow] = await db.select().from(crmContacts).where(eq(crmContacts.id, contactId)).limit(1);
  const recentActivities = await db.select({
    id: crmActivities.id,
    type: crmActivities.type,
    title: crmActivities.title,
    createdAt: crmActivities.createdAt,
  }).from(crmActivities)
    .where(and(eq(crmActivities.clientId, args.clientId), eq(crmActivities.contactId, contactId)))
    .orderBy(desc(crmActivities.createdAt))
    .limit(RECENT_ACTIVITIES);

  const dealConditions = [eq(crmDeals.clientId, args.clientId), eq(crmDeals.status, 'open')];
  const openDeals = await db.select({
    id: crmDeals.id,
    title: crmDeals.title,
    value: crmDeals.value,
    stageId: crmDeals.stageId,
    contactId: crmDeals.contactId,
    companyId: crmDeals.companyId,
  }).from(crmDeals)
    .where(and(
      ...dealConditions,
      or(
        eq(crmDeals.contactId, contactId),
        appliedCompanyId !== undefined ? eq(crmDeals.companyId, appliedCompanyId) : sql`false`,
      ),
    ))
    .orderBy(desc(crmDeals.updatedAt))
    .limit(RECENT_DEALS);

  const searchQuery = [
    senderEmail,
    fromHeader?.replace(/<[^>]*>/, '').trim() ?? '',
    subject,
    args.extraction.summary?.slice(0, 200) ?? '',
  ].filter(Boolean).join(' ').slice(0, 400);

  const brainHits = searchQuery.trim().length > 0
    ? (await searchBrain(args.clientId, searchQuery, { limit: SEARCH_HITS, perTypeLimit: SEARCH_HITS }))
        .hits.filter((h) => !(h.type === 'meeting' && h.id === args.meetingId)) // exclude self
    : [];

  // 4. Create the Claude job row + call.
  const [job] = await db.insert(brainAiJobs).values({
    clientId: args.clientId,
    jobType: 'crm_classify',
    status: 'running' as BrainAiJobStatus,
    input: {
      meetingId: args.meetingId,
      contactId,
      contactCreated: created,
      appliedCompanyId: appliedCompanyId ?? null,
      domainMatchCount: domainMatches.length,
      brainHitCount: brainHits.length,
      openDealCount: openDeals.length,
    },
    createdBy: args.userId,
    startedAt: new Date(),
  }).returning();

  let claudeOutput: ClassifyClaudeOutput = {};
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const userPrompt = buildUserPrompt({
      senderEmail,
      fromHeader,
      subject,
      bodyExcerpt,
      summary: args.extraction.summary,
      contact: contactRow ?? null,
      contactCreated: created,
      activities: recentActivities,
      domainMatches,
      appliedCompanyId,
      openDeals,
      brainHits: brainHits.map((h) => ({
        type: h.type,
        id: h.id,
        title: h.title,
        snippet: h.snippet,
        occurredAt: h.occurredAt ?? null,
      })),
    });

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    inputTokens = response.usage?.input_tokens ?? 0;
    outputTokens = response.usage?.output_tokens ?? 0;

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (textBlock) {
      claudeOutput = parseClassifyOutput(textBlock.text);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown classify error';
    await db.update(brainAiJobs).set({
      status: 'failed' as BrainAiJobStatus,
      error: message,
      completedAt: new Date(),
      inputTokens,
      outputTokens,
    }).where(eq(brainAiJobs.id, job.id));

    await logAudit({
      clientId: args.clientId,
      actorId: args.userId,
      action: 'brain.crm_classify_failed',
      entityType: 'brain_meeting',
      entityId: args.meetingId,
      metadata: { error: message },
    });

    // Auto-applied links (contact + company) already happened — keep them.
    return {
      jobId: job.id,
      reviewItemIds: [],
      appliedLinks: { contactId, contactCreated: created, companyId: appliedCompanyId },
    };
  }

  // 5. Materialize Claude output as review items.
  const reviewRows: (typeof brainAiReviewItems.$inferInsert)[] = [];

  // Contact classification — only when the AI proposes a non-default status/title/etc.
  // Status='active' is the schema default; only propose when changing it.
  if (claudeOutput.contactClassification) {
    const cc = claudeOutput.contactClassification;
    const hasProposal = !!(cc.proposedStatus || cc.proposedSeniority || cc.proposedDepartment || cc.proposedTitle);
    if (hasProposal) {
      const payload: BrainReviewItemCrmContactClassifyPayload = {
        contactId,
        proposedStatus: cc.proposedStatus,
        proposedSeniority: cc.proposedSeniority,
        proposedDepartment: cc.proposedDepartment,
        proposedTitle: cc.proposedTitle,
        confidence: cc.confidence ?? 'low',
        rationale: cc.rationale ?? 'No rationale provided',
      };
      reviewRows.push(makeReviewRow(args.clientId, args.meetingId, 'crm_contact_classify', payload));
    }
  }

  // Domain → company link. Only emit when ambiguous (>1) or no match but the AI has a name.
  if (domainMatches.length > 1) {
    const payload: BrainReviewItemCrmCompanyLinkPayload = {
      companyId: domainMatches[0].id,
      candidateCompanyIds: domainMatches.map((c) => c.id),
      rationale: `Sender domain "${senderDomain}" matched ${domainMatches.length} companies. Pick the right one to link this meeting.`,
    };
    reviewRows.push(makeReviewRow(args.clientId, args.meetingId, 'crm_company_link', payload));
  } else if (domainMatches.length === 0 && senderDomain && !isPersonalDomain(senderDomain)) {
    // No company exists for this domain — propose creating one.
    const payload: BrainReviewItemCrmCompanyCreatePayload = {
      name: senderDomain.split('.')[0]
        ? capitalize(senderDomain.split('.')[0])
        : senderDomain,
      domain: senderDomain,
      rationale: `New sender from "${senderDomain}" — no matching crm_company. Approve to create one and link this meeting.`,
    };
    reviewRows.push(makeReviewRow(args.clientId, args.meetingId, 'crm_company_create', payload));
  }

  // Deal links / creates from Claude.
  for (const dl of claudeOutput.dealLinks ?? []) {
    if (dl.action === 'link' && typeof dl.dealId === 'number') {
      // Validate the dealId is one we showed Claude.
      if (openDeals.some((d) => d.id === dl.dealId)) {
        const payload: BrainReviewItemCrmDealLinkPayload = {
          dealId: dl.dealId,
          rationale: dl.rationale ?? 'AI-proposed link',
        };
        reviewRows.push(makeReviewRow(args.clientId, args.meetingId, 'crm_deal_link', payload));
      }
    } else if (dl.action === 'create' && dl.proposedTitle) {
      const payload: BrainReviewItemCrmDealCreatePayload = {
        title: dl.proposedTitle.slice(0, 255),
        contactId,
        companyId: appliedCompanyId,
        value: typeof dl.proposedValue === 'number' && dl.proposedValue > 0 ? dl.proposedValue : undefined,
        rationale: dl.rationale ?? 'AI-proposed new deal',
      };
      reviewRows.push(makeReviewRow(args.clientId, args.meetingId, 'crm_deal_create', payload));
    }
  }

  // Brain-aware action items → standard 'task' type so existing UI handles them.
  for (const t of claudeOutput.brainAwareTasks ?? []) {
    if (!t.title) continue;
    const payload: BrainReviewItemTaskPayload = {
      title: t.title.slice(0, 500),
      description: t.description,
      priority: t.priority,
      relatesToBrainHit: t.relatesToBrainHit,
    };
    reviewRows.push(makeReviewRow(args.clientId, args.meetingId, 'task', payload));
  }

  let reviewItemIds: number[] = [];
  if (reviewRows.length > 0) {
    const inserted = await db.insert(brainAiReviewItems).values(reviewRows).returning({ id: brainAiReviewItems.id });
    reviewItemIds = inserted.map((r) => r.id);
  }

  // Charge credits — same heuristic as transcript pipeline.
  const credits = Math.max(1, Math.round(inputTokens / 1000) + Math.round(outputTokens / 250));
  await deductCredits(args.clientId, credits, 'brain_crm_classify', `meeting:${args.meetingId}`, `Classified CRM links for meeting ${args.meetingId}`);

  await db.update(brainAiJobs).set({
    status: 'completed' as BrainAiJobStatus,
    output: {
      reviewItemCount: reviewItemIds.length,
      contactCreated: created,
      companyAutoLinked: appliedCompanyId !== undefined,
    },
    inputTokens,
    outputTokens,
    creditsCharged: credits,
    completedAt: new Date(),
  }).where(eq(brainAiJobs.id, job.id));

  await logAudit({
    clientId: args.clientId,
    actorId: args.userId,
    action: 'brain.crm_classified',
    entityType: 'brain_meeting',
    entityId: args.meetingId,
    metadata: {
      jobId: job.id,
      contactId,
      contactCreated: created,
      appliedCompanyId: appliedCompanyId ?? null,
      reviewItemCount: reviewItemIds.length,
      inputTokens,
      outputTokens,
      creditsCharged: credits,
    },
  });

  return {
    jobId: job.id,
    reviewItemIds,
    appliedLinks: {
      contactId,
      contactCreated: created,
      companyId: appliedCompanyId,
    },
  };
}

async function ensureSenderParticipant(args: {
  meetingId: number;
  contactId: number;
  senderEmail: string;
  fromHeader: string | undefined;
}): Promise<void> {
  // If a row already references this contact, just upgrade roleInMeeting.
  const [existing] = await db.select().from(brainMeetingParticipants)
    .where(and(
      eq(brainMeetingParticipants.meetingId, args.meetingId),
      or(
        eq(brainMeetingParticipants.contactId, args.contactId),
        eq(brainMeetingParticipants.email, args.senderEmail),
      ),
    ))
    .limit(1);

  const { firstName, lastName } = parseDisplayName(args.fromHeader, args.senderEmail);
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || args.senderEmail;

  if (existing) {
    await db.update(brainMeetingParticipants).set({
      contactId: args.contactId,
      roleInMeeting: 'sender',
      email: existing.email ?? args.senderEmail,
      name: existing.name || fullName,
    }).where(eq(brainMeetingParticipants.id, existing.id));
    return;
  }

  await db.insert(brainMeetingParticipants).values({
    meetingId: args.meetingId,
    contactId: args.contactId,
    name: fullName.slice(0, 255),
    email: args.senderEmail.slice(0, 255),
    roleInMeeting: 'sender',
  });
}

function makeReviewRow(
  clientId: number,
  meetingId: number,
  proposedType: BrainReviewItemType,
  payload: BrainReviewItemPayload,
): typeof brainAiReviewItems.$inferInsert {
  return {
    clientId,
    sourceType: 'meeting',
    sourceId: meetingId,
    proposedType,
    proposedPayload: payload,
    status: 'pending',
  };
}

interface UserPromptArgs {
  senderEmail: string;
  fromHeader: string | undefined;
  subject: string;
  bodyExcerpt: string;
  summary: string;
  contact: typeof crmContacts.$inferSelect | null;
  contactCreated: boolean;
  activities: { id: number; type: string; title: string; createdAt: Date }[];
  domainMatches: { id: number; name: string; domain: string | null }[];
  appliedCompanyId: number | undefined;
  openDeals: { id: number; title: string; value: number | null; stageId: number; contactId: number | null; companyId: number | null }[];
  brainHits: { type: string; id: number; title: string; snippet: string; occurredAt: string | null }[];
}

function buildUserPrompt(args: UserPromptArgs): string {
  const lines: string[] = [];
  lines.push('<email>');
  lines.push(`From: ${args.fromHeader ?? args.senderEmail}`);
  lines.push(`Sender email: ${args.senderEmail}`);
  if (args.subject) lines.push(`Subject: ${args.subject}`);
  if (args.summary) lines.push(`Transcript-AI summary: ${args.summary}`);
  if (args.bodyExcerpt) {
    lines.push('Body excerpt:');
    lines.push(args.bodyExcerpt);
  }
  lines.push('</email>');
  lines.push('');

  lines.push('<existingContact>');
  if (args.contact) {
    lines.push(JSON.stringify({
      id: args.contact.id,
      firstName: args.contact.firstName,
      lastName: args.contact.lastName,
      title: args.contact.title,
      status: args.contact.status,
      seniority: args.contact.seniority,
      department: args.contact.department,
      companyId: args.contact.companyId,
      lastContactedAt: args.contact.lastContactedAt,
      created: args.contactCreated,
    }, null, 2));
  } else {
    lines.push('null');
  }
  lines.push('</existingContact>');
  lines.push('');

  lines.push('<recentActivities>');
  lines.push(JSON.stringify(args.activities.map((a) => ({
    type: a.type,
    title: a.title,
    at: a.createdAt.toISOString(),
  })), null, 2));
  lines.push('</recentActivities>');
  lines.push('');

  lines.push('<companyByDomain>');
  if (args.domainMatches.length === 0) {
    lines.push('No crm_companies match the sender domain.');
  } else if (args.appliedCompanyId !== undefined) {
    lines.push(`Auto-linked to company id=${args.appliedCompanyId}: ${JSON.stringify(args.domainMatches[0])}`);
  } else {
    lines.push(`Multiple matches — reviewer must pick one:`);
    lines.push(JSON.stringify(args.domainMatches, null, 2));
  }
  lines.push('</companyByDomain>');
  lines.push('');

  lines.push('<openDeals>');
  lines.push(JSON.stringify(args.openDeals, null, 2));
  lines.push('</openDeals>');
  lines.push('');

  lines.push('<brainHits>');
  lines.push(args.brainHits.length === 0
    ? 'No related brain history.'
    : JSON.stringify(args.brainHits, null, 2));
  lines.push('</brainHits>');
  lines.push('');

  lines.push('Return JSON only, matching the schema in the system prompt. Omit fields you have no signal for.');
  return lines.join('\n');
}

function parseClassifyOutput(text: string): ClassifyClaudeOutput {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed as ClassifyClaudeOutput;
  } catch {
    // Swallow — degraded behaviour: no review items but auto-applied links remain.
  }
  return {};
}

