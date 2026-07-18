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
  brainNotes,
} from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import type { AnyPgColumn, AnyPgTable } from 'drizzle-orm/pg-core';

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

  async function fetchType(type: string, table: AnyPgTable, titleField: string) {
    if (typeFilter && typeFilter !== type) return;
    const cols = table as unknown as Record<string, AnyPgColumn>;
    const queryResult = await db
      .select({ id: cols.id, title: cols[titleField] })
      .from(table)
      .where(eq(cols.clientId, client!.id));
    const rows = queryResult as { id: number; title: string | null }[];
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

  // Brain notes — exclude soft-deleted rows; other tables don't have deletedAt
  // so this lives outside the generic fetchType helper.
  if (!typeFilter || typeFilter === 'brain_note') {
    const noteRows = await db
      .select({ id: brainNotes.id, title: brainNotes.title })
      .from(brainNotes)
      .where(and(eq(brainNotes.clientId, client.id), isNull(brainNotes.deletedAt)));
    for (const r of noteRows) {
      results.push({ type: 'brain_note', id: r.id, title: r.title ?? 'Untitled' });
    }
  }

  return NextResponse.json({ success: true, data: results });
}
