import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  clientWebsites,
  emailCampaigns,
  pitchDecks,
  crmProposals,
  bookingPages,
  surveys,
  projects,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params; // consume param
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const typeFilter = req.nextUrl.searchParams.get('type');

  const results: { type: string; id: number; title: string }[] = [];

  async function fetchType(type: string, table: any, titleField: string) {
    if (typeFilter && typeFilter !== type) return;
    const rows = await db.select({ id: table.id, title: table[titleField] }).from(table).where(eq(table.clientId, client!.id));
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
