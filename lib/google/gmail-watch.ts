import { google } from 'googleapis';
import type { GoogleConnectionLike, GoogleOAuthCredentials } from '@/lib/google/oauth';

/**
 * Gmail's users.watch() subscribes a single user's mailbox to a Pub/Sub topic.
 *
 * Returns:
 *   - historyId: the watermark we'll feed to history.list() on the first push
 *   - expiration: the watch dies after ~7 days; daily cron must re-watch before
 *
 * Behavior notes:
 *   - Only ONE watch per Gmail account. Calling watch() again replaces the
 *     previous watch (different topic, different labels). So calling on every
 *     /connect is naturally idempotent.
 *   - We default to labelIds=['INBOX'] + labelFilterAction='include' so we
 *     only get pushes for inbox-bound mail. (Sent mail still appears via
 *     history.list responses to inbox events for the same thread; for
 *     comprehensive sent-mail tracking, omit labelIds entirely.)
 *   - The OAuth client must have gmail.readonly (or any broader Gmail scope).
 */

export interface GmailWatchResult {
  historyId: string;
  expiration: Date;
}

function buildOAuth2(creds: GoogleOAuthCredentials, connection: GoogleConnectionLike) {
  const client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, creds.redirectUri);
  client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.expiresAt.getTime(),
  });
  return client;
}

export async function startGmailWatch(opts: {
  credentials: GoogleOAuthCredentials;
  connection: GoogleConnectionLike;
  topicName: string;
  labelIds?: string[];
}): Promise<GmailWatchResult> {
  const oauth2 = buildOAuth2(opts.credentials, opts.connection);
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });
  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: opts.topicName,
      labelIds: opts.labelIds ?? ['INBOX'],
      labelFilterAction: 'include',
    },
  });

  const historyId = res.data.historyId;
  const expirationMs = res.data.expiration ? parseInt(res.data.expiration, 10) : NaN;
  if (!historyId || !Number.isFinite(expirationMs)) {
    throw new Error(
      `Gmail watch response missing historyId or expiration: ${JSON.stringify(res.data)}`
    );
  }
  return { historyId, expiration: new Date(expirationMs) };
}

export async function stopGmailWatch(opts: {
  credentials: GoogleOAuthCredentials;
  connection: GoogleConnectionLike;
}): Promise<void> {
  const oauth2 = buildOAuth2(opts.credentials, opts.connection);
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });
  await gmail.users.stop({ userId: 'me' });
}
