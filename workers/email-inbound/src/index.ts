/**
 * Cloudflare Email Worker — SD Inbound Email Gateway
 *
 * Receives catch-all email for *@simplerdevelopment.com, parses MIME via
 * postal-mime (handles nested multipart correctly), streams attachments to
 * R2, caps the forwarded body so the JSON stays under Vercel's 4.5MB
 * function payload limit, and POSTs to the Next.js API. The API dispatches
 * on recipient address — brain+<token>@… ingests into Company Brain;
 * everything else flows through the existing AI chat loop.
 *
 * Setup:
 *   1. Email Routing on simplerdevelopment.com → catch-all to this worker
 *   2. R2 bucket `brain-email-attachments` exists (wrangler r2 bucket create …)
 *   3. `wrangler secret put INBOUND_EMAIL_SECRET`
 *   4. `npx wrangler deploy`
 */

import PostalMime from 'postal-mime';

export interface Env {
  API_URL: string;
  INBOUND_EMAIL_SECRET: string;
  ATTACHMENTS: R2Bucket;
}

interface OutboundAttachment {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

// Vercel serverless functions reject bodies over ~4.5MB. The JSON envelope
// (secret, headers, attachment metadata, JSON overhead) is small, so the body
// has plenty of room — but we still cap aggressively because real emails with
// long quoted threads can run several MB on their own.
const MAX_BODY_BYTES = 1_000_000; // 1 MB

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const from = message.from;
    const to = message.to;

    const rawBytes = await streamToBytes(message.raw);

    let parsed;
    try {
      parsed = await PostalMime.parse(rawBytes);
    } catch (err) {
      console.error('postal-mime parse failed:', err);
      return;
    }

    const subject = parsed.subject || '(no subject)';
    const messageId = parsed.messageId || `gen-${Date.now()}`;

    // Prefer plain text, fall back to a stripped HTML version. Both cap to
    // MAX_BODY_BYTES so we never exceed the API's payload limit.
    const text = (parsed.text || '').trim();
    const fallbackHtml = (parsed.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const rawBody = text || fallbackHtml;
    const truncated = rawBody.length > MAX_BODY_BYTES;
    const body = truncated ? rawBody.slice(0, MAX_BODY_BYTES) + '\n\n[... truncated, see raw email in R2 ...]' : rawBody;

    if (!body && (parsed.attachments || []).length === 0) {
      // Nothing to ingest.
      return;
    }

    const idSafe = messageId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);

    // If we truncated, archive the raw email in R2 so the meeting record can
    // link out to the full source.
    if (truncated) {
      try {
        await env.ATTACHMENTS.put(`email-attachments/${idSafe}/__raw.eml`, rawBytes, {
          httpMetadata: { contentType: 'message/rfc822' },
        });
      } catch (err) {
        console.error('R2 raw upload failed:', err);
      }
    }

    // Stream parsed attachments to R2.
    const attachments: OutboundAttachment[] = [];
    for (const a of parsed.attachments || []) {
      const filename = a.filename || `attachment-${attachments.length + 1}`;
      const filenameSafe = filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200) || 'attachment';
      const key = `email-attachments/${idSafe}/${filenameSafe}`;
      const bytes = a.content instanceof ArrayBuffer
        ? new Uint8Array(a.content)
        : (a.content as Uint8Array);
      const contentType = a.mimeType || 'application/octet-stream';
      try {
        await env.ATTACHMENTS.put(key, bytes, {
          httpMetadata: { contentType },
        });
        attachments.push({ key, filename, contentType, size: bytes.byteLength });
      } catch (err) {
        console.error(`R2 upload failed for ${filename}:`, err);
      }
    }

    const payload = {
      secret: env.INBOUND_EMAIL_SECRET,
      from,
      to,
      subject,
      body,
      messageId,
      attachments,
      truncated,
    };

    try {
      const response = await fetch(env.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error (${response.status}): ${errorText.slice(0, 500)}`);
      }
    } catch (err) {
      console.error('Failed to forward email to API:', err);
    }
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

async function streamToBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
