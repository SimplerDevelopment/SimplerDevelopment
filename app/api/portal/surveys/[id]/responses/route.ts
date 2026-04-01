import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
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

  // Verify ownership
  const [survey] = await db
    .select()
    .from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, client.id)));
  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  const responses = await db
    .select()
    .from(surveyResponses)
    .where(eq(surveyResponses.surveyId, surveyId))
    .orderBy(desc(surveyResponses.createdAt));

  // Basic analytics
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(completed_at)::int`,
      withEmail: sql<number>`count(respondent_email)::int`,
    })
    .from(surveyResponses)
    .where(eq(surveyResponses.surveyId, surveyId));

  return NextResponse.json({
    success: true,
    data: {
      responses,
      stats: {
        total: stats?.total || 0,
        completed: stats?.completed || 0,
        withEmail: stats?.withEmail || 0,
      },
    },
  });
}
