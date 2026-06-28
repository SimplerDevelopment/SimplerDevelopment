/**
 * MCP tools — projects.
 *
 * Extracted from lib/mcp/server.ts during the per-domain refactor. The
 * registrar function below is invoked by buildMcpServer() and registers each
 * tool with its scope guard. Behavior is unchanged from the monolithic file.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq, type AnyColumn } from 'drizzle-orm';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db';
import {
  projects,
  kanbanCards,
  kanbanColumns,
  kanbanLabels,
  kanbanCardAssignees,
  posts,
  clientWebsites,
  emailCampaigns,
  pitchDecks,
  surveys,
  bookingPages,
  users,
  crmProposals,
  projectMembers,
  cardTemplates,
  projectArtifacts,
  brainNotes,
  brainAiReviewItems,
} from '@/lib/db/schema';
import { ROLE_OPTIONS, type ProjectRole } from '@/lib/portal/project-permissions';
import type { BrainReviewItemType } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { hasScope } from '@/lib/mcp-auth';
import {
  json,
  denied,
  requireScope,
  revalidateForWrite,
} from '../types';

export function registerProjectsTools(server: McpServer, ctx: PortalMcpContext): void {
  const clientId = ctx.client.id;

  // ── PROJECTS ───────────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'projects_list',
    {
      title: 'List projects',
      description: 'List all projects for the authenticated client.',
      inputSchema: {
        status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      const rows = await db.select().from(projects)
        .where(args.status
          ? and(eq(projects.clientId, clientId), eq(projects.status, args.status))
          : eq(projects.clientId, clientId))
        .orderBy(desc(projects.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'projects_create',
    {
      title: 'Create project',
      description: 'Create a new project. Pass cloneFromProjectId to seed the new project with the source project\'s columns, labels, and project-scoped card templates (cards are NOT copied).',
      inputSchema: {
        name: z.string().min(1),
        description: z.string().optional(),
        cloneFromProjectId: z.coerce.number().optional(),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');

      let source: typeof projects.$inferSelect | null = null;
      if (typeof args.cloneFromProjectId === 'number') {
        const [src] = await db.select().from(projects)
          .where(and(eq(projects.id, args.cloneFromProjectId), eq(projects.clientId, clientId)))
          .limit(1);
        if (!src) return json({ error: 'Source project not found in this account' });
        source = src;
      }

      const [row] = await db.insert(projects).values({
        name: args.name,
        description: args.description ?? null,
        clientId,
        status: 'active',
        createdBy: ctx.userId,
      }).returning();

      // Creator becomes owner; mirrors the REST POST /projects behavior.
      if (ctx.userId) {
        await db.insert(projectMembers).values({
          projectId: row.id,
          userId: ctx.userId,
          role: 'owner',
          addedBy: ctx.userId,
        }).onConflictDoNothing();
      }

      if (source) {
        const srcColumns = await db.select().from(kanbanColumns).where(eq(kanbanColumns.projectId, source.id));
        if (srcColumns.length > 0) {
          await db.insert(kanbanColumns).values(srcColumns.map(c => ({
            projectId: row.id,
            name: c.name,
            order: c.order,
            color: c.color,
            isDone: c.isDone,
            wipLimit: c.wipLimit,
          })));
        }
        const srcLabels = await db.select().from(kanbanLabels).where(eq(kanbanLabels.projectId, source.id));
        if (srcLabels.length > 0) {
          await db.insert(kanbanLabels).values(srcLabels.map(l => ({
            projectId: row.id,
            name: l.name,
            color: l.color,
          })));
        }
        const srcTemplates = await db.select().from(cardTemplates).where(eq(cardTemplates.projectId, source.id));
        if (srcTemplates.length > 0) {
          await db.insert(cardTemplates).values(srcTemplates.map(t => ({
            clientId,
            projectId: row.id,
            name: t.name,
            description: t.description,
            payload: t.payload,
            createdBy: ctx.userId,
          })));
        }
      }

      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'projects_update',
    {
      title: 'Update project',
      description: 'Update a project by id (name, description, status, dates).',
      inputSchema: {
        id: z.number(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['active', 'paused', 'completed', 'archived']).optional(),
        dueDate: z.string().optional().describe('ISO date'),
      },
    },
    async (args) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (args.name !== undefined) patch.name = args.name;
      if (args.description !== undefined) patch.description = args.description;
      if (args.status !== undefined) patch.status = args.status;
      if (args.dueDate !== undefined) patch.dueDate = new Date(args.dueDate);
      const [row] = await db.update(projects).set(patch)
        .where(and(eq(projects.id, args.id), eq(projects.clientId, clientId)))
        .returning();
      if (row) revalidateForWrite('portal');
      return json(row ?? { error: 'Not found' });
    }
  );


  // ── PROJECT MEMBERS ────────────────────────────────────────────────────
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'project_members_list',
    {
      title: 'List project members',
      description: "List members and their roles for a project. Roles are owner, editor, commenter, viewer. Staff users (admin/employee) have implicit owner-equivalent access on every project regardless of membership rows.",
      inputSchema: {
        projectId: z.coerce.number(),
      },
    },
    async ({ projectId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });
      const rows = await db
        .select({
          id: projectMembers.id,
          userId: projectMembers.userId,
          role: projectMembers.role,
          addedAt: projectMembers.addedAt,
          name: users.name,
          email: users.email,
        })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, projectId));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'project_members_set',
    {
      title: 'Add or update a project member',
      description: 'Add a user to a project, or change their role if already a member. Idempotent. Only owners can call this.',
      inputSchema: {
        projectId: z.coerce.number(),
        userId: z.coerce.number(),
        role: z.enum(['owner', 'editor', 'commenter', 'viewer']),
      },
    },
    async ({ projectId, userId, role }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!ROLE_OPTIONS.includes(role)) return json({ error: 'Invalid role' });
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });
      // Caller must be project owner. Staff users skip the check (implicit owner).
      if (ctx.userId) {
        const [callerMember] = await db.select({ role: projectMembers.role })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, ctx.userId)))
          .limit(1);
        if (callerMember?.role !== 'owner') return json({ error: 'Only project owners can manage members' });
      }
      const [row] = await db.insert(projectMembers).values({
        projectId,
        userId,
        role: role as ProjectRole,
        addedBy: ctx.userId,
      }).onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: { role: role as ProjectRole, addedBy: ctx.userId },
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'project_members_remove',
    {
      title: 'Remove a project member',
      description: 'Remove a user from a project. Refuses to remove the last owner.',
      inputSchema: {
        projectId: z.coerce.number(),
        userId: z.coerce.number(),
      },
    },
    async ({ projectId, userId }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      const [proj] = await db.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
      if (!proj) return json({ error: 'Project not found' });
      if (ctx.userId) {
        const [callerMember] = await db.select({ role: projectMembers.role })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, ctx.userId)))
          .limit(1);
        if (callerMember?.role !== 'owner') return json({ error: 'Only project owners can manage members' });
      }
      const [target] = await db.select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      if (!target) return json({ error: 'Member not found' });
      if (target.role === 'owner') {
        const owners = await db.select({ id: projectMembers.id })
          .from(projectMembers)
          .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.role, 'owner')));
        if (owners.length <= 1) return json({ error: 'Cannot remove the sole owner; promote another member first' });
      }
      await db.delete(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
      revalidateForWrite('portal');
      return json({ ok: true });
    }
  );

  // ── MY TASKS ───────────────────────────────────────────────────────────
  // Convenience read for the authenticated user's own kanban work across the
  // client's projects — mirrors the /portal/my-tasks page.
  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'my_tasks_list',
    {
      title: 'List my assigned tasks',
      description:
        "List kanban cards assigned to the authenticated user across the client's projects. Includes project, column, priority, and due date.",
      inputSchema: {
        openOnly: z.boolean().optional().describe('Default true — exclude cards in done columns.'),
      },
    },
    async ({ openOnly = true }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      const rows = await db
        .select({
          id: kanbanCards.id,
          number: kanbanCards.number,
          title: kanbanCards.title,
          priority: kanbanCards.priority,
          dueDate: kanbanCards.dueDate,
          projectId: kanbanCards.projectId,
          projectName: projects.name,
          projectKey: projects.projectKey,
          columnId: kanbanCards.columnId,
          columnName: kanbanColumns.name,
          columnIsDone: kanbanColumns.isDone,
        })
        .from(kanbanCardAssignees)
        .innerJoin(kanbanCards, eq(kanbanCards.id, kanbanCardAssignees.cardId))
        .innerJoin(projects, eq(projects.id, kanbanCards.projectId))
        .leftJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
        .where(and(
          eq(kanbanCardAssignees.userId, ctx.userId),
          eq(projects.clientId, clientId),
        ));
      const filtered = openOnly ? rows.filter(r => !r.columnIsDone) : rows;
      return json(filtered);
    }
  );

  // ── PROJECT ARTIFACTS ──────────────────────────────────────────────────
  // Polymorphic artifact links from a project. Mirrors the kanban-card and
  // crm-deal artifact patterns: caller picks an artifact type + id, we verify
  // the artifact belongs to this client, then we insert a project_artifacts
  // row with a snapshotted display title for cheap renders. Posts are scoped
  // via website (clientWebsites.clientId), so they get their own indirect
  // ownership check rather than a direct artifact.clientId comparison.
  const PROJECT_ARTIFACT_TABLES: Record<string, { table: AnyPgTable & Record<string, AnyColumn>; titleField: string }> = {
    website: { table: clientWebsites, titleField: 'name' },
    email_campaign: { table: emailCampaigns, titleField: 'name' },
    pitch_deck: { table: pitchDecks, titleField: 'title' },
    proposal: { table: crmProposals, titleField: 'title' },
    booking: { table: bookingPages, titleField: 'title' },
    survey: { table: surveys, titleField: 'title' },
    brain_note: { table: brainNotes, titleField: 'title' },
  };
  const PROJECT_ARTIFACT_TYPE_ENUM = z.enum([
    'website', 'email_campaign', 'pitch_deck', 'proposal',
    'booking', 'survey', 'post', 'brain_note',
  ]);

  async function authorizeProjectForClient(projectId: number) {
    const [proj] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId))).limit(1);
    return proj ?? null;
  }

  hasScope(ctx.scopes, 'projects:read') && server.registerTool(
    'projects_artifacts_list',
    {
      title: 'List artifacts linked to a project',
      description: 'List every artifact (website, email campaign, pitch deck, proposal, booking, survey, post, brain note) linked to a project.',
      inputSchema: { projectId: z.number() },
    },
    async ({ projectId }) => {
      if (!requireScope(ctx, 'projects:read')) return denied('projects:read');
      if (!(await authorizeProjectForClient(projectId))) return json({ error: 'Project not found' });
      const rows = await db.select().from(projectArtifacts)
        .where(eq(projectArtifacts.projectId, projectId))
        .orderBy(desc(projectArtifacts.pinned), desc(projectArtifacts.createdAt));
      return json(rows);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'projects_artifact_link',
    {
      title: 'Link an artifact to a project',
      description: 'Attach a website, email campaign, pitch deck, proposal, booking, survey, post, or brain note to a project. The artifact must belong to this client (posts are scoped via their parent website).',
      inputSchema: {
        projectId: z.number(),
        artifactType: PROJECT_ARTIFACT_TYPE_ENUM,
        artifactId: z.number(),
        pinned: z.boolean().optional(),
      },
    },
    async ({ projectId, artifactType, artifactId, pinned }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeProjectForClient(projectId))) return json({ error: 'Project not found' });

      let title: string | null = null;
      if (artifactType === 'post') {
        // Posts have no clientId; they're scoped via websiteId → clientWebsites.clientId.
        // Posts with websiteId=null are global/admin and excluded here.
        const [row] = await db
          .select({ title: posts.title, postType: posts.postType })
          .from(posts)
          .innerJoin(clientWebsites, eq(clientWebsites.id, posts.websiteId))
          .where(and(eq(posts.id, artifactId), eq(clientWebsites.clientId, clientId)))
          .limit(1);
        if (!row) return json({ error: 'Artifact not found or not owned by this client' });
        title = row.postType && row.postType !== 'blog'
          ? `${row.title} (${row.postType})`
          : row.title;
      } else {
        const config = PROJECT_ARTIFACT_TABLES[artifactType];
        const [source] = await db.select({ title: config.table[config.titleField] })
          .from(config.table)
          .where(and(eq(config.table.id, artifactId), eq(config.table.clientId, clientId)));
        if (!source) return json({ error: 'Artifact not found or not owned by this client' });
        title = source.title;
      }

      const [row] = await db.insert(projectArtifacts).values({
        projectId,
        artifactType,
        artifactId,
        displayTitle: title || 'Untitled',
        pinned: pinned ?? false,
        createdBy: ctx.userId,
      }).returning();
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'projects_artifact_toggle_pin',
    {
      title: 'Pin or unpin a project artifact',
      description: 'Update the pinned flag on a linked project artifact.',
      inputSchema: { projectId: z.number(), artifactDbId: z.number(), pinned: z.boolean() },
    },
    async ({ projectId, artifactDbId, pinned }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeProjectForClient(projectId))) return json({ error: 'Project not found' });
      const [row] = await db.update(projectArtifacts).set({ pinned })
        .where(and(eq(projectArtifacts.id, artifactDbId), eq(projectArtifacts.projectId, projectId)))
        .returning();
      if (!row) return json({ error: 'Artifact link not found' });
      revalidateForWrite('portal');
      return json(row);
    }
  );

  hasScope(ctx.scopes, 'projects:write') && server.registerTool(
    'projects_artifact_unlink',
    {
      title: 'Unlink an artifact from a project',
      description: 'Remove an artifact link from a project. Deletes the link row; the underlying artifact is not touched.',
      inputSchema: { projectId: z.number(), artifactDbId: z.number() },
    },
    async ({ projectId, artifactDbId }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!(await authorizeProjectForClient(projectId))) return json({ error: 'Project not found' });
      const [row] = await db.delete(projectArtifacts)
        .where(and(eq(projectArtifacts.id, artifactDbId), eq(projectArtifacts.projectId, projectId)))
        .returning();
      if (!row) return json({ error: 'Artifact link not found' });
      revalidateForWrite('portal');
      return json(row);
    }
  );

  // Stage an artifact-link suggestion for human review instead of writing it
  // directly. Lands in brain_ai_review_items with proposedType
  // 'project_artifact_link'. The union member is added in a parallel work
  // unit; cast keeps this file compiling until that lands.
  (hasScope(ctx.scopes, 'projects:write') && hasScope(ctx.scopes, 'brain:write')) && server.registerTool(
    'projects_propose_artifact_link',
    {
      title: 'Propose linking an artifact to a project (lands in the brain review queue)',
      description: "Stage a suggested project↔artifact link as a pending AI review item — visible in the brain review queue for a human to approve, edit, or reject. Prefer this over projects_artifact_link when the suggestion came from analysis the user hasn't directly authorized.",
      inputSchema: {
        projectId: z.number(),
        artifactType: PROJECT_ARTIFACT_TYPE_ENUM,
        artifactId: z.number(),
        pinned: z.boolean().optional(),
        rationale: z.string().optional(),
      },
    },
    async ({ projectId, artifactType, artifactId, pinned, rationale }) => {
      if (!requireScope(ctx, 'projects:write')) return denied('projects:write');
      if (!requireScope(ctx, 'brain:write')) return denied('brain:write');
      if (!(await authorizeProjectForClient(projectId))) return json({ error: 'Project not found' });
      const [item] = await db.insert(brainAiReviewItems).values({
        clientId,
        sourceType: 'manual',
        sourceId: projectId,
        proposedType: 'project_artifact_link' as BrainReviewItemType,
        proposedPayload: {
          projectId,
          artifactType,
          artifactId,
          pinned: pinned ?? false,
          rationale,
        },
        status: 'pending',
      }).returning();
      return json(item);
    }
  );
}
