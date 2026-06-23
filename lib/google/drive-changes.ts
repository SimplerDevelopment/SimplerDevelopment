/**
 * Drive sync for Meet Recordings → Brain meetings.
 *
 * Each Google Workspace user connection has a `driveStartPageToken` watermark.
 * On each sync pass we pull `drive.changes.list({ pageToken })`, filter to
 * Google Docs whose parent folder is "Meet Recordings", export the Doc as
 * plain text, and dispatch through the google_meet_recording adapter
 * (createMeetingFromAdapter handles dedup on (clientId, sourceRef)).
 *
 * Why filter on parent folder rather than file name?
 * Google generates several artifact types per Meet recording — the auto-named
 * Doc varies ("Notes by Gemini in <meeting>", "Transcript - <meeting>", etc.)
 * — but they all land in the same "Meet Recordings" auto-folder. Folder match
 * is the stable contract.
 */

import { google, type drive_v3 } from 'googleapis';
import { randomBytes, randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { googleWorkspaceUserConnections } from '@/lib/db/schema';
import type { GoogleConnectionLike, GoogleOAuthCredentials } from '@/lib/google/oauth';
import { createMeetingFromAdapter } from '@/lib/brain/meetings';
import { getOrCreateBrainProfile } from '@/lib/brain/profiles';
import { getMeetingAdapter } from '@/lib/brain/meeting-sources';

export interface DriveWatchResult {
  channelId: string;
  resourceId: string;
  channelToken: string;
  expiration: Date;
}

export interface DriveSyncResult {
  scanned: number;
  ingested: number;
  skipped: number;
  errors: Array<{ fileId: string; error: string }>;
  newPageToken: string | null;
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

/** Drive API gives us back a base page token to use for the FIRST changes.list
 *  call. Persist this on connect so we don't replay the user's whole drive. */
export async function getDriveStartPageToken(args: {
  credentials: GoogleOAuthCredentials;
  connection: GoogleConnectionLike;
}): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: buildOAuth2(args.credentials, args.connection) });
  const res = await drive.changes.getStartPageToken({});
  if (!res.data.startPageToken) throw new Error('drive.changes.getStartPageToken returned no token');
  return res.data.startPageToken;
}

/** The "Meet Recordings" folder is auto-created by Google Meet on first
 *  recording. Find it by name + mimeType. Returns null if the user has never
 *  recorded a Meet (no folder yet). */
export async function findMeetRecordingsFolderId(args: {
  credentials: GoogleOAuthCredentials;
  connection: GoogleConnectionLike;
}): Promise<string | null> {
  const drive = google.drive({ version: 'v3', auth: buildOAuth2(args.credentials, args.connection) });
  const res = await drive.files.list({
    q: "name = 'Meet Recordings' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
    fields: 'files(id, name, ownedByMe)',
    pageSize: 5,
    spaces: 'drive',
  });
  const owned = (res.data.files ?? []).find((f) => f.ownedByMe);
  return owned?.id ?? res.data.files?.[0]?.id ?? null;
}

/** Pull file metadata enough to filter (parents) + ingest (createdTime, name). */
async function getFileMeta(
  drive: drive_v3.Drive,
  fileId: string,
): Promise<drive_v3.Schema$File | null> {
  try {
    const res = await drive.files.get({
      fileId,
      fields: 'id, name, mimeType, parents, createdTime, modifiedTime, ownedByMe, trashed, webViewLink',
      supportsAllDrives: true,
    });
    return res.data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/404|not found/i.test(msg)) return null; // file deleted between change + read
    throw err;
  }
}

/** Export a Google Doc as plain text. Empty string if export fails or Doc is empty. */
async function exportDocAsText(drive: drive_v3.Drive, fileId: string): Promise<string> {
  const res = await drive.files.export(
    { fileId, mimeType: 'text/plain' },
    { responseType: 'text' },
  );
  // googleapis returns the body as a string when responseType='text'
  return typeof res.data === 'string' ? res.data : String(res.data ?? '');
}

/**
 * Walk drive.changes.list pages from the connection's stored pageToken,
 * filter to Google Docs in the Meet Recordings folder, and dispatch each
 * through the google_meet_recording adapter. Persists the new page token at
 * the end so the next call resumes cleanly. Per-file failures are recorded
 * and don't abort the run.
 */
