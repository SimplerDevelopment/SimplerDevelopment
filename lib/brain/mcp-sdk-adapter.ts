/**
 * Wire Brain tools into the @modelcontextprotocol/sdk server. Lets a Claude
 * Desktop user (or any MCP client) drive Company Brain via natural language —
 * search the brain, list/get/create/update tasks and meetings, manage the
 * AI review queue.
 *
 * Scopes:
 *   brain:read      — list/get/search across all brain entities
 *   brain:write     — create/update tasks, meetings, links
 *   brain:approve   — approve/reject AI review items, edit relationship
 *                     overlays. This is sensitive; gate behind a separate
 *                     scope so power users can opt in explicitly.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import { searchBrain } from './search';
import { getOrCreateBrainProfile } from './profiles';
import {
  createMeetingFromAdapter,
  getMeeting,
  linkMeeting,
  listMeetings,
  type BrainMeeting,
} from './meetings';
import {
  createTask,
  getTask,
  listTasks,
  updateTask,
} from './tasks';
import {
  createOverlay,
  getRelationship,
  listRelationships,
  updateOverlay,
} from './relationships';
import {
  approveReviewItem,
  getReviewItem,
  listReviewItems,
  rejectReviewItem,
} from './review';
import {
  applySuggestionToReviewItem,
  suggestReviewerForItem,
} from './review-routing';
import {
  createDecision,
  getDecisionById,
  listDecisions,
  softRejectDecision,
  supersedeDecision,
  updateDecision,
  type CreateDecisionInput,
  type ListDecisionsOpts,
} from './decisions';
import {
  attachTopics,
  createTopic,
  deleteTopic,
  detachTopics,
  getTopicById,
  getTopicTree,
  importTopicsFromTags,
  listEntitiesForTopic,
  listTopics,
  mergeTopic,
  moveTopic,
  updateTopic,
} from './topics';
import type { BrainDecisionReversibility, BrainDecisionStatus } from '@/lib/db/schema';
import {
  bulkUpdateNotes,
  createNote,
  countNotes,
  deleteNote,
  getNote,
  getNoteBySourceUrl,
  listNotes,
  restoreNote,
  updateNote,
  type BulkOp,
} from './notes';
import {
  listInitiatives,
  getInitiativeById,
  createInitiative,
  updateInitiative,
  closeInitiative,
  reopenInitiative,
  linkEntity,
  unlinkEntity,
  listInitiativeLinks,
} from './initiatives';
import {
  listGoals,
  getGoalById,
  createGoal,
  updateGoal,
  checkinGoal,
  deleteGoal,
} from './goals';
import {
  createSavedSearch,
  deleteSavedSearch,
  getSavedSearch,
  listSavedSearches,
  updateSavedSearch,
  type BrainSavedSearchFilters,
} from './saved-searches';
import {
  createTemplate,
  deleteTemplate,
  DuplicateTemplateNameError,
  getTemplate,
  listTemplates,
  updateTemplate,
  type BrainNoteTemplateTrigger,
} from './templates';
import { applyTemplate } from './template';
import { getDashboardSummary } from './dashboard';
import {
  listPeople,
  getPersonById,
  createPerson,
  updatePerson,
  deletePerson,
  attachExpertise,
  detachExpertise,
  listExpertiseTags,
  createExpertiseTag,
  updateExpertiseTag,
  deleteExpertiseTag,
  mergeExpertiseTags,
  whoKnows,
} from './people';
import {
  listOrgUnits,
  getOrgUnitTree,
  getOrgUnitById,
  createOrgUnit,
  updateOrgUnit,
  moveOrgUnit,
  mergeOrgUnits,
  deleteOrgUnit,
  addMember,
  removeMember,
  setPrimaryUnit,
  type BrainOrgUnitTreeNode,
} from './org-units';
import {
  bulkImportGlossary,
  createGlossaryTerm,
  deleteGlossaryTerm,
  getGlossaryTermById,
  listGlossaryTerms,
  lookupGlossary,
  updateGlossaryTerm,
} from './glossary';
import {
  listPlaybooks,
  getPlaybookById,
  createPlaybook,
  updatePlaybook,
  activatePlaybook,
  archivePlaybook,
  deletePlaybook,
  addStep,
  updateStep,
  removeStep,
  reorderSteps,
  type AddStepInput,
  type UpdateStepInput,
  type BrainPlaybookCondition,
} from './playbooks';
import {
  listRuns,
  getRunById,
  listActiveRunsForEntity,
  startRun,
  advanceRun,
  completeStep,
  skipStep,
  abortRun,
} from './playbook-runs';
import { db } from '@/lib/db';
import {
  brainAiReviewItems,
  brainAuditLogs,
  brainOrgUnits,
  brainPeople,
  brainPersonOrgUnits,
  users,
  type BrainPersonStatus,
} from '@/lib/db/schema';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { assertUserVisibleToClient, OwnershipError } from '@/lib/security/assert-owned';

function json(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
}

// MCP clients are off-origin (Claude Desktop, etc.), so relative paths like
// /portal/brain/knowledge are useless to them. Absolutize against the public
// portal origin before returning.
const PORTAL_BASE_URL = (process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com').replace(/\/$/, '');
function absolutizeUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${PORTAL_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function denied(scope: string) {
  return {
    content: [{ type: 'text' as const, text: `Permission denied: this API key lacks the "${scope}" scope.` }],
    isError: true,
  };
}

function err(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

export function registerBrainToolsOnSdk(server: McpServer, ctx: PortalMcpContext) {
  const clientId = ctx.client.id;
  const profilePromise = getOrCreateBrainProfile(clientId, ctx.client.company || 'Company Brain');

  // ── READ — search & summaries ────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_search',
    {
      title: 'Search Company Brain',
      description: 'Hybrid lexical + semantic search across the entire workspace: knowledge notes, meetings, CRM companies and contacts, deals, tasks, relationships, and pages. Returns ranked hits with snippets and citation URLs. Use this before answering any factual question about the workspace — never guess.',
      inputSchema: {
        query: z.string().min(1).max(500),
        types: z.array(z.enum([
          'meeting', 'note', 'task', 'relationship',
          'company', 'contact', 'deal', 'post',
        ])).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await searchBrain(clientId, args.query, {
        types: args.types,
        limit: args.limit,
      });
      return json({
        ...out,
        hits: out.hits.map((h) => ({ ...h, url: absolutizeUrl(h.url) })),
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_dashboard_summary',
    {
      title: 'Get Brain dashboard summary',
      description: 'Return the command-center snapshot: needs-review meetings, overdue/blocked/upcoming tasks, stale prospects, priority relationships, recent meetings, and high-level counts (including decisionsCount + topicsCount from the brain-restructure entities).',
      inputSchema: {},
    },
    async () => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      // Slim addition only — compute the two new counts inline so we don't
      // refactor the typed DashboardSummary shape in lib/brain/dashboard.ts.
      const { brainDecisions, brainTopics } = await import('@/lib/db/schema');
      const [summary, decisionsCountRows, topicsCountRows] = await Promise.all([
        getDashboardSummary(clientId),
        db.select({ count: sql<number>`count(*)::int` }).from(brainDecisions)
          .where(and(eq(brainDecisions.clientId, clientId), eq(brainDecisions.status, 'accepted'))),
        db.select({ count: sql<number>`count(*)::int` }).from(brainTopics)
          .where(eq(brainTopics.clientId, clientId)),
      ]);
      return json({
        ...summary,
        counts: {
          ...summary.counts,
          decisionsCount: Number(decisionsCountRows[0]?.count ?? 0),
          topicsCount: Number(topicsCountRows[0]?.count ?? 0),
        },
      });
    },
  );

  // ── READ — relationships ─────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_relationships',
    {
      title: 'List Brain relationships',
      description: 'List relationship overlays. Filter by type, owner, priority, status, or staleness.',
      inputSchema: {
        type: z.string().optional(),
        ownerId: z.number().int().positive().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        status: z.enum(['active', 'paused', 'archived']).optional(),
        staleOnly: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listRelationships(clientId, {
        type: args.type,
        ownerId: args.ownerId,
        priority: args.priority,
        status: args.status,
        staleOnly: args.staleOnly,
      });
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_relationship',
    {
      title: 'Get Brain relationship',
      description: 'Get a relationship overlay by id with linked CRM record, contacts, recent meetings, and open tasks.',
      inputSchema: { overlayId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getRelationship(clientId, args.overlayId);
      if (!detail) return err('Relationship not found.');
      return json(detail);
    },
  );

  // ── READ — meetings ──────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_meetings',
    {
      title: 'List Brain meetings',
      description: 'List meetings. Optional filter by status (draft/processing/needs_review/approved).',
      inputSchema: {
        status: z.enum(['draft', 'processing', 'needs_review', 'approved']).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      return json(await listMeetings(clientId, { status: args.status, limit: args.limit }));
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_meeting',
    {
      title: 'Get Brain meeting',
      description: 'Get a meeting with participants, transcript, AI summary, and the linked CRM record (if any).',
      inputSchema: { meetingId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const meeting = await getMeeting(clientId, args.meetingId);
      if (!meeting) return err('Meeting not found.');
      return json(meeting);
    },
  );

  // ── READ — tasks ─────────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_tasks',
    {
      title: 'List Brain tasks',
      description: 'List Brain tasks. Filter by status, owner, meeting, needs-review flag.',
      inputSchema: {
        status: z.enum(['open', 'in_progress', 'blocked', 'done']).optional(),
        ownerId: z.number().int().positive().optional(),
        meetingId: z.number().int().positive().optional(),
        needsReview: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      return json(await listTasks(clientId, args));
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_task',
    {
      title: 'Get Brain task',
      description: 'Fetch a single Brain task by id.',
      inputSchema: { taskId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const t = await getTask(clientId, args.taskId);
      if (!t) return err('Task not found.');
      return json(t);
    },
  );

  // ── READ — review queue ──────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_review_items',
    {
      title: 'List AI review items',
      description: 'List items in the AI proposal queue. Default: pending only. Filter by source meeting via sourceId.',
      inputSchema: {
        status: z.enum(['pending', 'approved', 'rejected', 'edited']).optional(),
        sourceId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      return json(await listReviewItems(clientId, {
        status: args.status ?? 'pending',
        sourceType: args.sourceId !== undefined ? 'meeting' : undefined,
        sourceId: args.sourceId,
      }));
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_review_item',
    {
      title: 'Get AI review item',
      description: 'Get a single pending or resolved AI proposal by id, including the full proposed payload.',
      inputSchema: { itemId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const item = await getReviewItem(clientId, args.itemId);
      if (!item) return err('Review item not found.');
      return json(item);
    },
  );

  // ── WRITE — meetings ─────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_create_meeting',
    {
      title: 'Create a Brain meeting (paste source)',
      description: 'Create a meeting from pasted transcript text. Optionally link to a CRM company or deal at creation time. Use this when the user gives you raw meeting notes — never call this with content the user did not provide.',
      inputSchema: {
        transcript: z.string().min(1).max(200_000),
        title: z.string().optional(),
        meetingDate: z.string().optional(), // ISO
        participants: z.array(z.object({
          name: z.string(),
          email: z.string().optional(),
        })).optional(),
        companyId: z.number().int().positive().optional(),
        dealId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      if (args.companyId !== undefined && args.dealId !== undefined) {
        return err('A meeting can link to a company OR a deal, not both.');
      }
      const profile = await profilePromise;
      if (!profile.enabled) return err('Company Brain is not enabled for this workspace.');
      try {
        const meeting: BrainMeeting = await createMeetingFromAdapter({
          adapterId: 'paste',
          input: {
            transcript: args.transcript,
            title: args.title,
            meetingDate: args.meetingDate,
            participants: args.participants,
          },
          ctx: { clientId, userId: ctx.userId, profile },
          link: (args.companyId !== undefined || args.dealId !== undefined)
            ? { companyId: args.companyId ?? null, dealId: args.dealId ?? null }
            : undefined,
        });
        // Slim echo — never round-trip the up-to-200k transcript back to the
        // caller. They already sent it; re-emitting it burns tokens for zero
        // value. Caller can re-fetch full body via brain_get_meeting.
        return json({
          id: meeting.id,
          title: meeting.title,
          status: meeting.status,
          source: meeting.source,
          sourceRef: meeting.sourceRef,
          createdAt: meeting.createdAt,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create meeting.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_link_meeting',
    {
      title: 'Link a meeting to a CRM record',
      description: 'Set or clear a meeting\'s CRM link (company or deal). Pass companyId=null or dealId=null to clear.',
      inputSchema: {
        meetingId: z.number().int().positive(),
        companyId: z.number().int().positive().nullable().optional(),
        dealId: z.number().int().positive().nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      if (args.companyId != null && args.dealId != null) {
        return err('A meeting can link to a company OR a deal, not both.');
      }
      const updated = await linkMeeting(clientId, args.meetingId, {
        companyId: args.companyId,
        dealId: args.dealId,
      });
      if (!updated) return err('Meeting not found.');
      return json(updated);
    },
  );

  // ── WRITE — tasks ────────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_create_task',
    {
      title: 'Create a Brain task',
      description: 'Create a Brain task directly. Use brain_propose_task instead when the user is reviewing your suggestions.',
      inputSchema: {
        title: z.string().min(1).max(500),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        dueDate: z.string().optional(), // ISO
        ownerId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        if (args.ownerId != null) await assertUserVisibleToClient(args.ownerId, clientId);
      } catch (e) {
        if (e instanceof OwnershipError) return json({ error: e.message });
        throw e;
      }
      const task = await createTask({
        clientId,
        title: args.title,
        description: args.description,
        priority: args.priority,
        dueDate: args.dueDate ? new Date(args.dueDate) : null,
        ownerId: args.ownerId ?? null,
        source: 'manual',
        createdBy: ctx.userId,
      });
      return json(task);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_propose_task',
    {
      title: 'Propose a task (lands in the human review queue)',
      description: 'Stage a suggested task as a pending AI review item — visible in /portal/brain/communications/[id]/review for the user to approve, edit, or reject. Prefer this over brain_create_task when you\'re unsure or when the suggestion came from analysis the user hasn\'t directly authorized.',
      inputSchema: {
        title: z.string().min(1).max(500),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        dueDate: z.string().optional(),
        complianceFlag: z.boolean().optional(),
        /** Optionally attach to an existing meeting so the suggestion lives in that meeting's review queue. */
        sourceMeetingId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const [item] = await db.insert(brainAiReviewItems).values({
        clientId,
        sourceType: args.sourceMeetingId !== undefined ? 'meeting' : 'manual',
        sourceId: args.sourceMeetingId ?? 0,
        proposedType: 'task',
        proposedPayload: {
          title: args.title,
          description: args.description,
          priority: args.priority ?? 'medium',
          dueDate: args.dueDate,
          complianceFlag: args.complianceFlag ?? false,
        },
        status: 'pending',
      }).returning();
      return json(item);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_update_task',
    {
      title: 'Update a Brain task',
      description: 'Patch task fields (title, description, status, priority, due date, owner, blocked reason).',
      inputSchema: {
        taskId: z.number().int().positive(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
        status: z.enum(['open', 'in_progress', 'blocked', 'done']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        dueDate: z.string().nullable().optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        blockedReason: z.string().nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const updated = await updateTask(clientId, args.taskId, {
        title: args.title,
        description: args.description ?? undefined,
        status: args.status,
        priority: args.priority,
        dueDate: args.dueDate ? new Date(args.dueDate) : (args.dueDate === null ? null : undefined),
        ownerId: args.ownerId ?? undefined,
        blockedReason: args.blockedReason ?? undefined,
      }, ctx.userId);
      if (!updated) return err('Task not found.');
      return json(updated);
    },
  );

  // ── WRITE — relationships ────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_create_relationship',
    {
      title: 'Create a Brain relationship overlay',
      description: 'Start tracking a CRM company or deal as a Brain relationship. Idempotent — returns the existing overlay if one exists for the same target.',
      inputSchema: {
        companyId: z.number().int().positive().optional(),
        dealId: z.number().int().positive().optional(),
        relationshipType: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        summary: z.string().optional(),
        currentPriorities: z.string().optional(),
        openLoops: z.string().optional(),
        nextReviewAt: z.string().optional(),
        staleAfterDays: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      if ((args.companyId === undefined) === (args.dealId === undefined)) {
        return err('Provide exactly one of companyId or dealId.');
      }
      try {
        const overlay = await createOverlay({
          clientId,
          actorId: ctx.userId,
          companyId: args.companyId,
          dealId: args.dealId,
          relationshipType: args.relationshipType,
          priority: args.priority,
          summary: args.summary,
          currentPriorities: args.currentPriorities,
          openLoops: args.openLoops,
          nextReviewAt: args.nextReviewAt ? new Date(args.nextReviewAt) : undefined,
          staleAfterDays: args.staleAfterDays,
        });
        return json(overlay);
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create relationship.');
      }
    },
  );

  // ── APPROVE — sensitive, separate scope ──────────────────────────────────

  hasScope(ctx.scopes, 'brain:approve') && server.registerTool(
    'brain_approve_review_item',
    {
      title: 'Approve an AI review item',
      description: 'Approve a pending AI proposal. For "task" proposals this materializes a brain_tasks row. Optionally edit the payload before approving. AUDITED.',
      inputSchema: {
        itemId: z.number().int().positive(),
        editedPayload: z.record(z.string(), z.unknown()).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:approve')) return denied('brain:approve');
      try {
        const out = await approveReviewItem({
          clientId,
          itemId: args.itemId,
          actorId: ctx.userId,
          editedPayload: args.editedPayload,
        });
        return json(out);
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to approve.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:approve') && server.registerTool(
    'brain_reject_review_item',
    {
      title: 'Reject an AI review item',
      description: 'Reject a pending AI proposal. AUDITED.',
      inputSchema: {
        itemId: z.number().int().positive(),
        reason: z.string().max(500).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:approve')) return denied('brain:approve');
      const updated = await rejectReviewItem({
        clientId,
        itemId: args.itemId,
        actorId: ctx.userId,
        reason: args.reason,
      });
      if (!updated) return err('Review item not found.');
      return json(updated);
    },
  );

  // ── Phase 6 — review-item routing by expertise ──────────────────────────
  // Score candidate brain_people for who should approve this item and persist
  // the result on the row. Idempotent — re-running recomputes against current
  // expertise + workload.

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_review_items_suggest_reviewer',
    {
      title: 'Suggest a reviewer for an AI review item',
      description: 'Score active brain_people for who should review this AI proposal — based on topic-expertise match, org-unit context, past approval history for this proposed_type, and current workload. Persists the top candidate (when score >= 3) on suggested_reviewer_person_id/score/reason. Returns the suggestion or null. AUDITED.',
      inputSchema: {
        reviewItemId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const item = await getReviewItem(clientId, args.reviewItemId);
      if (!item) return err('Review item not found.');
      try {
        const suggestion = await suggestReviewerForItem(clientId, item);
        await applySuggestionToReviewItem(clientId, item.id, suggestion);
        return json(suggestion
          ? {
              reviewItemId: item.id,
              suggestedPersonId: suggestion.personId,
              score: suggestion.score,
              reason: suggestion.reason,
            }
          : { reviewItemId: item.id, suggestion: null });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to suggest reviewer.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_review_items_list_for_reviewer',
    {
      title: 'List review items routed to a person',
      description: 'List review items where suggested_reviewer_person_id matches the given brain_people.id. Useful for "show me items routed to me" queries. Capped at 50 rows; filter by status (default pending).',
      inputSchema: {
        personId: z.number().int().positive(),
        status: z.enum(['pending', 'approved', 'rejected', 'edited']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const items = await listReviewItems(clientId, {
        suggestedReviewerPersonId: args.personId,
        status: args.status ?? 'pending',
        limit: 50,
      });
      // Slim — the full proposed_payload can be retrieved via getReviewItem.
      return json({
        items: items.map((i) => ({
          id: i.id,
          proposedType: i.proposedType,
          sourceType: i.sourceType,
          sourceId: i.sourceId,
          status: i.status,
          suggestedReviewerPersonId: i.suggestedReviewerPersonId,
          suggestedReviewerScore: i.suggestedReviewerScore,
          suggestedReviewerReason: i.suggestedReviewerReason,
          createdAt: i.createdAt,
        })),
      });
    },
  );

  hasScope(ctx.scopes, 'brain:approve') && server.registerTool(
    'brain_update_relationship',
    {
      title: 'Update a relationship overlay',
      description: 'Edit a Brain relationship overlay (priorities, summary, next review date, etc.). AUDITED.',
      inputSchema: {
        overlayId: z.number().int().positive(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        status: z.enum(['active', 'paused', 'archived']).optional(),
        summary: z.string().nullable().optional(),
        currentPriorities: z.string().nullable().optional(),
        openLoops: z.string().nullable().optional(),
        nextReviewAt: z.string().nullable().optional(),
        staleAfterDays: z.number().int().positive().nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:approve')) return denied('brain:approve');
      try {
        const updated = await updateOverlay(clientId, args.overlayId, ctx.userId, {
          priority: args.priority,
          status: args.status,
          summary: args.summary ?? undefined,
          currentPriorities: args.currentPriorities ?? undefined,
          openLoops: args.openLoops ?? undefined,
          nextReviewAt: args.nextReviewAt ? new Date(args.nextReviewAt) : (args.nextReviewAt === null ? null : undefined),
          staleAfterDays: args.staleAfterDays ?? undefined,
        });
        return json(updated);
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to update.');
      }
    },
  );

  // ── KNOWLEDGE — notes (the surface AI agents drive web crawls into) ──────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_notes',
    {
      title: 'List Brain knowledge notes',
      description: 'List/search notes in Company Brain Knowledge. Use this BEFORE crawling a URL to dedupe — pass `sourceUrl` for an exact match or `sourceUrlStartsWith` for a domain-wide check. Slim by default (no body — call brain_get_note for the full row); paginated via { items, total, limit, offset }.',
      inputSchema: {
        search: z.string().optional().describe('ILIKE on title and body.'),
        tag: z.string().optional().describe('Match a single tag.'),
        sourceUrl: z.string().optional().describe('Exact source URL match — for dedup.'),
        sourceUrlStartsWith: z.string().optional().describe('Prefix match on source URL — e.g. "https://docs.example.com/" to find everything ingested from that site.'),
        relationshipOverlayId: z.number().int().positive().optional(),
        companyId: z.number().int().positive().optional(),
        dealId: z.number().int().positive().optional(),
        contactId: z.number().int().positive().optional(),
        meetingId: z.number().int().positive().optional(),
        pinnedOnly: z.boolean().optional(),
        trashed: z.boolean().optional().describe('When true, return only soft-deleted notes (the trash bin). Default false.'),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;
      const filters = {
        search: args.search,
        tag: args.tag,
        sourceUrl: args.sourceUrl,
        sourceUrlStartsWith: args.sourceUrlStartsWith,
        relationshipOverlayId: args.relationshipOverlayId,
        companyId: args.companyId,
        dealId: args.dealId,
        contactId: args.contactId,
        meetingId: args.meetingId,
        pinnedOnly: args.pinnedOnly,
        trashed: args.trashed,
      };
      const [notes, total] = await Promise.all([
        listNotes(clientId, { ...filters, limit, offset }),
        countNotes(clientId, filters),
      ]);
      // Trim bodies for list responses; full body is available via brain_get_note.
      const items = notes.map((n) => ({
        id: n.id,
        title: n.title,
        bodyPreview: n.body.slice(0, 400),
        bodyLength: n.body.length,
        tags: n.tags,
        sourceUrl: n.sourceUrl,
        confidentialityLevel: n.confidentialityLevel,
        pinned: n.pinned,
        source: n.source,
        relationshipOverlayId: n.relationshipOverlayId,
        companyId: n.companyId,
        dealId: n.dealId,
        contactId: n.contactId,
        meetingId: n.meetingId,
        attachmentFilename: n.attachmentFilename,
        attachmentMimeType: n.attachmentMimeType,
        deletedAt: n.deletedAt,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      }));
      return json({ items, total, limit, offset });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_note',
    {
      title: 'Get a Brain knowledge note',
      description: 'Fetch a single note with its full body. Use brain_list_notes to find IDs.',
      inputSchema: {
        noteId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const note = await getNote(clientId, args.noteId);
      if (!note) return err('Note not found.');
      return json(note);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_create_note',
    {
      title: 'Create a Brain knowledge note',
      description: 'Save a knowledge note. The primary write surface for AI-driven web ingestion: pass `sourceUrl` to record provenance and source="crawl" when ingesting from the web. Body is markdown, capped at 50KB. Pre-check for an existing note via brain_list_notes(sourceUrl=...) before creating to avoid duplicates.',
      inputSchema: {
        title: z.string().min(1).max(255),
        body: z.string().max(50_000).optional(),
        tags: z.array(z.string()).optional(),
        sourceUrl: z.string().url().optional().describe('Original URL the content came from (for crawled notes).'),
        source: z.enum(['manual', 'ai_review', 'document_import', 'crawl']).optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
        pinned: z.boolean().optional(),
        relationshipOverlayId: z.number().int().positive().optional(),
        companyId: z.number().int().positive().optional(),
        dealId: z.number().int().positive().optional(),
        contactId: z.number().int().positive().optional(),
        meetingId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const note = await createNote({
        clientId,
        title: args.title,
        body: args.body ?? '',
        tags: args.tags ?? [],
        sourceUrl: args.sourceUrl ?? null,
        source: args.source ?? (args.sourceUrl ? 'crawl' : 'manual'),
        confidentialityLevel: args.confidentialityLevel,
        pinned: args.pinned ?? false,
        relationshipOverlayId: args.relationshipOverlayId ?? null,
        companyId: args.companyId ?? null,
        dealId: args.dealId ?? null,
        contactId: args.contactId ?? null,
        meetingId: args.meetingId ?? null,
        createdBy: ctx.userId,
      });
      return json(note);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_upsert_note_by_url',
    {
      title: 'Upsert a Brain knowledge note keyed by source URL',
      description: 'Idempotent crawl primitive: if a note already exists for this `sourceUrl`, update its title/body/tags; otherwise create a new one. Returns `{ note, created: boolean }`. Prefer this over brain_create_note when ingesting web pages.',
      inputSchema: {
        sourceUrl: z.string().url(),
        title: z.string().min(1).max(255),
        body: z.string().max(50_000),
        tags: z.array(z.string()).optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
        relationshipOverlayId: z.number().int().positive().optional(),
        companyId: z.number().int().positive().optional(),
        dealId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const existing = await getNoteBySourceUrl(clientId, args.sourceUrl);
      if (existing) {
        const updated = await updateNote(clientId, existing.id, {
          title: args.title,
          body: args.body,
          tags: args.tags,
          confidentialityLevel: args.confidentialityLevel,
          relationshipOverlayId: args.relationshipOverlayId,
          companyId: args.companyId,
          dealId: args.dealId,
        }, ctx.userId);
        return json({ note: updated, created: false });
      }
      const created = await createNote({
        clientId,
        title: args.title,
        body: args.body,
        tags: args.tags ?? [],
        sourceUrl: args.sourceUrl,
        source: 'crawl',
        confidentialityLevel: args.confidentialityLevel,
        relationshipOverlayId: args.relationshipOverlayId ?? null,
        companyId: args.companyId ?? null,
        dealId: args.dealId ?? null,
        createdBy: ctx.userId,
      });
      return json({ note: created, created: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_update_note',
    {
      title: 'Update a Brain knowledge note',
      description: 'Patch fields on an existing note. Pass `null` for nullable fields to clear them.',
      inputSchema: {
        noteId: z.number().int().positive(),
        title: z.string().min(1).max(255).optional(),
        body: z.string().max(50_000).optional(),
        tags: z.array(z.string()).optional(),
        sourceUrl: z.string().url().nullable().optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
        pinned: z.boolean().optional(),
        relationshipOverlayId: z.number().int().positive().nullable().optional(),
        companyId: z.number().int().positive().nullable().optional(),
        dealId: z.number().int().positive().nullable().optional(),
        contactId: z.number().int().positive().nullable().optional(),
        meetingId: z.number().int().positive().nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const updated = await updateNote(clientId, args.noteId, {
        title: args.title,
        body: args.body,
        tags: args.tags,
        sourceUrl: args.sourceUrl ?? undefined,
        confidentialityLevel: args.confidentialityLevel,
        pinned: args.pinned,
        relationshipOverlayId: args.relationshipOverlayId ?? undefined,
        companyId: args.companyId ?? undefined,
        dealId: args.dealId ?? undefined,
        contactId: args.contactId ?? undefined,
        meetingId: args.meetingId ?? undefined,
      }, ctx.userId);
      if (!updated) return err('Note not found.');
      return json(updated);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_delete_note',
    {
      title: 'Delete a Brain knowledge note',
      description: 'Two-stage delete matching the portal. Default (force=false) soft-deletes — note moves to trash and can be restored via brain_restore_note; if the note was already trashed, this hard-deletes it. Pass force=true to hard-delete on the first call. Hard delete cleans up any attached S3 object. AUDITED.',
      inputSchema: {
        noteId: z.number().int().positive(),
        force: z.boolean().optional().describe('When true, skip the soft-delete stage and hard-delete immediately.'),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const before = await getNote(clientId, args.noteId);
      if (!before) return err('Note not found.');
      const willHardDelete = args.force === true || before.deletedAt !== null;
      const ok = await deleteNote(clientId, args.noteId, ctx.userId, { force: args.force });
      if (!ok) return err('Note not found.');
      return json({ id: args.noteId, deleted: willHardDelete ? 'hard' : 'soft' });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_restore_note',
    {
      title: 'Restore a soft-deleted Brain knowledge note',
      description: 'Move a trashed note back to the active list. No-op (returns the note) if it was not deleted. Mirrors POST /portal/brain/knowledge/[id]/restore.',
      inputSchema: {
        noteId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const restored = await restoreNote(clientId, args.noteId, ctx.userId);
      if (!restored) return err('Note not found.');
      return json({
        id: restored.id,
        title: restored.title,
        bodyLength: restored.body.length,
        tags: restored.tags,
        sourceUrl: restored.sourceUrl,
        pinned: restored.pinned,
        deletedAt: restored.deletedAt,
        updatedAt: restored.updatedAt,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_bulk_update_notes',
    {
      title: 'Bulk update Brain knowledge notes',
      description: 'Apply one of: soft_delete, restore, hard_delete, add_tags, remove_tags, replace_tag_prefix to up to 500 notes. Returns { updated, skipped }. Cross-tenant ids are silently skipped.',
      inputSchema: {
        ids: z.array(z.number().int().positive()).min(1).max(500),
        op: z.discriminatedUnion('kind', [
          z.object({ kind: z.literal('soft_delete') }),
          z.object({ kind: z.literal('restore') }),
          z.object({ kind: z.literal('hard_delete') }),
          z.object({ kind: z.literal('add_tags'), tags: z.array(z.string().min(1)).min(1) }),
          z.object({ kind: z.literal('remove_tags'), tags: z.array(z.string().min(1)).min(1) }),
          z.object({ kind: z.literal('replace_tag_prefix'), from: z.string().min(1), to: z.string() }),
        ]),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const summary = await bulkUpdateNotes(clientId, args.ids, args.op as BulkOp, ctx.userId);
      return json({ updated: summary.updated, skipped: summary.failed });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_note_history',
    {
      title: 'List Brain note audit history',
      description: 'Audit log for one note: created, updated, soft_deleted, restored, hard_deleted, attachment_cleared, etc. Slim by default (omits metadata.diff and other large blobs). Pass includeDiff=true to receive the full metadata payload.',
      inputSchema: {
        noteId: z.number().int().positive(),
        limit: z.number().int().min(1).max(200).optional(),
        includeDiff: z.boolean().optional().describe('When true, include the full metadata blob (may contain diffs). Default false.'),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const note = await getNote(clientId, args.noteId);
      if (!note) return err('Note not found.');
      const limit = args.limit ?? 50;
      const rows = await db.select().from(brainAuditLogs)
        .where(and(
          eq(brainAuditLogs.clientId, clientId),
          eq(brainAuditLogs.entityType, 'brain_note'),
          eq(brainAuditLogs.entityId, args.noteId),
        ))
        .orderBy(desc(brainAuditLogs.createdAt))
        .limit(limit);
      const items = rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorId: r.actorId,
        createdAt: r.createdAt,
        ...(args.includeDiff ? { metadata: r.metadata } : {}),
      }));
      return json({ items, limit });
    },
  );

  // ── KNOWLEDGE — saved searches ───────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_saved_searches',
    {
      title: 'List Brain saved searches',
      description: 'List the caller\'s sidebar-pinned filter sets. scope=mine returns personal pins only, scope=shared returns team pins (userId IS NULL), scope=all (default) returns both. Slim by default (no filters JSON); pass includeFilters=true to receive the filter payloads inline.',
      inputSchema: {
        scope: z.enum(['mine', 'shared', 'all']).optional(),
        includeFilters: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const scope = args.scope ?? 'all';
      let rows;
      if (scope === 'shared') {
        rows = await listSavedSearches(clientId, { userId: null });
      } else if (scope === 'mine') {
        const all = await listSavedSearches(clientId, { userId: ctx.userId });
        rows = all.filter((r) => r.userId === ctx.userId);
      } else {
        rows = await listSavedSearches(clientId, { userId: ctx.userId });
      }
      const items = rows.map((r) => ({
        id: r.id,
        name: r.name,
        icon: r.icon,
        scope: r.userId === null ? 'shared' : 'personal',
        userId: r.userId,
        sortOrder: r.sortOrder,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        ...(args.includeFilters ? { filters: r.filters } : {}),
      }));
      return json({ items });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_saved_search',
    {
      title: 'Get a Brain saved search',
      description: 'Fetch a saved search by id, including the full filters JSON.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const row = await getSavedSearch(clientId, args.id);
      if (!row) return err('Saved search not found.');
      return json(row);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_create_saved_search',
    {
      title: 'Create a Brain saved search',
      description: 'Pin a knowledge filter set to the sidebar. scope="shared" makes it team-visible (userId IS NULL); scope="personal" (default) scopes to the caller. Returns identity echo only — re-fetch via brain_get_saved_search if you need the filters back.',
      inputSchema: {
        name: z.string().min(1).max(150),
        filters: z.object({
          search: z.string().optional(),
          tagPrefix: z.string().optional(),
          tags: z.array(z.string()).optional(),
          pinnedOnly: z.boolean().optional(),
          trashed: z.boolean().optional(),
          sort: z.enum(['updated', 'created', 'title']).optional(),
          order: z.enum(['asc', 'desc']).optional(),
        }),
        icon: z.string().max(50).optional(),
        sortOrder: z.number().optional(),
        scope: z.enum(['personal', 'shared']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const userId = args.scope === 'shared' ? null : ctx.userId;
      const created = await createSavedSearch({
        clientId,
        userId,
        name: args.name,
        icon: args.icon,
        filters: args.filters as BrainSavedSearchFilters,
        sortOrder: args.sortOrder,
        createdBy: ctx.userId,
      });
      return json({
        id: created.id,
        name: created.name,
        icon: created.icon,
        scope: created.userId === null ? 'shared' : 'personal',
        userId: created.userId,
        sortOrder: created.sortOrder,
        createdAt: created.createdAt,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_update_saved_search',
    {
      title: 'Update a Brain saved search',
      description: 'Patch fields on a saved search. Pass scope to move between personal and shared. Returns identity echo + updatedAt; re-fetch via brain_get_saved_search if you need the new filters.',
      inputSchema: {
        id: z.number().int().positive(),
        name: z.string().min(1).max(150).optional(),
        filters: z.object({
          search: z.string().optional(),
          tagPrefix: z.string().optional(),
          tags: z.array(z.string()).optional(),
          pinnedOnly: z.boolean().optional(),
          trashed: z.boolean().optional(),
          sort: z.enum(['updated', 'created', 'title']).optional(),
          order: z.enum(['asc', 'desc']).optional(),
        }).optional(),
        icon: z.string().max(50).optional(),
        sortOrder: z.number().optional(),
        scope: z.enum(['personal', 'shared']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const patch: Parameters<typeof updateSavedSearch>[2] = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.filters !== undefined) patch.filters = args.filters as BrainSavedSearchFilters;
      if (args.icon !== undefined) patch.icon = args.icon;
      if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
      if (args.scope !== undefined) patch.userId = args.scope === 'shared' ? null : ctx.userId;
      const updated = await updateSavedSearch(clientId, args.id, patch, ctx.userId);
      if (!updated) return err('Saved search not found.');
      return json({
        id: updated.id,
        name: updated.name,
        icon: updated.icon,
        scope: updated.userId === null ? 'shared' : 'personal',
        userId: updated.userId,
        sortOrder: updated.sortOrder,
        updatedAt: updated.updatedAt,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_delete_saved_search',
    {
      title: 'Delete a Brain saved search',
      description: 'Remove a saved-search pin from the sidebar.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const ok = await deleteSavedSearch(clientId, args.id, ctx.userId);
      if (!ok) return err('Saved search not found.');
      return json({ id: args.id, deleted: true });
    },
  );

  // ── KNOWLEDGE — note templates ───────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_note_templates',
    {
      title: 'List Brain note templates',
      description: 'List reusable note templates (markdown bodies with {{variables}}). Slim by default (omits the body text); pass includeBody=true to inline bodies — they can be multi-KB each.',
      inputSchema: {
        trigger: z.enum(['manual', 'daily', 'meeting', 'slash']).optional(),
        enabled: z.boolean().optional(),
        includeBody: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listTemplates(clientId, {
        trigger: args.trigger as BrainNoteTemplateTrigger | undefined,
        enabled: args.enabled,
      });
      const items = rows.map((t) => ({
        id: t.id,
        name: t.name,
        trigger: t.trigger,
        enabled: t.enabled,
        variables: t.variables,
        defaultTags: t.defaultTags,
        bodyLength: t.body.length,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        ...(args.includeBody ? { body: t.body } : {}),
      }));
      return json({ items });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_note_template',
    {
      title: 'Get a Brain note template',
      description: 'Fetch a template by id, including the full markdown body.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const row = await getTemplate(clientId, args.id);
      if (!row) return err('Template not found.');
      return json(row);
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_create_note_template',
    {
      title: 'Create a Brain note template',
      description: 'Define a reusable note template. Body is markdown — supports {{variables}} resolved by lib/brain/template.ts. Returns 409-equivalent error if a template with this name already exists for the client.',
      inputSchema: {
        name: z.string().min(1).max(150),
        body: z.string().min(1),
        trigger: z.enum(['manual', 'daily', 'meeting', 'slash']).optional(),
        variables: z.array(z.string()).optional(),
        defaultTags: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createTemplate({
          clientId,
          name: args.name,
          body: args.body,
          trigger: args.trigger as BrainNoteTemplateTrigger | undefined,
          variables: args.variables ?? null,
          defaultTags: args.defaultTags ?? null,
          enabled: args.enabled,
          createdBy: ctx.userId,
        });
        return json({
          id: created.id,
          name: created.name,
          trigger: created.trigger,
          enabled: created.enabled,
          bodyLength: created.body.length,
          createdAt: created.createdAt,
        });
      } catch (e) {
        if (e instanceof DuplicateTemplateNameError) {
          return err(`A template named "${args.name}" already exists for this client.`);
        }
        return err(e instanceof Error ? e.message : 'Failed to create template.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_update_note_template',
    {
      title: 'Update a Brain note template',
      description: 'Patch any field on a template. Returns identity echo + updatedAt; re-fetch via brain_get_note_template if you need the full body back.',
      inputSchema: {
        id: z.number().int().positive(),
        name: z.string().min(1).max(150).optional(),
        body: z.string().min(1).optional(),
        trigger: z.enum(['manual', 'daily', 'meeting', 'slash']).optional(),
        variables: z.array(z.string()).nullable().optional(),
        defaultTags: z.array(z.string()).nullable().optional(),
        enabled: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await updateTemplate(clientId, args.id, {
          name: args.name,
          body: args.body,
          trigger: args.trigger as BrainNoteTemplateTrigger | undefined,
          variables: args.variables,
          defaultTags: args.defaultTags,
          enabled: args.enabled,
        }, ctx.userId);
        if (!updated) return err('Template not found.');
        return json({
          id: updated.id,
          name: updated.name,
          trigger: updated.trigger,
          enabled: updated.enabled,
          bodyLength: updated.body.length,
          updatedAt: updated.updatedAt,
        });
      } catch (e) {
        if (e instanceof DuplicateTemplateNameError) {
          return err(`A template named "${args.name}" already exists for this client.`);
        }
        return err(e instanceof Error ? e.message : 'Failed to update template.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_delete_note_template',
    {
      title: 'Delete a Brain note template',
      description: 'Permanently delete a template. Existing notes created from it are unaffected.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const ok = await deleteTemplate(clientId, args.id, ctx.userId);
      if (!ok) return err('Template not found.');
      return json({ id: args.id, deleted: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_create_note_from_template',
    {
      title: 'Materialize a Brain note from a template',
      description: 'Apply a template (resolving {{today}}, {{userName}}, etc.) and create a new note. Mirrors POST /portal/brain/knowledge/from-template/[id]. Slim echo (no body) — fetch full content via brain_get_note.',
      inputSchema: {
        templateId: z.number().int().positive(),
        titleOverride: z.string().max(255).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const template = await getTemplate(clientId, args.templateId);
      if (!template) return err('Template not found.');

      const [actor] = await db.select({ name: users.name, email: users.email }).from(users)
        .where(eq(users.id, ctx.userId))
        .limit(1);
      const userName = actor?.name?.trim() || actor?.email || null;

      const appliedBody = await applyTemplate(template.body, {
        today: new Date(),
        clientId,
        userName,
      });

      const tags = Array.from(new Set([
        ...(template.defaultTags ?? []),
        `from_template:${template.id}`,
      ]));

      const note = await createNote({
        clientId,
        title: args.titleOverride?.trim() || template.name,
        body: appliedBody,
        tags,
        source: 'manual',
        createdBy: ctx.userId,
      });

      return json({
        id: note.id,
        title: note.title,
        bodyLength: note.body.length,
        tags: note.tags,
        updatedAt: note.updatedAt,
      });
    },
  );

  // ── READ — CRM companies ────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_companies',
    {
      title: 'List CRM companies',
      description: 'List CRM companies for this tenant. Optional fuzzy search on name + domain. Use brain_search for semantic matching across all entity types; this is for browsing/filtering by structured fields.',
      inputSchema: {
        search: z.string().optional().describe('ILIKE on name and domain.'),
        industry: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmCompanies } = await import('@/lib/db/schema');
      const { and, eq, sql, ilike, or } = await import('drizzle-orm');
      const conds = [eq(crmCompanies.clientId, clientId)];
      if (args.industry) conds.push(eq(crmCompanies.industry, args.industry));
      if (args.search?.trim()) {
        const q = `%${args.search.trim()}%`;
        conds.push(sql`(${crmCompanies.name} ILIKE ${q} OR ${crmCompanies.domain} ILIKE ${q})`);
      }
      const rows = await db.select().from(crmCompanies)
        .where(and(...conds))
        .orderBy(crmCompanies.name)
        .limit(Math.max(1, Math.min(args.limit ?? 50, 200)));
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_company',
    {
      title: 'Get CRM company',
      description: 'Get a CRM company with its linked contacts and open deals.',
      inputSchema: { companyId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmCompanies, crmContacts, crmDeals } = await import('@/lib/db/schema');
      const { and, eq } = await import('drizzle-orm');
      const [company] = await db.select().from(crmCompanies)
        .where(and(eq(crmCompanies.clientId, clientId), eq(crmCompanies.id, args.companyId)))
        .limit(1);
      if (!company) return err('Company not found.');
      const [contacts, deals] = await Promise.all([
        db.select().from(crmContacts)
          .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.companyId, company.id))),
        db.select().from(crmDeals)
          .where(and(eq(crmDeals.clientId, clientId), eq(crmDeals.companyId, company.id))),
      ]);
      return json({ ...company, contacts, deals });
    },
  );

  // ── READ — CRM contacts ─────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_contacts',
    {
      title: 'List CRM contacts',
      description: 'List CRM contacts. Optional filter by companyId or fuzzy search on name + email.',
      inputSchema: {
        search: z.string().optional().describe('ILIKE on first_name, last_name, email.'),
        companyId: z.number().int().positive().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmContacts } = await import('@/lib/db/schema');
      const { and, eq, sql } = await import('drizzle-orm');
      const conds = [eq(crmContacts.clientId, clientId)];
      if (args.companyId) conds.push(eq(crmContacts.companyId, args.companyId));
      if (args.status) conds.push(eq(crmContacts.status, args.status));
      if (args.search?.trim()) {
        const q = `%${args.search.trim()}%`;
        conds.push(sql`(${crmContacts.firstName} ILIKE ${q} OR ${crmContacts.lastName} ILIKE ${q} OR ${crmContacts.email} ILIKE ${q})`);
      }
      const rows = await db.select().from(crmContacts)
        .where(and(...conds))
        .orderBy(crmContacts.firstName)
        .limit(Math.max(1, Math.min(args.limit ?? 50, 200)));
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_contact',
    {
      title: 'Get CRM contact',
      description: 'Get a CRM contact with their linked company and any open deals they own.',
      inputSchema: { contactId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmContacts, crmCompanies, crmDeals } = await import('@/lib/db/schema');
      const { and, eq } = await import('drizzle-orm');
      const [contact] = await db.select().from(crmContacts)
        .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.id, args.contactId)))
        .limit(1);
      if (!contact) return err('Contact not found.');
      let company = null;
      if (contact.companyId) {
        const [c] = await db.select().from(crmCompanies)
          .where(eq(crmCompanies.id, contact.companyId)).limit(1);
        company = c ?? null;
      }
      const deals = await db.select().from(crmDeals)
        .where(and(eq(crmDeals.clientId, clientId), eq(crmDeals.contactId, contact.id)));
      return json({ ...contact, company, deals });
    },
  );

  // ── READ — CRM deals ─────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_deals',
    {
      title: 'List CRM deals',
      description: 'List CRM deals. Optional filter by status (open/won/lost), priority, or stageId.',
      inputSchema: {
        status: z.enum(['open', 'won', 'lost']).optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        stageId: z.number().int().positive().optional(),
        companyId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmDeals } = await import('@/lib/db/schema');
      const { and, eq, desc } = await import('drizzle-orm');
      const conds = [eq(crmDeals.clientId, clientId)];
      if (args.status) conds.push(eq(crmDeals.status, args.status));
      if (args.priority) conds.push(eq(crmDeals.priority, args.priority));
      if (args.stageId) conds.push(eq(crmDeals.stageId, args.stageId));
      if (args.companyId) conds.push(eq(crmDeals.companyId, args.companyId));
      const rows = await db.select().from(crmDeals)
        .where(and(...conds))
        .orderBy(desc(crmDeals.value))
        .limit(Math.max(1, Math.min(args.limit ?? 50, 200)));
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_deal',
    {
      title: 'Get CRM deal',
      description: 'Get a CRM deal with its linked company, primary contact, and stage info.',
      inputSchema: { dealId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { crmDeals, crmCompanies, crmContacts, crmPipelineStages } = await import('@/lib/db/schema');
      const { and, eq } = await import('drizzle-orm');
      const [deal] = await db.select().from(crmDeals)
        .where(and(eq(crmDeals.clientId, clientId), eq(crmDeals.id, args.dealId)))
        .limit(1);
      if (!deal) return err('Deal not found.');
      const [company, contact, stage] = await Promise.all([
        deal.companyId
          ? db.select().from(crmCompanies).where(eq(crmCompanies.id, deal.companyId)).limit(1).then(r => r[0] ?? null)
          : Promise.resolve(null),
        deal.contactId
          ? db.select().from(crmContacts).where(eq(crmContacts.id, deal.contactId)).limit(1).then(r => r[0] ?? null)
          : Promise.resolve(null),
        db.select().from(crmPipelineStages).where(eq(crmPipelineStages.id, deal.stageId)).limit(1).then(r => r[0] ?? null),
      ]);
      return json({ ...deal, company, contact, stage });
    },
  );

  // ── READ — Posts (website content) ──────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_list_posts',
    {
      title: 'List website posts/pages',
      description: 'List posts owned by this tenant via client_websites. Optional filter by websiteId, published flag, or post_type. Bodies are returned as serialized block JSON — call brain_get_post for the full record.',
      inputSchema: {
        websiteId: z.number().int().positive().optional(),
        published: z.boolean().optional(),
        postType: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { posts: postsTable, clientWebsites } = await import('@/lib/db/schema');
      const { and, eq, desc, inArray } = await import('drizzle-orm');
      // Tenancy: posts.website_id -> client_websites.client_id
      const websites = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(eq(clientWebsites.clientId, clientId));
      const websiteIds = websites.map(w => w.id);
      if (websiteIds.length === 0) return json([]);
      const conds = [inArray(postsTable.websiteId, websiteIds)];
      if (args.websiteId) conds.push(eq(postsTable.websiteId, args.websiteId));
      if (args.published !== undefined) conds.push(eq(postsTable.published, args.published));
      if (args.postType) conds.push(eq(postsTable.postType, args.postType));
      // Avoid returning the full body JSON in list responses — that can be
      // megabytes per row. Caller can fetch the full record via brain_get_post.
      const rows = await db.select({
        id: postsTable.id,
        title: postsTable.title,
        slug: postsTable.slug,
        postType: postsTable.postType,
        excerpt: postsTable.excerpt,
        published: postsTable.published,
        publishedAt: postsTable.publishedAt,
        websiteId: postsTable.websiteId,
        updatedAt: postsTable.updatedAt,
      }).from(postsTable)
        .where(and(...conds))
        .orderBy(desc(postsTable.updatedAt))
        .limit(Math.max(1, Math.min(args.limit ?? 50, 200)));
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_get_post',
    {
      title: 'Get website post/page',
      description: 'Get a post including its full block JSON (posts.content). Validates tenancy via the website ownership.',
      inputSchema: { postId: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const { posts: postsTable, clientWebsites } = await import('@/lib/db/schema');
      const { and, eq } = await import('drizzle-orm');
      const [post] = await db.select().from(postsTable)
        .where(eq(postsTable.id, args.postId)).limit(1);
      if (!post) return err('Post not found.');
      // Tenancy check
      if (post.websiteId === null) return err('Post not found.');
      const [w] = await db.select({ clientId: clientWebsites.clientId })
        .from(clientWebsites).where(eq(clientWebsites.id, post.websiteId)).limit(1);
      if (!w || w.clientId !== clientId) return err('Post not found.');
      return json(post);
    },
  );

  // ── READ — initiatives ──────────────────────────────────────────────────
  //
  // Initiatives are the multi-quarter umbrella under which goals, tasks,
  // notes, meetings, decisions, topics, and CRM links hang. Token-budget
  // rules: list/tree responses default slim (no description / lessonsLearned);
  // heavy fields are opt-in via the `include` flag.

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_initiatives_list',
    {
      title: 'List Brain initiatives',
      description: 'List initiatives for this tenant. Slim by default — returns { id, name, slug, status, priority, ownerId, targetDate, goalCount } per row. Pass `include: ["description"]` or `["lessonsLearned"]` to opt into heavier text fields. Filters: status, ownerId, priority, hasOpenGoals, targetDateBefore (ISO).',
      inputSchema: {
        status: z.enum(['planned', 'active', 'paused', 'completed', 'cancelled']).optional(),
        ownerId: z.number().int().positive().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        hasOpenGoals: z.boolean().optional(),
        targetDateBefore: z.string().optional().describe('ISO date — return only initiatives whose targetDate is before this.'),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(z.enum(['description', 'lessonsLearned'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listInitiatives(clientId, {
        status: args.status,
        ownerId: args.ownerId,
        priority: args.priority,
        hasOpenGoals: args.hasOpenGoals,
        targetDateBefore: args.targetDateBefore ? new Date(args.targetDateBefore) : undefined,
        limit: args.limit,
        offset: args.offset,
      });
      const include = new Set(args.include ?? []);
      const items = rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        status: r.status,
        priority: r.priority,
        ownerId: r.ownerId,
        targetDate: r.targetDate ? r.targetDate.toISOString() : null,
        goalCount: r.goalCount,
        ...(include.has('description') ? { description: r.description } : {}),
        ...(include.has('lessonsLearned') ? { lessonsLearned: r.lessonsLearned } : {}),
      }));
      return json({ items, limit: args.limit ?? 50, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_initiatives_get',
    {
      title: 'Get a Brain initiative',
      description: 'Get one initiative by id. Pass `includeGoals=true` to inline ordered goals, `includeLinks=true` to inline resolved linked-entity rows (also returns byType counts when present). Heavy text fields (description, lessonsLearned) are opt-in via `include`.',
      inputSchema: {
        id: z.number().int().positive(),
        includeGoals: z.boolean().optional(),
        includeLinks: z.boolean().optional(),
        include: z.array(z.enum(['description', 'lessonsLearned'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getInitiativeById(clientId, args.id, {
        includeGoals: args.includeGoals,
        includeLinks: args.includeLinks,
      });
      if (!detail) return err('Initiative not found.');
      const include = new Set(args.include ?? []);
      const i = detail.initiative;
      const initiative: Record<string, unknown> = {
        id: i.id,
        name: i.name,
        slug: i.slug,
        status: i.status,
        priority: i.priority,
        ownerId: i.ownerId,
        sponsorId: i.sponsorId,
        startDate: i.startDate ? i.startDate.toISOString() : null,
        targetDate: i.targetDate ? i.targetDate.toISOString() : null,
        closedAt: i.closedAt ? i.closedAt.toISOString() : null,
        closeReason: i.closeReason,
        confidentialityLevel: i.confidentialityLevel,
        createdBy: i.createdBy,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      };
      if (include.has('description')) initiative.description = i.description;
      if (include.has('lessonsLearned')) initiative.lessonsLearned = i.lessonsLearned;

      const out: Record<string, unknown> = { initiative };
      if (detail.goals) {
        // Slim goal projection for embedded list; full goal via brain_goals_get.
        out.goals = detail.goals.map((g) => ({
          id: g.id,
          title: g.title,
          status: g.status,
          ownerId: g.ownerId,
          targetDate: g.targetDate ? g.targetDate.toISOString() : null,
          sortOrder: g.sortOrder,
          currentMetric: g.currentMetric,
          targetMetric: g.targetMetric,
          unit: g.unit,
        }));
      }
      if (detail.links) {
        out.links = {
          byType: detail.links.byType,
          ...(detail.links.items ? {
            items: detail.links.items.map((l) => ({
              entityType: l.entityType,
              entityId: l.entityId,
              title: l.title,
              pinned: l.pinned,
              note: l.note,
            })),
          } : {}),
        };
      }
      return json(out);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_initiatives_links',
    {
      title: 'List entities linked to a Brain initiative',
      description: 'List the polymorphic entities (tasks, notes, meetings, decisions, topics, CRM deals, CRM companies) linked to an initiative. Returns resolved display rows + { total, byType counts }.',
      inputSchema: {
        id: z.number().int().positive(),
        entityType: z.enum(['task', 'note', 'meeting', 'decision', 'topic', 'crm_deal', 'crm_company']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listInitiativeLinks(clientId, args.id, {
        entityType: args.entityType,
        limit: args.limit,
        offset: args.offset,
      });
      const items = rows.map((r) => ({
        entityType: r.entityType,
        entityId: r.entityId,
        title: r.title,
        pinned: r.pinned,
        note: r.note,
      }));
      const byType: Record<string, number> = {};
      for (const it of items) byType[it.entityType] = (byType[it.entityType] ?? 0) + 1;
      return json({ items, total: items.length, byType });
    },
  );

  // ── READ — goals ────────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_goals_list',
    {
      title: 'List Brain goals',
      description: 'List goals for this tenant. Slim by default — returns { id, initiativeId, title, status, ownerId, targetDate, sortOrder, currentMetric, targetMetric, unit } per row. Pass `include: ["description"]` or `["lastProgressNote"]` to opt into heavier text fields.',
      inputSchema: {
        initiativeId: z.number().int().positive().optional(),
        status: z.enum(['open', 'on_track', 'at_risk', 'off_track', 'achieved', 'missed']).optional(),
        ownerId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(z.enum(['description', 'lastProgressNote'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listGoals(clientId, {
        initiativeId: args.initiativeId,
        status: args.status,
        ownerId: args.ownerId,
        limit: args.limit,
        offset: args.offset,
      });
      const include = new Set(args.include ?? []);
      const items = rows.map((g) => ({
        id: g.id,
        initiativeId: g.initiativeId,
        title: g.title,
        status: g.status,
        ownerId: g.ownerId,
        targetDate: g.targetDate ? g.targetDate.toISOString() : null,
        sortOrder: g.sortOrder,
        currentMetric: g.currentMetric,
        targetMetric: g.targetMetric,
        unit: g.unit,
        ...(include.has('description') ? { description: g.description } : {}),
        ...(include.has('lastProgressNote') ? { lastProgressNote: g.lastProgressNote } : {}),
      }));
      return json({ items, limit: args.limit ?? 100, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_goals_get',
    {
      title: 'Get a Brain goal',
      description: 'Get one goal by id with a slim parent-initiative reference ({ id, name, slug, status }). Heavy text fields (description, lastProgressNote) are opt-in via `include`.',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(z.enum(['description', 'lastProgressNote'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getGoalById(clientId, args.id);
      if (!detail) return err('Goal not found.');
      const include = new Set(args.include ?? []);
      const g = detail.goal;
      const goal: Record<string, unknown> = {
        id: g.id,
        initiativeId: g.initiativeId,
        title: g.title,
        status: g.status,
        ownerId: g.ownerId,
        unit: g.unit,
        targetMetric: g.targetMetric,
        currentMetric: g.currentMetric,
        targetDate: g.targetDate ? g.targetDate.toISOString() : null,
        sortOrder: g.sortOrder,
        lastCheckedInAt: g.lastCheckedInAt ? g.lastCheckedInAt.toISOString() : null,
        createdBy: g.createdBy,
        createdAt: g.createdAt.toISOString(),
        updatedAt: g.updatedAt.toISOString(),
      };
      if (include.has('description')) goal.description = g.description;
      if (include.has('lastProgressNote')) goal.lastProgressNote = g.lastProgressNote;
      return json({
        goal,
        initiative: detail.initiative
          ? {
              id: detail.initiative.initiativeId,
              name: detail.initiative.name,
              slug: detail.initiative.slug,
              status: detail.initiative.status,
            }
          : null,
      });
    },
  );

  // ── WRITE — initiatives ────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_create',
    {
      title: 'Create a Brain initiative',
      description: 'Create a multi-quarter initiative. Echo: { id, slug, status } — re-fetch via brain_initiatives_get for the full row.',
      inputSchema: {
        name: z.string().min(1).max(255),
        description: z.string().nullable().optional(),
        status: z.enum(['planned', 'active', 'paused', 'completed', 'cancelled']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        sponsorId: z.number().int().positive().nullable().optional(),
        startDate: z.string().nullable().optional(),
        targetDate: z.string().nullable().optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createInitiative(clientId, ctx.userId, {
          name: args.name,
          description: args.description ?? null,
          status: args.status,
          priority: args.priority,
          ownerId: args.ownerId ?? null,
          sponsorId: args.sponsorId ?? null,
          startDate: args.startDate ? new Date(args.startDate) : args.startDate === null ? null : undefined,
          targetDate: args.targetDate ? new Date(args.targetDate) : args.targetDate === null ? null : undefined,
          confidentialityLevel: args.confidentialityLevel,
        });
        return json({ id: created.id, slug: created.slug, status: created.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create initiative.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_update',
    {
      title: 'Update a Brain initiative',
      description: 'Patch fields on an initiative. Status changes are NOT allowed here — use brain_initiatives_close or brain_initiatives_reopen. Echo: { id, updatedFields }. Returns a structured error { error: "use_close_or_reopen" } if a status change is attempted.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          name: z.string().min(1).max(255).optional(),
          description: z.string().nullable().optional(),
          priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
          ownerId: z.number().int().positive().nullable().optional(),
          sponsorId: z.number().int().positive().nullable().optional(),
          startDate: z.string().nullable().optional(),
          targetDate: z.string().nullable().optional(),
          confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const p = args.patch;
      try {
        const updated = await updateInitiative(clientId, ctx.userId, args.id, {
          name: p.name,
          description: p.description,
          priority: p.priority,
          ownerId: p.ownerId,
          sponsorId: p.sponsorId,
          startDate: p.startDate ? new Date(p.startDate) : p.startDate === null ? null : undefined,
          targetDate: p.targetDate ? new Date(p.targetDate) : p.targetDate === null ? null : undefined,
          confidentialityLevel: p.confidentialityLevel,
        });
        if (!updated) return err('Initiative not found.');
        return json({ id: updated.id, updatedFields: Object.keys(p).filter((k) => (p as Record<string, unknown>)[k] !== undefined) });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('use closeInitiative or reopenInitiative')) {
          return json({ error: 'use_close_or_reopen', message });
        }
        return err(message || 'Failed to update initiative.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_close',
    {
      title: 'Close a Brain initiative',
      description: 'Terminal status transition — outcome must be "completed" or "cancelled". Requires at least one of `reason` / `lessonsLearned`. If lessonsLearned is provided, a brain_note is auto-created with the text and pinned-linked back. Echo: { id, status, closedAt, noteId? }.',
      inputSchema: {
        id: z.number().int().positive(),
        outcome: z.enum(['completed', 'cancelled']),
        reason: z.string().max(2000).optional(),
        lessonsLearned: z.string().max(50_000).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await closeInitiative(clientId, ctx.userId, args.id, {
          outcome: args.outcome,
          reason: args.reason,
          lessonsLearned: args.lessonsLearned,
        });
        if (!out) return err('Initiative not found.');
        return json({
          id: out.initiative.id,
          status: out.initiative.status,
          closedAt: out.initiative.closedAt ? out.initiative.closedAt.toISOString() : null,
          ...(out.lessonsLearnedNoteId !== null ? { noteId: out.lessonsLearnedNoteId } : {}),
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to close initiative.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_reopen',
    {
      title: 'Reopen a Brain initiative',
      description: 'Reopen a previously closed initiative — only allowed from `completed` or `cancelled`. Sets status="active" and clears closedAt. Echo: { id, status }. Returns a structured error { error: "non_terminal_status" } if the current status is not terminal.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await reopenInitiative(clientId, ctx.userId, args.id);
        if (!updated) return err('Initiative not found.');
        return json({ id: updated.id, status: updated.status });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('cannot reopen from non-terminal status')) {
          return json({ error: 'non_terminal_status', message });
        }
        return err(message || 'Failed to reopen initiative.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_link',
    {
      title: 'Link an entity to a Brain initiative',
      description: 'Attach a polymorphic entity (task, note, meeting, decision, topic, crm_deal, crm_company, person, org_unit, glossary_term) to an initiative. Idempotent — re-posting the same (initiativeId, entityType, entityId) returns alreadyLinked=true with linkId=null. Echo: { linkId, alreadyLinked }.',
      inputSchema: {
        initiativeId: z.number().int().positive(),
        entityType: z.enum(['task', 'note', 'meeting', 'decision', 'topic', 'crm_deal', 'crm_company', 'person', 'org_unit', 'glossary_term']),
        entityId: z.number().int().positive(),
        note: z.string().nullable().optional(),
        pinned: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await linkEntity(clientId, ctx.userId, {
          initiativeId: args.initiativeId,
          entityType: args.entityType,
          entityId: args.entityId,
          note: args.note ?? null,
          pinned: args.pinned,
        });
        return json({ linkId: out.linkId, alreadyLinked: out.alreadyLinked });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to link entity.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_initiatives_unlink',
    {
      title: 'Unlink an entity from a Brain initiative',
      description: 'Remove a polymorphic link from an initiative. Echo: { removed: boolean } — false if no matching link existed.',
      inputSchema: {
        initiativeId: z.number().int().positive(),
        entityType: z.enum(['task', 'note', 'meeting', 'decision', 'topic', 'crm_deal', 'crm_company', 'person', 'org_unit', 'glossary_term']),
        entityId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const removed = await unlinkEntity(clientId, ctx.userId, {
          initiativeId: args.initiativeId,
          entityType: args.entityType,
          entityId: args.entityId,
        });
        return json({ removed });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to unlink entity.');
      }
    },
  );

  // ── WRITE — goals ───────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_goals_create',
    {
      title: 'Create a Brain goal',
      description: 'Create a goal under an existing initiative (must be in the same tenant). Echo: { id, status, initiativeId } — re-fetch via brain_goals_get for the full row.',
      inputSchema: {
        initiativeId: z.number().int().positive(),
        title: z.string().min(1).max(255),
        description: z.string().nullable().optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        unit: z.string().max(30).nullable().optional(),
        targetMetric: z.number().int().nullable().optional(),
        currentMetric: z.number().int().nullable().optional(),
        targetDate: z.string().nullable().optional(),
        sortOrder: z.number().int().optional(),
        status: z.enum(['open', 'on_track', 'at_risk', 'off_track', 'achieved', 'missed']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createGoal(clientId, ctx.userId, {
          initiativeId: args.initiativeId,
          title: args.title,
          description: args.description ?? null,
          ownerId: args.ownerId ?? null,
          unit: args.unit ?? null,
          targetMetric: args.targetMetric ?? null,
          currentMetric: args.currentMetric ?? null,
          targetDate: args.targetDate ? new Date(args.targetDate) : args.targetDate === null ? null : undefined,
          sortOrder: args.sortOrder,
          status: args.status,
        });
        return json({ id: created.id, status: created.status, initiativeId: created.initiativeId });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create goal.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_goals_update',
    {
      title: 'Update a Brain goal',
      description: 'Patch fields on a goal. Status changes are allowed here (unlike initiatives). Echo: { id, updatedFields }.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          title: z.string().min(1).max(255).optional(),
          description: z.string().nullable().optional(),
          ownerId: z.number().int().positive().nullable().optional(),
          unit: z.string().max(30).nullable().optional(),
          targetMetric: z.number().int().nullable().optional(),
          currentMetric: z.number().int().nullable().optional(),
          targetDate: z.string().nullable().optional(),
          sortOrder: z.number().int().optional(),
          status: z.enum(['open', 'on_track', 'at_risk', 'off_track', 'achieved', 'missed']).optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const p = args.patch;
      try {
        const updated = await updateGoal(clientId, ctx.userId, args.id, {
          title: p.title,
          description: p.description,
          ownerId: p.ownerId,
          unit: p.unit,
          targetMetric: p.targetMetric,
          currentMetric: p.currentMetric,
          targetDate: p.targetDate ? new Date(p.targetDate) : p.targetDate === null ? null : undefined,
          sortOrder: p.sortOrder,
          status: p.status,
        });
        if (!updated) return err('Goal not found.');
        return json({ id: updated.id, updatedFields: Object.keys(p).filter((k) => (p as Record<string, unknown>)[k] !== undefined) });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to update goal.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_goals_checkin',
    {
      title: 'Check in on a Brain goal',
      description: 'Drop a progress check-in — updates currentMetric / lastProgressNote / lastCheckedInAt. When status is omitted but currentMetric is provided, the auto-classifier picks the new status. Not audit-logged (lastCheckedInAt is the breadcrumb). Echo: { id, status, currentMetric, lastCheckedInAt }.',
      inputSchema: {
        id: z.number().int().positive(),
        currentMetric: z.number().int().optional(),
        note: z.string().max(10_000).nullable().optional(),
        status: z.enum(['open', 'on_track', 'at_risk', 'off_track', 'achieved', 'missed']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await checkinGoal(clientId, ctx.userId, args.id, {
          currentMetric: args.currentMetric,
          note: args.note,
          status: args.status,
        });
        if (!updated) return err('Goal not found.');
        return json({
          id: updated.id,
          status: updated.status,
          currentMetric: updated.currentMetric,
          lastCheckedInAt: updated.lastCheckedInAt ? updated.lastCheckedInAt.toISOString() : null,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to check in.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_goals_delete',
    {
      title: 'Delete a Brain goal',
      description: 'Hard-delete a goal (leaf row — no cascade impact). Echo: { id, deleted: true }.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const ok = await deleteGoal(clientId, ctx.userId, args.id);
        if (!ok) return err('Goal not found.');
        return json({ id: args.id, deleted: true });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to delete goal.');
      }
    },
  );
  // ─────────────────────────────────────────────────────────────────────────
  // BRAIN — DECISIONS (Phase 1 brain-restructure, Wave 2c)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Token-budget conventions enforced here:
  //   - List rows omit the heavy text fields (context / rationale / decision /
  //     alternativesConsidered) by default. Each is opt-in via `include`.
  //   - get-by-id keeps the same heavy-text gating (the helper returns the row
  //     in full but we project it down before serializing). Chain summary rows
  //     are always slim.
  //   - Write echoes return just identity + changed-field metadata.
  //   - `limit` is capped at 100 on every paginated tool.

  type DecisionRow = Awaited<ReturnType<typeof listDecisions>>[number];
  const slimDecisionRow = (
    d: DecisionRow,
    include: ReadonlyArray<'context' | 'rationale' | 'decision' | 'alternatives'> | undefined,
  ) => {
    const inc = new Set(include ?? []);
    const base = {
      id: d.id,
      title: d.title,
      status: d.status as BrainDecisionStatus,
      reversibility: d.reversibility as BrainDecisionReversibility,
      decidedAt: d.decidedAt,
      supersededByDecisionId: d.supersededByDecisionId,
      anchors: {
        meetingId: d.meetingId,
        noteId: d.noteId,
        companyId: d.companyId,
        dealId: d.dealId,
      },
      decisionMakerId: d.decisionMakerId,
    };
    return {
      ...base,
      ...(inc.has('context') ? { context: d.context } : {}),
      ...(inc.has('rationale') ? { rationale: d.rationale } : {}),
      ...(inc.has('decision') ? { decision: d.decision } : {}),
      ...(inc.has('alternatives') ? { alternativesConsidered: d.alternativesConsidered } : {}),
    };
  };

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_decisions_list',
    {
      title: 'List Brain decisions',
      description: 'List decisions with optional filters (status, reversibility, decision-maker, date range, supersededOnly, topicId). Slim by default — heavy text fields (context, rationale, decision text, alternatives) are opt-in via `include`. Paginated via { items, total, limit, offset }; limit capped at 100.',
      inputSchema: {
        status: z.enum(['proposed', 'accepted', 'superseded', 'rejected']).optional(),
        reversibility: z.enum(['one_way', 'two_way']).optional(),
        decisionMakerId: z.number().int().positive().optional(),
        dateFrom: z.string().optional().describe('ISO date — decidedAt >= this.'),
        dateTo: z.string().optional().describe('ISO date — decidedAt <= this.'),
        supersededOnly: z.boolean().optional(),
        topicId: z.number().int().positive().optional().describe('Currently a no-op pass-through; helper has a TODO to JOIN brain_entity_topics. Accepted without erroring so callers can future-proof.'),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(z.enum(['context', 'rationale', 'decision', 'alternatives'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;
      const opts: ListDecisionsOpts = {
        status: args.status,
        reversibility: args.reversibility,
        decisionMakerId: args.decisionMakerId,
        dateFrom: args.dateFrom ? new Date(args.dateFrom) : undefined,
        dateTo: args.dateTo ? new Date(args.dateTo) : undefined,
        supersededOnly: args.supersededOnly,
        topicId: args.topicId,
        limit,
        offset,
      };
      const [rows, totalRows] = await Promise.all([
        listDecisions(clientId, opts),
        // Count is a cheap parallel query — keep it slim so list responses
        // can drive pagination UIs without a second round-trip.
        (async () => {
          const { brainDecisions } = await import('@/lib/db/schema');
          const conds = [eq(brainDecisions.clientId, clientId)];
          if (args.status) conds.push(eq(brainDecisions.status, args.status));
          if (args.reversibility) conds.push(eq(brainDecisions.reversibility, args.reversibility));
          if (args.decisionMakerId !== undefined) conds.push(eq(brainDecisions.decisionMakerId, args.decisionMakerId));
          if (args.supersededOnly) conds.push(eq(brainDecisions.status, 'superseded'));
          const [r] = await db.select({ count: sql<number>`count(*)::int` })
            .from(brainDecisions).where(and(...conds));
          return Number(r?.count ?? 0);
        })(),
      ]);
      return json({
        items: rows.map((d) => slimDecisionRow(d, args.include)),
        total: totalRows,
        limit,
        offset,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_decisions_get',
    {
      title: 'Get a Brain decision',
      description: 'Fetch a decision by id with its supersedes chain (ancestors + descendants). Heavy text fields (context, rationale, decision, alternatives) are opt-in via `include` to stay token-light; chain summary rows are always slim ({ id, title, decidedAt, status }).',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(z.enum(['context', 'rationale', 'decision', 'alternatives'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await getDecisionById(clientId, args.id);
      if (!out) return err('Decision not found.');
      return json({
        decision: slimDecisionRow(out.decision, args.include),
        ancestors: out.ancestors,
        descendants: out.descendants,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_decisions_create',
    {
      title: 'Create a Brain decision',
      description: 'Create a new accepted decision. Heavy text fields (decision, rationale, context, alternativesConsidered) live in the input; the echo is slim ({ id, status, decidedAt }) so the caller does not round-trip the prose it just authored. AUDITED.',
      inputSchema: {
        title: z.string().min(1).max(255),
        context: z.string().nullable().optional(),
        decision: z.string().min(1),
        rationale: z.string().min(1),
        alternativesConsidered: z.string().nullable().optional(),
        reversibility: z.enum(['one_way', 'two_way']).optional(),
        decidedAt: z.string().optional().describe('ISO timestamp; defaults to now.'),
        decisionMakerId: z.number().int().positive().nullable().optional(),
        anchors: z.object({
          meetingId: z.number().int().positive().nullable().optional(),
          noteId: z.number().int().positive().nullable().optional(),
          companyId: z.number().int().positive().nullable().optional(),
          dealId: z.number().int().positive().nullable().optional(),
        }).optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const input: CreateDecisionInput = {
          title: args.title,
          context: args.context ?? null,
          decision: args.decision,
          rationale: args.rationale,
          alternativesConsidered: args.alternativesConsidered ?? null,
          reversibility: args.reversibility,
          decidedAt: args.decidedAt,
          decisionMakerId: args.decisionMakerId ?? null,
          anchors: args.anchors,
          confidentialityLevel: args.confidentialityLevel,
        };
        const created = await createDecision(clientId, ctx.userId, input);
        return json({ id: created.id, status: created.status, decidedAt: created.decidedAt });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create decision.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_decisions_update',
    {
      title: 'Update a Brain decision (metadata only)',
      description: 'Patch mutable fields (title, context, decisionMakerId, anchors, confidentialityLevel, alternativesConsidered) on an existing decision. Attempts to mutate `decision`, `rationale`, or `reversibility` are REJECTED — those changes require `brain_decisions_supersede` (immutable history). Echo is { id, updatedFields }. AUDITED.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          title: z.string().min(1).max(255).optional(),
          context: z.string().nullable().optional(),
          decisionMakerId: z.number().int().positive().nullable().optional(),
          anchors: z.object({
            meetingId: z.number().int().positive().nullable().optional(),
            noteId: z.number().int().positive().nullable().optional(),
            companyId: z.number().int().positive().nullable().optional(),
            dealId: z.number().int().positive().nullable().optional(),
          }).optional(),
          confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
          alternativesConsidered: z.string().nullable().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const before = await getDecisionById(clientId, args.id);
        if (!before) return err('Decision not found.');
        const updated = await updateDecision(clientId, ctx.userId, args.id, args.patch);
        if (!updated) return err('Decision not found.');
        const changed: string[] = [];
        if (args.patch.title !== undefined && updated.title !== before.decision.title) changed.push('title');
        if (args.patch.context !== undefined && updated.context !== before.decision.context) changed.push('context');
        if (args.patch.decisionMakerId !== undefined && updated.decisionMakerId !== before.decision.decisionMakerId) changed.push('decisionMakerId');
        if (args.patch.confidentialityLevel !== undefined && updated.confidentialityLevel !== before.decision.confidentialityLevel) changed.push('confidentialityLevel');
        if (args.patch.alternativesConsidered !== undefined && updated.alternativesConsidered !== before.decision.alternativesConsidered) changed.push('alternativesConsidered');
        if (args.patch.anchors) {
          const a = args.patch.anchors;
          if (a.meetingId !== undefined && updated.meetingId !== before.decision.meetingId) changed.push('meetingId');
          if (a.noteId !== undefined && updated.noteId !== before.decision.noteId) changed.push('noteId');
          if (a.companyId !== undefined && updated.companyId !== before.decision.companyId) changed.push('companyId');
          if (a.dealId !== undefined && updated.dealId !== before.decision.dealId) changed.push('dealId');
        }
        return json({ id: updated.id, updatedFields: changed });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to update decision.';
        if (msg.includes('supersedeDecision')) {
          return json({
            error: 'use_supersede',
            message: 'Cannot mutate rationale, decision text, or reversibility in place. Call brain_decisions_supersede to create a successor decision linked to this one.',
          });
        }
        return err(msg);
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_decisions_supersede',
    {
      title: 'Supersede a Brain decision',
      description: 'Atomically create a successor decision and link it back to the old one (old.status → "superseded", old.supersededByDecisionId → new.id). Use this whenever you need to change rationale, decision text, or reversibility. Echo: { previous, current }. AUDITED.',
      inputSchema: {
        oldId: z.number().int().positive(),
        title: z.string().min(1).max(255),
        context: z.string().nullable().optional(),
        decision: z.string().min(1),
        rationale: z.string().min(1),
        alternativesConsidered: z.string().nullable().optional(),
        reversibility: z.enum(['one_way', 'two_way']).optional(),
        decidedAt: z.string().optional(),
        decisionMakerId: z.number().int().positive().nullable().optional(),
        anchors: z.object({
          meetingId: z.number().int().positive().nullable().optional(),
          noteId: z.number().int().positive().nullable().optional(),
          companyId: z.number().int().positive().nullable().optional(),
          dealId: z.number().int().positive().nullable().optional(),
        }).optional(),
        confidentialityLevel: z.enum(['standard', 'restricted', 'confidential']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await supersedeDecision(clientId, ctx.userId, args.oldId, {
          title: args.title,
          context: args.context ?? null,
          decision: args.decision,
          rationale: args.rationale,
          alternativesConsidered: args.alternativesConsidered ?? null,
          reversibility: args.reversibility,
          decidedAt: args.decidedAt,
          decisionMakerId: args.decisionMakerId ?? null,
          anchors: args.anchors,
          confidentialityLevel: args.confidentialityLevel,
        });
        return json({
          previous: { id: args.oldId, status: 'superseded' as const },
          current: { id: created.id, status: created.status, decidedAt: created.decidedAt },
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to supersede decision.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_decisions_reject',
    {
      title: 'Soft-reject a Brain decision',
      description: 'Soft-delete by transitioning status → "rejected". Decisions are immutable history — no row is ever DELETEd. Idempotent. AUDITED.',
      inputSchema: {
        id: z.number().int().positive(),
        reason: z.string().max(500).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const updated = await softRejectDecision(clientId, ctx.userId, args.id, args.reason);
      if (!updated) return err('Decision not found.');
      return json({ id: updated.id, status: 'rejected' as const });
    },
  );

  // ─────────────────────────────────────────────────────────────────────────
  // BRAIN — TOPICS (Phase 1 brain-restructure, Wave 2c)
  // ─────────────────────────────────────────────────────────────────────────
  //
  // Token-budget conventions:
  //   - List/tree responses omit `description` (a free-form text field) by
  //     default — opt in via `includeDescriptions` / `includeDescription`.
  //   - Tree nodes carry `childCount` + `entityCount` for badge UIs without
  //     forcing the caller to fetch entities or descendants separately.
  //   - Write echoes return just the identity + the field(s) the helper
  //     touched (path, parentId, deleted flag, etc.).
  //   - `topics_entities` returns slim `{ entityType, entityId, title }` rows
  //     and supports limit/offset pagination (cap 100).

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_topics_list',
    {
      title: 'List Brain topics (flat)',
      description: 'List every topic for this tenant in path order (children sort under their parents). Slim by default — no `description`. Pass `includeEntityCounts=true` to add per-row `entityCount` (one extra group-by query).',
      inputSchema: {
        tagPrefix: z.string().optional().describe('Filter to topics whose path starts with `/<tagPrefix>` — useful after an import-from-tags run.'),
        includeEntityCounts: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listTopics(clientId);
      let filtered = rows;
      if (args.tagPrefix?.trim()) {
        const pref = `/${args.tagPrefix.trim().replace(/^\/+/, '')}`;
        filtered = rows.filter((r) => r.path === pref || r.path.startsWith(`${pref}/`));
      }
      let countByTopic: Map<number, number> | null = null;
      if (args.includeEntityCounts) {
        const { brainEntityTopics } = await import('@/lib/db/schema');
        const counts = await db.select({
          topicId: brainEntityTopics.topicId,
          count: sql<number>`count(*)::int`,
        }).from(brainEntityTopics)
          .where(eq(brainEntityTopics.clientId, clientId))
          .groupBy(brainEntityTopics.topicId);
        countByTopic = new Map<number, number>(counts.map((r) => [r.topicId, Number(r.count)]));
      }
      const items = filtered.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        path: t.path,
        parentId: t.parentId,
        sortOrder: t.sortOrder,
        ...(t.color ? { color: t.color } : {}),
        ...(t.icon ? { icon: t.icon } : {}),
        ...(countByTopic ? { entityCount: countByTopic.get(t.id) ?? 0 } : {}),
      }));
      return json(items);
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_topics_tree',
    {
      title: 'Get Brain topics as a nested tree',
      description: 'Return the topic taxonomy as a nested tree with per-node `childCount` + `entityCount`. Descriptions are omitted by default; pass `includeDescriptions=true` to inline them (potentially multi-KB per node).',
      inputSchema: {
        includeDescriptions: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const tree = await getTopicTree(clientId);
      type SlimNode = {
        id: number;
        name: string;
        slug: string;
        path: string;
        parentId: number | null;
        sortOrder: number;
        color?: string;
        icon?: string;
        childCount: number;
        entityCount: number;
        description?: string | null;
        children: SlimNode[];
      };
      const slim = (nodes: Awaited<ReturnType<typeof getTopicTree>>): SlimNode[] =>
        nodes.map((n) => ({
          id: n.id,
          name: n.name,
          slug: n.slug,
          path: n.path,
          parentId: n.parentId,
          sortOrder: n.sortOrder,
          ...(n.color ? { color: n.color } : {}),
          ...(n.icon ? { icon: n.icon } : {}),
          childCount: n.childCount,
          entityCount: n.entityCount,
          ...(args.includeDescriptions ? { description: n.description } : {}),
          children: slim(n.children),
        }));
      return json(slim(tree));
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_topics_get',
    {
      title: 'Get a Brain topic',
      description: 'Fetch a topic by id with its breadcrumb (root → immediate parent, NOT including the topic itself). `description` is opt-in.',
      inputSchema: {
        id: z.number().int().positive(),
        includeDescription: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await getTopicById(clientId, args.id);
      if (!out) return err('Topic not found.');
      const slim = {
        id: out.id,
        name: out.name,
        slug: out.slug,
        path: out.path,
        parentId: out.parentId,
        sortOrder: out.sortOrder,
        ...(out.color ? { color: out.color } : {}),
        ...(out.icon ? { icon: out.icon } : {}),
        ...(args.includeDescription ? { description: out.description } : {}),
      };
      return json({
        topic: slim,
        breadcrumb: out.breadcrumb.map((b) => ({ id: b.id, name: b.name, slug: b.slug })),
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_topics_entities',
    {
      title: 'List entities attached to a topic',
      description: 'List the notes / meetings / tasks / decisions / relationship-overlays attached to a topic. Returns slim `{ entityType, entityId, title }` rows, a total, and a per-type tally (`byType`). Paginated; limit capped at 100.',
      inputSchema: {
        id: z.number().int().positive(),
        entityType: z.enum(['note', 'meeting', 'task', 'decision', 'relationship_overlay', 'initiative', 'person']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await listEntitiesForTopic(clientId, args.id);
      const filtered = args.entityType
        ? out.items.filter((r) => r.entityType === args.entityType)
        : out.items;
      const limit = args.limit ?? 50;
      const offset = args.offset ?? 0;
      const page = filtered.slice(offset, offset + limit);
      return json({
        items: page,
        total: filtered.length,
        byType: {
          note: out.byType.note.length,
          meeting: out.byType.meeting.length,
          task: out.byType.task.length,
          decision: out.byType.decision.length,
          relationship_overlay: out.byType.relationship_overlay.length,
        },
        limit,
        offset,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_create',
    {
      title: 'Create a Brain topic',
      description: 'Create a topic. Slug + path auto-derive from name; slug collisions get a `-2`, `-3`, … suffix. Echo: { id, slug, path, parentId }. AUDITED.',
      inputSchema: {
        name: z.string().min(1).max(150),
        parentId: z.number().int().positive().nullable().optional(),
        description: z.string().nullable().optional(),
        color: z.string().max(20).nullable().optional(),
        icon: z.string().max(50).nullable().optional(),
        sortOrder: z.number().int().optional(),
        derivedFromTag: z.string().max(100).nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createTopic(clientId, ctx.userId, {
          name: args.name,
          parentId: args.parentId ?? null,
          description: args.description ?? null,
          color: args.color ?? null,
          icon: args.icon ?? null,
          sortOrder: args.sortOrder,
          derivedFromTag: args.derivedFromTag ?? null,
        });
        return json({
          id: created.id,
          slug: created.slug,
          path: created.path,
          parentId: created.parentId,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create topic.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_update',
    {
      title: 'Update a Brain topic',
      description: 'Patch a topic. Rename DOES NOT change slug (stable URLs); use brain_topics_move for reparenting. Echo: { id, updatedFields }. AUDITED.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          name: z.string().min(1).max(150).optional(),
          description: z.string().nullable().optional(),
          color: z.string().max(20).nullable().optional(),
          icon: z.string().max(50).nullable().optional(),
          sortOrder: z.number().int().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const before = await getTopicById(clientId, args.id);
      if (!before) return err('Topic not found.');
      const updated = await updateTopic(clientId, ctx.userId, args.id, args.patch);
      if (!updated) return err('Topic not found.');
      const changed: string[] = [];
      if (args.patch.name !== undefined && updated.name !== before.name) changed.push('name');
      if (args.patch.description !== undefined && updated.description !== before.description) changed.push('description');
      if (args.patch.color !== undefined && updated.color !== before.color) changed.push('color');
      if (args.patch.icon !== undefined && updated.icon !== before.icon) changed.push('icon');
      if (args.patch.sortOrder !== undefined && updated.sortOrder !== before.sortOrder) changed.push('sortOrder');
      return json({ id: updated.id, updatedFields: changed });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_move',
    {
      title: 'Reparent a Brain topic',
      description: 'Move a topic under a new parent (pass `newParentId: null` to promote to root). Recomputes the affected subtree\'s materialized `path` atomically. Echo: { id, path, descendantsRepathed }. AUDITED.',
      inputSchema: {
        id: z.number().int().positive(),
        newParentId: z.number().int().positive().nullable(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const before = await getTopicById(clientId, args.id);
        if (!before) return err('Topic not found.');
        // Count descendants pre-move so we can echo how many were repathed.
        const { brainTopics } = await import('@/lib/db/schema');
        const likePattern = `${before.path}/%`;
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
          .from(brainTopics)
          .where(and(
            eq(brainTopics.clientId, clientId),
            sql`brain_topics.path LIKE ${likePattern}`,
          ));
        const moved = await moveTopic(clientId, ctx.userId, args.id, args.newParentId);
        if (!moved) return err('Topic not found.');
        return json({
          id: moved.id,
          path: moved.path,
          descendantsRepathed: Number(count ?? 0),
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to move topic.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_merge',
    {
      title: 'Merge two Brain topics',
      description: 'Fold `sourceId` into `targetId`: reattach all entity links (skipping dupes), reparent source\'s children under target (with full path rewrite), then delete source. Refuses to merge a topic into one of its own descendants. Echo: { sourceId, targetId, entitiesReattached, childrenReparented }. AUDITED.',
      inputSchema: {
        sourceId: z.number().int().positive(),
        targetId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await mergeTopic(clientId, ctx.userId, args.sourceId, args.targetId);
        if (!out) return err('Source or target topic not found.');
        return json({
          sourceId: args.sourceId,
          targetId: out.targetId,
          entitiesReattached: out.reattached,
          childrenReparented: out.reparented,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to merge topics.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_delete',
    {
      title: 'Delete a Brain topic',
      description: 'Delete a topic. Refuses if the topic has children (resolve via merge or by deleting children first). Refuses if any entities are attached unless `force=true`, which also drops the join rows. AUDITED.',
      inputSchema: {
        id: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await deleteTopic(clientId, ctx.userId, args.id, { force: args.force });
      if (!out.deleted) {
        if (out.reason === 'not_found') return err('Topic not found.');
        return json({
          error: out.reason ?? 'conflict',
          message: out.reason === 'has_children'
            ? 'Topic has child topics — delete them first or merge into another topic.'
            : 'Topic has entities attached — pass force=true to drop the join rows and delete anyway.',
        });
      }
      return json({ id: args.id, deleted: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_attach',
    {
      title: 'Attach topics to an entity',
      description: 'Bulk-attach one or more topics to a single (entityType, entityId) target. Idempotent — rows that already exist are reported as `alreadyAttached`. Cross-tenant topic ids are silently dropped. Echo: { attached, alreadyAttached }.',
      inputSchema: {
        targetEntityType: z.enum(['note', 'meeting', 'task', 'decision', 'relationship_overlay', 'initiative', 'person']),
        targetEntityId: z.number().int().positive(),
        topicIds: z.array(z.number().int().positive()).min(1).max(50),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await attachTopics(db, {
        clientId,
        actorId: ctx.userId,
        targetEntityType: args.targetEntityType,
        targetEntityId: args.targetEntityId,
        topicIds: args.topicIds,
      });
      return json({ attached: out.attached, alreadyAttached: out.alreadyAttached });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_detach',
    {
      title: 'Detach topics from an entity',
      description: 'Bulk-detach one or more topics from a single (entityType, entityId) target. Tenant-scoped; missing rows are a no-op. Echo: { detached }.',
      inputSchema: {
        targetEntityType: z.enum(['note', 'meeting', 'task', 'decision', 'relationship_overlay', 'initiative', 'person']),
        targetEntityId: z.number().int().positive(),
        topicIds: z.array(z.number().int().positive()).min(1).max(50),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await detachTopics(clientId, ctx.userId, {
        targetEntityType: args.targetEntityType,
        targetEntityId: args.targetEntityId,
        topicIds: args.topicIds,
      });
      return json({ detached: out.detached });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_topics_import_from_tags',
    {
      title: 'Import Brain topics from note tags',
      description: 'Walk every `brain_notes.tags` string, split `a/b/c` into a hierarchical chain of topics, find-or-create each segment, and attach every note bearing that tag to the leaf topic. Optional `tagPrefix` scopes to one branch. `dryRun=true` returns the report without writing. Idempotent — re-running adds nothing if no new tags appeared. Returns the full per-topic report (intentionally NOT slimmed — this IS the result the caller wants).',
      inputSchema: {
        tagPrefix: z.string().optional(),
        dryRun: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const report = await importTopicsFromTags(clientId, ctx.userId, {
        tagPrefix: args.tagPrefix,
        dryRun: args.dryRun,
      });
      return json({
        topicsCreated: report.topicsCreated,
        notesAttached: report.notesAttached,
        perTopic: report.perTopic.map((p) => ({
          topicId: p.topicId,
          path: p.path,
          noteCount: p.noteCount,
        })),
        dryRun: report.dryRun,
      });
    },
  );
  // ── PEOPLE — reads ───────────────────────────────────────────────────────

  const personIncludeEnum = z.enum(['notes', 'profileUrls']);
  const orgUnitIncludeEnum = z.enum(['descriptions']);

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_people_list',
    {
      title: 'List Brain people',
      description: 'List internal people (employees / advisors / contractors). Slim row by default — pass `include: ["notes", "profileUrls"]` to opt into heavy fields. Filter by status / orgUnitId / expertiseTagId / managerId / search.',
      inputSchema: {
        status: z.enum(['active', 'inactive', 'departed']).optional(),
        orgUnitId: z.number().int().positive().optional(),
        expertiseTagId: z.number().int().positive().optional(),
        managerId: z.number().int().positive().optional(),
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(personIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const include = new Set(args.include ?? []);
      const rows = await listPeople(clientId, {
        status: args.status as BrainPersonStatus | undefined,
        orgUnitId: args.orgUnitId,
        expertiseTagId: args.expertiseTagId,
        managerId: args.managerId,
        search: args.search,
        limit: args.limit,
        offset: args.offset,
      });
      // listPeople already returns the slim shape. Hydrate heavy fields only
      // when the caller opted in.
      if (include.size === 0 || rows.length === 0) {
        return json({ items: rows, limit: args.limit ?? 50, offset: args.offset ?? 0 });
      }
      const ids = rows.map((r) => r.id);
      const heavyRows = await db
        .select({
          id: brainPeople.id,
          notes: brainPeople.notes,
          profileUrls: brainPeople.profileUrls,
        })
        .from(brainPeople)
        .where(and(eq(brainPeople.clientId, clientId), inArray(brainPeople.id, ids)));
      const heavyById = new Map(heavyRows.map((r) => [r.id, r]));
      const items = rows.map((r) => {
        const h = heavyById.get(r.id);
        return {
          ...r,
          ...(include.has('notes') ? { notes: h?.notes ?? null } : {}),
          ...(include.has('profileUrls') ? { profileUrls: h?.profileUrls ?? [] } : {}),
        };
      });
      return json({ items, limit: args.limit ?? 50, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_people_get',
    {
      title: 'Get Brain person',
      description: 'Fetch a person with manager, direct reports, org-unit memberships, and expertise tags. Slim person fields by default — pass `include: ["notes", "profileUrls"]` to opt into heavy fields.',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(personIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getPersonById(clientId, args.id);
      if (!detail) return err('Person not found.');
      const include = new Set(args.include ?? []);
      const p = detail.person;
      const slimPerson: Record<string, unknown> = {
        id: p.id,
        clientId: p.clientId,
        userId: p.userId,
        fullName: p.fullName,
        email: p.email,
        managerId: p.managerId,
        title: p.title,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        source: p.source,
        createdBy: p.createdBy,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
      if (include.has('notes')) slimPerson.notes = p.notes;
      if (include.has('profileUrls')) slimPerson.profileUrls = p.profileUrls;
      return json({
        person: slimPerson,
        manager: detail.manager,
        directReports: detail.directReports,
        orgUnits: detail.orgUnits,
        expertise: detail.expertise,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_org_units_list',
    {
      title: 'List Brain org units (flat)',
      description: 'Flat list of org units for this tenant, ordered by path. Slim row by default (no description) — pass `include: ["descriptions"]` to inline the description text. `memberCount` is always populated.',
      inputSchema: {
        include: z.array(orgUnitIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const include = new Set(args.include ?? []);
      const units = await listOrgUnits(clientId);
      // memberCount in one batch — same pattern as getOrgUnitTree.
      const memberRows = units.length === 0 ? [] : await db
        .select({
          orgUnitId: brainPersonOrgUnits.orgUnitId,
          count: sql<number>`count(*)::int`,
        })
        .from(brainPersonOrgUnits)
        .where(and(
          eq(brainPersonOrgUnits.clientId, clientId),
          inArray(brainPersonOrgUnits.orgUnitId, units.map((u) => u.id)),
        ))
        .groupBy(brainPersonOrgUnits.orgUnitId);
      const countByUnit = new Map<number, number>();
      for (const r of memberRows) countByUnit.set(r.orgUnitId, Number(r.count));
      const items = units.map((u) => ({
        id: u.id,
        name: u.name,
        slug: u.slug,
        path: u.path,
        parentId: u.parentId,
        leadPersonId: u.leadPersonId,
        sortOrder: u.sortOrder,
        color: u.color,
        icon: u.icon,
        memberCount: countByUnit.get(u.id) ?? 0,
        ...(include.has('descriptions') ? { description: u.description } : {}),
      }));
      return json({ items });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_org_units_tree',
    {
      title: 'Get Brain org-unit tree',
      description: 'Nested tree of org units for this tenant. Each node carries `childCount` and `memberCount`. Slim by default (no description) — pass `include: ["descriptions"]` to inline.',
      inputSchema: {
        include: z.array(orgUnitIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const include = new Set(args.include ?? []);
      const roots = await getOrgUnitTree(clientId);
      const shape = (node: BrainOrgUnitTreeNode): Record<string, unknown> => ({
        id: node.id,
        name: node.name,
        slug: node.slug,
        path: node.path,
        parentId: node.parentId,
        leadPersonId: node.leadPersonId,
        sortOrder: node.sortOrder,
        color: node.color,
        icon: node.icon,
        memberCount: node.memberCount,
        childCount: node.children.length,
        ...(include.has('descriptions') ? { description: node.description } : {}),
        children: node.children.map(shape),
      });
      return json({ items: roots.map(shape) });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_org_units_get',
    {
      title: 'Get Brain org unit',
      description: 'Fetch an org unit with its ancestor chain and members (personId / fullName / title / primary / roleInUnit).',
      inputSchema: { id: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getOrgUnitById(clientId, args.id);
      if (!detail) return err('Org unit not found.');
      return json({
        unit: detail.unit,
        ancestors: detail.ancestors,
        members: detail.members,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_who_knows',
    {
      title: 'Who knows X? — expertise search',
      description: 'Resolve a free-text query to expertise tags (substring match on tag name + description), then rank people by matched-tag count, level bonus, and primary-org-unit bonus. The marquee tool — use this when the user asks "who knows about X" or "who should I talk to about Y".',
      inputSchema: {
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(25).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await whoKnows(clientId, args.query, { limit: args.limit });
      return json(out);
    },
  );

  // ── PEOPLE — writes ──────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_people_create',
    {
      title: 'Create a Brain person',
      description: 'Add an internal person (employee / advisor / contractor). Echoes only `{ id, status }` — re-fetch via brain_people_get for the full record.',
      inputSchema: {
        fullName: z.string().min(1).max(200),
        email: z.string().email().max(255).nullable().optional(),
        userId: z.number().int().positive().nullable().optional(),
        managerId: z.number().int().positive().nullable().optional(),
        title: z.string().max(200).nullable().optional(),
        startDate: z.string().nullable().optional(),
        endDate: z.string().nullable().optional(),
        status: z.enum(['active', 'inactive', 'departed']).optional(),
        notes: z.string().nullable().optional(),
        profileUrls: z.array(z.object({ label: z.string(), url: z.string().url() })).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createPerson(clientId, ctx.userId, {
          fullName: args.fullName,
          email: args.email ?? null,
          userId: args.userId ?? null,
          managerId: args.managerId ?? null,
          title: args.title ?? null,
          startDate: args.startDate ? new Date(args.startDate) : null,
          endDate: args.endDate ? new Date(args.endDate) : null,
          status: args.status,
          notes: args.notes ?? null,
          profileUrls: args.profileUrls,
        });
        return json({ id: created.id, status: created.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create person.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_people_update',
    {
      title: 'Update a Brain person',
      description: 'Patch fields on a person. Manager change is cycle-guarded — assigning a descendant as the manager returns `{ error: "manager_cycle" }`. Echoes only `{ id, updatedFields }`.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          fullName: z.string().min(1).max(200).optional(),
          email: z.string().email().max(255).nullable().optional(),
          managerId: z.number().int().positive().nullable().optional(),
          title: z.string().max(200).nullable().optional(),
          startDate: z.string().nullable().optional(),
          endDate: z.string().nullable().optional(),
          status: z.enum(['active', 'inactive', 'departed']).optional(),
          notes: z.string().nullable().optional(),
          profileUrls: z.array(z.object({ label: z.string(), url: z.string().url() })).optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const p = args.patch;
      const patch: Parameters<typeof updatePerson>[3] = {};
      if (p.fullName !== undefined) patch.fullName = p.fullName;
      if (p.email !== undefined) patch.email = p.email;
      if (p.managerId !== undefined) patch.managerId = p.managerId;
      if (p.title !== undefined) patch.title = p.title;
      if (p.startDate !== undefined) patch.startDate = p.startDate ? new Date(p.startDate) : null;
      if (p.endDate !== undefined) patch.endDate = p.endDate ? new Date(p.endDate) : null;
      if (p.status !== undefined) patch.status = p.status;
      if (p.notes !== undefined) patch.notes = p.notes;
      if (p.profileUrls !== undefined) patch.profileUrls = p.profileUrls;
      try {
        const updated = await updatePerson(clientId, ctx.userId, args.id, patch);
        if (!updated) return err('Person not found.');
        return json({ id: updated.id, updatedFields: Object.keys(p) });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to update person.';
        if (/cycle/i.test(message)) {
          return json({ error: 'manager_cycle', message });
        }
        return err(message);
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_people_delete',
    {
      title: 'Delete a Brain person',
      description: 'Delete a person. Cascades org-unit memberships and expertise junctions; reports-to chains pointing at this person are nulled out.',
      inputSchema: { id: z.number().int().positive() },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const ok = await deletePerson(clientId, ctx.userId, args.id);
      if (!ok) return err('Person not found.');
      return json({ id: args.id, deleted: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_people_attach_expertise',
    {
      title: 'Attach an expertise tag to a person',
      description: 'Attach an expertise tag with an optional 1–4 proficiency level. Idempotent — `alreadyAttached: true` means the row already existed (level may have been updated).',
      inputSchema: {
        personId: z.number().int().positive(),
        expertiseTagId: z.number().int().positive(),
        level: z.number().int().min(1).max(4).nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await attachExpertise(clientId, ctx.userId, args.personId, {
          expertiseTagId: args.expertiseTagId,
          level: args.level ?? null,
        });
        return json({ alreadyAttached: out.alreadyAttached, level: args.level ?? null });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to attach expertise.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_people_detach_expertise',
    {
      title: 'Detach an expertise tag from a person',
      description: 'Remove an expertise tag from a person. `detached: false` means the row did not exist.',
      inputSchema: {
        personId: z.number().int().positive(),
        expertiseTagId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const detached = await detachExpertise(clientId, ctx.userId, args.personId, args.expertiseTagId);
      return json({ detached });
    },
  );

  // ── EXPERTISE TAGS — reads ───────────────────────────────────────────────

  const expertiseTagIncludeEnum = z.enum(['description']);

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_expertise_tags_list',
    {
      title: 'List Brain expertise tags',
      description: 'List per-tenant expertise tags. Slim row by default — pass `include: ["description"]` to inline the description text. `peopleCount` is always populated. Filter by `search` (ILIKE on name + description) or `source` ("manual" | "ai_suggested").',
      inputSchema: {
        search: z.string().max(200).optional(),
        source: z.enum(['manual', 'ai_suggested']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(expertiseTagIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const include = new Set(args.include ?? []);
      const rows = await listExpertiseTags(clientId, {
        search: args.search,
        source: args.source,
        limit: args.limit,
        offset: args.offset,
      });
      const items = rows.map((r) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        source: r.source,
        createdAt: r.createdAt,
        peopleCount: r.peopleCount,
        ...(include.has('description') ? { description: r.description } : {}),
      }));
      return json({ items, limit: args.limit ?? 50, offset: args.offset ?? 0 });
    },
  );

  // ── EXPERTISE TAGS — writes ──────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_expertise_tags_create',
    {
      title: 'Create an expertise tag',
      description: 'Create a per-tenant expertise tag. Slug is auto-derived from name; collisions get a `-2`, `-3` suffix. Echoes `{ id, slug }`.',
      inputSchema: {
        name: z.string().min(1).max(100),
        description: z.string().nullable().optional(),
        source: z.enum(['manual', 'ai_suggested']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createExpertiseTag(clientId, ctx.userId, {
          name: args.name,
          description: args.description ?? null,
          source: args.source,
        });
        return json({ id: created.id, slug: created.slug });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create expertise tag.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_expertise_tags_update',
    {
      title: 'Update an expertise tag',
      description: 'Patch name or description on an expertise tag. Slug stays stable (renames do not change the URL). Echoes `{ id, updatedFields }`.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          name: z.string().min(1).max(100).optional(),
          description: z.string().nullable().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const updated = await updateExpertiseTag(clientId, ctx.userId, args.id, args.patch);
      if (!updated) return err('Expertise tag not found.');
      return json({ id: updated.id, updatedFields: Object.keys(args.patch) });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_expertise_tags_delete',
    {
      title: 'Delete an expertise tag',
      description: 'Delete an expertise tag. Default refuses if any person still holds it — pass `force: true` to cascade-detach. Returns a structured `{ error: "in_use", peopleAttached }` shape on conflict.',
      inputSchema: {
        id: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await deleteExpertiseTag(clientId, ctx.userId, args.id, { force: args.force });
      if (!out.deleted) {
        if (out.reason === 'not_found') return err('Expertise tag not found.');
        if (out.reason === 'in_use') {
          return json({
            error: 'in_use',
            message: 'Expertise tag is still attached to one or more people. Pass force=true to cascade.',
          });
        }
      }
      return json({ id: args.id, deleted: true });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_expertise_tags_merge',
    {
      title: 'Merge two expertise tags',
      description: 'Re-attach every brain_person_expertise row from `sourceTagId` to `targetTagId`, then delete the source tag. Levels on target are preserved; if target has no level but source had one, source\'s level is copied. Echoes `{ peopleReattached, sourceDeleted: true }`.',
      inputSchema: {
        sourceTagId: z.number().int().positive(),
        targetTagId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await mergeExpertiseTags(clientId, ctx.userId, args.sourceTagId, args.targetTagId);
        return json({ peopleReattached: out.reattached, sourceDeleted: true });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to merge expertise tags.');
      }
    },
  );

  // ── ORG UNITS — writes ───────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_create',
    {
      title: 'Create an org unit',
      description: 'Create a hierarchical org unit. Slug auto-derived; path computed from parent. Echoes `{ id, slug, path }`.',
      inputSchema: {
        name: z.string().min(1).max(150),
        parentId: z.number().int().positive().nullable().optional(),
        description: z.string().nullable().optional(),
        leadPersonId: z.number().int().positive().nullable().optional(),
        color: z.string().max(20).nullable().optional(),
        icon: z.string().max(50).nullable().optional(),
        sortOrder: z.number().int().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createOrgUnit(clientId, ctx.userId, {
          name: args.name,
          parentId: args.parentId ?? null,
          description: args.description ?? null,
          leadPersonId: args.leadPersonId ?? null,
          color: args.color ?? null,
          icon: args.icon ?? null,
          sortOrder: args.sortOrder,
        });
        return json({ id: created.id, slug: created.slug, path: created.path });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create org unit.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_update',
    {
      title: 'Update an org unit',
      description: 'Patch fields on an org unit. Slug + path stay stable on rename. Echoes `{ id, updatedFields }`. Use brain_org_units_move to re-parent.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          name: z.string().min(1).max(150).optional(),
          description: z.string().nullable().optional(),
          leadPersonId: z.number().int().positive().nullable().optional(),
          color: z.string().max(20).nullable().optional(),
          icon: z.string().max(50).nullable().optional(),
          sortOrder: z.number().int().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await updateOrgUnit(clientId, ctx.userId, args.id, args.patch);
        if (!updated) return err('Org unit not found.');
        return json({ id: updated.id, updatedFields: Object.keys(args.patch) });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to update org unit.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_move',
    {
      title: 'Re-parent an org unit',
      description: 'Move an org unit under a new parent (or to root with `newParentId: null`). Rewrites the path prefix for the moved unit AND every descendant. Cycle-guarded. Echoes `{ id, path, descendantsRepathed }`.',
      inputSchema: {
        id: z.number().int().positive(),
        newParentId: z.number().int().positive().nullable(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const before = await getOrgUnitById(clientId, args.id);
        if (!before) return err('Org unit not found.');
        // Count descendants (path LIKE 'before.path/%') for the echo.
        const descendantRows = await db
          .select({ id: brainOrgUnits.id })
          .from(brainOrgUnits)
          .where(and(
            eq(brainOrgUnits.clientId, clientId),
            sql`${brainOrgUnits.path} LIKE ${`${before.unit.path}/%`}`,
          ));
        const descendantsRepathed = descendantRows.length;
        const moved = await moveOrgUnit(clientId, ctx.userId, args.id, args.newParentId);
        if (!moved) return err('Org unit not found.');
        return json({ id: moved.id, path: moved.path, descendantsRepathed });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to move org unit.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_merge',
    {
      title: 'Merge two org units',
      description: 'Re-parent `sourceId`\'s children under `targetId`, re-attach `sourceId`\'s members to `targetId` (dedup-safe), then delete `sourceId`. Echoes `{ sourceId, targetId, membersReattached, childrenReparented }`.',
      inputSchema: {
        sourceId: z.number().int().positive(),
        targetId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        // Capture counts BEFORE the merge so we can echo them — mergeOrgUnits
        // returns the target unit, not a stats payload.
        const sourceDetail = await getOrgUnitById(clientId, args.sourceId);
        if (!sourceDetail) return err('Source org unit not found.');
        const membersReattached = sourceDetail.members.length;
        const childrenRows = await db
          .select({ id: brainOrgUnits.id })
          .from(brainOrgUnits)
          .where(and(
            eq(brainOrgUnits.clientId, clientId),
            eq(brainOrgUnits.parentId, args.sourceId),
          ));
        const childrenReparented = childrenRows.length;
        const merged = await mergeOrgUnits(clientId, ctx.userId, args.sourceId, args.targetId);
        if (!merged) return err('Source org unit not found.');
        return json({
          sourceId: args.sourceId,
          targetId: args.targetId,
          membersReattached,
          childrenReparented,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to merge org units.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_delete',
    {
      title: 'Delete an org unit',
      description: 'Delete an org unit. Default refuses if it has members or children — pass `force: true` to detach members and re-parent children up one level. Returns structured `{ error: "in_use", memberCount, childCount }` on conflict.',
      inputSchema: {
        id: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const ok = await deleteOrgUnit(clientId, ctx.userId, args.id, { force: args.force });
        if (!ok) return err('Org unit not found.');
        return json({ id: args.id, deleted: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to delete org unit.';
        // Helper throws "Org unit has N member(s) and M child unit(s). Pass force=true to cascade."
        const match = message.match(/has\s+(\d+)\s+member.*\s+(\d+)\s+child/i);
        if (match) {
          return json({
            error: 'in_use',
            message,
            memberCount: Number(match[1]),
            childCount: Number(match[2]),
          });
        }
        return err(message);
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_add_member',
    {
      title: 'Add a person to an org unit',
      description: 'Attach a person to an org unit. Idempotent — re-attaching updates `primary` and `roleInUnit`. Marking primary flips primary=false on the person\'s other memberships. Echoes `{ alreadyMember, primary }`.',
      inputSchema: {
        orgUnitId: z.number().int().positive(),
        personId: z.number().int().positive(),
        primary: z.boolean().optional(),
        roleInUnit: z.string().max(150).nullable().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        // Check pre-existing membership for the echo flag.
        const [existing] = await db
          .select({ id: brainPersonOrgUnits.id })
          .from(brainPersonOrgUnits)
          .where(and(
            eq(brainPersonOrgUnits.clientId, clientId),
            eq(brainPersonOrgUnits.orgUnitId, args.orgUnitId),
            eq(brainPersonOrgUnits.personId, args.personId),
          ))
          .limit(1);
        const alreadyMember = Boolean(existing);
        const row = await addMember(clientId, ctx.userId, {
          orgUnitId: args.orgUnitId,
          personId: args.personId,
          primary: args.primary,
          roleInUnit: args.roleInUnit ?? null,
        });
        return json({ alreadyMember, primary: row.primary });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to add member.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_remove_member',
    {
      title: 'Remove a person from an org unit',
      description: 'Detach a person from an org unit. `removed: false` means the membership row did not exist.',
      inputSchema: {
        orgUnitId: z.number().int().positive(),
        personId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const removed = await removeMember(clientId, ctx.userId, {
        orgUnitId: args.orgUnitId,
        personId: args.personId,
      });
      return json({ removed });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_org_units_set_primary',
    {
      title: 'Set a person\'s primary org unit',
      description: 'Mark `orgUnitId` as the primary membership for `personId`. Flips primary=false on the person\'s other memberships in the same transaction. Requires the membership to already exist — call brain_org_units_add_member first if not.',
      inputSchema: {
        personId: z.number().int().positive(),
        orgUnitId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const ok = await setPrimaryUnit(clientId, ctx.userId, args.personId, args.orgUnitId);
      if (!ok) return err('Membership not found. Call brain_org_units_add_member first.');
      return json({ personId: args.personId, orgUnitId: args.orgUnitId, primary: true });
    },
  );
  // ── GLOSSARY — read ──────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_glossary_list',
    {
      title: 'List Brain glossary terms',
      description: 'List tenant glossary terms (acronyms, codenames, jargon). Slim by default: returns id, term, slug, shortDefinition, status, category, ownerId, aliasCount. To receive full `definition` and full `aliases`, pass include=["definition"] / ["aliases"]. Filters: status, category, search, ownerId. Cap limit 100.',
      inputSchema: {
        status: z.enum(['active', 'deprecated']).optional(),
        category: z.string().optional(),
        search: z.string().optional().describe('Substring match on term, aliases, and definition.'),
        ownerId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(z.enum(['definition', 'aliases'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const slim = await listGlossaryTerms(clientId, {
        status: args.status,
        category: args.category,
        search: args.search,
        ownerId: args.ownerId,
        limit: args.limit,
        offset: args.offset,
      });
      const include = new Set(args.include ?? []);
      if (include.size === 0) {
        return json(slim);
      }
      // Heavy include: hydrate by looking up full rows for the slim page.
      // Bounded by the same limit so token cost stays predictable.
      const { db } = await import('@/lib/db');
      const { brainGlossaryTerms } = await import('@/lib/db/schema');
      const { and, eq, inArray } = await import('drizzle-orm');
      const ids = slim.items.map((r) => r.id);
      const heavy = ids.length > 0
        ? await db.select({
            id: brainGlossaryTerms.id,
            definition: brainGlossaryTerms.definition,
            aliases: brainGlossaryTerms.aliases,
          })
          .from(brainGlossaryTerms)
          .where(and(
            eq(brainGlossaryTerms.clientId, clientId),
            inArray(brainGlossaryTerms.id, ids),
          ))
        : [];
      const byId = new Map(heavy.map((h) => [h.id, h]));
      const items = slim.items.map((r) => {
        const h = byId.get(r.id);
        return {
          ...r,
          ...(include.has('definition') ? { definition: h?.definition ?? null } : {}),
          ...(include.has('aliases') ? { aliases: h?.aliases ?? [] } : {}),
        };
      });
      return json({ ...slim, items });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_glossary_get',
    {
      title: 'Get a Brain glossary term with related terms',
      description: 'Fetch a single term + its "see also" related terms (joined from the relatedTermIds JSON array, cross-tenant ids filtered out). Slim by default — omits full `definition` and `aliases` from the main term unless `include` is passed. Related terms are always slim (id/term/slug/shortDefinition).',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(z.enum(['definition', 'aliases'])).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getGlossaryTermById(clientId, args.id);
      if (!detail) return err('Glossary term not found.');
      const include = new Set(args.include ?? []);
      const t = detail.term;
      return json({
        term: {
          id: t.id,
          term: t.term,
          slug: t.slug,
          shortDefinition: t.shortDefinition,
          status: t.status,
          category: t.category,
          ownerId: t.ownerId,
          source: t.source,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
          aliasCount: Array.isArray(t.aliases) ? t.aliases.length : 0,
          relatedTermIdCount: Array.isArray(t.relatedTermIds) ? t.relatedTermIds.length : 0,
          ...(include.has('definition') ? { definition: t.definition } : {}),
          ...(include.has('aliases') ? { aliases: t.aliases } : {}),
        },
        relatedTerms: detail.relatedTerms,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_glossary_lookup',
    {
      title: 'Look up Brain glossary terms by query',
      description: 'The marquee tool: substring + alias-array match against ACTIVE glossary terms with a scored ranking (exact term 10 / exact alias 8 / term prefix 5 / alias prefix 4 / term substring 3 / alias substring 2 / definition substring 1). Use BEFORE answering any factual question that may contain tenant-specific acronyms or codenames so the workspace\'s preferred definition is used. Cap limit 25, default 10.',
      inputSchema: {
        query: z.string().min(1).max(200),
        limit: z.number().int().min(1).max(25).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await lookupGlossary(clientId, args.query, { limit: args.limit });
      return json(out);
    },
  );

  // ── GLOSSARY — write ─────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_glossary_create',
    {
      title: 'Create a Brain glossary term',
      description: 'Add a new term. Slug is auto-derived from `term` (lowercase, dash-separated); collisions per tenant suffix `-2`, `-3`, …. Default status="active", source="manual", aliases=[], relatedTermIds=[]. Echoes { id, slug } only — call brain_glossary_get for the full row.',
      inputSchema: {
        term: z.string().min(1).max(200),
        definition: z.string().min(1),
        shortDefinition: z.string().max(500).optional(),
        aliases: z.array(z.string()).optional(),
        status: z.enum(['active', 'deprecated']).optional(),
        category: z.string().max(100).optional(),
        ownerId: z.number().int().positive().optional(),
        relatedTermIds: z.array(z.number().int().positive()).optional(),
        source: z.enum(['manual', 'ai_suggested']).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createGlossaryTerm(clientId, ctx.userId, {
          term: args.term,
          definition: args.definition,
          shortDefinition: args.shortDefinition,
          aliases: args.aliases,
          status: args.status,
          category: args.category,
          ownerId: args.ownerId,
          relatedTermIds: args.relatedTermIds,
          source: args.source,
        });
        return json({ id: created.id, slug: created.slug });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create glossary term.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_glossary_update',
    {
      title: 'Update a Brain glossary term',
      description: 'Patch any field on a glossary term EXCEPT slug (which is stable for external URLs). Echoes { id, updatedFields }.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          term: z.string().min(1).max(200).optional(),
          definition: z.string().min(1).optional(),
          shortDefinition: z.string().max(500).nullable().optional(),
          aliases: z.array(z.string()).optional(),
          status: z.enum(['active', 'deprecated']).optional(),
          category: z.string().max(100).nullable().optional(),
          ownerId: z.number().int().positive().nullable().optional(),
          relatedTermIds: z.array(z.number().int().positive()).optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const updated = await updateGlossaryTerm(clientId, ctx.userId, args.id, args.patch);
      if (!updated) return err('Glossary term not found.');
      return json({ id: updated.id, updatedFields: Object.keys(args.patch) });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_glossary_delete',
    {
      title: 'Delete a Brain glossary term',
      description: 'Hard delete. Also prunes this id from every OTHER term\'s relatedTermIds list. Audit row written before the delete. Echoes { id, deleted, prunedRelatedTermFromCount }.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const out = await deleteGlossaryTerm(clientId, ctx.userId, args.id);
      if (!out.deleted) return err('Glossary term not found.');
      return json({
        id: args.id,
        deleted: true,
        prunedRelatedTermFromCount: out.prunedRelatedTermFromCount,
      });
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_glossary_bulk_import',
    {
      title: 'Bulk import / upsert Brain glossary terms',
      description: 'Insert or update up to 200 terms in one call. Upsert is per-tenant on slug (auto-derived from `term`) — existing rows have their definition/shortDefinition/aliases/category replaced; new rows are inserted with status="active" and source="manual". A single audit row is written after the batch. Echoes { created, updated, errors }.',
      inputSchema: {
        terms: z.array(z.object({
          term: z.string().min(1).max(200),
          definition: z.string().min(1),
          shortDefinition: z.string().max(500).optional(),
          aliases: z.array(z.string()).optional(),
          category: z.string().max(100).optional(),
        })).min(1).max(200),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await bulkImportGlossary(clientId, ctx.userId, { terms: args.terms });
        return json({ created: out.created, updated: out.updated, errors: out.errors });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Bulk import failed.');
      }
    },
  );

  // ── READ — playbooks (Wave 2c) ───────────────────────────────────────────

  const playbookStatusEnum = z.enum(['draft', 'active', 'archived']);
  const playbookTriggerKindEnum = z.enum(['manual', 'event', 'scheduled']);
  const playbookRunStatusEnum = z.enum(['pending', 'active', 'paused', 'completed', 'aborted', 'failed']);
  const playbookStepKindEnum = z.enum(['task', 'note', 'meeting', 'decision', 'review_item', 'wait', 'branch']);
  const playbookLinkEntityTypeEnum = z.enum(['initiative', 'person', 'crm_company', 'crm_deal', 'meeting', 'decision']);
  const playbookConditionOpEnum = z.enum(['eq', 'neq', 'in', 'not_in', 'exists', 'not_exists', 'gt', 'lt']);
  const playbookConditionSchema = z.object({
    field: z.string().min(1),
    op: playbookConditionOpEnum,
    value: z.unknown().optional(),
  }).nullable();
  const playbookListIncludeEnum = z.enum(['description', 'triggerConfig', 'defaultTopicIds']);
  const playbookGetIncludeEnum = z.enum(['description', 'stepConfigs']);
  const playbookRunGetIncludeEnum = z.enum(['context', 'triggerPayload']);

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_playbooks_list',
    {
      title: 'List Brain playbooks',
      description: 'List multi-step playbooks for this tenant. Slim by default — returns { id, name, slug, status, category, triggerKind, ownerId, stepCount, activeRunCount } per row. Pass `include: ["description"]`, `["triggerConfig"]`, or `["defaultTopicIds"]` to opt into heavier fields. Filters: status, category, triggerKind, ownerId.',
      inputSchema: {
        status: z.union([playbookStatusEnum, z.array(playbookStatusEnum)]).optional(),
        category: z.string().max(100).optional(),
        triggerKind: z.union([playbookTriggerKindEnum, z.array(playbookTriggerKindEnum)]).optional(),
        ownerId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        include: z.array(playbookListIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listPlaybooks(clientId, {
        status: args.status,
        category: args.category,
        triggerKind: args.triggerKind,
        ownerId: args.ownerId,
        limit: args.limit,
        offset: args.offset,
      });
      const include = new Set(args.include ?? []);
      // Heavy fields require a second fetch — only if requested AND there are rows.
      let extraByPlaybook: Map<number, {
        description: string | null;
        triggerConfig: unknown;
        defaultTopicIds: number[];
      }> | null = null;
      if (rows.length > 0 && (include.has('description') || include.has('triggerConfig') || include.has('defaultTopicIds'))) {
        const { brainPlaybooks } = await import('@/lib/db/schema');
        const extras = await db.select({
          id: brainPlaybooks.id,
          description: brainPlaybooks.description,
          triggerConfig: brainPlaybooks.triggerConfig,
          defaultTopicIds: brainPlaybooks.defaultTopicIds,
        }).from(brainPlaybooks)
          .where(and(
            eq(brainPlaybooks.clientId, clientId),
            inArray(brainPlaybooks.id, rows.map((r) => r.id)),
          ));
        extraByPlaybook = new Map(extras.map((e) => [e.id, {
          description: e.description,
          triggerConfig: e.triggerConfig,
          defaultTopicIds: e.defaultTopicIds ?? [],
        }]));
      }
      const items = rows.map((r) => {
        const extra = extraByPlaybook?.get(r.id);
        return {
          id: r.id,
          name: r.name,
          slug: r.slug,
          status: r.status,
          category: r.category,
          triggerKind: r.triggerKind,
          ownerId: r.ownerId,
          stepCount: r.stepCount,
          activeRunCount: r.activeRunCount,
          ...(include.has('description') && extra ? { description: extra.description } : {}),
          ...(include.has('triggerConfig') && extra ? { triggerConfig: extra.triggerConfig } : {}),
          ...(include.has('defaultTopicIds') && extra ? { defaultTopicIds: extra.defaultTopicIds } : {}),
        };
      });
      return json({ items, limit: args.limit ?? 50, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_playbooks_get',
    {
      title: 'Get a Brain playbook with steps',
      description: 'Get one playbook by id with its ordered steps. Slim by default — step rows return { id, key, name, kind, nextStepKeys, sortOrder } and the playbook omits description. Pass `include: ["description"]` to inline the playbook description, `["stepConfigs"]` to inline each step\'s config + condition + description blobs.',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(playbookGetIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getPlaybookById(clientId, args.id);
      if (!detail) return err('Playbook not found.');
      const include = new Set(args.include ?? []);
      const p = detail.playbook;
      const playbook: Record<string, unknown> = {
        id: p.id,
        name: p.name,
        slug: p.slug,
        status: p.status,
        category: p.category,
        triggerKind: p.triggerKind,
        triggerConfig: p.triggerConfig,
        ownerId: p.ownerId,
        defaultTopicIds: p.defaultTopicIds,
        source: p.source,
        createdBy: p.createdBy,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
      if (include.has('description')) playbook.description = p.description;
      const steps = detail.steps.map((s) => {
        const row: Record<string, unknown> = {
          id: s.id,
          key: s.key,
          name: s.name,
          kind: s.kind,
          nextStepKeys: s.nextStepKeys,
          sortOrder: s.sortOrder,
        };
        if (include.has('stepConfigs')) {
          row.description = s.description;
          row.config = s.config;
          row.condition = s.condition;
        }
        return row;
      });
      return json({ playbook, steps });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_playbook_runs_list',
    {
      title: 'List Brain playbook runs',
      description: 'List runs for this tenant. Slim row default — { id, playbookId, playbookName, label, status, startedAt, completedAt, stepProgress: { completed, total } }. Filter by status and / or playbookId. Cap limit at 100.',
      inputSchema: {
        status: z.union([playbookRunStatusEnum, z.array(playbookRunStatusEnum)]).optional(),
        playbookId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listRuns(clientId, {
        status: args.status,
        playbookId: args.playbookId,
        limit: args.limit,
        offset: args.offset,
      });
      const items = rows.map((r) => ({
        id: r.id,
        playbookId: r.playbookId,
        playbookName: r.playbookName,
        label: r.label,
        status: r.status,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        stepProgress: r.stepProgress,
      }));
      return json({ items, limit: args.limit ?? 50, offset: args.offset ?? 0 });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_playbook_runs_get',
    {
      title: 'Get a Brain playbook run',
      description: 'Get one run by id with { run, playbook (slim: id/name/slug/status), steps (per-run state), links }. Heavy JSON columns (`context`, `triggerPayload`) are opt-in via `include`.',
      inputSchema: {
        id: z.number().int().positive(),
        include: z.array(playbookRunGetIncludeEnum).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const detail = await getRunById(clientId, args.id);
      if (!detail) return err('Playbook run not found.');
      const include = new Set(args.include ?? []);
      const r = detail.run;
      const run: Record<string, unknown> = {
        id: r.id,
        playbookId: r.playbookId,
        label: r.label,
        status: r.status,
        startedBy: r.startedBy,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        abortedAt: r.abortedAt ? r.abortedAt.toISOString() : null,
        abortReason: r.abortReason,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
      if (include.has('context')) run.context = r.context;
      if (include.has('triggerPayload')) run.triggerPayload = r.triggerPayload;
      return json({
        run,
        playbook: {
          id: detail.playbook.id,
          name: detail.playbook.name,
          slug: detail.playbook.slug,
          status: detail.playbook.status,
        },
        steps: detail.steps.map((s) => ({
          id: s.id,
          stepId: s.stepId,
          key: s.key,
          name: s.name,
          kind: s.kind,
          status: s.status,
          resultEntityType: s.resultEntityType,
          resultEntityId: s.resultEntityId,
          startedAt: s.startedAt ? s.startedAt.toISOString() : null,
          completedAt: s.completedAt ? s.completedAt.toISOString() : null,
          waitUntil: s.waitUntil ? s.waitUntil.toISOString() : null,
          failureReason: s.failureReason,
        })),
        links: detail.links.map((l) => ({
          id: l.id,
          entityType: l.entityType,
          entityId: l.entityId,
        })),
      });
    },
  );

  hasScope(ctx.scopes, 'brain:read') && server.registerTool(
    'brain_playbook_runs_active_for_entity',
    {
      title: 'List active playbook runs anchored to an entity',
      description: 'Returns active + paused runs anchored to the given entity via brain_playbook_links — e.g. "what onboarding playbook is in flight for this person?". Slim row shape, same as brain_playbook_runs_list.',
      inputSchema: {
        entityType: playbookLinkEntityTypeEnum,
        entityId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const rows = await listActiveRunsForEntity(clientId, args.entityType, args.entityId);
      const items = rows.map((r) => ({
        id: r.id,
        playbookId: r.playbookId,
        playbookName: r.playbookName,
        label: r.label,
        status: r.status,
        startedAt: r.startedAt ? r.startedAt.toISOString() : null,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        stepProgress: r.stepProgress,
      }));
      return json({ items, total: items.length });
    },
  );

  // ── WRITE — playbooks (Wave 2c) ──────────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_create',
    {
      title: 'Create a Brain playbook',
      description: 'Create a new playbook (always starts in `draft`). Use brain_playbooks_add_step to attach steps, then brain_playbooks_activate once the DAG is valid. Echo: { id, slug, status }.',
      inputSchema: {
        name: z.string().min(1).max(200),
        description: z.string().nullable().optional(),
        triggerKind: playbookTriggerKindEnum.optional(),
        triggerConfig: z.object({
          event: z.string().optional(),
          filters: z.record(z.string(), z.unknown()).optional(),
          cron: z.string().optional(),
        }).nullable().optional(),
        category: z.string().max(100).nullable().optional(),
        ownerId: z.number().int().positive().nullable().optional(),
        defaultTopicIds: z.array(z.number().int().positive()).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const created = await createPlaybook(clientId, ctx.userId, {
          name: args.name,
          description: args.description ?? null,
          triggerKind: args.triggerKind,
          triggerConfig: args.triggerConfig ?? null,
          category: args.category ?? null,
          ownerId: args.ownerId ?? null,
          defaultTopicIds: args.defaultTopicIds,
        });
        return json({ id: created.id, slug: created.slug, status: created.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to create playbook.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_update',
    {
      title: 'Update a Brain playbook',
      description: 'Patch fields on a playbook definition. Status changes are NOT allowed here — use brain_playbooks_activate or brain_playbooks_archive. Echo: { id, updatedFields }. Returns a structured error { error: "use_activate_or_archive" } if a status change is attempted.',
      inputSchema: {
        id: z.number().int().positive(),
        patch: z.object({
          name: z.string().min(1).max(200).optional(),
          description: z.string().nullable().optional(),
          category: z.string().max(100).nullable().optional(),
          ownerId: z.number().int().positive().nullable().optional(),
          triggerKind: playbookTriggerKindEnum.optional(),
          triggerConfig: z.object({
            event: z.string().optional(),
            filters: z.record(z.string(), z.unknown()).optional(),
            cron: z.string().optional(),
          }).nullable().optional(),
          defaultTopicIds: z.array(z.number().int().positive()).optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const p = args.patch;
      try {
        const updated = await updatePlaybook(clientId, ctx.userId, args.id, {
          name: p.name,
          description: p.description,
          category: p.category,
          ownerId: p.ownerId,
          triggerKind: p.triggerKind,
          triggerConfig: p.triggerConfig,
          defaultTopicIds: p.defaultTopicIds,
        });
        if (!updated) return err('Playbook not found.');
        return json({
          id: updated.id,
          updatedFields: Object.keys(p).filter((k) => (p as Record<string, unknown>)[k] !== undefined),
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('use activatePlaybook or archivePlaybook')) {
          return json({ error: 'use_activate_or_archive', message });
        }
        return err(message || 'Failed to update playbook.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_activate',
    {
      title: 'Activate a Brain playbook',
      description: 'Flip status from `draft` to `active`. Refuses if the playbook has zero steps OR the step graph fails DAG validation (cycles, missing next-step refs, no entry point). On DAG failure returns a structured error { error: "dag_invalid", errors: string[] }. Echo on success: { id, status: "active" }.',
      inputSchema: {
        id: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await activatePlaybook(clientId, ctx.userId, args.id);
        if (!updated) return err('Playbook not found.');
        return json({ id: updated.id, status: updated.status });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const dagPrefix = 'playbook DAG invalid: ';
        if (message.startsWith(dagPrefix)) {
          const errors = message.slice(dagPrefix.length).split('; ').filter(Boolean);
          return json({ error: 'dag_invalid', errors });
        }
        if (message.includes('zero steps')) {
          return json({ error: 'dag_invalid', errors: [message] });
        }
        return err(message || 'Failed to activate playbook.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_archive',
    {
      title: 'Archive a Brain playbook',
      description: 'Flip status to `archived`. Refuses while pending/active/paused runs exist unless `force=true`. Echo on success: { id, status: "archived" }. Returns a structured error { error: "active_runs_exist", message } if force is omitted and active runs block the transition.',
      inputSchema: {
        id: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await archivePlaybook(clientId, ctx.userId, args.id, { force: args.force });
        if (!updated) return err('Playbook not found.');
        return json({ id: updated.id, status: updated.status });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('cannot archive playbook with')) {
          return json({ error: 'active_runs_exist', message });
        }
        return err(message || 'Failed to archive playbook.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_delete',
    {
      title: 'Delete a Brain playbook',
      description: 'Hard delete. Refuses while any runs exist (active or historical) unless `force=true` — force cascades through runs/run-steps/links. Echo on success: { id, deleted: true }. Returns a structured error { error: "runs_exist", message } if force is omitted and runs block the delete.',
      inputSchema: {
        id: z.number().int().positive(),
        force: z.boolean().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const deleted = await deletePlaybook(clientId, ctx.userId, args.id, { force: args.force });
        if (!deleted) return err('Playbook not found.');
        return json({ id: args.id, deleted: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('cannot delete playbook with')) {
          return json({ error: 'runs_exist', message });
        }
        return err(message || 'Failed to delete playbook.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_add_step',
    {
      title: 'Add a step to a Brain playbook',
      description: 'Append a step to a playbook. The step `key` is a stable identifier within the playbook (used by nextStepKeys + run state). `sortOrder` auto-picks (append) when omitted. Echo: { id, key } — re-fetch via brain_playbooks_get for the full row.',
      inputSchema: {
        playbookId: z.number().int().positive(),
        step: z.object({
          key: z.string().min(1).max(100),
          name: z.string().min(1).max(200),
          description: z.string().nullable().optional(),
          kind: playbookStepKindEnum,
          config: z.record(z.string(), z.unknown()).optional(),
          condition: playbookConditionSchema.optional(),
          nextStepKeys: z.array(z.string()).optional(),
          sortOrder: z.number().int().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const step: AddStepInput = {
          key: args.step.key,
          name: args.step.name,
          description: args.step.description ?? null,
          kind: args.step.kind,
          config: args.step.config,
          condition: (args.step.condition ?? null) as BrainPlaybookCondition,
          nextStepKeys: args.step.nextStepKeys,
          sortOrder: args.step.sortOrder,
        };
        const created = await addStep(clientId, ctx.userId, args.playbookId, step);
        return json({ id: created.id, key: created.key });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to add step.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_update_step',
    {
      title: 'Update a Brain playbook step',
      description: 'Patch fields on an existing step. Echo: { id, updatedFields }.',
      inputSchema: {
        stepId: z.number().int().positive(),
        patch: z.object({
          key: z.string().min(1).max(100).optional(),
          name: z.string().min(1).max(200).optional(),
          description: z.string().nullable().optional(),
          kind: playbookStepKindEnum.optional(),
          config: z.record(z.string(), z.unknown()).optional(),
          condition: playbookConditionSchema.optional(),
          nextStepKeys: z.array(z.string()).optional(),
          sortOrder: z.number().int().optional(),
        }),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const p = args.patch;
      try {
        const patch: UpdateStepInput = {
          key: p.key,
          name: p.name,
          description: p.description,
          kind: p.kind,
          config: p.config,
          condition: p.condition === undefined
            ? undefined
            : (p.condition as BrainPlaybookCondition),
          nextStepKeys: p.nextStepKeys,
          sortOrder: p.sortOrder,
        };
        const updated = await updateStep(clientId, ctx.userId, args.stepId, patch);
        if (!updated) return err('Step not found.');
        return json({
          id: updated.id,
          updatedFields: Object.keys(p).filter((k) => (p as Record<string, unknown>)[k] !== undefined),
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to update step.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_remove_step',
    {
      title: 'Remove a Brain playbook step',
      description: 'Remove a step from a playbook. Defensive — refuses if any run-step row references it (delete the affected runs first). Also walks sibling steps and strips this step\'s key from their nextStepKeys arrays so the DAG stays clean. Echo: { stepId, deleted: true }.',
      inputSchema: {
        stepId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const deleted = await removeStep(clientId, ctx.userId, args.stepId);
        if (!deleted) return err('Step not found.');
        return json({ stepId: args.stepId, deleted: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes('run-step row(s) reference')) {
          return json({ error: 'run_steps_reference', message });
        }
        return err(message || 'Failed to remove step.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbooks_reorder_steps',
    {
      title: 'Reorder Brain playbook steps',
      description: 'Atomically re-sortOrder the given step ids. All ids must belong to the same playbook + tenant; otherwise the whole batch is rejected. Steps not in `orderedStepIds` are left untouched. Echo: { playbookId, count }.',
      inputSchema: {
        playbookId: z.number().int().positive(),
        orderedStepIds: z.array(z.number().int().positive()).min(1),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const refreshed = await reorderSteps(clientId, ctx.userId, args.playbookId, args.orderedStepIds);
        return json({ playbookId: args.playbookId, count: refreshed.length });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to reorder steps.');
      }
    },
  );

  // ── WRITE — playbook runs (Wave 2c) ──────────────────────────────────────

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbook_runs_start',
    {
      title: 'Start a Brain playbook run',
      description: 'Spawn a new run of an active playbook. `context` is the variable bag step configs template against (e.g. { person: { fullName: "Jane" } }). `links` anchors the run to polymorphic entities (initiative, person, crm_company, crm_deal, meeting, decision). Entry steps fire immediately within the start tx. Echo: { runId, status: "active", firstStepKeys: string[] }.',
      inputSchema: {
        playbookId: z.number().int().positive(),
        label: z.string().min(1).max(255),
        context: z.record(z.string(), z.unknown()).optional(),
        triggerPayload: z.record(z.string(), z.unknown()).optional(),
        links: z.array(z.object({
          entityType: playbookLinkEntityTypeEnum,
          entityId: z.number().int().positive(),
        })).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await startRun(clientId, ctx.userId, {
          playbookId: args.playbookId,
          label: args.label,
          context: args.context,
          triggerPayload: args.triggerPayload,
          links: args.links,
        });
        return json({
          runId: out.runId,
          status: out.runStatus,
          firstStepKeys: out.firstStepKeys,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to start run.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbook_runs_advance',
    {
      title: 'Advance a Brain playbook run',
      description: 'Resolve any active `branch` run-steps and chain forward to next steps. Task/decision/review_item/wait steps stay active until explicit completion — this tool does not touch them. Echo: { runId, newActiveStepKeys, newStatus }.',
      inputSchema: {
        runId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await advanceRun(clientId, ctx.userId, args.runId);
        if (!out) return err('Playbook run not found.');
        return json({
          runId: out.runId,
          newActiveStepKeys: out.newActiveStepKeys,
          newStatus: out.newStatus,
        });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to advance run.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbook_run_steps_complete',
    {
      title: 'Complete a Brain playbook run step',
      description: 'Explicitly mark a run-step completed (used for task/decision/review_item kinds that don\'t auto-complete). Optionally record the entity this step produced. After the mutation, advanceRun chains forward. Echo: { stepId, status: "completed" }.',
      inputSchema: {
        runId: z.number().int().positive(),
        stepId: z.number().int().positive(),
        resultEntityType: z.string().max(50).optional(),
        resultEntityId: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await completeStep(clientId, ctx.userId, args.runId, args.stepId, {
          resultEntityType: args.resultEntityType,
          resultEntityId: args.resultEntityId,
        });
        if (!out) return err('Run step not found.');
        return json({ stepId: out.stepId, status: out.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to complete step.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbook_run_steps_skip',
    {
      title: 'Skip a Brain playbook run step',
      description: 'Mark a run-step skipped (the step is treated as terminal for routing but with no result). Optional `reason` is stored on the row. After the mutation, advanceRun chains forward. Echo: { stepId, status: "skipped" }.',
      inputSchema: {
        runId: z.number().int().positive(),
        stepId: z.number().int().positive(),
        reason: z.string().max(5000).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const out = await skipStep(clientId, ctx.userId, args.runId, args.stepId, {
          reason: args.reason,
        });
        if (!out) return err('Run step not found.');
        return json({ stepId: out.stepId, status: out.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to skip step.');
      }
    },
  );

  hasScope(ctx.scopes, 'brain:write') && server.registerTool(
    'brain_playbook_runs_abort',
    {
      title: 'Abort a Brain playbook run',
      description: 'Stop a run mid-flight. Any still-active step rows are marked skipped with the abort reason. Echo: { runId, status: "aborted" }.',
      inputSchema: {
        runId: z.number().int().positive(),
        reason: z.string().max(2000).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      try {
        const updated = await abortRun(clientId, ctx.userId, args.runId, { reason: args.reason });
        if (!updated) return err('Playbook run not found.');
        return json({ runId: updated.id, status: updated.status });
      } catch (e) {
        return err(e instanceof Error ? e.message : 'Failed to abort run.');
      }
    },
  );
}
