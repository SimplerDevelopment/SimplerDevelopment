import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  kanbanCards,
  kanbanCardArtifacts,
  projects,
  clientWebsites,
  emailCampaigns,
  pitchDecks,
  crmProposals,
  bookingPages,
  surveys,
  brainNotes,
  pathCharts,
  agentFlows,
  agentFlowRuns,
} from '@/lib/db/schema';
import { and, eq, desc, isNull } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';

// Types whose ownership or title can't be resolved by the generic
// (clientId + titleField) lookup below and get their own branch instead.
//
// This whole resolution scheme is a hand-duplicated copy of
// lib/mcp/tools/artifact-vocab.ts (not imported — the MCP and REST paths
// evolved separately). Keep both in sync when adding an artifact type.
const INDIRECT_ARTIFACT_TYPES = new Set(['path_chart', 'agent_flow_run']);

const ARTIFACT_TABLES: Record<string, { table: AnyPgTable; titleField: string }> = {
  website: { table: clientWebsites, titleField: 'name' },
  email_campaign: { table: emailCampaigns, titleField: 'name' },
  pitch_deck: { table: pitchDecks, titleField: 'title' },
  proposal: { table: crmProposals, titleField: 'title' },
  booking: { table: bookingPages, titleField: 'title' },
  survey: { table: surveys, titleField: 'title' },
  project: { table: projects, titleField: 'name' },
  brain_note: { table: brainNotes, titleField: 'title' },
};

function getRole(session: unknown): string {
  return (session as { user?: { role?: string } } | null)?.user?.role ?? '';
}

async function getAuthedCard(cardId: number) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);

  const [card] = await db.select({ id: kanbanCards.id, projectId: kanbanCards.projectId }).from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return { error: NextResponse.json({ success: false, message: 'Card not found' }, { status: 404 }) };

  const [project] = await db.select({ id: projects.id, clientId: projects.clientId }).from(projects).where(eq(projects.id, card.projectId)).limit(1);
  if (!project) return { error: NextResponse.json({ success: false, message: 'Project not found' }, { status: 404 }) };

  const role = getRole(session);
  if (role !== 'admin' && role !== 'employee') {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) {
      return { error: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
    }
  }

  return { userId, card, clientId: project.clientId };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cardId = parseInt(id, 10);
  if (isNaN(cardId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedCard(cardId);
  if ('error' in result) return result.error;

  const artifacts = await db
    .select()
    .from(kanbanCardArtifacts)
    .where(eq(kanbanCardArtifacts.cardId, cardId))
    .orderBy(desc(kanbanCardArtifacts.pinned), desc(kanbanCardArtifacts.createdAt));

  return NextResponse.json({ success: true, data: artifacts });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cardId = parseInt(id, 10);
  if (isNaN(cardId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedCard(cardId);
  if ('error' in result) return result.error;

  const body = await req.json();
  const { artifactType, artifactId } = body;

  if (!artifactType || !artifactId || (!INDIRECT_ARTIFACT_TYPES.has(artifactType) && !ARTIFACT_TABLES[artifactType])) {
    return NextResponse.json({ success: false, message: 'Valid artifactType and artifactId required' }, { status: 400 });
  }

  let displayTitle: string;
  if (artifactType === 'agent_flow_run') {
    // Inverse of path_chart below: a run carries clientId directly, so the
    // join is for the display title (a run has no name of its own, only its
    // flow's). Both predicates stay on agent_flow_runs so another tenant's
    // run is not-found rather than found-with-their-flow-name.
    const [run] = await db
      .select({ flowName: agentFlows.name, runId: agentFlowRuns.id })
      .from(agentFlowRuns)
      .innerJoin(agentFlows, eq(agentFlows.id, agentFlowRuns.flowId))
      .where(and(eq(agentFlowRuns.id, artifactId), eq(agentFlowRuns.clientId, result.clientId)))
      .limit(1);
    if (!run) {
      return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });
    }
    // Run id in the title: a card can link several runs of the same flow
    // (rework loop, retry), and three identical labels tell a reader nothing.
    displayTitle = `${run.flowName} — run #${run.runId}`;
  } else if (artifactType === 'path_chart') {
    // Path charts have no clientId column; ownership flows through their
    // parent project (projectId -> projects.clientId), the same indirect
    // pattern brain_note's soft-delete gate uses below.
    const [chart] = await db
      .select({ title: pathCharts.title })
      .from(pathCharts)
      .innerJoin(projects, eq(projects.id, pathCharts.projectId))
      .where(and(eq(pathCharts.id, artifactId), eq(projects.clientId, result.clientId)))
      .limit(1);
    if (!chart) {
      return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });
    }
    displayTitle = chart.title || body.displayTitle || 'Untitled';
  } else {
    // Enforce tenant ownership: artifact must belong to the task's project's client
    const config = ARTIFACT_TABLES[artifactType];
    const tableCols = config.table as unknown as Record<string, AnyPgColumn>;
    const baseWhere = and(eq(tableCols.id, artifactId), eq(tableCols.clientId, result.clientId));
    const finalWhere = artifactType === 'brain_note'
      ? and(baseWhere, isNull(brainNotes.deletedAt))
      : baseWhere;
    const [source] = await db
      .select({ title: tableCols[config.titleField] })
      .from(config.table)
      .where(finalWhere);
    if (!source) {
      return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });
    }
    displayTitle = source.title || body.displayTitle || 'Untitled';
  }

  const [artifact] = await db
    .insert(kanbanCardArtifacts)
    .values({
      cardId,
      artifactType,
      artifactId,
      displayTitle,
      pinned: body.pinned ?? false,
      createdBy: result.userId,
    })
    .returning();

  return NextResponse.json({ success: true, data: artifact }, { status: 201 });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cardId = parseInt(id, 10);
  if (isNaN(cardId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedCard(cardId);
  if ('error' in result) return result.error;

  const body = await req.json();
  const { artifactDbId, pinned } = body;

  if (!artifactDbId || pinned === undefined) {
    return NextResponse.json({ success: false, message: 'artifactDbId and pinned required' }, { status: 400 });
  }

  const [updated] = await db
    .update(kanbanCardArtifacts)
    .set({ pinned })
    .where(and(eq(kanbanCardArtifacts.id, artifactDbId), eq(kanbanCardArtifacts.cardId, cardId)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cardId = parseInt(id, 10);
  if (isNaN(cardId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedCard(cardId);
  if ('error' in result) return result.error;

  const body = await req.json();
  const [deleted] = await db
    .delete(kanbanCardArtifacts)
    .where(and(eq(kanbanCardArtifacts.id, body.artifactDbId), eq(kanbanCardArtifacts.cardId, cardId)))
    .returning();

  if (!deleted) return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
