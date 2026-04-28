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

// ─── HMAC helpers (used by the fetch handler that streams R2 attachments) ───
async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // GET /attachment?key=<r2-key>&exp=<unix-ts>&sig=<hmac-hex>
    // The Next.js API generates these short-lived signed URLs after verifying
    // session + meeting ownership; the worker only checks the signature, then
    // streams the R2 object back.
    const url = new URL(request.url);
    if (url.pathname !== '/attachment') {
      return new Response('Not found', { status: 404 });
    }
    const key = url.searchParams.get('key');
    const exp = url.searchParams.get('exp');
    const sig = url.searchParams.get('sig');
    if (!key || !exp || !sig) return new Response('Bad request', { status: 400 });

    const expNum = parseInt(exp, 10);
    if (!Number.isFinite(expNum) || expNum < Math.floor(Date.now() / 1000)) {
      return new Response('Expired', { status: 410 });
    }

    const expected = await hmacHex(env.INBOUND_EMAIL_SECRET, `${key}\n${exp}`);
    if (!await constantTimeEqual(expected, sig)) {
      return new Response('Forbidden', { status: 403 });
    }

    const obj = await env.ATTACHMENTS.get(key);
    if (!obj) return new Response('Not found', { status: 404 });

    const filename = key.split('/').pop() || 'attachment';
    const headers = new Headers();
    if (obj.httpMetadata?.contentType) headers.set('Content-Type', obj.httpMetadata.contentType);
    headers.set('Content-Length', String(obj.size));
    // inline so images render in-browser; the download button on the API side
    // can override this with `?download=1` if we ever want force-download UX.
    headers.set('Content-Disposition', `inline; filename="${filename}"`);
    headers.set('Cache-Control', 'private, max-age=300');
    return new Response(obj.body, { headers });
  },

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
