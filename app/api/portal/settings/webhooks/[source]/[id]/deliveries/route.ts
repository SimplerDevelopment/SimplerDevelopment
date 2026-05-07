// Read recent delivery attempts for a single webhook.
// project_webhook_deliveries is the only delivery log table that currently
// exists, so survey + site simply return an empty list (the UI shows a
// "no delivery log yet" placeholder for those sources).

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  projects,
  projectWebhooks,
  projectWebhookDeliveries,
  surveys,
  surveyWebhooks,
} from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

type Source = 'project' | 'survey' | 'site';

function isSource(v: string): v is Source {
  return v === 'project' || v === 'survey' || v === 'site';
}

export interface DeliveryRow {
  id: number;
  event: string;
  status: number | null;
  error: string | null;
  createdAt: string;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ source: string; id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  const { source, id } = await params;
  if (!isSource(source)) {
    return NextResponse.json({ success: false, message: 'Unknown source' }, { status: 400 });
  }
  const hookId = parseInt(id, 10);
  if (Number.isNaN(hookId)) {
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });
  }

  if (source === 'project') {
    const [hook] = await db
      .select({ id: projectWebhooks.id, projectId: projectWebhooks.projectId })
      .from(projectWebhooks)
      .where(eq(projectWebhooks.id, hookId))
      .limit(1);
    if (!hook) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const [proj] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, hook.projectId), eq(projects.clientId, client.id)))
      .limit(1);
    if (!proj) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    const rows = await db
      .select({
        id: projectWebhookDeliveries.id,
        event: projectWebhookDeliveries.event,
        status: projectWebhookDeliveries.status,
        error: projectWebhookDeliveries.error,
        createdAt: projectWebhookDeliveries.createdAt,
      })
      .from(projectWebhookDeliveries)
      .where(eq(projectWebhookDeliveries.webhookId, hookId))
      .orderBy(desc(projectWebhookDeliveries.createdAt))
      .limit(50);

    const data: DeliveryRow[] = rows.map((r) => ({
      id: r.id,
      event: r.event,
      status: r.status ?? null,
      error: r.error ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
    return NextResponse.json({ success: true, data });
  }

  if (source === 'survey') {
    const [hook] = await db
      .select({ id: surveyWebhooks.id, surveyId: surveyWebhooks.surveyId })
      .from(surveyWebhooks)
      .where(eq(surveyWebhooks.id, hookId))
      .limit(1);
    if (!hook) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    const [survey] = await db
      .select({ id: surveys.id })
      .from(surveys)
      .where(and(eq(surveys.id, hook.surveyId), eq(surveys.clientId, client.id)))
      .limit(1);
    if (!survey) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

    // TODO: wire to a future survey_webhook_deliveries table.
    return NextResponse.json({ success: true, data: [] as DeliveryRow[] });
  }

  // site — not implemented yet
  return NextResponse.json({ success: true, data: [] as DeliveryRow[] });
}
