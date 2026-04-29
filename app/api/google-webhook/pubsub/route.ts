import { NextResponse, type NextRequest } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { googleWorkspaceUserConnections } from '@/lib/db/schema';
import { refreshIfExpired } from '@/lib/google/oauth';
import { getTenantWorkspaceCredentialsByPubsubToken } from '@/lib/google/tenant-credentials';
import {
  syncHistorySince,
  HistoryTooOldError,
} from '@/lib/google/gmail-history';
import { startGmailWatch } from '@/lib/google/gmail-watch';
import { ingestGmailMessageIntoBrain } from '@/lib/brain/ingest-gmail-message';

/**
 * Pub/Sub push receiver for Gmail watch notifications.
 *
 * URL: /api/google-webhook/pubsub?token=<tenant_pubsub_verification_token>
 *
 * Auth: per-tenant verification token in the query string. The token is the
 * routing key — it identifies which tenant's row in
 * google_workspace_tenant_credentials this push belongs to. Unknown token →
 * 401 (Pub/Sub will eventually drop after retry exhaustion).
 *
 * Response policy:
 *   - 200: message processed (or skipped intentionally). Pub/Sub acks.
 *   - 4xx: drop without retry (auth failure, malformed body).
 *   - 5xx: ONLY for transient errors we want Pub/Sub to retry. We try hard
 *          to land at 200 even when individual messages fail to ingest, since
 *          the brain_meetings unique index makes each message idempotent on
 *          retry but a 5xx loops the whole batch.
 *
 * Flow:
 *   1. Validate token → tenant
 *   2. Parse Pub/Sub envelope; base64-decode data → { emailAddress, historyId }
 *   3. Look up user connection by (clientId, emailAddress)
 *   4. Refresh access token if needed
 *   5. If gmailHistoryId is null this is the first push — set the watermark
 *      and await the next event (no backfill from undefined)
 *   6. Call syncHistorySince(stored)
 *   7. For each fetched message → ingestGmailMessageIntoBrain
 *   8. Persist new historyId
 *
 * History-too-old recovery: if Gmail says our stored historyId is gone (>7d),
 * we restart the watch and adopt the new historyId with no backfill. Better
 * to lose 7d of unsynced history than 5xx the push forever.
 */

interface PubsubEnvelope {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
  };
  subscription?: string;
}

