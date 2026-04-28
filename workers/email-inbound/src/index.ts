/**
 * Cloudflare Email Worker — SD Inbound Email Gateway
 *
 * Receives catch-all email for *@simplerdevelopment.com, parses MIME, streams
 * attachments to R2 (so the JSON payload to the API stays small), and forwards
 * a structured payload to the Next.js API. The API dispatches on the recipient
 * address — brain+<token>@… is ingested into the company brain; everything
 * else goes through the existing AI chat loop.
 *
 * Setup:
 *   1. Email Routing on simplerdevelopment.com → catch-all to this worker
 *   2. R2 bucket `brain-email-attachments` exists (wrangler r2 bucket create …)
 *   3. `wrangler secret put INBOUND_EMAIL_SECRET`
 *   4. `npx wrangler deploy`
 */

export interface Env {
  API_URL: string;
  INBOUND_EMAIL_SECRET: string;
  ATTACHMENTS: R2Bucket;
}

interface ParsedAttachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

interface OutboundAttachment {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const from = message.from;
    const to = message.to;

    const rawEmail = await streamToString(message.raw);

    const subject = extractHeader(rawEmail, 'Subject') || '(no subject)';
    const messageId = extractHeader(rawEmail, 'Message-ID') || `gen-${Date.now()}`;
    const textBody = extractTextBody(rawEmail);
    const attachmentsParsed = extractAttachments(rawEmail);

    if (!textBody.trim() && attachmentsParsed.length === 0) {
      return;
    }

