// Unified webhook console aggregator: reads project_webhooks + survey_webhooks
// (and is forward-compatible with site-level webhooks once that table exists),
// scoped to the caller's active portal client.
//
// Read-only. Per-row mutations (rotate / view deliveries) live alongside this
// route at ./[source]/[id]/...
//
// IMPORTANT: this route never proxies to the underlying per-source mutation
// routes — it only reads.

import { NextResponse } from 'next/server';
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

export type WebhookSource = 'project' | 'survey' | 'site';

export interface UnifiedWebhookRow {
  source: WebhookSource;
  sourceId: number;
  /** Human label for the parent (project name, survey title, site domain). */
  sourceLabel: string;
  /** Deep link to the parent object's webhook UI in the portal. */
  sourceHref: string;
  id: number;
  url: string;
  events: string[];
  enabled: boolean;
  lastDeliveryAt: string | null;
  lastStatus: number | null;
  /** Last 4 chars of the signing secret (or null if not set). */
  secretLast4: string | null;
  /** Whether the most recent delivery was a failure (status >= 400 or null with prior fire). */
  failing: boolean;
  createdAt: string;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  // 1) Project webhooks: join via projects.clientId.
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

  // 2) Survey webhooks: scope by surveys.clientId.
  const tenantSurveys = await db
    .select({ id: surveys.id, title: surveys.title })
    .from(surveys)
    .where(eq(surveys.clientId, client.id));
  const surveyIds = tenantSurveys.map((s) => s.id);
  const surveyTitleById = new Map(tenantSurveys.map((s) => [s.id, s.title]));
  const surveyRows = surveyIds.length
    ? await db
        .select()
        .from(surveyWebhooks)
        .where(inArray(surveyWebhooks.surveyId, surveyIds))
        .orderBy(desc(surveyWebhooks.createdAt))
    : [];

  // 3) Site webhooks: schema does not yet include a per-site webhooks table.
  //    The console renders the "site" source as soon as a `siteWebhooks`
  //    table is added — until then this slice is intentionally empty.
  const siteRows: UnifiedWebhookRow[] = [];

  const unified: UnifiedWebhookRow[] = [
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
      // survey_webhooks does not currently track delivery state
      lastDeliveryAt: null,
      lastStatus: null,
      secretLast4: r.secret ? r.secret.slice(-4) : null,
      failing: false,
      createdAt: r.createdAt.toISOString(),
    })),
    ...siteRows,
  ];

  // Most-recent first across all sources.
  unified.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return NextResponse.json({ success: true, data: unified });
}