export async function syncDriveChangesForConnection(args: {
  credentials: GoogleOAuthCredentials;
  connection: GoogleConnectionLike & { id: number; driveStartPageToken: string | null };
  clientId: number;
  userId: number;
  meetRecordingsFolderId: string | null;
}): Promise<DriveSyncResult> {
  const result: DriveSyncResult = { scanned: 0, ingested: 0, skipped: 0, errors: [], newPageToken: null };

  const startToken = args.connection.driveStartPageToken;
  if (!startToken) {
    throw new Error('connection has no driveStartPageToken — call getDriveStartPageToken on connect first');
  }

  // Folder ID may not be cached yet — try to find it now (returns null if the
  // user has never recorded a Meet; in that case we just no-op until they do).
  let folderId = args.meetRecordingsFolderId;
  if (!folderId) {
    folderId = await findMeetRecordingsFolderId({ credentials: args.credentials, connection: args.connection });
    if (!folderId) {
      // Nothing to sync, but still advance the page token so we don't re-scan
      // the same change set every minute.
      const drive = google.drive({ version: 'v3', auth: buildOAuth2(args.credentials, args.connection) });
      const res = await drive.changes.list({ pageToken: startToken, pageSize: 1, fields: 'newStartPageToken' });
      if (res.data.newStartPageToken) {
        await db.update(googleWorkspaceUserConnections)
          .set({ driveStartPageToken: res.data.newStartPageToken, lastSyncAt: new Date() })
          .where(eq(googleWorkspaceUserConnections.id, args.connection.id));
        result.newPageToken = res.data.newStartPageToken;
      }
      return result;
    }
  }

  const drive = google.drive({ version: 'v3', auth: buildOAuth2(args.credentials, args.connection) });
  const profile = await getOrCreateBrainProfile(args.clientId, 'Brain');
  if (!getMeetingAdapter('google_meet_recording')) {
    throw new Error('google_meet_recording adapter not registered');
  }

  let pageToken: string | undefined = startToken;
  let newStartPageToken: string | null = null;

  while (pageToken) {
    const changeList: drive_v3.Schema$ChangeList = (await drive.changes.list({
      pageToken,
      pageSize: 100,
      includeRemoved: false,
      restrictToMyDrive: true,
      spaces: 'drive',
      fields: 'changes(fileId, removed, file(id, name, mimeType, parents, trashed)), nextPageToken, newStartPageToken',
    })).data;

    for (const change of changeList.changes ?? []) {
      result.scanned += 1;
      if (change.removed) { result.skipped += 1; continue; }
      const f = change.file;
      if (!f || !f.id) { result.skipped += 1; continue; }
      if (f.trashed) { result.skipped += 1; continue; }
      // Only Google Docs land here from Meet recordings (transcripts + Gemini notes).
      // Keep the filter loose enough to also accept ordinary .doc / .pdf if that
      // ever changes, but require the Meet Recordings parent.
      if (!(f.parents ?? []).includes(folderId)) { result.skipped += 1; continue; }
      if (f.mimeType !== 'application/vnd.google-apps.document') { result.skipped += 1; continue; }

      try {
        const meta = await getFileMeta(drive, f.id);
        if (!meta) { result.skipped += 1; continue; }
        const text = await exportDocAsText(drive, f.id);
        if (!text || !text.trim()) { result.skipped += 1; continue; }

        await createMeetingFromAdapter({
          adapterId: 'google_meet_recording',
          input: {
            fileId: f.id,
            name: meta.name ?? f.name ?? '(Meet recording)',
            createdTime: meta.createdTime ?? null,
            webViewLink: meta.webViewLink ?? null,
            parentFolderId: folderId,
            text,
          },
          ctx: { clientId: args.clientId, userId: args.userId, profile },
        });
        result.ingested += 1;
      } catch (err) {
        result.errors.push({ fileId: f.id, error: err instanceof Error ? err.message : String(err) });
      }
    }

    pageToken = changeList.nextPageToken ?? undefined;
    if (changeList.newStartPageToken) newStartPageToken = changeList.newStartPageToken;
  }

  // Advance watermark even if zero changes — that's how getStartPageToken bumps.
  const tokenToPersist = newStartPageToken ?? startToken;
  await db.update(googleWorkspaceUserConnections)
    .set({ driveStartPageToken: tokenToPersist, lastSyncAt: new Date() })
    .where(eq(googleWorkspaceUserConnections.id, args.connection.id));
  result.newPageToken = tokenToPersist;

  return result;
}

/**
 * Subscribe to drive.changes via an HTTP push channel. Google will POST
 * X-Goog-Channel-* headers to `address` whenever any file changes for this
 * user; our webhook handler validates the channel-token header against the
 * value we persist, then dispatches the same syncDriveChangesForConnection
 * the cron uses.
 *
 * Channels expire after 1 day by default (Drive's max is ~7 but the API often
 * caps lower); a daily cron near the expiration re-subscribes.
 *
 * Idempotent at the call site: callers should stopDriveChanges first if a
 * channel already exists, otherwise Google may keep delivering on both.
 */
