import { NextResponse, type NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { microsoftTeamsUserConnections } from '@/lib/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Microsoft Graph change-notification receiver for transcript subscriptions.
 *
 * URL: /api/microsoft-webhook/transcripts (registered as `notificationUrl`
 * when the subscription is created in lib/microsoft/transcripts-watch.ts).
 *
 * Two distinct request shapes hit this handler:
 *
 * 1. VALIDATION HANDSHAKE — issued once when the subscription is created.
 *    Microsoft sends `?validationToken=<random>` and expects the handler to
 *    echo the token back as plain text, status 200, within 10 seconds.
 *    Failure to ack means the subscription is rejected at create time.
 *    No `clientState` check happens here — the request comes from Graph
 *    before clientState is registered.
 *
 * 2. CHANGE NOTIFICATION — every event after registration. JSON body with
 *    a `value` array of notification entries:
 *      {
 *        subscriptionId, subscriptionExpirationDateTime, tenantId,
 *        clientState, changeType, resource,
 *        resourceData: { @odata.type, @odata.id, id }
 *      }
 *    We validate clientState against the connection row, ack with 202, and
 *    leave actual transcript fetching + ingestion to PR 3 (which will hook
 *    in here). For now this is detection-only — we just confirm wiring.
 *
 * Response policy:
 *   - 200 + plain text validationToken on the validation handshake
 *   - 202 once we've ack'd a change notification (processing is async)
 *   - 401 if clientState doesn't match (Graph will retry then drop)
 *   - 404 if the subscriptionId doesn't map to any known connection
 *
 * The 30-second receive-and-ack budget is real: if we don't 2xx within that
 * window, Graph treats the notification as failed and starts a back-off.
 * Heavy lifting must happen async (in PR 3, via a queued job or the cron).
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get('validationToken');

  // VALIDATION HANDSHAKE — echo plain text, status 200.
  // No clientState check (Graph hasn't registered it yet).
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // CHANGE NOTIFICATION — JSON body with `value` array.
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

  const notifications = (body as { value: unknown[] }).value;

  // For each notification, validate clientState against the stored value on
  // the connection row keyed by subscriptionId. A failed match means either
  // (a) we missed an unsubscribe and Graph is still notifying, or (b) the
  // notification is forged. Either way, refuse to process.
  let processed = 0;
  let rejected = 0;
  let unknown = 0;

  for (const raw of notifications) {
    if (!raw || typeof raw !== 'object') {
      rejected++;
      continue;
    }
    const n = raw as {
      subscriptionId?: string;
      clientState?: string;
      changeType?: string;
      resource?: string;
      resourceData?: { id?: string };
    };
    if (!n.subscriptionId || !n.clientState) {
      rejected++;
      continue;
    }

    const [conn] = await db
      .select({
        id: microsoftTeamsUserConnections.id,
        clientId: microsoftTeamsUserConnections.clientId,
        userId: microsoftTeamsUserConnections.userId,
        clientState: microsoftTeamsUserConnections.subscriptionClientState,
      })
      .from(microsoftTeamsUserConnections)
      .where(eq(microsoftTeamsUserConnections.subscriptionId, n.subscriptionId))
      .limit(1);

    if (!conn) {
      unknown++;
      continue;
    }
    if (conn.clientState !== n.clientState) {
      rejected++;
      console.warn(
        `[microsoft-webhook] clientState mismatch for subscription ${n.subscriptionId} ` +
          `(connection ${conn.id}, client ${conn.clientId}, user ${conn.userId})`,
      );
      continue;
    }

    // PR 3 hooks in here: enqueue a sync job for (clientId, userId,
    // resourceData.id). For now, just log + count.
    console.log(
      `[microsoft-webhook] transcript notification: ` +
        `connection=${conn.id} change=${n.changeType ?? '?'} ` +
        `resource=${n.resource ?? '?'} transcriptId=${n.resourceData?.id ?? '?'}`,
    );
    processed++;
  }

  // 202 Accepted — we've taken responsibility, processing is async.
  return NextResponse.json(
    { success: true, data: { processed, rejected, unknown } },
    { status: 202 },
  );
}
