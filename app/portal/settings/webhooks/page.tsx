// Unified webhook console — server-rendered list of every webhook the
// caller's active client owns across project / survey / site sources.
// Surfaces enabled state, last delivery, and per-row actions (rotate +
// view deliveries) without modifying any of the underlying source UIs.

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  projects,
  projectWebhooks,
  surveys,
  surveyWebhooks,
} from '@/lib/db/schema';
import { eq, inArray, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { redirect } from 'next/navigation';
import WebhookConsole, { type UnifiedWebhookRow } from './WebhookConsole';

export const dynamic = 'force-dynamic';

export default async function WebhooksSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');
  const userId = parseInt(session.user.id, 10);

  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  // 1) Project webhooks scoped via projects.clientId.
  const projectRows = await db
    .select({
      hookId: projectWebhooks.id,
      projectId: projects.id,
      projectName: projects.name,
      url: projectWebhooks.url,
      secret: projectWebhooks.secret,
      events: projectWebhooks.events,
      active: projectWebhooks.active,
      lastFiredAt: projectWebhooks.lastFiredAt,
      lastStatus: projectWebhooks.lastStatus,
      failureCount: projectWebhooks.failureCount,
      createdAt: projectWebhooks.createdAt,
    })
    .from(projectWebhooks)
    .innerJoin(projects, eq(projects.id, projectWebhooks.projectId))
    .where(eq(projects.clientId, client.id))
    .orderBy(desc(projectWebhooks.createdAt));

  // 2) Survey webhooks scoped via surveys.clientId.
  const tenantSurveys = await db
    .select({ id: surveys.id, title: surveys.title })
    .from(surveys)
    .where(eq(surveys.clientId, client.id));
  const surveyTitleById = new Map(tenantSurveys.map((s) => [s.id, s.title]));
  const surveyIds = tenantSurveys.map((s) => s.id);
  const surveyRows = surveyIds.length
    ? await db
        .select()
        .from(surveyWebhooks)
        .where(inArray(surveyWebhooks.surveyId, surveyIds))
        .orderBy(desc(surveyWebhooks.createdAt))
    : [];

  const rows: UnifiedWebhookRow[] = [
    ...projectRows.map<UnifiedWebhookRow>((r) => ({
      source: 'project',
      sourceId: r.projectId,
      sourceLabel: r.projectName,
      sourceHref: `/portal/projects/${r.projectId}/webhooks`,
      id: r.hookId,
      url: r.url,
      events: r.events ?? [],
      enabled: r.active,
      lastDeliveryAt: r.lastFiredAt ? r.lastFiredAt.toISOString() : null,
      lastStatus: r.lastStatus ?? null,
      secretLast4: r.secret ? r.secret.slice(-4) : null,
      failing: r.failureCount > 0 || (r.lastStatus !== null && r.lastStatus >= 400),
      createdAt: r.createdAt.toISOString(),
      hasDeliveryLog: true,
    })),
    ...surveyRows.map<UnifiedWebhookRow>((r) => ({
      source: 'survey',
      sourceId: r.surveyId,
      sourceLabel: surveyTitleById.get(r.surveyId) ?? `Survey #${r.surveyId}`,
      sourceHref: `/portal/surveys/${r.surveyId}/webhooks`,
      id: r.id,
      url: r.url,
      events: r.events ?? [],
      enabled: r.enabled,
      lastDeliveryAt: null,
      lastStatus: null,
      secretLast4: r.secret ? r.secret.slice(-4) : null,
      failing: false,
      createdAt: r.createdAt.toISOString(),
      hasDeliveryLog: false,
    })),
    // site rows: schema not yet present.
  ];

  rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Webhooks</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Outbound webhooks across every project, survey, and site you own. Configure new endpoints
          inside each source — this view aggregates them so you can audit delivery health and rotate
          signing secrets in one place.
        </p>
      </div>

      <WebhookConsole rows={rows} />
    </div>
  );
}
