import { google } from 'googleapis';
import { uploadToS3 } from '@/lib/s3/upload';
import type { GoogleConnectionLike, GoogleOAuthCredentials } from '@/lib/google/oauth';
import type { GmailAttachmentRef } from '@/lib/google/gmail-history';

/**
 * Fetch each Gmail attachment's bytes and upload to S3. Returns metadata in
 * the same shape the MX-routed inbound flow uses (so the brain meeting detail
 * page can render both sources uniformly via source_metadata.attachments).
 *
 *   { key, filename, contentType, size }
 *
 * The `key` is the S3 object key (prefixed `media/`) that the brain
 * attachment proxy route discriminates on to dispatch S3 vs R2.
 *
 * Per-attachment behavior:
 *   - Capped at 25 MB (Gmail's outgoing limit; conservative re: serverless memory)
 *   - On any single attachment failure: skip that one and continue
 *   - Inline images get uploaded too — UI can filter later
 */

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface UploadedAttachment {
  key: string;
  filename: string;
  contentType: string;
  size: number;
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

export async function fetchAndUploadGmailAttachments(opts: {
  credentials: GoogleOAuthCredentials;
  connection: GoogleConnectionLike;
  messageId: string;
  refs: GmailAttachmentRef[];
}): Promise<UploadedAttachment[]> {
  if (opts.refs.length === 0) return [];

  const oauth2 = buildOAuth2(opts.credentials, opts.connection);
  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const uploaded: UploadedAttachment[] = [];
  for (const ref of opts.refs) {
    if (ref.size > MAX_ATTACHMENT_BYTES) {
      console.warn(
        `[gmail-attachments] skipping ${ref.filename} (${ref.size} bytes > ${MAX_ATTACHMENT_BYTES})`
      );
      continue;
    }

    let buffer: Buffer;
    try {
      const res = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: opts.messageId,
        id: ref.attachmentId,
      });
      const data = res.data.data;
      if (!data) {
        console.warn(`[gmail-attachments] empty data for ${ref.filename}`);
        continue;
      }
      buffer = Buffer.from(data, 'base64url');
    } catch (err) {
      console.error(`[gmail-attachments] fetch failed for ${ref.filename}`, err);
      continue;
    }

    try {
      const result = await uploadToS3(buffer, ref.filename, ref.contentType);
      // result.url is `/api/media/proxy/<key>`; we want just the storage key
      // since the brain attachment proxy will reconstruct the URL.
      const key = result.url.replace(/^\/api\/media\/proxy\//, '');
      uploaded.push({
        key,
        filename: ref.filename,
        contentType: result.mimeType,
        size: result.fileSize,
      });
    } catch (err) {
      console.error(`[gmail-attachments] S3 upload failed for ${ref.filename}`, err);
      continue;
    }
  }

  return uploaded;
}
