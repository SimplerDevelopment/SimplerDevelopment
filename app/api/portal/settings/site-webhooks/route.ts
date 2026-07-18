/**
 * Tenant-level (site) outbound webhook collection.
 *
 * GET  — list the client's site webhooks (secrets redacted)
 * POST — create a webhook; full signing secret returned once on creation
 *
 * Tenant-scoped via getPortalClient → siteWebhooks.clientId. Rotate + delivery
 * log live under /api/portal/settings/webhooks/[source=site]/[id]/...; the
 * unified console at /api/portal/settings/webhooks aggregates all sources.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { siteWebhooks } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { validateWebhookUrl } from '@/lib/ssrf-guard';
import { generateWebhookSecret } from '@/lib/site-webhooks/dispatcher';
import { AUTOMATION_EVENTS } from '@/lib/automation/event-bus';

const VALID_EVENTS = new Set<string>([...Object.keys(AUTOMATION_EVENTS), '*']);

function sanitizeEvents(input: unknown): string[] {
  if (!Array.isArray(input)) return ['*'];
  const kept = input.filter((v): v is string => typeof v === 'string' && VALID_EVENTS.has(v));
  return kept.length ? Array.from(new Set(kept)) : ['*'];
}

function redact<T extends { secret: string | null }>(row: T): T {
  if (!row.secret) return row;
  return { ...row, secret: row.secret.slice(0, 6) + '…' };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const rows = await db
    .select()
    .from(siteWebhooks)
    .where(eq(siteWebhooks.clientId, client.id))
    .orderBy(desc(siteWebhooks.createdAt));

  return NextResponse.json({ success: true, data: rows.map(redact) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { url, events, enabled } = body as { url?: unknown; events?: unknown; enabled?: unknown };

  if (typeof url !== 'string' || !url.trim())
    return NextResponse.json({ success: false, message: 'URL is required' }, { status: 400 });
  const check = validateWebhookUrl(url);
  if (!check.ok) return NextResponse.json({ success: false, message: check.reason }, { status: 400 });

  const secret = generateWebhookSecret();
  const [row] = await db
    .insert(siteWebhooks)
    .values({
      clientId: client.id,
      url: url.slice(0, 500),
      secret,
      events: sanitizeEvents(events),
      enabled: typeof enabled === 'boolean' ? enabled : true,
      createdBy: userId,
    })
    .returning();

  // Full secret returned once on creation; subsequent reads redact it.
  return NextResponse.json({ success: true, data: row }, { status: 201 });
}
