/**
 * Tenant-level (site) outbound webhook — single-row mutations.
 *
 * PATCH  — update url / events / enabled (secret rotation lives at the unified
 *          console's /webhooks/site/[id]/rotate route)
 * DELETE — remove the webhook (delivery log cascades)
 *
 * Tenant-scoped: every query is constrained by siteWebhooks.clientId.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { siteWebhooks } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { validateWebhookUrl } from '@/lib/ssrf-guard';
import { AUTOMATION_EVENTS } from '@/lib/automation/event-bus';

const VALID_EVENTS = new Set<string>([...Object.keys(AUTOMATION_EVENTS), '*']);

function sanitizeEvents(input: unknown): string[] {
  if (!Array.isArray(input)) return ['*'];
  const kept = input.filter((v): v is string => typeof v === 'string' && VALID_EVENTS.has(v));
  return kept.length ? Array.from(new Set(kept)) : ['*'];
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const hookId = parseInt(id, 10);
  if (Number.isNaN(hookId))
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.url !== undefined) {
    if (typeof body.url !== 'string' || !body.url.trim())
      return NextResponse.json({ success: false, message: 'URL must be a non-empty string' }, { status: 400 });
    const check = validateWebhookUrl(body.url);
    if (!check.ok) return NextResponse.json({ success: false, message: check.reason }, { status: 400 });
    updates.url = body.url.slice(0, 500);
  }
  if (body.events !== undefined) updates.events = sanitizeEvents(body.events);
  if (body.enabled !== undefined) updates.enabled = !!body.enabled;

  const [row] = await db
    .update(siteWebhooks)
    .set(updates)
    .where(and(eq(siteWebhooks.id, hookId), eq(siteWebhooks.clientId, client.id)))
    .returning();

  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const redacted = row.secret ? { ...row, secret: row.secret.slice(0, 6) + '…' } : row;
  return NextResponse.json({ success: true, data: redacted });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { id } = await params;
  const hookId = parseInt(id, 10);
  if (Number.isNaN(hookId))
    return NextResponse.json({ success: false, message: 'Invalid id' }, { status: 400 });

  const [row] = await db
    .delete(siteWebhooks)
    .where(and(eq(siteWebhooks.id, hookId), eq(siteWebhooks.clientId, client.id)))
    .returning();

  if (!row) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