    // Stream attachments to R2 before forwarding. We key by message id (made
    // safe for R2) so the same email re-delivered overwrites in place — no
    // duplicate blobs from accidental retries.
    const attachments: OutboundAttachment[] = [];
    const idSafe = messageId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);

    for (const a of attachmentsParsed) {
      const filenameSafe = a.filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200) || 'attachment';
      const key = `email-attachments/${idSafe}/${filenameSafe}`;
      try {
        await env.ATTACHMENTS.put(key, a.bytes, {
          httpMetadata: { contentType: a.contentType },
        });
        attachments.push({
          key,
          filename: a.filename,
          contentType: a.contentType,
          size: a.bytes.byteLength,
        });
      } catch (err) {
        console.error(`R2 upload failed for ${a.filename}:`, err);
      }
    }

    const payload = {
      secret: env.INBOUND_EMAIL_SECRET,
      from,
      to,
      subject,
      body: textBody,
      messageId,
      attachments,
    };

    try {
      const response = await fetch(env.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error (${response.status}): ${errorText}`);
      }
    } catch (err) {
      console.error('Failed to forward email to API:', err);
    }
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

function extractHeader(raw: string, name: string): string | null {
  const headerEnd = raw.indexOf('\r\n\r\n');
  const headers = headerEnd > 0 ? raw.substring(0, headerEnd) : raw;
  const unfolded = headers.replace(/\r\n[\t ]+/g, ' ');
  const regex = new RegExp(`^${name}:\\s*(.+)$`, 'mi');
  const match = unfolded.match(regex);
  return match ? match[1].trim() : null;
}

function extractTextBody(raw: string): string {
  const headerEnd = raw.indexOf('\r\n\r\n');
  if (headerEnd < 0) return raw;

  const body = raw.substring(headerEnd + 4);
  const contentType = extractHeader(raw, 'Content-Type') || '';

  if (!contentType.includes('multipart')) {
    return decodeBodyText(body, extractHeader(raw, 'Content-Transfer-Encoding'));
  }

  const boundary = parseBoundary(contentType);
  if (!boundary) return body;

  const parts = body.split(`--${boundary}`);

  for (const part of parts) {
    if (part.trim() === '--' || part.trim() === '') continue;
    const partHeaderEnd = part.indexOf('\r\n\r\n');
    if (partHeaderEnd < 0) continue;
    const partHeaders = part.substring(0, partHeaderEnd);
    const partBody = part.substring(partHeaderEnd + 4);

    if (partHeaders.toLowerCase().includes('text/plain')) {
      const encoding = partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1];
      return decodeBodyText(partBody, encoding || null).trim();
    }
  }

  for (const part of parts) {
    const partHeaderEnd = part.indexOf('\r\n\r\n');
    if (partHeaderEnd < 0) continue;
    const partHeaders = part.substring(0, partHeaderEnd);
    const partBody = part.substring(partHeaderEnd + 4);

    if (partHeaders.toLowerCase().includes('text/html')) {
      const encoding = partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1];
      const html = decodeBodyText(partBody, encoding || null);
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  return body.trim();
}

/**
 * Walk multipart parts and pull anything with a filename or
 * Content-Disposition: attachment. Returns decoded bytes ready for R2.
 */
function extractAttachments(raw: string): ParsedAttachment[] {
  const headerEnd = raw.indexOf('\r\n\r\n');
  if (headerEnd < 0) return [];
  const body = raw.substring(headerEnd + 4);
  const contentType = extractHeader(raw, 'Content-Type') || '';
  if (!contentType.includes('multipart')) return [];

  const boundary = parseBoundary(contentType);
  if (!boundary) return [];

  const parts = body.split(`--${boundary}`);
  const out: ParsedAttachment[] = [];

  for (const part of parts) {
    if (part.trim() === '--' || part.trim() === '') continue;
    const partHeaderEnd = part.indexOf('\r\n\r\n');
    if (partHeaderEnd < 0) continue;
    const headers = part.substring(0, partHeaderEnd);
    const headersLower = headers.toLowerCase();

    // Skip text bodies — only files
    if (headersLower.includes('text/plain') && !headersLower.includes('attachment')) continue;
    if (headersLower.includes('text/html') && !headersLower.includes('attachment')) continue;

    // Look for filename in Content-Disposition or Content-Type
    const filename =
      extractParam(headers, 'Content-Disposition', 'filename') ||
      extractParam(headers, 'Content-Type', 'name') ||
      null;
    const isAttachment = /Content-Disposition:\s*attachment/i.test(headers);

    if (!filename && !isAttachment) continue;
    if (!filename) continue; // attachment without a filename — skip

    const ctMatch = headers.match(/Content-Type:\s*([^\s;]+)/i);
    const partContentType = ctMatch ? ctMatch[1].trim() : 'application/octet-stream';
    const encoding = headers.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1] || null;

    // Strip the trailing CRLF that lives between body and the next boundary
    const partBody = part.substring(partHeaderEnd + 4).replace(/\r?\n$/, '');
    const bytes = decodeBodyBytes(partBody, encoding);
    if (bytes.byteLength === 0) continue;

    out.push({ filename, contentType: partContentType, bytes });
  }

  return out;
}

function parseBoundary(contentType: string): string | null {
  const m = contentType.match(/boundary="?([^";\r\n]+)"?/);
  return m ? m[1] : null;
}

function extractParam(headers: string, headerName: string, paramName: string): string | null {
  const re = new RegExp(`${headerName}:[^\\r\\n]*?${paramName}="?([^";\\r\\n]+)"?`, 'i');
  const m = headers.match(re);
  return m ? m[1].trim() : null;
}

function decodeBodyText(body: string, encoding: string | null): string {
  if (!encoding) return body;
  switch (encoding.toLowerCase()) {
    case 'base64':
      try { return atob(body.replace(/\s/g, '')); } catch { return body; }
    case 'quoted-printable':
      return body
        .replace(/=\r?\n/g, '')
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    default:
      return body;
  }
}

function decodeBodyBytes(body: string, encoding: string | null): Uint8Array {
  if (!encoding || encoding.toLowerCase() === '7bit' || encoding.toLowerCase() === '8bit' || encoding.toLowerCase() === 'binary') {
    return new TextEncoder().encode(body);
  }
  if (encoding.toLowerCase() === 'base64') {
    try {
      const bin = atob(body.replace(/\s/g, ''));
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return bytes;
    } catch {
      return new TextEncoder().encode(body);
    }
  }
  if (encoding.toLowerCase() === 'quoted-printable') {
    const decoded = body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const bytes = new Uint8Array(decoded.length);
    for (let i = 0; i < decoded.length; i++) bytes[i] = decoded.charCodeAt(i) & 0xff;
    return bytes;
  }
  return new TextEncoder().encode(body);
}
