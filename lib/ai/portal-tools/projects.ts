/**
 * Project / kanban-card / sprint / file / comment AI tools.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import {
  projects, kanbanColumns, kanbanCards, sprints,
  kanbanCardFiles, kanbanCardComments, kanbanCardAssignees, users,
  kanbanLabels, cardTemplates, projectMembers, crmDeals, crmCompanies,
} from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';

export const projectTools: Anthropic.Tool[] = [
  {
    name: 'get_my_projects',
    description: 'Get all projects for this client with status, due dates, and sprint/card progress summary.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'pm_spawn_project_from_deal',
    description: 'Create a new project for a CRM deal\'s company, optionally cloning the structure (columns + labels + card templates) of an existing template project. Use this as the "deal won → onboarding kanban" automation action. Returns the new project id so subsequent actions can chain off it.',
    input_schema: {
      type: 'object' as const,
      properties: {
        deal_id: { type: 'number', description: 'The CRM deal id; the new project name and description default from the deal.' },
        template_project_id: { type: 'number', description: 'Optional source project to clone columns/labels/templates from.' },
        name_prefix: { type: 'string', description: 'Optional prefix prepended to the deal name (e.g. "Onboarding · "). Defaults to none.' },
      },
      required: ['deal_id'],
    },
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
];

export type ProjectHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const projectHandlers: Record<string, ProjectHandler> = {
  get_my_projects: async (_input, clientId, _userId) => {
    const rows = await db.select().from(projects).where(eq(projects.clientId, clientId)).orderBy(desc(projects.createdAt));
    return rows.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      startDate: p.startDate,
      dueDate: p.dueDate,
    }));
  },

  get_project_board: async (input, clientId, _userId) => {
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
  },

  get_project_cards: async (input, clientId, _userId) => {
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
      order: kanbanCards.order,
    }).from(kanbanCards).where(eq(kanbanCards.projectId, projectId)).orderBy(kanbanCards.order);

    const cardIds = cards.map(c => c.id);
    const assigneeRows = cardIds.length
      ? await db.select({
          cardId: kanbanCardAssignees.cardId,
          userId: kanbanCardAssignees.userId,
          userName: users.name,
        }).from(kanbanCardAssignees)
          .innerJoin(users, eq(users.id, kanbanCardAssignees.userId))
          .where(sql`${kanbanCardAssignees.cardId} = ANY(${cardIds})`)
      : [];

    const assigneesByCard = new Map<number, { id: number; name: string }[]>();
    for (const r of assigneeRows) {
      const arr = assigneesByCard.get(r.cardId) ?? [];
      arr.push({ id: r.userId, name: r.userName });
      assigneesByCard.set(r.cardId, arr);
    }

    return cards.map(c => ({
      ...c,
      column: columnMap[c.columnId] ?? 'Unknown',
      assignees: assigneesByCard.get(c.id) ?? [],
    }));
  },

  get_sprint_progress: async (input, clientId, _userId) => {
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
  },

  get_project_files: async (input, clientId, _userId) => {
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
  },

  add_card_comment: async (input, clientId, userId) => {
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
  },

  create_project_card: async (input, clientId, userId) => {
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
  },

  update_project_card: async (input, clientId, _userId) => {
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
  },

  pm_spawn_project_from_deal: async (input, clientId, userId) => {
    // CRM-PM bridge: deal closes → spawn an onboarding project. Designed for
    // the automation engine to call from a `crm.deal.won` rule.
    const dealId = input.deal_id as number;
    const templateProjectId = typeof input.template_project_id === 'number' ? input.template_project_id : null;
    const namePrefix = typeof input.name_prefix === 'string' ? input.name_prefix : '';

    const [deal] = await db.select({
      id: crmDeals.id,
      title: crmDeals.title,
      companyId: crmDeals.companyId,
      clientId: crmDeals.clientId,
    }).from(crmDeals).where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, clientId))).limit(1);
    if (!deal) return { error: 'Deal not found in this account' };

    let companyName: string | null = null;
    if (deal.companyId) {
      const [co] = await db.select({ name: crmCompanies.name }).from(crmCompanies).where(eq(crmCompanies.id, deal.companyId)).limit(1);
      companyName = co?.name ?? null;
    }

    // Verify template ownership if supplied.
    let template: typeof projects.$inferSelect | null = null;
    if (templateProjectId != null) {
      const [src] = await db.select().from(projects)
        .where(and(eq(projects.id, templateProjectId), eq(projects.clientId, clientId))).limit(1);
      if (!src) return { error: 'Template project not found in this account' };
      template = src;
    }

    const baseName = `${namePrefix}${companyName ?? deal.title ?? 'New project'}`.slice(0, 240).trim();
    const basePrefix = baseName.replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'PRJ';

    const [project] = await db.insert(projects).values({
      name: baseName,
      description: `Auto-created from CRM deal #${deal.id}${companyName ? ` for ${companyName}` : ''}.`,
      clientId,
      status: 'active',
      isPrivate: true,
      createdBy: userId,
    }).returning();

    await db.update(projects).set({ projectKey: `${basePrefix}${project.id}` }).where(eq(projects.id, project.id));

    if (userId) {
      await db.insert(projectMembers).values({
        projectId: project.id,
        userId,
        role: 'owner',
        addedBy: userId,
      }).onConflictDoNothing();
    }

    if (template) {
      const srcCols = await db.select().from(kanbanColumns).where(eq(kanbanColumns.projectId, template.id));
      if (srcCols.length > 0) {
        await db.insert(kanbanColumns).values(srcCols.map(c => ({
          projectId: project.id,
          name: c.name,
          order: c.order,
          color: c.color,
          isDone: c.isDone,
          wipLimit: c.wipLimit,
        })));
      }
      const srcLabels = await db.select().from(kanbanLabels).where(eq(kanbanLabels.projectId, template.id));
      if (srcLabels.length > 0) {
        await db.insert(kanbanLabels).values(srcLabels.map(l => ({
          projectId: project.id,
          name: l.name,
          color: l.color,
        })));
      }
      const srcTemplates = await db.select().from(cardTemplates).where(eq(cardTemplates.projectId, template.id));
      if (srcTemplates.length > 0) {
        await db.insert(cardTemplates).values(srcTemplates.map(t => ({
          clientId,
          projectId: project.id,
          name: t.name,
          description: t.description,
          payload: t.payload,
          createdBy: userId,
        })));
      }
    }

    return {
      success: true,
      message: `Project "${baseName}" created${template ? ` from template "${template.name}"` : ''}.`,
      projectId: project.id,
      projectKey: `${basePrefix}${project.id}`,
      clonedFromProjectId: template?.id ?? null,
      dealId: deal.id,
      companyName,
    };
  },

  move_project_card: async (input, clientId, _userId) => {
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
  },
};
