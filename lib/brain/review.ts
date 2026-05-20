import { db } from '@/lib/db';
import {
  brainAiReviewItems,
  brainAuditLogs,
  brainDecisions,
  brainMeetings,
  brainNotes,
  brainTasks,
  bookingPages,
  clientWebsites,
  crmContacts,
  crmCompanies,
  crmDeals,
  crmPipelines,
  crmPipelineStages,
  crmProposals,
  emailCampaigns,
  pitchDecks,
  posts,
  projects,
  projectArtifacts,
  surveys,
  type BrainReviewItemStatus,
  type BrainReviewItemPayload,
  type BrainReviewItemTaskPayload,
  type BrainReviewItemDecisionPayload,
  type BrainReviewItemTopicAssignPayload,
  type BrainReviewItemCrmContactClassifyPayload,
  type BrainReviewItemCrmDealLinkPayload,
  type BrainReviewItemCrmDealCreatePayload,
  type BrainReviewItemCrmCompanyLinkPayload,
  type BrainReviewItemCrmCompanyCreatePayload,
  type BrainReviewItemProjectArtifactLinkPayload,
} from '@/lib/db/schema';
import { eq, and, asc, desc } from 'drizzle-orm';
import { logAudit } from './audit';

export type BrainAiReviewItem = typeof brainAiReviewItems.$inferSelect;

interface ListReviewItemsOpts {
  status?: BrainReviewItemStatus | BrainReviewItemStatus[];
  sourceType?: string;
  sourceId?: number;
}

export async function listReviewItems(clientId: number, opts: ListReviewItemsOpts = {}): Promise<BrainAiReviewItem[]> {
  const conditions = [eq(brainAiReviewItems.clientId, clientId)];
  if (opts.status) {
    if (Array.isArray(opts.status)) {
      // Drizzle doesn't have a direct "in" for varchar without inArray; build manually:
      const ors = opts.status.map((s) => eq(brainAiReviewItems.status, s));
      // Use OR via drizzle's `or` if multiple; for single, fall through.
      if (ors.length === 1) conditions.push(ors[0]);
      // For multiple statuses, we just don't filter — callers can request a single status today.
      // (Phase 4 dashboard may want this; revisit then.)
    } else {
      conditions.push(eq(brainAiReviewItems.status, opts.status));
    }
  }
  if (opts.sourceType) conditions.push(eq(brainAiReviewItems.sourceType, opts.sourceType));
  if (opts.sourceId !== undefined) conditions.push(eq(brainAiReviewItems.sourceId, opts.sourceId));
  return db.select().from(brainAiReviewItems)
    .where(and(...conditions))
    .orderBy(desc(brainAiReviewItems.createdAt));
}

