import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  kanbanCards,
  projects,
  clientWebsites,
  emailCampaigns,
  pitchDecks,
  crmProposals,
  bookingPages,
  surveys,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function getRole(session: any): string {
  return (session as unknown as { user?: { role?: string } })?.user?.role ?? '';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cardId = parseInt(id, 10);
  if (isNaN(cardId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const userId = parseInt(session.user.id, 10);

  const [card] = await db.select({ id: kanbanCards.id, projectId: kanbanCards.projectId }).from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
  if (!card) return NextResponse.json({ success: false, message: 'Card not found' }, { status: 404 });

  const [project] = await db.select({ id: projects.id, clientId: projects.clientId }).from(projects).where(eq(projects.id, card.projectId)).limit(1);
  if (!project) return NextResponse.json({ success: false, message: 'Project not found' }, { status: 404 });

  const role = getRole(session);
  if (role !== 'admin' && role !== 'employee') {
    const client = await getPortalClient(userId);
    if (!client || client.id !== project.clientId) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
  }

  const clientId = project.clientId;
  const typeFilter = req.nextUrl.searchParams.get('type');

  const results: { type: string; id: number; title: string }[] = [];

  async function fetchType(type: string, table: any, titleField: string) {
    if (typeFilter && typeFilter !== type) return;
    const rows = await db.select({ id: table.id, title: table[titleField] }).from(table).where(eq(table.clientId, clientId));
    for (const r of rows) {
      results.push({ type, id: r.id, title: r.title ?? 'Untitled' });
    }
  }

  await Promise.all([
    fetchType('website', clientWebsites, 'name'),
    fetchType('email_campaign', emailCampaigns, 'name'),
    fetchType('pitch_deck', pitchDecks, 'title'),
    fetchType('proposal', crmProposals, 'title'),
    fetchType('booking', bookingPages, 'title'),
    fetchType('survey', surveys, 'title'),
    fetchType('project', projects, 'name'),
  ]);

  return NextResponse.json({ success: true, data: results });
}
