import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { microsoftTeamsUserConnections } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Microsoft Graph LIFECYCLE notification receiver.
 *
 * URL: /api/microsoft-webhook/lifecycle (registered as `lifecycleNotificationUrl`
 * when the subscription is created).
 *
 * Lifecycle events tell us about subscription health rather than data
 * changes. Three events matter:
 *
 *   reauthorizationRequired — the access token underpinning this
 *     subscription is about to expire / has expired. Graph asks us to PATCH
 *     the subscription (which forces a token refresh) before notifications
 *     resume. Recovery: clear subscriptionExpiration so the renewal cron
 *     immediately re-PATCHes with a fresh token.
 *   subscriptionRemoved — Graph deleted the subscription server-side
 *     (usually because the user revoked access or admin disabled the app).
 *     Recovery: null out subscription_* columns so the renewal cron
 *     creates a new one (or it'll skip if revokedAt is set).
 *   missed — Graph couldn't deliver one or more notifications. Recovery:
 *     PR 3 will run a delta-sync to catch up; for PR 2 we just log.
 *
 * Same validation handshake as the transcripts webhook (echo
 * validationToken). Same clientState check on real notifications.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get('validationToken');

  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (
    !body ||
    typeof body !== 'object' ||
    !('value' in body) ||
    !Array.isArray((body as { value: unknown }).value)
  ) {
    return NextResponse.json({ error: 'missing_value_array' }, { status: 400 });
  }

  const events = (body as { value: unknown[] }).value;
  let handled = 0;
  let rejected = 0;
  let unknown = 0;

  for (const raw of events) {
    if (!raw || typeof raw !== 'object') {
      rejected++;
      continue;
    }
    const ev = raw as {
      subscriptionId?: string;
      clientState?: string;
      lifecycleEvent?: string;
    };
    if (!ev.subscriptionId || !ev.clientState || !ev.lifecycleEvent) {
      rejected++;
      continue;
    }

    const [conn] = await db
      .select({
        id: microsoftTeamsUserConnections.id,
        clientState: microsoftTeamsUserConnections.subscriptionClientState,
      })
      .from(microsoftTeamsUserConnections)
      .where(eq(microsoftTeamsUserConnections.subscriptionId, ev.subscriptionId))
      .limit(1);

    if (!conn) {
      unknown++;
      continue;
    }
    if (conn.clientState !== ev.clientState) {
      rejected++;
      console.warn(
        `[microsoft-lifecycle] clientState mismatch for subscription ${ev.subscriptionId}`,
      );
      continue;
    }

    switch (ev.lifecycleEvent) {
      case 'reauthorizationRequired':
        // Set expiration to "right now" — the renewal cron will pick this up
        // on its next pass and PATCH with a fresh token.
        await db
          .update(microsoftTeamsUserConnections)
          .set({ subscriptionExpiration: new Date(), updatedAt: new Date() })
          .where(eq(microsoftTeamsUserConnections.id, conn.id));
        console.log(
          `[microsoft-lifecycle] reauthorizationRequired for connection ${conn.id} — flagged for cron`,
        );
        handled++;
        break;
      case 'subscriptionRemoved':
        await db
          .update(microsoftTeamsUserConnections)
          .set({
            subscriptionId: null,
            subscriptionResource: null,
            subscriptionExpiration: null,
            subscriptionClientState: null,
            updatedAt: new Date(),
          })
          .where(eq(microsoftTeamsUserConnections.id, conn.id));
        console.log(
          `[microsoft-lifecycle] subscriptionRemoved for connection ${conn.id} — cleared, cron will recreate`,
        );
        handled++;
        break;
      case 'missed':
        console.log(
          `[microsoft-lifecycle] missed notifications for connection ${conn.id} — delta sync TBD in PR 3`,
        );
        handled++;
        break;
      default:
        console.warn(
          `[microsoft-lifecycle] unknown lifecycleEvent "${ev.lifecycleEvent}" for connection ${conn.id}`,
        );
        rejected++;
    }
  }

  return NextResponse.json(
    { success: true, data: { handled, rejected, unknown } },
    { status: 202 },
  );
}