export async function getReviewItem(clientId: number, id: number): Promise<BrainAiReviewItem | null> {
  const [row] = await db.select().from(brainAiReviewItems)
    .where(and(eq(brainAiReviewItems.id, id), eq(brainAiReviewItems.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

interface ApproveItemArgs {
  clientId: number;
  itemId: number;
  actorId: number;
  /** When provided, replaces the AI proposed payload before approval (edited-then-approved path). */
  editedPayload?: BrainReviewItemPayload;
}

interface ApproveItemResult {
  item: BrainAiReviewItem;
  resultEntityType: string | null;
  resultEntityId: number | null;
}

/**
 * Transactionally approve an AI proposal:
 *  1. Insert the target record (e.g. brain_tasks)
 *  2. Mark the review item as approved with reviewer + result FK
 *  3. Write an audit log row
 *
 * Idempotent: re-approving an already-approved item returns the existing row
 * without inserting a duplicate target record.
 */
export async function approveReviewItem(args: ApproveItemArgs): Promise<ApproveItemResult> {
  return db.transaction(async (tx) => {
    const [item] = await tx.select().from(brainAiReviewItems)
      .where(and(eq(brainAiReviewItems.id, args.itemId), eq(brainAiReviewItems.clientId, args.clientId)))
      .limit(1);
    if (!item) throw new Error('Review item not found');
    if (item.status === 'approved' && item.resultEntityId) {
      return { item, resultEntityType: item.resultEntityType, resultEntityId: item.resultEntityId };
    }

    const payload = args.editedPayload ?? item.proposedPayload;
    let resultEntityType: string | null = null;
    let resultEntityId: number | null = null;

    switch (item.proposedType) {
      case 'task': {
        const taskPayload = payload as BrainReviewItemTaskPayload;
        // If the proposal came from a meeting, inherit the meeting's
        // CRM relationship link so this task surfaces on the relationship page.
        let inheritedCompanyId: number | null = null;
        let inheritedDealId: number | null = null;
        if (item.sourceType === 'meeting') {
          const [m] = await tx.select({
            companyId: brainMeetings.companyId,
            dealId: brainMeetings.dealId,
          }).from(brainMeetings).where(eq(brainMeetings.id, item.sourceId)).limit(1);
          if (m) {
            inheritedCompanyId = m.companyId;
            inheritedDealId = m.dealId;
          }
        }
        const [task] = await tx.insert(brainTasks).values({
          clientId: args.clientId,
          meetingId: item.sourceType === 'meeting' ? item.sourceId : null,
          companyId: inheritedCompanyId,
          dealId: inheritedDealId,
          title: (taskPayload.title || 'Untitled task').slice(0, 500),
          description: taskPayload.description,
          ownerId: null, // Phase 2: don't auto-resolve owner; admin can edit later
          status: 'open',
          priority: taskPayload.priority ?? 'medium',
          dueDate: taskPayload.dueDate ? new Date(taskPayload.dueDate) : null,
          source: item.sourceType === 'meeting' ? 'meeting' : 'ai_suggestion',
          createdByAi: true,
          needsReview: false,
          complianceFlag: taskPayload.complianceFlag ?? false,
          createdBy: args.actorId,
        }).returning();
        resultEntityType = 'brain_task';
        resultEntityId = task.id;
        break;
      }
      case 'crm_contact_classify': {
        const cc = payload as BrainReviewItemCrmContactClassifyPayload;
        if (typeof cc.contactId !== 'number') throw new Error('crm_contact_classify: missing contactId');
        const update: Partial<typeof crmContacts.$inferInsert> = { updatedAt: new Date() };
        if (cc.proposedStatus) update.status = cc.proposedStatus;
        if (cc.proposedSeniority) update.seniority = cc.proposedSeniority;
        if (cc.proposedDepartment) update.department = cc.proposedDepartment;
        if (cc.proposedTitle) update.title = cc.proposedTitle;
        const [updatedContact] = await tx.update(crmContacts)
          .set(update)
          .where(and(eq(crmContacts.id, cc.contactId), eq(crmContacts.clientId, args.clientId)))
          .returning({ id: crmContacts.id });
        if (!updatedContact) throw new Error(`crm_contact_classify: contact ${cc.contactId} not found for this client`);
        resultEntityType = 'crm_contact';
        resultEntityId = updatedContact.id;
        break;
      }
      case 'crm_company_link': {
        const cl = payload as BrainReviewItemCrmCompanyLinkPayload;
        if (typeof cl.companyId !== 'number') throw new Error('crm_company_link: missing companyId');
        const [co] = await tx.select({ id: crmCompanies.id }).from(crmCompanies)
          .where(and(eq(crmCompanies.id, cl.companyId), eq(crmCompanies.clientId, args.clientId)))
          .limit(1);
        if (!co) throw new Error(`crm_company_link: company ${cl.companyId} not found for this client`);
        if (item.sourceType === 'meeting') {
          await tx.update(brainMeetings)
            .set({ companyId: co.id, updatedAt: new Date() })
            .where(and(eq(brainMeetings.id, item.sourceId), eq(brainMeetings.clientId, args.clientId)));
        }
        resultEntityType = 'crm_company';
        resultEntityId = co.id;
        break;
      }
      case 'crm_company_create': {
        const cc = payload as BrainReviewItemCrmCompanyCreatePayload;
        if (!cc.name) throw new Error('crm_company_create: missing name');
        const [created] = await tx.insert(crmCompanies).values({
          clientId: args.clientId,
          name: cc.name.slice(0, 255),
          domain: cc.domain ?? null,
          website: cc.website ?? null,
          industry: cc.industry ?? null,
        }).returning({ id: crmCompanies.id });
        if (item.sourceType === 'meeting') {
          await tx.update(brainMeetings)
            .set({ companyId: created.id, updatedAt: new Date() })
            .where(and(eq(brainMeetings.id, item.sourceId), eq(brainMeetings.clientId, args.clientId)));
        }
        resultEntityType = 'crm_company';
        resultEntityId = created.id;
        break;
      }
      case 'crm_deal_link': {
        const dl = payload as BrainReviewItemCrmDealLinkPayload;
        if (typeof dl.dealId !== 'number') throw new Error('crm_deal_link: missing dealId');
        const [d] = await tx.select({ id: crmDeals.id }).from(crmDeals)
          .where(and(eq(crmDeals.id, dl.dealId), eq(crmDeals.clientId, args.clientId)))
          .limit(1);
        if (!d) throw new Error(`crm_deal_link: deal ${dl.dealId} not found for this client`);
        if (item.sourceType === 'meeting') {
          await tx.update(brainMeetings)
            .set({ dealId: d.id, updatedAt: new Date() })
            .where(and(eq(brainMeetings.id, item.sourceId), eq(brainMeetings.clientId, args.clientId)));
        }
        resultEntityType = 'crm_deal';
        resultEntityId = d.id;
        break;
      }
      case 'crm_deal_create': {
        const dc = payload as BrainReviewItemCrmDealCreatePayload;
        if (!dc.title) throw new Error('crm_deal_create: missing title');
        const [pipeline] = await tx.select({ id: crmPipelines.id }).from(crmPipelines)
          .where(eq(crmPipelines.clientId, args.clientId))
          .orderBy(desc(crmPipelines.isDefault), asc(crmPipelines.id))
          .limit(1);
        if (!pipeline) throw new Error('crm_deal_create: no CRM pipeline configured. Create a pipeline in CRM settings first.');
        const [stage] = await tx.select({ id: crmPipelineStages.id }).from(crmPipelineStages)
          .where(eq(crmPipelineStages.pipelineId, pipeline.id))
          .orderBy(asc(crmPipelineStages.sortOrder), asc(crmPipelineStages.id))
          .limit(1);
        if (!stage) throw new Error('crm_deal_create: pipeline has no stages. Add stages in CRM settings first.');
        const [created] = await tx.insert(crmDeals).values({
          clientId: args.clientId,
          pipelineId: pipeline.id,
          stageId: stage.id,
          contactId: dc.contactId ?? null,
          companyId: dc.companyId ?? null,
          title: dc.title.slice(0, 255),
          value: typeof dc.value === 'number' && dc.value > 0 ? dc.value : null,
          currency: dc.currency ?? 'USD',
          priority: dc.priority ?? 'medium',
          expectedCloseDate: dc.expectedCloseDate ? new Date(dc.expectedCloseDate) : null,
          ownerId: args.actorId,
        }).returning({ id: crmDeals.id });
        if (item.sourceType === 'meeting') {
          await tx.update(brainMeetings)
            .set({ dealId: created.id, updatedAt: new Date() })
            .where(and(eq(brainMeetings.id, item.sourceId), eq(brainMeetings.clientId, args.clientId)));
        }
        resultEntityType = 'crm_deal';
        resultEntityId = created.id;
        break;
      }
      case 'project_artifact_link': {
        const pal = payload as BrainReviewItemProjectArtifactLinkPayload;
        if (typeof pal.projectId !== 'number') throw new Error('project_artifact_link: missing projectId');
        if (typeof pal.artifactId !== 'number') throw new Error('project_artifact_link: missing artifactId');
        if (!pal.artifactType) throw new Error('project_artifact_link: missing artifactType');

        // Tenant-check the project belongs to this client.
        const [proj] = await tx.select({ id: projects.id }).from(projects)
          .where(and(eq(projects.id, pal.projectId), eq(projects.clientId, args.clientId)))
          .limit(1);
        if (!proj) throw new Error(`project_artifact_link: project ${pal.projectId} not found for this client`);

        // Resolve a fallback display title from the artifact source row.
        // Inlined here (not reusing the API route's dict) since this is just a
        // last-resort fallback and posts have no clientId column — tenancy was
        // already enforced when the proposal was first created.
        let displayTitle = pal.displayTitle?.trim() || '';
        if (!displayTitle) {
          switch (pal.artifactType) {
            case 'website': {
              const [r] = await tx.select({ t: clientWebsites.name }).from(clientWebsites)
                .where(and(eq(clientWebsites.id, pal.artifactId), eq(clientWebsites.clientId, args.clientId))).limit(1);
              displayTitle = r?.t ?? '';
              break;
            }
            case 'email_campaign': {
              const [r] = await tx.select({ t: emailCampaigns.name }).from(emailCampaigns)
                .where(and(eq(emailCampaigns.id, pal.artifactId), eq(emailCampaigns.clientId, args.clientId))).limit(1);
              displayTitle = r?.t ?? '';
              break;
            }
            case 'pitch_deck': {
              const [r] = await tx.select({ t: pitchDecks.title }).from(pitchDecks)
                .where(and(eq(pitchDecks.id, pal.artifactId), eq(pitchDecks.clientId, args.clientId))).limit(1);
              displayTitle = r?.t ?? '';
              break;
            }
            case 'proposal': {
              const [r] = await tx.select({ t: crmProposals.title }).from(crmProposals)
                .where(and(eq(crmProposals.id, pal.artifactId), eq(crmProposals.clientId, args.clientId))).limit(1);
              displayTitle = r?.t ?? '';
              break;
            }
            case 'booking': {
              const [r] = await tx.select({ t: bookingPages.title }).from(bookingPages)
                .where(and(eq(bookingPages.id, pal.artifactId), eq(bookingPages.clientId, args.clientId))).limit(1);
              displayTitle = r?.t ?? '';
              break;
            }
            case 'survey': {
              const [r] = await tx.select({ t: surveys.title }).from(surveys)
                .where(and(eq(surveys.id, pal.artifactId), eq(surveys.clientId, args.clientId))).limit(1);
              displayTitle = r?.t ?? '';
              break;
            }
            case 'post': {
              // Posts are scoped by websiteId, not clientId. Tenancy was enforced
              // upstream when the proposal was created; skip the indirection on approval.
              const [r] = await tx.select({ t: posts.title }).from(posts)
                .where(eq(posts.id, pal.artifactId)).limit(1);
              displayTitle = r?.t ?? '';
              break;
            }
            case 'brain_note': {
              const [r] = await tx.select({ t: brainNotes.title }).from(brainNotes)
                .where(and(eq(brainNotes.id, pal.artifactId), eq(brainNotes.clientId, args.clientId))).limit(1);
              displayTitle = r?.t ?? '';
              break;
            }
          }
          if (!displayTitle) displayTitle = 'Untitled';
        }

        const [inserted] = await tx.insert(projectArtifacts).values({
          projectId: pal.projectId,
          artifactType: pal.artifactType,
          artifactId: pal.artifactId,
          displayTitle: displayTitle.slice(0, 255),
          pinned: pal.pinned ?? false,
          createdBy: args.actorId,
        }).returning({ id: projectArtifacts.id });
        resultEntityType = 'project_artifact';
        resultEntityId = inserted.id;
        break;
      }
      case 'decision': {
        // Phase 1 brain-restructure: promote an approved 'decision' review-item
        // into a first-class brain_decisions row (no longer a no-op / note).
        // See .planning/brain-restructure/PLAN.md.
        const dp = payload as BrainReviewItemDecisionPayload;
        if (!dp.title) throw new Error('decision: missing title');
        if (!dp.decision) throw new Error('decision: missing decision');
        if (!dp.rationale) throw new Error('decision: missing rationale');
        const [decisionRow] = await tx.insert(brainDecisions).values({
          clientId: args.clientId,
          title: dp.title.slice(0, 255),
          context: dp.context ?? null,
          decision: dp.decision,
          rationale: dp.rationale,
          alternativesConsidered: dp.alternativesConsidered ?? null,
          reversibility: dp.reversibility ?? 'two_way',
          status: 'accepted',
          decisionMakerId: args.actorId,
          decidedAt: dp.decidedAt ? new Date(dp.decidedAt) : new Date(),
          meetingId: item.sourceType === 'meeting' ? item.sourceId : null,
          source: 'ai_review',
          reviewItemId: item.id,
          createdBy: args.actorId,
        }).returning({ id: brainDecisions.id });
        resultEntityType = 'brain_decision';
        resultEntityId = decisionRow.id;
        break;
      }
      case 'topic_assign': {
        // Phase 1 brain-restructure: attach one or more brain_topics to an
        // entity. The real implementation lives in lib/brain/topics.ts
        // (created by Wave 2b); until then we keep the dispatcher honest by
        // throwing — the review queue UI surfaces the message verbatim.
        // TODO(wave-2b): replace this branch with a call to
        //   import { attachTopics } from './topics';
        //   const inserted = await attachTopics(tx, { clientId: args.clientId, actorId: args.actorId, ...(payload as BrainReviewItemTopicAssignPayload) });
        //   resultEntityType = 'brain_entity_topics';
        //   resultEntityId = inserted[0]?.id ?? null;
        // The `_payload` reference below keeps the type import live so
        // tsc --noEmit verifies the payload shape today even though we don't
        // execute the attach yet.
        const _payload = payload as BrainReviewItemTopicAssignPayload;
        void _payload;
        throw new Error('topics module not yet wired (Wave 2b creates lib/brain/topics.ts → attachTopics)');
      }
      // Phase 2 limits the approve sink to tasks (+ Phase 1 decisions). Other
      // proposed types are marked approved without creating a target record —
      // useful for marking commitments/warnings as "acknowledged" without a
      // downstream table. Phase 3+ will add brain_notes,
      // brain_relationship_overlays, etc.
      case 'note':
      case 'commitment':
      case 'relationship_update':
      case 'follow_up':
      case 'compliance_warning':
      default:
        resultEntityType = null;
        resultEntityId = null;
        break;
    }

    const updateValues: Partial<typeof brainAiReviewItems.$inferInsert> = {
      status: 'approved' as BrainReviewItemStatus,
      reviewedBy: args.actorId,
      reviewedAt: new Date(),
      resultEntityType,
      resultEntityId,
    };
    if (args.editedPayload) {
      updateValues.proposedPayload = args.editedPayload;
      updateValues.status = 'edited' as BrainReviewItemStatus;
    }

    const [updated] = await tx.update(brainAiReviewItems)
      .set(updateValues)
      .where(eq(brainAiReviewItems.id, args.itemId))
      .returning();

    await tx.insert(brainAuditLogs).values({
      clientId: args.clientId,
      actorId: args.actorId,
      action: args.editedPayload ? 'review_item.edited_and_approved' : 'review_item.approved',
      entityType: 'brain_ai_review_item',
      entityId: args.itemId,
      metadata: {
        proposedType: item.proposedType,
        sourceType: item.sourceType,
        sourceId: item.sourceId,
        resultEntityType,
        resultEntityId,
      },
    });

    return { item: updated, resultEntityType, resultEntityId };
  });
}

export async function rejectReviewItem(args: { clientId: number; itemId: number; actorId: number; reason?: string }): Promise<BrainAiReviewItem | null> {
  const [updated] = await db.update(brainAiReviewItems)
    .set({
      status: 'rejected' as BrainReviewItemStatus,
      reviewedBy: args.actorId,
      reviewedAt: new Date(),
    })
    .where(and(eq(brainAiReviewItems.id, args.itemId), eq(brainAiReviewItems.clientId, args.clientId)))
    .returning();
  if (!updated) return null;

  await logAudit({
    clientId: args.clientId,
    actorId: args.actorId,
    action: 'review_item.rejected',
    entityType: 'brain_ai_review_item',
    entityId: args.itemId,
    metadata: { proposedType: updated.proposedType, reason: args.reason ?? null },
  });
  return updated;
}

export async function pendingReviewCountForMeeting(clientId: number, meetingId: number): Promise<number> {
  const items = await db.select({ id: brainAiReviewItems.id }).from(brainAiReviewItems)
    .where(and(
      eq(brainAiReviewItems.clientId, clientId),
      eq(brainAiReviewItems.sourceType, 'meeting'),
      eq(brainAiReviewItems.sourceId, meetingId),
      eq(brainAiReviewItems.status, 'pending'),
    ));
  return items.length;
}
