/**
 * Per-survey webhook item (HOOK-01).
 *
 * GET    — fetch a single webhook (secret redacted)
 * PUT    — update url / events / enabled. Resets failureCount when re-enabled.
 * DELETE — remove. Cascade drops all delivery rows.
 *
 * Tenant-scoped via the survey → client check.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { surveys, surveyWebhooks } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { validateWebhookUrl } from '@/lib/ssrf-guard';

const ALLOWED_EVENTS = ['response.submitted', '*'] as const;
type Allowed = (typeof ALLOWED_EVENTS)[number];

function sanitizeEvents(input: unknown): Allowed[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<Allowed>();
  for (const v of input) {
    if (typeof v === 'string' && (ALLOWED_EVENTS as readonly string[]).includes(v)) {
      seen.add(v as Allowed);
    }
  }
  return seen.size > 0 ? Array.from(seen) : ['response.submitted'];
}

function redactSecret<T extends { secret: string | null }>(row: T): T {
  if (!row.secret) return row;
  return { ...row, secret: row.secret.slice(0, 6) + '…' };
}

async function loadHookForClient(surveyId: number, webhookId: number, clientId: number) {
  const [survey] = await db.select().from(surveys)
    .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId))).limit(1);
  if (!survey) return null;

  const [hook] = await db.select().from(surveyWebhooks)
    .where(and(eq(surveyWebhooks.id, webhookId), eq(surveyWebhooks.surveyId, surveyId))).limit(1);
  if (!hook) return null;

  return { survey, hook };
}

export async function GET(
  _req: Request,
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

  const found = await loadHookForClient(parseInt(id, 10), parseInt(webhookId, 10), client.id);
  if (!found) return NextResponse.json({ success: false, message: 'Webhook not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: redactSecret(found.hook) });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; webhookId: string }> },
) {
  const { id, webhookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const found = await loadHookForClient(parseInt(id, 10), parseInt(webhookId, 10), client.id);
  if (!found) return NextResponse.json({ success: false, message: 'Webhook not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof body.url === 'string') {
    const check = validateWebhookUrl(body.url);
    if (!check.ok) return NextResponse.json({ success: false, message: check.reason }, { status: 400 });
    updates.url = body.url.slice(0, 500);
  }

  const events = sanitizeEvents(body.events);
  if (events !== null) updates.events = events;

  if (typeof body.enabled === 'boolean') {
    updates.enabled = body.enabled;
    if (body.enabled) updates.failureCount = 0;
  }

  const [row] = await db.update(surveyWebhooks).set(updates)
    .where(eq(surveyWebhooks.id, found.hook.id))
    .returning();

  return NextResponse.json({ success: true, data: redactSecret(row) });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; webhookId: string }> },
) {
  const { id, webhookId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const authResult = await authorizePortal({ action: 'write', requireService: 'surveys' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const found = await loadHookForClient(parseInt(id, 10), parseInt(webhookId, 10), client.id);
  if (!found) return NextResponse.json({ success: false, message: 'Webhook not found' }, { status: 404 });

  await db.delete(surveyWebhooks).where(eq(surveyWebhooks.id, found.hook.id));

  return NextResponse.json({ success: true });
}
