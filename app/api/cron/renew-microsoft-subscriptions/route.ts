import { NextResponse } from 'next/server';
import { withCronHealth } from '@/lib/cron-health';
import { eq, and, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { microsoftTeamsUserConnections } from '@/lib/db/schema';
import { getEnvMicrosoftCredentials } from '@/lib/microsoft/oauth';
import {
  createTranscriptsSubscription,
  renewTranscriptsSubscription,
  SubscriptionGoneError,
} from '@/lib/microsoft/transcripts-watch';
import { GraphRequestError } from '@/lib/microsoft/graph-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron: keep Microsoft Teams transcript subscriptions alive AND create them
 * for newly-connected users that don't have one yet.
 *
 * Microsoft caps the subscription's `expirationDateTime` at ~60 minutes for
 * this resource. Subscriptions are requested with a 50-minute lifetime; this
 * cron runs every 25 minutes so we always have at least one renewal window
 * left even if a single tick is skipped.
 *
 * Auth: Vercel cron header OR `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Behavior:
 *   - Pick connections that are: not revoked, AND either no subscriptionId yet
 *     OR subscription expires within the next 30 minutes.
 *   - For "no subscription yet": create one.
 *   - For "expiring soon": PATCH renew. On 404 (gone), create a new one.
 *   - On invalid refresh token: leave the row alone for now (user must
 *     re-authorize manually). Could clear the subscriptionId so we don't
 *     keep retrying — but we'd lose the audit trail. PR 4 surfaces a
 *     "needs reconnect" badge in the portal UI.
 *
 * Response: per-connection summary so we can see what happened in cron logs.
 */
async function _GET(req: Request) {
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron) {
    const cronSecret = process.env.CRON_SECRET;
    const auth = req.headers.get('authorization');
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
  }

  // Build credentials once. If env isn't configured, return early so we don't
  // surface this as a cron failure on environments that haven't enabled the
  // Teams integration yet.
  const redirectUri = `${process.env.NEXTAUTH_URL ?? 'https://www.simplerdevelopment.com'}/api/portal/integrations/microsoft/callback`;
  let credentials;
  try {
    credentials = getEnvMicrosoftCredentials(redirectUri);
  } catch {
    return NextResponse.json({
      success: true,
      data: { skipped: 'microsoft_oauth_not_configured' },
    });
  }

  const RENEW_WINDOW_MS = 30 * 60 * 1000;
  const renewBefore = new Date(Date.now() + RENEW_WINDOW_MS);

  const due = await db
    .select()
    .from(microsoftTeamsUserConnections)
    .where(
      and(
        isNull(microsoftTeamsUserConnections.revokedAt),
        or(
          isNull(microsoftTeamsUserConnections.subscriptionId),
          lt(microsoftTeamsUserConnections.subscriptionExpiration, renewBefore),
        ),
      ),
    );

  const t0 = Date.now();
  const results: Array<{ connectionId: number; action: string; ok: boolean; error?: string }> = [];

  for (const row of due) {
    const conn = {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      expiresAt: row.expiresAt,
    };

    try {
      if (!row.subscriptionId) {
        const created = await createTranscriptsSubscription({
          connection: conn,
          credentials,
          microsoftUserId: row.microsoftUserId,
        });
        await persistSubscription(row.id, created);
        results.push({ connectionId: row.id, action: 'created', ok: true });
        continue;
      }

      try {
        const renewed = await renewTranscriptsSubscription({
          connection: conn,
          credentials,
          subscriptionId: row.subscriptionId,
        });
        await persistRenewal(row.id, renewed);
        results.push({ connectionId: row.id, action: 'renewed', ok: true });
      } catch (err) {
        if (err instanceof SubscriptionGoneError) {
          // Server-side gone — recreate.
          const created = await createTranscriptsSubscription({
            connection: conn,
            credentials,
            microsoftUserId: row.microsoftUserId,
          });
          await persistSubscription(row.id, created);
          results.push({ connectionId: row.id, action: 'recreated_after_404', ok: true });
        } else {
          throw err;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = err instanceof GraphRequestError ? err.status : undefined;
      results.push({
        connectionId: row.id,
        action: row.subscriptionId ? 'renew' : 'create',
        ok: false,
        error: status ? `${status}: ${msg}` : msg,
      });
      console.error(`[cron:renew-microsoft-subscriptions] connection ${row.id} failed:`, msg);
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      durationMs: Date.now() - t0,
      considered: due.length,
      results,
    },
  });
}

async function persistSubscription(
  connectionId: number,
  result: Awaited<ReturnType<typeof createTranscriptsSubscription>>,
) {
  const update: Record<string, unknown> = {
    subscriptionId: result.subscriptionId,
    subscriptionResource: result.subscriptionResource,
    subscriptionExpiration: result.subscriptionExpiration,
    subscriptionClientState: result.subscriptionClientState,
    updatedAt: new Date(),
  };
  if (result.refreshed) {
    update.accessToken = result.connection.accessToken;
    update.refreshToken = result.connection.refreshToken;
    update.expiresAt = result.connection.expiresAt;
  }
  await db
    .update(microsoftTeamsUserConnections)
    .set(update)
    .where(eq(microsoftTeamsUserConnections.id, connectionId));
}

async function persistRenewal(
  connectionId: number,
  result: Awaited<ReturnType<typeof renewTranscriptsSubscription>>,
) {
  const update: Record<string, unknown> = {
    subscriptionExpiration: result.subscriptionExpiration,
    updatedAt: new Date(),
  };
  if (result.refreshed) {
    update.accessToken = result.connection.accessToken;
    update.refreshToken = result.connection.refreshToken;
    update.expiresAt = result.connection.expiresAt;
  }
  await db
    .update(microsoftTeamsUserConnections)
    .set(update)
    .where(eq(microsoftTeamsUserConnections.id, connectionId));
}

export const GET = withCronHealth(
  { name: 'api-cron:renew-microsoft-subscriptions', area: 'api-cron' },
  _GET,
);
