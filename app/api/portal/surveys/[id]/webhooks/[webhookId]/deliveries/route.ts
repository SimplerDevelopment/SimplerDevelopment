/**
 * Per-webhook delivery audit log (HOOK-01).
 *
 * GET — list recent delivery rows for a webhook (latest first). Used by the
 * builder UI to surface "what happened on the last few attempts".
 *
 * Tenant-scoped via the survey → client check on the parent webhook.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyWebhooks, surveyWebhookDeliveries } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; webhookId: string }> },
) {
  const { id, webhookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'read', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const surveyId = parseInt(id, 10);
  const hookId = parseInt(webhookId, 10);

  // Verify the survey/webhook pair belongs to the caller's client.
  const [survey] = await db.select().from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, client.id))).limit(1);
  if (!survey) return NextResponse.json({ success: false, message: 'Survey not found' }, { status: 404 });

  const [hook] = await db.select().from(surveyWebhooks)
    .where(and(eq(surveyWebhooks.id, hookId), eq(surveyWebhooks.surveyId, surveyId))).limit(1);
  if (!hook) return NextResponse.json({ success: false, message: 'Webhook not found' }, { status: 404 });

  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get('limit') || '', 10);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

  const rows = await db.select().from(surveyWebhookDeliveries)
    .where(eq(surveyWebhookDeliveries.webhookId, hookId))
    .orderBy(desc(surveyWebhookDeliveries.createdAt))
    .limit(limit);

  return NextResponse.json({ success: true, data: rows });
}