export async function subscribeDriveChanges(args: {
  credentials: GoogleOAuthCredentials;
  connection: GoogleConnectionLike & { driveStartPageToken: string };
  webhookAddress: string;
  /** TTL hint in ms — Google caps. Default: 1 day. */
  ttlMs?: number;
}): Promise<DriveWatchResult> {
  const drive = google.drive({ version: 'v3', auth: buildOAuth2(args.credentials, args.connection) });
  const channelId = randomUUID();
  const channelToken = randomBytes(24).toString('hex');
  const ttl = args.ttlMs ?? 24 * 60 * 60 * 1000;
  const requestedExpiration = String(Date.now() + ttl);

  const res = await drive.changes.watch({
    pageToken: args.connection.driveStartPageToken,
    requestBody: {
      id: channelId,
      type: 'web_hook',
      address: args.webhookAddress,
      token: channelToken,
      expiration: requestedExpiration,
    },
  });

  if (!res.data.resourceId) {
    throw new Error('drive.changes.watch returned no resourceId');
  }
  const expirationMs = res.data.expiration ? parseInt(res.data.expiration, 10) : NaN;
  if (!Number.isFinite(expirationMs)) {
    throw new Error(`drive.changes.watch returned non-numeric expiration: ${res.data.expiration}`);
  }
  return {
    channelId,
    resourceId: res.data.resourceId,
    channelToken,
    expiration: new Date(expirationMs),
  };
}

/** Tear down an existing drive watch channel. Safe to call when the channel
 *  may already be expired/dead — Google returns 404 in that case which we
 *  swallow. */
export async function stopDriveChanges(args: {
  credentials: GoogleOAuthCredentials;
  connection: GoogleConnectionLike;
  channelId: string;
  resourceId: string;
}): Promise<void> {
  const drive = google.drive({ version: 'v3', auth: buildOAuth2(args.credentials, args.connection) });
  try {
    await drive.channels.stop({ requestBody: { id: args.channelId, resourceId: args.resourceId } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/404|not found|gone/i.test(msg)) return;
    throw err;
  }
}

/**
 * Backfill: list every Google Doc currently in the Meet Recordings folder
 * (oldest → newest, capped) and dispatch each through the adapter. Used to
 * pull in pre-existing recordings on first connect — the changes API only
 * sees deltas from the watermark forward, so historical files would otherwise
 * never sync.
 *
 * Idempotent on (clientId, sourceRef=fileId): re-running the backfill on the
 * same folder updates existing rows rather than duplicating.
 */
export async function backfillMeetRecordingsFolder(args: {
  credentials: GoogleOAuthCredentials;
  connection: GoogleConnectionLike;
  clientId: number;
  userId: number;
  meetRecordingsFolderId: string;
  /** Cap on how many files to ingest in one pass. Default 50. */
  limit?: number;
}): Promise<DriveSyncResult> {
  const result: DriveSyncResult = { scanned: 0, ingested: 0, skipped: 0, errors: [], newPageToken: null };
  const drive = google.drive({ version: 'v3', auth: buildOAuth2(args.credentials, args.connection) });
  const profile = await getOrCreateBrainProfile(args.clientId, 'Brain');
  if (!getMeetingAdapter('google_meet_recording')) {
    throw new Error('google_meet_recording adapter not registered');
  }

  const limit = args.limit ?? 50;
  let pageToken: string | undefined;
  let collected: drive_v3.Schema$File[] = [];

  while (collected.length < limit) {
    const remaining = limit - collected.length;
    const res = await drive.files.list({
      q: `'${args.meetRecordingsFolderId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.document'`,
      fields: 'files(id, name, mimeType, createdTime, webViewLink), nextPageToken',
      pageSize: Math.min(100, remaining),
      orderBy: 'createdTime',
      pageToken,
    });
    const files = res.data.files ?? [];
    collected = collected.concat(files);
    pageToken = res.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  for (const f of collected.slice(0, limit)) {
    if (!f.id) { result.skipped += 1; continue; }
    result.scanned += 1;
    try {
      const text = await exportDocAsText(drive, f.id);
      if (!text || !text.trim()) { result.skipped += 1; continue; }
      await createMeetingFromAdapter({
        adapterId: 'google_meet_recording',
        input: {
          fileId: f.id,
          name: f.name ?? '(Meet recording)',
          createdTime: f.createdTime ?? null,
          webViewLink: f.webViewLink ?? null,
          parentFolderId: args.meetRecordingsFolderId,
          text,
        },
        ctx: { clientId: args.clientId, userId: args.userId, profile },
      });
      result.ingested += 1;
    } catch (err) {
      result.errors.push({ fileId: f.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
