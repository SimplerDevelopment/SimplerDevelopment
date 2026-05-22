// Publishing Command Center — single-campaign read/update/delete.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { publishingCampaigns, kanbanCards } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPublishingSession } from '@/lib/publishing/active-client';
import { checkPublishingPermission } from '@/lib/publishing/permissions';

export const dynamic = 'force-dynamic';

async function loadCampaign(clientId: number, id: number) {
  const [row] = await db
    .select()
    .from(publishingCampaigns)
    .where(and(eq(publishingCampaigns.id, id), eq(publishingCampaigns.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getPublishingSession();
    const { id } = await params;
    const campaign = await loadCampaign(session.clientId, parseInt(id, 10));
    if (!campaign) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    console.error('publishing campaigns GET[id] failed:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load campaign' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getPublishingSession();
    const perm = await checkPublishingPermission(
      { userId: session.userId, clientId: session.clientId, isStaff: session.isStaff },
      'manage_campaigns',
    );
    if (!perm.granted) {
      return NextResponse.json(
        { success: false, message: `forbidden (${perm.reason})` },
        { status: 403 },
      );
    }

    const { id } = await params;
    const campaignId = parseInt(id, 10);
    const existing = await loadCampaign(session.clientId, campaignId);
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, message: 'invalid body' },
        { status: 400 },
      );
    }

    const updates: Partial<typeof publishingCampaigns.$inferInsert> = { updatedAt: new Date() };
    if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
    if (typeof body.description === 'string' || body.description === null) updates.description = body.description;
    if (typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)) updates.color = body.color;
    if (body.startDate === null) updates.startDate = null;
    else if (typeof body.startDate === 'string') {
      const d = new Date(body.startDate);
      if (!isNaN(d.getTime())) updates.startDate = d;
    }
    if (body.endDate === null) updates.endDate = null;
    else if (typeof body.endDate === 'string') {
      const d = new Date(body.endDate);
      if (!isNaN(d.getTime())) updates.endDate = d;
    }
    if (['active', 'completed', 'archived'].includes(body.status)) updates.status = body.status;

    const [row] = await db
      .update(publishingCampaigns)
      .set(updates)
      .where(and(eq(publishingCampaigns.id, campaignId), eq(publishingCampaigns.clientId, session.clientId)))
      .returning();
    return NextResponse.json({ success: true, data: row });
  } catch (error) {
    console.error('publishing campaigns PATCH[id] failed:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to update campaign' },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getPublishingSession();
    const perm = await checkPublishingPermission(
      { userId: session.userId, clientId: session.clientId, isStaff: session.isStaff },
      'manage_campaigns',
    );
    if (!perm.granted) {
      return NextResponse.json(
        { success: false, message: `forbidden (${perm.reason})` },
        { status: 403 },
      );
    }

    const { id } = await params;
    const campaignId = parseInt(id, 10);
    const existing = await loadCampaign(session.clientId, campaignId);
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }

    // No FK cascade on kanban_cards.campaign_id — manually null it out.
    await db
      .update(kanbanCards)
      .set({ campaignId: null })
      .where(eq(kanbanCards.campaignId, campaignId));

    await db
      .delete(publishingCampaigns)
      .where(and(eq(publishingCampaigns.id, campaignId), eq(publishingCampaigns.clientId, session.clientId)));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('publishing campaigns DELETE[id] failed:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to delete campaign' },
      { status: 500 },
    );
  }
}
