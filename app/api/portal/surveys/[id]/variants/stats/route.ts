/**
 * Per-variant response counts for a survey.
 *
 * Returns one row per variant id (plus a `null` bucket for responses that
 * weren't attributed to any variant — historical or default-fields traffic).
 *
 * Today this is intentionally simple: total / completed / withEmail. Richer
 * funnel analytics (started → completed conversion using
 * `survey_partial_responses`) is left to the analytics tab. TODO(stats-deep)
 * — wire partials into per-variant rates once we add a `variantId` column to
 * `survey_partial_responses`.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const surveyId = parseInt(id, 10);
  const [survey] = await db.select({ id: surveys.id }).from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, client.id)))
    .limit(1);
  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  const rows = await db
    .select({
      variantId: surveyResponses.variantId,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(${surveyResponses.completedAt})::int`,
      withEmail: sql<number>`count(${surveyResponses.respondentEmail})::int`,
    })
    .from(surveyResponses)
    .where(eq(surveyResponses.surveyId, surveyId))
    .groupBy(surveyResponses.variantId);

  return NextResponse.json({
    success: true,
    data: rows.map((r) => ({
      variantId: r.variantId,
      total: r.total ?? 0,
      completed: r.completed ?? 0,
      withEmail: r.withEmail ?? 0,
    })),
  });
}
