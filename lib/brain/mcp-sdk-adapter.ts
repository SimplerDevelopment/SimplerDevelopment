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
  createNote,
  deleteNote,
  getNote,
  getNoteBySourceUrl,
  listNotes,
  updateNote,
} from './notes';
import { getDashboardSummary } from './dashboard';
import { db } from '@/lib/db';
import { brainAiReviewItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

function json(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }] };
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
      description: 'Keyword search across meetings, knowledge notes, tasks, and relationships. Returns ranked hits with snippets and citation URLs. Use this before answering any factual question about the workspace — never guess.',
      inputSchema: {
        query: z.string().min(1).max(500),
        types: z.array(z.enum(['meeting', 'note', 'task', 'relationship'])).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const out = await searchBrain(clientId, args.query, {
        types: args.types,
        limit: args.limit,
      });
      return json(out);
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
      description: 'Stage a suggested task as a pending AI review item — visible in /portal/brain/meetings/[id]/review for the user to approve, edit, or reject. Prefer this over brain_create_task when you\'re unsure or when the suggestion came from analysis the user hasn\'t directly authorized.',
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
      description: 'List/search notes in Company Brain Knowledge. Use this BEFORE crawling a URL to dedupe — pass `sourceUrl` for an exact match or `sourceUrlStartsWith` for a domain-wide check.',
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
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:read')) return denied('brain:read');
      const notes = await listNotes(clientId, {
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
        limit: args.limit ?? 50,
      });
      // Trim bodies for list responses; full body is available via brain_get_note.
      return json(notes.map((n) => ({
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
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })));
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
      description: 'Permanently delete a note. If it has an attached file, the S3 object is best-effort cleaned up. AUDITED.',
      inputSchema: {
        noteId: z.number().int().positive(),
      },
    },
    async (args) => {
      if (!hasScope(ctx.scopes, 'brain:write')) return denied('brain:write');
      const ok = await deleteNote(clientId, args.noteId, ctx.userId);
      if (!ok) return err('Note not found.');
      return json({ ok: true });
    },
  );
}
