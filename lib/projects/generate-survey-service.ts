/**
 * PUX-033 step 2 — tenancy-scoped service that turns a project into a
 * generated survey: loads the project + its cards (scoped by clientId),
 * hands the snapshot to `buildProjectSurvey` (step 1, DB-free), persists the
 * result exactly the way `surveys_create` does (`lib/mcp/tools/surveys.ts`),
 * mints an approval link the way `surveys_create` does, and links the survey
 * to the project as an artifact the way `POST /api/portal/projects/[id]/artifacts`
 * does.
 *
 * `createApprovalLink` expects a full `PortalMcpContext` (it reads
 * `ctx.client.id` / `ctx.userId` / `ctx.keyId` / `ctx.credentialKind`). A
 * session-authenticated REST route has no MCP key, so this builds a
 * *synthetic* context the same way `app/api/portal/ai/chat/route.ts` already
 * does for `stageOrApply` (see its "UAG-003" comment) — that's a sanctioned
 * pattern, not a workaround: `PortalMcpContext.client`'s own doc comment
 * calls out "REST/mobile bearer path, synthetic gate contexts" as a normal
 * source for this shape, and `keyId: null` is documented as "the caller is a
 * portal *session* (no API key / OAuth token)".
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  projects,
  kanbanCards,
  kanbanColumns,
  surveys,
  projectArtifacts,
  kanbanCardArtifacts,
  clients,
} from '@/lib/db/schema';
import type { SurveyFieldDef } from '@/lib/db/schema';
import type { PortalMcpContext } from '@/lib/mcp-auth';
import { createApprovalLink, approvalEnvelope } from '@/lib/mcp/approval-links';
import { slugify } from '@/lib/publishing/slug';
import {
  buildProjectSurvey,
  type ProjectSurveyPreset,
  type ProjectSurveySnapshot,
} from './generate-survey';

export interface GenerateProjectSurveyArgs {
  clientId: number;
  projectId: number;
  preset: ProjectSurveyPreset;
  createdByUserId: number;
  /** Injected "today" for a dated title — see ProjectSurveyOptions.date. */
  date?: string;
}

export interface GenerateProjectSurveyOk {
  ok: true;
  survey: { id: number; slug: string; title: string; status: string };
  approvalUrl: string | null;
  publicPath: string;
  artifactId: number;
  reviewedCardIds: number[];
}

export interface GenerateProjectSurveyNotFound {
  ok: false;
  reason: 'not_found';
}

export type GenerateProjectSurveyResult = GenerateProjectSurveyOk | GenerateProjectSurveyNotFound;

export async function generateProjectSurvey(
  args: GenerateProjectSurveyArgs,
): Promise<GenerateProjectSurveyResult> {
  const { clientId, projectId, preset, createdByUserId, date } = args;

  // Tenancy: the project must belong to THIS client, or this doesn't exist
  // for the caller — never leak a 200/leak-shaped response for someone
  // else's project.
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
      dueDate: projects.dueDate,
      clientId: projects.clientId,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.clientId, clientId)))
    .limit(1);
  if (!project) return { ok: false, reason: 'not_found' };

  // Cards are loaded only through the already-verified project — projectId
  // here is the id we just confirmed belongs to clientId, so this join can't
  // pull another tenant's cards in.
  const cardRows = await db
    .select({
      id: kanbanCards.id,
      title: kanbanCards.title,
      columnName: kanbanColumns.name,
      isDone: kanbanColumns.isDone,
      workflowState: kanbanCards.workflowState,
    })
    .from(kanbanCards)
    .innerJoin(kanbanColumns, eq(kanbanCards.columnId, kanbanColumns.id))
    .where(eq(kanbanCards.projectId, project.id));

  const snapshot: ProjectSurveySnapshot = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      dueDate: project.dueDate ? project.dueDate.toISOString() : null,
    },
    cards: cardRows.map((c) => ({
      id: c.id,
      title: c.title,
      columnName: c.columnName,
      isDone: c.isDone,
      workflowState: c.workflowState,
    })),
  };

  const built = buildProjectSurvey(preset, snapshot, { date });

  // Persist exactly the way surveys_create does (lib/mcp/tools/surveys.ts,
  // ~line 206-244): same slug pattern, status stays 'draft', same field set.
  const baseSlug = slugify(built.title.trim());
  const slug = `${baseSlug}-${Date.now().toString(36)}`;
  const [surveyRow] = await db
    .insert(surveys)
    .values({
      clientId,
      title: built.title.trim(),
      slug,
      description: built.description?.trim() || null,
      fields: built.fields as SurveyFieldDef[],
      thankYouTitle: built.thankYouTitle,
      thankYouMessage: built.thankYouMessage,
      requireEmail: built.requireEmail,
      allowMultiple: built.allowMultiple,
      createdBy: createdByUserId,
    })
    .returning();

  // Synthetic PortalMcpContext — see file-header comment. `client` must be
  // the FULL row createApprovalLink persists (clientId), not just its id.
  const [clientRow] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  const gateCtx: PortalMcpContext = {
    userId: createdByUserId,
    client: clientRow,
    scopes: [],
    keyId: null,
    credentialKind: null,
    requireCmsApproval: false,
  };
  const approval = approvalEnvelope(
    await createApprovalLink({
      ctx: gateCtx,
      entityType: 'survey',
      entityId: surveyRow.id,
      summary: `Survey "${surveyRow.title}"`,
    }),
  );

  // Link the survey to the project as an artifact — same insert shape as
  // POST /api/portal/projects/[id]/artifacts. We already have the survey row
  // we just inserted, so this skips that route's re-lookup-for-title step
  // but writes the identical columns.
  const [artifact] = await db
    .insert(projectArtifacts)
    .values({
      projectId: project.id,
      artifactType: 'survey',
      artifactId: surveyRow.id,
      displayTitle: surveyRow.title || 'Untitled',
      pinned: false,
      createdBy: createdByUserId,
    })
    .returning();

  // qa_review only: link the survey onto each reviewed card too, the same
  // plain-insert shape kanban_card_artifact_link uses
  // (lib/mcp/tools/kanban-artifacts.ts:84-95).
  const reviewedCardIds = built.meta?.reviewedCardIds ?? [];
  if (reviewedCardIds.length > 0) {
    await db.insert(kanbanCardArtifacts).values(
      reviewedCardIds.map((cardId) => ({
        cardId,
        artifactType: 'survey',
        artifactId: surveyRow.id,
        displayTitle: surveyRow.title || 'Untitled',
        pinned: false,
        createdBy: createdByUserId,
      })),
    );
  }

  return {
    ok: true,
    survey: { id: surveyRow.id, slug: surveyRow.slug, title: surveyRow.title, status: surveyRow.status },
    approvalUrl: approval?.url ?? null,
    publicPath: `/s/${surveyRow.slug}`,
    artifactId: artifact.id,
    reviewedCardIds,
  };
}