interface GmailNotificationPayload {
  emailAddress?: string;
  historyId?: string | number;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'missing_token' }, { status: 401 });
  }

  const tenant = await getTenantWorkspaceCredentialsByPubsubToken(token);
  if (!tenant) {
    return NextResponse.json({ error: 'unknown_token' }, { status: 401 });
  }

  let envelope: PubsubEnvelope;
  try {
    envelope = (await req.json()) as PubsubEnvelope;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const dataB64 = envelope.message?.data;
  if (!dataB64) {
    // Empty pushes happen during subscription setup; ack so Pub/Sub stops.
    return NextResponse.json({ ok: true, reason: 'empty_data' });
  }

  let payload: GmailNotificationPayload;
  try {
    payload = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf8'));
  } catch {
    return NextResponse.json({ error: 'invalid_data_payload' }, { status: 400 });
  }
  const emailAddress = payload.emailAddress?.toLowerCase();
  const newHistoryId = payload.historyId != null ? String(payload.historyId) : null;
  if (!emailAddress || !newHistoryId) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // Find the user connection for this (tenant, mailbox).
  const [conn] = await db
    .select()
    .from(googleWorkspaceUserConnections)
    .where(
      and(
        eq(googleWorkspaceUserConnections.clientId, tenant.clientId),
        eq(googleWorkspaceUserConnections.googleAccountEmail, emailAddress),
        isNull(googleWorkspaceUserConnections.revokedAt)
      )
    )
    .limit(1);

  if (!conn) {
    // Push for an unknown mailbox — could be a stale watch from a disconnected
    // user; Gmail eventually stops sending. Ack to drop.
    console.warn(`[gmail-webhook] no active connection for ${emailAddress} on client=${tenant.clientId}`);
    return NextResponse.json({ ok: true, reason: 'no_connection' });
  }

  // First push for this connection: just record the watermark and await the
  // next event. We deliberately don't backfill here — a fresh watch's first
  // historyId points at "right now," and we have no older window to walk.
  if (!conn.gmailHistoryId) {
    await db
      .update(googleWorkspaceUserConnections)
      .set({ gmailHistoryId: newHistoryId, lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(googleWorkspaceUserConnections.id, conn.id));
    return NextResponse.json({ ok: true, reason: 'watermark_initialized' });
  }

  // Refresh access token if near expiry, persist any rotated refresh_token.
  let accessToken = conn.accessToken;
  let refreshToken = conn.refreshToken;
  let expiresAt = conn.expiresAt;
  try {
    const refreshed = await refreshIfExpired(
      { accessToken, refreshToken, expiresAt },
      tenant.oauth
    );
    if (refreshed.refreshed) {
      accessToken = refreshed.accessToken;
      expiresAt = refreshed.expiresAt;
      if (refreshed.refreshToken) refreshToken = refreshed.refreshToken;
      await db
        .update(googleWorkspaceUserConnections)
        .set({ accessToken, refreshToken, expiresAt, updatedAt: new Date() })
        .where(eq(googleWorkspaceUserConnections.id, conn.id));
    }
  } catch (err) {
    console.error(`[gmail-webhook] token refresh failed for connection=${conn.id}`, err);
    return NextResponse.json({ ok: true, reason: 'refresh_failed' });
  }

  let messages, latestHistoryId;
  try {
    const result = await syncHistorySince({
      credentials: tenant.oauth,
      connection: { accessToken, refreshToken, expiresAt },
      startHistoryId: conn.gmailHistoryId,
    });
    messages = result.messages;
    latestHistoryId = result.latestHistoryId;
  } catch (err) {
    if (err instanceof HistoryTooOldError) {
      // Stored historyId expired. Re-watch to get a fresh one and fast-forward.
      try {
        const watch = await startGmailWatch({
          credentials: tenant.oauth,
          connection: { accessToken, refreshToken, expiresAt },
          topicName: tenant.pubsubTopic,
        });
        await db
          .update(googleWorkspaceUserConnections)
          .set({
            gmailHistoryId: watch.historyId,
            gmailWatchExpiration: watch.expiration,
            lastSyncAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(googleWorkspaceUserConnections.id, conn.id));
        return NextResponse.json({ ok: true, reason: 'history_too_old_rewatched' });
      } catch (rewatchErr) {
        console.error(`[gmail-webhook] re-watch failed for connection=${conn.id}`, rewatchErr);
        return NextResponse.json({ ok: true, reason: 'rewatch_failed' });
      }
    }
    console.error(`[gmail-webhook] history sync failed for connection=${conn.id}`, err);
    return NextResponse.json({ ok: true, reason: 'sync_failed' });
  }

  // Honor the tenant's storeBodies setting (lives on the user connection's
  // syncSettings; defaults to false for per-user connections).
  const storeBodies = (conn.syncSettings as { storeBodies?: boolean })?.storeBodies ?? false;

  let inserted = 0;
  let skipped = 0;
  for (const m of messages) {
    try {
      const result = await ingestGmailMessageIntoBrain({
        clientId: tenant.clientId,
        message: m,
        storeBodies,
      });
      if (result.status === 'inserted') inserted++;
      else skipped++;
    } catch (err) {
      // Per-message failure: log, keep going. A 200 with partial-success is
      // safer than a 5xx that retries everything (and re-fires auto-process).
      console.error(`[gmail-webhook] ingest failed message=${m.id}`, err);
      skipped++;
    }
  }

  await db
    .update(googleWorkspaceUserConnections)
    .set({
      gmailHistoryId: latestHistoryId,
      lastSyncAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(googleWorkspaceUserConnections.id, conn.id));

  return NextResponse.json({
    ok: true,
    fetched: messages.length,
    inserted,
    skipped,
    latestHistoryId,
  });
}
