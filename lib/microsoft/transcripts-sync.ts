import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { microsoftTeamsUserConnections } from '@/lib/db/schema';
import { getEnvMicrosoftCredentials } from '@/lib/microsoft/oauth';
import { fetchTeamsTranscript } from '@/lib/microsoft/transcripts-fetch';
import { createMeetingFromAdapter } from '@/lib/brain/meetings';
import { getOrCreateBrainProfile } from '@/lib/brain/profiles';
import type { TeamsTranscriptInput } from '@/lib/brain/meeting-sources/teams-transcript';

/**
 * Orchestrate webhook → Graph fetch → adapter → brain_meetings row.
 *
 * Called from app/api/microsoft-webhook/transcripts on each notification.
 * Idempotent — repeated calls for the same transcript update the existing
 * brain_meetings row (createMeetingFromAdapter is idempotent on
 * (clientId, sourceRef)).
 *
 * Failure modes:
 *   - Connection not found / revoked → throw NotConnectedError; caller logs
 *     and acks the webhook so Graph stops retrying.
 *   - Graph 401 / 403 → tokens revoked or scope changed; surfaced as a thrown
 *     error so the webhook handler can ack and the next renewal-cron pass
 *     will mark the row reauthorization-required.
 *   - Empty/malformed transcript → throw with context; webhook acks anyway.
 */

export class NotConnectedError extends Error {
  constructor(public connectionId?: number) {
    super(connectionId ? `Connection ${connectionId} not found or revoked` : 'No connection');
    this.name = 'NotConnectedError';
  }
}

export interface SyncTranscriptArgs {
  /** subscription_id from the webhook notification — keys the connection. */
  subscriptionId: string;
  /** {meetingId} extracted from the resource path. */
  meetingId: string;
  /** {transcriptId} extracted from the resource path. */
  transcriptId: string;
}

export interface SyncTranscriptResult {
  brainMeetingId: number;
  reimported: boolean;
  byteCount: number;
}

export async function syncTranscriptForSubscription(
  args: SyncTranscriptArgs,
): Promise<SyncTranscriptResult> {
  const [conn] = await db
    .select()
    .from(microsoftTeamsUserConnections)
    .where(eq(microsoftTeamsUserConnections.subscriptionId, args.subscriptionId))
    .limit(1);

  if (!conn || conn.revokedAt) {
    throw new NotConnectedError(conn?.id);
  }

  // Build credentials. We don't strictly need the redirectUri here (we're not
  // doing the auth-code flow), but the helper requires it; pass a stable
  // production URL so env validation passes.
  const credentials = getEnvMicrosoftCredentials(
    'https://www.simplerdevelopment.com/api/portal/integrations/microsoft/callback',
  );

  const fetched = await fetchTeamsTranscript({
    connection: {
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      expiresAt: conn.expiresAt,
    },
    credentials,
    userOid: conn.microsoftUserId,
    meetingId: args.meetingId,
    transcriptId: args.transcriptId,
  });

  // Persist any token refresh side-effect from the Graph calls before we
  // hand off to the brain pipeline (so a slow ingestion path doesn't lose
  // the new token if it crashes).
  if (fetched.refreshed) {
    await db
      .update(microsoftTeamsUserConnections)
      .set({
        accessToken: fetched.connection.accessToken,
        refreshToken: fetched.connection.refreshToken,
        expiresAt: fetched.connection.expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(microsoftTeamsUserConnections.id, conn.id));
  }

  const profile = await getOrCreateBrainProfile(conn.clientId, 'Brain');

  const adapterInput: TeamsTranscriptInput = {
    meetingId: fetched.meetingId,
    transcriptId: fetched.transcriptId,
    transcript: fetched.transcript,
    vtt: fetched.vtt,
    meetingSubject: fetched.meetingSubject,
    meetingStart: fetched.meetingStart,
    meetingEnd: fetched.meetingEnd,
    joinWebUrl: fetched.joinWebUrl,
    participants: fetched.participants,
    organizerOid: conn.microsoftUserId,
    organizerTenantId: conn.microsoftTenantId,
  };

  const meeting = await createMeetingFromAdapter({
    adapterId: 'teams_transcript',
    input: adapterInput,
    ctx: { clientId: conn.clientId, userId: conn.userId, profile },
  });

  // Update the connection's lastSyncAt so portal status reflects activity.
  await db
    .update(microsoftTeamsUserConnections)
    .set({ lastSyncAt: new Date(), updatedAt: new Date() })
    .where(eq(microsoftTeamsUserConnections.id, conn.id));

  // createMeetingFromAdapter doesn't tell us which path it took, so derive
  // reimported from updatedAt > createdAt. This is approximate but good
  // enough for the webhook log.
  const reimported = meeting.updatedAt.getTime() > meeting.createdAt.getTime() + 1000;

  return {
    brainMeetingId: meeting.id,
    reimported,
    byteCount: fetched.transcript.length,
  };
}

/**
 * Parse the resource string from a webhook notification into
 * { meetingId, transcriptId }. Resource format:
 *   communications/onlineMeetings('{meetingId}')/transcripts('{transcriptId}')
 */
export function parseTranscriptResource(
  resource: string,
): { meetingId: string; transcriptId: string } | null {
  const m = resource.match(
    /onlineMeetings\(['"]([^'"]+)['"]\)\/transcripts\(['"]([^'"]+)['"]\)/i,
  );
  if (!m) return null;
  return { meetingId: m[1], transcriptId: m[2] };
}
