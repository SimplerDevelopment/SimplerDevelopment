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
} from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';

const ARTIFACT_TABLES: Record<string, { table: any; titleField: string }> = {
  website: { table: clientWebsites, titleField: 'name' },
  email_campaign: { table: emailCampaigns, titleField: 'name' },
  pitch_deck: { table: pitchDecks, titleField: 'title' },
  proposal: { table: crmProposals, titleField: 'title' },
  booking: { table: bookingPages, titleField: 'title' },
  survey: { table: surveys, titleField: 'title' },
  project: { table: projects, titleField: 'name' },
};

function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
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

  if (!artifactType || !artifactId || !ARTIFACT_TABLES[artifactType]) {
    return NextResponse.json({ success: false, message: 'Valid artifactType and artifactId required' }, { status: 400 });
  }

  // Enforce tenant ownership: artifact must belong to the task's project's client
  const config = ARTIFACT_TABLES[artifactType];
  const [source] = await db
    .select({ title: config.table[config.titleField] })
    .from(config.table)
    .where(and(eq(config.table.id, artifactId), eq(config.table.clientId, result.clientId)));
  if (!source) {
    return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });
  }
  const displayTitle = source.title || body.displayTitle || 'Untitled';

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
