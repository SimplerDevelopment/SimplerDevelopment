// Rotate a webhook signing secret across any of the three sources.
// Plaintext secret is returned exactly once (on this response) and never logged.
//
// Tenant-scoped: the rotated row must belong to the caller's active client.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  projects,
  projectWebhooks,
  surveys,
  surveyWebhooks,
  siteWebhooks,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { generateWebhookSecret } from '@/lib/pm-webhooks';

type Source = 'project' | 'survey' | 'site';

function isSource(v: string): v is Source {
  return v === 'project' || v === 'survey' || v === 'site';
}

export async function POST(
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

  const newSecret = generateWebhookSecret();

  if (source === 'project') {
    // Tenant guard: project must belong to caller's client.
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

    await db.update(projectWebhooks).set({ secret: newSecret }).where(eq(projectWebhooks.id, hookId));
    return NextResponse.json({
      success: true,
      data: { secret: newSecret, secretLast4: newSecret.slice(-4) },
    });
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

    await db.update(surveyWebhooks).set({ secret: newSecret }).where(eq(surveyWebhooks.id, hookId));
    return NextResponse.json({
      success: true,
      data: { secret: newSecret, secretLast4: newSecret.slice(-4) },
    });
  }

  // source === 'site' — scoped directly by clientId (no parent object).
  const [hook] = await db
    .select({ id: siteWebhooks.id })
    .from(siteWebhooks)
    .where(and(eq(siteWebhooks.id, hookId), eq(siteWebhooks.clientId, client.id)))
    .limit(1);
  if (!hook) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db
    .update(siteWebhooks)
    .set({ secret: newSecret, updatedAt: new Date() })
    .where(eq(siteWebhooks.id, hookId));
  return NextResponse.json({
    success: true,
    data: { secret: newSecret, secretLast4: newSecret.slice(-4) },
  });
}
