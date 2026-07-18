import { randomBytes } from 'node:crypto';
import { graphCall, GraphRequestError } from '@/lib/microsoft/graph-client';
import type {
  MicrosoftConnectionLike,
  MicrosoftOAuthCredentials,
} from '@/lib/microsoft/oauth';

/**
 * Microsoft Graph change-notification subscriptions for online meeting
 * transcripts. Resource path:
 *
 *   /communications/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='{oid}')
 *
 * Subscription lifetime: max ~60 minutes (Microsoft hard cap for this
 * resource). The renewal cron runs every 25 minutes and PATCHes
 * expirationDateTime to keep them alive.
 *
 * Auth model: delegated. The subscription only sees transcripts for meetings
 * where the connected user is organizer or co-organizer.
 */

/** Microsoft caps subscription lifetime at 60 minutes for this resource;
 *  we ask for 50 to give the renewal cron headroom against clock skew. */
const SUBSCRIPTION_TTL_MINUTES = 50;

/** Notifications must arrive at an HTTPS URL reachable from Graph's servers.
 *  In local dev the OAuth flow works but subscription creation will fail —
 *  use a tunnel (ngrok/cloudflared) or rely on the production-deployed cron
 *  to create the subscription later. */
function buildNotificationUrls(originHint?: string): { notificationUrl: string; lifecycleNotificationUrl: string } {
  const base =
    originHint ??
    process.env.NEXTAUTH_URL ??
    process.env.PUBLIC_APP_URL ??
    'https://www.simplerdevelopment.com';
  const trimmed = base.replace(/\/$/, '');
  return {
    notificationUrl: `${trimmed}/api/microsoft-webhook/transcripts`,
    lifecycleNotificationUrl: `${trimmed}/api/microsoft-webhook/lifecycle`,
  };
}

function newClientState(): string {
  return randomBytes(32).toString('base64url');
}

function expirationFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

interface GraphSubscription {
  id: string;
  resource: string;
  changeType: string;
  notificationUrl: string;
  lifecycleNotificationUrl?: string;
  expirationDateTime: string;
  clientState: string;
  applicationId?: string;
  creatorId?: string;
}

export interface CreateSubscriptionResult {
  subscriptionId: string;
  subscriptionResource: string;
  subscriptionExpiration: Date;
  subscriptionClientState: string;
  /** True if the underlying connection's tokens were refreshed mid-call.
   *  Caller must persist them. */
  refreshed: boolean;
  connection: MicrosoftConnectionLike;
}

/**
 * Create a transcripts subscription for a single connected user. Idempotent
 * by accident only — calling twice creates two subscriptions. Callers should
 * check for an existing subscriptionId on the connection row first and prefer
 * `renewSubscription` over re-creating.
 */
export async function createTranscriptsSubscription(args: {
  connection: MicrosoftConnectionLike;
  credentials: MicrosoftOAuthCredentials;
  microsoftUserId: string;
  originHint?: string;
}): Promise<CreateSubscriptionResult> {
  const { notificationUrl, lifecycleNotificationUrl } = buildNotificationUrls(args.originHint);
  const clientState = newClientState();
  const resource = `/communications/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='${args.microsoftUserId}')`;

  const result = await graphCall<GraphSubscription>({
    connection: args.connection,
    credentials: args.credentials,
    call: {
      method: 'POST',
      path: '/subscriptions',
      body: {
        changeType: 'created,updated',
        notificationUrl,
        lifecycleNotificationUrl,
        resource,
        expirationDateTime: expirationFromNow(SUBSCRIPTION_TTL_MINUTES),
        clientState,
        // includeResourceData=false (default) — we'll fetch the actual
        // transcript content on the webhook side rather than receiving it
        // inline. Keeps the webhook payload small and avoids needing a
        // resource-data encryption certificate at this stage.
      },
    },
  });

  return {
    subscriptionId: result.data.id,
    subscriptionResource: result.data.resource,
    subscriptionExpiration: new Date(result.data.expirationDateTime),
    subscriptionClientState: clientState,
    refreshed: result.refreshed,
    connection: result.connection,
  };
}

export interface RenewSubscriptionResult {
  subscriptionExpiration: Date;
  refreshed: boolean;
  connection: MicrosoftConnectionLike;
}

/**
 * Extend an existing subscription's lifetime. Returns the new expiration
 * timestamp the caller should persist.
 *
 * If Graph 404s, the subscription was deleted server-side (most often
 * because we missed too many renewal windows). Callers should treat 404 as
 * "create a new one" — surfaced as `SubscriptionGoneError` so the caller
 * doesn't have to inspect the underlying status code.
 */
export async function renewTranscriptsSubscription(args: {
  connection: MicrosoftConnectionLike;
  credentials: MicrosoftOAuthCredentials;
  subscriptionId: string;
}): Promise<RenewSubscriptionResult> {
  try {
    const result = await graphCall<GraphSubscription>({
      connection: args.connection,
      credentials: args.credentials,
      call: {
        method: 'PATCH',
        path: `/subscriptions/${encodeURIComponent(args.subscriptionId)}`,
        body: {
          expirationDateTime: expirationFromNow(SUBSCRIPTION_TTL_MINUTES),
        },
      },
    });
    return {
      subscriptionExpiration: new Date(result.data.expirationDateTime),
      refreshed: result.refreshed,
      connection: result.connection,
    };
  } catch (err) {
    if (err instanceof GraphRequestError && err.status === 404) {
      throw new SubscriptionGoneError(args.subscriptionId);
    }
    throw err;
  }
}

export class SubscriptionGoneError extends Error {
  constructor(public subscriptionId: string) {
    super(`Subscription ${subscriptionId} no longer exists on Graph (404)`);
    this.name = 'SubscriptionGoneError';
  }
}

/**
 * Delete a subscription. Best-effort — 404 means "already gone, nothing to do."
 * Other errors propagate so the caller decides whether to retry.
 */
export async function deleteTranscriptsSubscription(args: {
  connection: MicrosoftConnectionLike;
  credentials: MicrosoftOAuthCredentials;
  subscriptionId: string;
}): Promise<{ refreshed: boolean; connection: MicrosoftConnectionLike }> {
  try {
    const result = await graphCall<undefined>({
      connection: args.connection,
      credentials: args.credentials,
      call: {
        method: 'DELETE',
        path: `/subscriptions/${encodeURIComponent(args.subscriptionId)}`,
      },
    });
    return { refreshed: result.refreshed, connection: result.connection };
  } catch (err) {
    if (err instanceof GraphRequestError && err.status === 404) {
      return { refreshed: false, connection: args.connection };
    }
    throw err;
  }
}
