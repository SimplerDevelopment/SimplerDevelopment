import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  crmDeals,
  crmDealArtifacts,
  clientWebsites,
  emailCampaigns,
  pitchDecks,
  crmProposals,
  bookingPages,
  surveys,
  projects,
  brainNotes,
} from '@/lib/db/schema';
import { and, eq, desc, isNull } from 'drizzle-orm';

const ARTIFACT_TABLES: Record<string, { table: any; titleField: string }> = {
  website: { table: clientWebsites, titleField: 'name' },
  email_campaign: { table: emailCampaigns, titleField: 'name' },
  pitch_deck: { table: pitchDecks, titleField: 'title' },
  proposal: { table: crmProposals, titleField: 'title' },
  booking: { table: bookingPages, titleField: 'title' },
  survey: { table: surveys, titleField: 'title' },
  project: { table: projects, titleField: 'name' },
  brain_note: { table: brainNotes, titleField: 'title' },
};

async function getAuthedDeal(dealId: number) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };

  const [deal] = await db.select({ id: crmDeals.id }).from(crmDeals)
    .where(and(eq(crmDeals.id, dealId), eq(crmDeals.clientId, client.id)));
  if (!deal) return { error: NextResponse.json({ success: false, message: 'Deal not found' }, { status: 404 }) };

  return { client, userId, deal };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedDeal(dealId);
  if ('error' in result) return result.error;

  const artifacts = await db
    .select()
    .from(crmDealArtifacts)
    .where(eq(crmDealArtifacts.dealId, dealId))
    .orderBy(desc(crmDealArtifacts.pinned), desc(crmDealArtifacts.createdAt));

  return NextResponse.json({ success: true, data: artifacts });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedDeal(dealId);
  if ('error' in result) return result.error;

  const body = await req.json();
  const { artifactType, artifactId } = body;

  if (!artifactType || !artifactId || !ARTIFACT_TABLES[artifactType]) {
    return NextResponse.json({ success: false, message: 'Valid artifactType and artifactId required' }, { status: 400 });
  }

  // Look up the display title from the source table; enforce tenant ownership
  // so a caller can't attach another client's artifact to their deal.
  const config = ARTIFACT_TABLES[artifactType];
  const baseWhere = and(eq(config.table.id, artifactId), eq(config.table.clientId, result.client.id));
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
  const displayTitle = source.title || body.displayTitle || 'Untitled';

  const [artifact] = await db
    .insert(crmDealArtifacts)
    .values({
      dealId,
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
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedDeal(dealId);
  if ('error' in result) return result.error;

  const body = await req.json();
  const { artifactDbId, pinned } = body;

  if (!artifactDbId || pinned === undefined) {
    return NextResponse.json({ success: false, message: 'artifactDbId and pinned required' }, { status: 400 });
  }

  const [updated] = await db
    .update(crmDealArtifacts)
    .set({ pinned })
    .where(and(eq(crmDealArtifacts.id, artifactDbId), eq(crmDealArtifacts.dealId, dealId)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const dealId = parseInt(id, 10);
  if (isNaN(dealId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const result = await getAuthedDeal(dealId);
  if ('error' in result) return result.error;

  const body = await req.json();
  const [deleted] = await db
    .delete(crmDealArtifacts)
    .where(and(eq(crmDealArtifacts.id, body.artifactDbId), eq(crmDealArtifacts.dealId, dealId)))
    .returning();

  if (!deleted) return NextResponse.json({ success: false, message: 'Artifact not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
