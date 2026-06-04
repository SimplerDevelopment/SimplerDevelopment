import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  projects,
  projectArtifacts,
  clientWebsites,
  emailCampaigns,
  pitchDecks,
  crmProposals,
  bookingPages,
  surveys,
  posts,
  brainNotes,
} from '@/lib/db/schema';
import { and, eq, desc, inArray, isNull } from 'drizzle-orm';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ARTIFACT_TABLES: Record<string, { table: any; titleField: string }> = {
  website: { table: clientWebsites, titleField: 'name' },
  email_campaign: { table: emailCampaigns, titleField: 'name' },
  pitch_deck: { table: pitchDecks, titleField: 'title' },
  proposal: { table: crmProposals, titleField: 'title' },
  booking: { table: bookingPages, titleField: 'title' },
  survey: { table: surveys, titleField: 'title' },
  brain_note: { table: brainNotes, titleField: 'title' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

async function getAuthedProject(projectId: number) {
  // Parallelize auth() and the project lookup. The project row doesn't depend
  // on the session, and the staff/client gate runs after both resolve.
  const [session, projectRows] = await Promise.all([
    auth(),
    db
      .select({ id: projects.id, clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
  ]);
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);

  const project = projectRows[0];
  if (!project) return { error: NextResponse.json({ success: false, message: 'Project not found' }, { status: 404 }) };

  const role = getRole(session);
  if (role !== 'admin' && role !== 'employee') {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) {
      return { error: NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 }) };
    }
  }

  return { userId, project, clientId: project.clientId };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedProject(projectId);
  if ('error' in result) return result.error;

  // Pagination — default 100, capped at 200.
  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '100', 10) || 100));
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const offset = (page - 1) * limit;

  const artifacts = await db
    .select()
    .from(projectArtifacts)
    .where(eq(projectArtifacts.projectId, projectId))
    .orderBy(desc(projectArtifacts.pinned), desc(projectArtifacts.createdAt))
    .limit(limit)
    .offset(offset);

  // Short cache for the picker open / tab switch case. Pinned/order changes
  // will be slightly stale for up to 10s; the artifact list is not a
  // collaborative live document and link/unlink is a user-initiated reload.
  return NextResponse.json(
    { success: true, data: artifacts, page, limit },
    { headers: { 'Cache-Control': 'private, max-age=10' } },
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedProject(projectId);
  if ('error' in result) return result.error;

  const body = await req.json();
  const { artifactType, artifactId } = body;

  if (!artifactType || !artifactId) {
    return NextResponse.json({ success: false, message: 'Valid artifactType and artifactId required' }, { status: 400 });
  }

  let displayTitle: string | null = null;

  if (artifactType === 'post') {
    // Posts have no clientId — gate by websiteId belonging to this client.
    const sites = await db
      .select({ id: clientWebsites.id })
      .from(clientWebsites)
      .where(eq(clientWebsites.clientId, result.clientId));
    if (sites.length === 0) {
      return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });
    }
    const [post] = await db
      .select({ title: posts.title })
      .from(posts)
      .where(and(eq(posts.id, artifactId), inArray(posts.websiteId, sites.map((s) => s.id))))
      .limit(1);
    if (!post) {
      return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });
    }
    displayTitle = post.title || body.displayTitle || 'Untitled';
  } else if (ARTIFACT_TABLES[artifactType]) {
    const config = ARTIFACT_TABLES[artifactType];
    // brain_note requires excluding soft-deleted rows.
    const baseWhere = and(eq(config.table.id, artifactId), eq(config.table.clientId, result.clientId));
    const finalWhere = artifactType === 'brain_note'
      ? and(baseWhere, isNull(brainNotes.deletedAt))
      : baseWhere;
    const [source] = await db
      .select({ title: config.table[config.titleField] })
      .from(config.table)
      .where(finalWhere);
    if (!source) {
      return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });
    }
    displayTitle = source.title || body.displayTitle || 'Untitled';
  } else {
    return NextResponse.json({ success: false, message: 'Valid artifactType and artifactId required' }, { status: 400 });
  }

  const [artifact] = await db
    .insert(projectArtifacts)
    .values({
      projectId,
      artifactType,
      artifactId,
      displayTitle: displayTitle ?? 'Untitled',
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
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedProject(projectId);
  if ('error' in result) return result.error;

  const body = await req.json();
  const { artifactDbId, pinned } = body;

  if (!artifactDbId || pinned === undefined) {
    return NextResponse.json({ success: false, message: 'artifactDbId and pinned required' }, { status: 400 });
  }

  const [updated] = await db
    .update(projectArtifacts)
    .set({ pinned })
    .where(and(eq(projectArtifacts.id, artifactDbId), eq(projectArtifacts.projectId, projectId)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedProject(projectId);
  if ('error' in result) return result.error;

  const body = await req.json();
  const [deleted] = await db
    .delete(projectArtifacts)
    .where(and(eq(projectArtifacts.id, body.artifactDbId), eq(projectArtifacts.projectId, projectId)))
    .returning();

  if (!deleted) return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
