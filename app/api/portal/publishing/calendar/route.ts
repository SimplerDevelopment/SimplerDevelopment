// Publishing Command Center — calendar feed.
//
// GET /api/portal/publishing/calendar?start=ISO&end=ISO
//
// Returns the publishing cards whose `scheduled_for` falls in the requested
// range, scoped to the per-client publishing project. Cards without a
// `scheduled_for` value are excluded — they belong on the board, not the
// calendar.
//
// For each card we surface:
//   - the current column (stage) name, so the calendar entry can show whether
//     the artifact is still in Draft / In Review / Scheduled / Published,
//   - the most-recent linked artifact (artifactType + displayTitle) so the
//     entry can render the channel icon + accurate title,
//   - the linked campaign (id, name, color) so cross-channel groupings can
//     reuse the campaign chip color from the board.
//
// Tenancy: resolved via getPublishingSession() — the only authority on which
// client's project the calling user can see. Every row is filtered by
// projectId = session.project.id, which is itself keyed to clientId.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  kanbanCards,
  kanbanCardArtifacts,
  kanbanColumns,
  publishingCampaigns,
} from '@/lib/db/schema';
import { and, eq, gte, lte, isNotNull, inArray, desc } from 'drizzle-orm';
import { getPublishingSession, isRedirectError } from '@/lib/publishing/active-client';

export const dynamic = 'force-dynamic';

interface PublishingCalendarEntry {
  id: number;
  title: string;
  date: string; // ISO scheduledFor
  artifactType: string | null;
  artifactTitle: string | null;
  columnName: string;
  campaign: { id: number; name: string; color: string } | null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getPublishingSession();
    const projectId = session.project.id;

    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!start || !end) {
      return NextResponse.json(
        { success: false, message: 'start and end query params are required (ISO dates)' },
        { status: 400 },
      );
    }

    const startDate = new Date(start);
    const endDate = new Date(end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { success: false, message: 'start and end must be valid ISO dates' },
        { status: 400 },
      );
    }

    // 1. Pull every card on this project that has a scheduled_for date in range.
    //    Joining the column inline gives us the stage name without a follow-up
    //    query.
    const cards = await db
      .select({
        id: kanbanCards.id,
        title: kanbanCards.title,
        scheduledFor: kanbanCards.scheduledFor,
        campaignId: kanbanCards.campaignId,
        columnName: kanbanColumns.name,
      })
      .from(kanbanCards)
      .innerJoin(kanbanColumns, eq(kanbanColumns.id, kanbanCards.columnId))
      .where(
        and(
          eq(kanbanCards.projectId, projectId),
          isNotNull(kanbanCards.scheduledFor),
          gte(kanbanCards.scheduledFor, startDate),
          lte(kanbanCards.scheduledFor, endDate),
        ),
      )
      .orderBy(kanbanCards.scheduledFor);

    if (cards.length === 0) {
      return NextResponse.json({ success: true, data: [] satisfies PublishingCalendarEntry[] });
    }

    const cardIds = cards.map((c) => c.id);

    // 2. Look up artifact links — there can be many per card. The card's
    //    "primary" artifact for calendar purposes is the most recent one
    //    (createdAt DESC). We fetch all rows for the in-range cards and
    //    fold to the first-seen per card.
    const artifactRows = await db
      .select({
        cardId: kanbanCardArtifacts.cardId,
        artifactType: kanbanCardArtifacts.artifactType,
        displayTitle: kanbanCardArtifacts.displayTitle,
        createdAt: kanbanCardArtifacts.createdAt,
      })
      .from(kanbanCardArtifacts)
      .where(inArray(kanbanCardArtifacts.cardId, cardIds))
      .orderBy(desc(kanbanCardArtifacts.createdAt));

    const primaryArtifactByCard = new Map<
      number,
      { artifactType: string; displayTitle: string }
    >();
    for (const row of artifactRows) {
      if (!primaryArtifactByCard.has(row.cardId)) {
        primaryArtifactByCard.set(row.cardId, {
          artifactType: row.artifactType,
          displayTitle: row.displayTitle,
        });
      }
    }

    // 3. Resolve campaign chips for the referenced campaign IDs.
    const campaignIds = Array.from(
      new Set(cards.map((c) => c.campaignId).filter((id): id is number => id != null)),
    );
    const campaignRows = campaignIds.length
      ? await db
          .select({
            id: publishingCampaigns.id,
            name: publishingCampaigns.name,
            color: publishingCampaigns.color,
          })
          .from(publishingCampaigns)
          .where(inArray(publishingCampaigns.id, campaignIds))
      : [];
    const campaignsById = new Map<number, { id: number; name: string; color: string }>(
      campaignRows.map((c) => [c.id, c]),
    );

    const data: PublishingCalendarEntry[] = cards.map((c) => {
      const artifact = primaryArtifactByCard.get(c.id) ?? null;
      const campaign = c.campaignId != null ? campaignsById.get(c.campaignId) ?? null : null;
      // scheduledFor is guaranteed non-null by the WHERE clause above.
      const date = c.scheduledFor!.toISOString();
      return {
        id: c.id,
        title: c.title,
        date,
        artifactType: artifact?.artifactType ?? null,
        artifactTitle: artifact?.displayTitle ?? null,
        columnName: c.columnName,
        campaign,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (isRedirectError(error)) throw error; // let next emit the 307 (no session / no client)
    console.error('Error fetching publishing calendar:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch publishing calendar' },
      { status: 500 },
    );
  }
}
