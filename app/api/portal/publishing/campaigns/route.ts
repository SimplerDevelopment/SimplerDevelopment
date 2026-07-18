// Publishing Command Center — campaigns list + create.
//
// GET  /api/portal/publishing/campaigns       → list campaigns for this client
// POST /api/portal/publishing/campaigns       → create a campaign (gate: manage_campaigns)

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { publishingCampaigns, kanbanCards } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getPublishingSession, isRedirectError } from '@/lib/publishing/active-client';
import { checkPublishingPermission } from '@/lib/publishing/permissions';
import { slugify } from '@/lib/publishing/slug';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getPublishingSession();
    const rows = await db
      .select({
        id: publishingCampaigns.id,
        name: publishingCampaigns.name,
        slug: publishingCampaigns.slug,
        description: publishingCampaigns.description,
        color: publishingCampaigns.color,
        startDate: publishingCampaigns.startDate,
        endDate: publishingCampaigns.endDate,
        status: publishingCampaigns.status,
        createdAt: publishingCampaigns.createdAt,
        updatedAt: publishingCampaigns.updatedAt,
        cardCount: sql<number>`COUNT(${kanbanCards.id})::int`,
      })
      .from(publishingCampaigns)
      .leftJoin(kanbanCards, eq(kanbanCards.campaignId, publishingCampaigns.id))
      .where(eq(publishingCampaigns.clientId, session.clientId))
      .groupBy(publishingCampaigns.id)
      .orderBy(publishingCampaigns.createdAt);
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    if (isRedirectError(error)) throw error; // let next emit the 307 (no session / no client)
    console.error('publishing campaigns GET failed:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load campaigns' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, message: 'invalid body' },
        { status: 400 },
      );
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json(
        { success: false, message: 'name is required' },
        { status: 400 },
      );
    }

    const requestedSlug =
      typeof body.slug === 'string' && body.slug.trim() ? slugify(body.slug) : slugify(name);
    // Disambiguate slug if a campaign already exists with this slug for this client.
    const slug = await uniqueSlug(session.clientId, requestedSlug);

    const description = typeof body.description === 'string' ? body.description : null;
    const color = typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)
      ? body.color
      : '#6366f1';
    const startDate = parseDate(body.startDate);
    const endDate = parseDate(body.endDate);
    const status = ['active', 'completed', 'archived'].includes(body.status)
      ? body.status
      : 'active';

    const [row] = await db
      .insert(publishingCampaigns)
      .values({
        clientId: session.clientId,
        name,
        slug,
        description,
        color,
        startDate,
        endDate,
        status,
        createdBy: session.userId,
      })
      .returning();
    return NextResponse.json({ success: true, data: row }, { status: 201 });
  } catch (error) {
    if (isRedirectError(error)) throw error; // let next emit the 307 (no session / no client)
    console.error('publishing campaigns POST failed:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to create campaign' },
      { status: 500 },
    );
  }
}

function parseDate(input: unknown): Date | null {
  if (typeof input !== 'string' || !input) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

async function uniqueSlug(clientId: number, base: string): Promise<string> {
  let candidate = base || 'campaign';
  let n = 1;
  // Try the base first, then base-2, base-3, … until unique. Bounded so a
  // malicious input doesn't cause an open-ended loop.
  while (n < 100) {
    const [existing] = await db
      .select({ id: publishingCampaigns.id })
      .from(publishingCampaigns)
      .where(and(eq(publishingCampaigns.clientId, clientId), eq(publishingCampaigns.slug, candidate)))
      .limit(1);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base || 'campaign'}-${n}`;
  }
  // Fallback: timestamp suffix. Extremely unlikely path.
  return `${base || 'campaign'}-${Date.now()}`;
}
