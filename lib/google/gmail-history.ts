import { google, type gmail_v1 } from 'googleapis';
import type { GoogleConnectionLike, GoogleOAuthCredentials } from '@/lib/google/oauth';

/**
 * Gmail history sync — given a stored historyId, find every message added since
 * and fetch its full content. Pub/Sub pushes carry only an emailAddress +
 * historyId pointer, so this module is the bridge between "something changed"
 * and "here are the actual messages."
 *
 * Behavior notes:
 *   - history.list is paginated; we follow nextPageToken to completion.
 *   - history.list with `historyTypes=['messageAdded']` filters server-side to
 *     just the events we care about. Sent-mail and label changes are excluded.
 *   - If the stored historyId is too old (Gmail retains ~7 days of history),
 *     the API returns 404. Caller should treat that as "must re-watch and
 *     start fresh from the new historyId" — see SyncTooOldError below.
 *   - We dedupe message IDs across pages; Gmail occasionally repeats them.
 */

export class HistoryTooOldError extends Error {
  constructor() {
    super(
      'Stored historyId is older than Gmail retains (~7 days). Caller must ' +
      're-watch and accept the new historyId without backfilling.'
    );
    this.name = 'HistoryTooOldError';
  }
}

export interface FetchedMessage {
  id: string;
  threadId: string;
  internetMessageId: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  receivedAt: Date;
  labelIds: string[];
  snippet: string;
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

/**
 * Walk every history page from `startHistoryId` and return the unique set of
 * message IDs that were ADDED. Throws HistoryTooOldError on a 404.
 */
async function listAddedMessageIds(
  gmail: gmail_v1.Gmail,
  startHistoryId: string
): Promise<{ ids: string[]; latestHistoryId: string }> {
  const ids = new Set<string>();
  let pageToken: string | undefined = undefined;
  let latest = startHistoryId;

  while (true) {
    let data: gmail_v1.Schema$ListHistoryResponse;
    try {
      const res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
        ...(pageToken ? { pageToken } : {}),
      });
      data = res.data;
    } catch (err: unknown) {
      const code = (err as { code?: number; response?: { status?: number } })?.code
        ?? (err as { response?: { status?: number } })?.response?.status;
      if (code === 404) throw new HistoryTooOldError();
      throw err;
    }

    if (data.historyId) latest = data.historyId;
    for (const h of data.history ?? []) {
      for (const ma of h.messagesAdded ?? []) {
        if (ma.message?.id) ids.add(ma.message.id);
      }
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return { ids: [...ids], latestHistoryId: latest };
}

/**
 * Walk a Gmail message's MIME tree and return the first text/plain body.
 * Falls back to the snippet if no text/plain part exists.
 */
function extractTextBody(msg: gmail_v1.Schema$Message): string {
  const decode = (data: string | null | undefined): string => {
    if (!data) return '';
    return Buffer.from(data, 'base64url').toString('utf8');
  };
  const walk = (part: gmail_v1.Schema$MessagePart): string | null => {
    if (part.mimeType === 'text/plain' && part.body?.data) return decode(part.body.data);
    for (const sub of part.parts ?? []) {
      const found = walk(sub);
      if (found) return found;
    }
    return null;
  };
  if (msg.payload) {
    const text = walk(msg.payload);
    if (text) return text;
  }
  return msg.snippet ?? '';
}

function header(msg: gmail_v1.Schema$Message, name: string): string {
  const h = msg.payload?.headers?.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? '';
}

/**
 * Sync once: fetch every messageAdded event since startHistoryId and return
 * fully-parsed FetchedMessage objects plus the new watermark to persist.
 */
export async function syncHistorySince(opts: {
  credentials: GoogleOAuthCredentials;
  connection: GoogleConnectionLike;
  startHistoryId: string;
}): Promise<{ messages: FetchedMessage[]; latestHistoryId: string }> {
  const oauth2 = buildOAuth2(opts.credentials, opts.connection);
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const { ids, latestHistoryId } = await listAddedMessageIds(gmail, opts.startHistoryId);

  const messages: FetchedMessage[] = [];
  for (const id of ids) {
    let raw;
    try {
      raw = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    } catch (err: unknown) {
      // Single-message 404 — message was deleted between history.list and
      // messages.get. Skip; the next sync will pick up subsequent state.
      const code = (err as { code?: number })?.code;
      if (code === 404) continue;
      throw err;
    }
    const m = raw.data;
    if (!m.id || !m.threadId) continue;

    const internetId = header(m, 'Message-ID').replace(/[<>]/g, '');
    messages.push({
      id: m.id,
      threadId: m.threadId,
      internetMessageId: internetId || `gmail-${m.id}`,
      from: header(m, 'From'),
      to: header(m, 'To'),
      subject: header(m, 'Subject'),
      bodyText: extractTextBody(m),
      receivedAt: m.internalDate ? new Date(parseInt(m.internalDate, 10)) : new Date(),
      labelIds: m.labelIds ?? [],
      snippet: m.snippet ?? '',
    });
  }

  return { messages, latestHistoryId };
}
