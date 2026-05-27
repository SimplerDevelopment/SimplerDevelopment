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
import { db } from '@/lib/db';
import { brainAiReviewItems, brainAuditLogs, users } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
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
      description: 'Return the command-center snapshot: needs-review meetings, overdue/blocked/upcoming tasks, stale prospects, priority relationships, recent meetings, and high-level counts.',
      inputSchema: {},
    },
    async () => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      return json(await getDashboardSummary(clientId));
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
      // MCP consumers historically received full rows including transcripts;
      // keep that behaviour explicit via `includeTranscript: true` so the slim
      // default list path doesn't silently strip fields a model might rely on.
      return json(await listMeetings(clientId, { status: args.status, limit: args.limit, includeTranscript: true }));
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
        return json(meeting);
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
        // includeBody: true because this MCP tool returns a 400-char preview
        // and the body length; the default slim list projection drops body.
        listNotes(clientId, { ...filters, limit, offset, includeBody: true }),
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
}
