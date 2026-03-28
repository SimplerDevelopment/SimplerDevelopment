/**
 * Cloudflare Email Worker — SD Inbound Email Gateway
 *
 * Receives catch-all emails for *@simplerdevelopment.com,
 * parses the MIME message, and forwards to the Next.js API
 * which runs the AI chat loop and replies.
 *
 * Setup:
 * 1. Enable Email Routing on simplerdevelopment.com in Cloudflare dashboard
 * 2. Add a catch-all route pointing to this worker
 * 3. Set the INBOUND_EMAIL_SECRET via `wrangler secret put INBOUND_EMAIL_SECRET`
 * 4. Deploy: `cd workers/email-inbound && npx wrangler deploy`
 */

export interface Env {
  API_URL: string;
  INBOUND_EMAIL_SECRET: string;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    const from = message.from;
    const to = message.to;

    // Read the raw email body
    const rawEmail = await streamToString(message.raw);

    // Parse subject and text body from raw MIME
    const subject = extractHeader(rawEmail, 'Subject') || '(no subject)';
    const messageId = extractHeader(rawEmail, 'Message-ID') || '';
    const textBody = extractTextBody(rawEmail);

    if (!textBody.trim()) {
      // Empty email — ignore
      return;
    }

    // Forward to Next.js API
    const payload = {
      secret: env.INBOUND_EMAIL_SECRET,
      from,
      to,
      subject,
      body: textBody,
      messageId,
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
  // Headers end at the first blank line
  const headerEnd = raw.indexOf('\r\n\r\n');
  const headers = headerEnd > 0 ? raw.substring(0, headerEnd) : raw;

  // Handle folded headers (continuation lines start with whitespace)
  const unfolded = headers.replace(/\r\n[\t ]+/g, ' ');

  const regex = new RegExp(`^${name}:\\s*(.+)$`, 'mi');
  const match = unfolded.match(regex);
  return match ? match[1].trim() : null;
}

function extractTextBody(raw: string): string {
  // Find the boundary between headers and body
  const headerEnd = raw.indexOf('\r\n\r\n');
  if (headerEnd < 0) return raw;

  const headers = raw.substring(0, headerEnd);
  const body = raw.substring(headerEnd + 4);

  // Check content type
  const contentType = extractHeader(raw, 'Content-Type') || '';

  // Simple text/plain email
  if (!contentType.includes('multipart')) {
    return decodeBody(body, extractHeader(raw, 'Content-Transfer-Encoding'));
  }

  // Multipart — find boundary
  const boundaryMatch = contentType.match(/boundary="?([^";\r\n]+)"?/);
  if (!boundaryMatch) return body;

  const boundary = boundaryMatch[1];
  const parts = body.split(`--${boundary}`);

  // Look for text/plain part first, then text/html
  for (const part of parts) {
    if (part.trim() === '--' || part.trim() === '') continue;

    const partHeaderEnd = part.indexOf('\r\n\r\n');
    if (partHeaderEnd < 0) continue;

    const partHeaders = part.substring(0, partHeaderEnd);
    const partBody = part.substring(partHeaderEnd + 4);

    if (partHeaders.toLowerCase().includes('text/plain')) {
      const encoding = partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1];
      return decodeBody(partBody, encoding || null).trim();
    }
  }

  // Fallback: try to get any text content
  for (const part of parts) {
    const partHeaderEnd = part.indexOf('\r\n\r\n');
    if (partHeaderEnd < 0) continue;
    const partHeaders = part.substring(0, partHeaderEnd);
    const partBody = part.substring(partHeaderEnd + 4);

    if (partHeaders.toLowerCase().includes('text/html')) {
      const encoding = partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1];
      const html = decodeBody(partBody, encoding || null);
      // Strip HTML tags for a rough text version
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  return body.trim();
}

function decodeBody(body: string, encoding: string | null): string {
  if (!encoding) return body;

  switch (encoding.toLowerCase()) {
    case 'base64':
      try { return atob(body.replace(/\s/g, '')); } catch { return body; }
    case 'quoted-printable':
      return body
        .replace(/=\r?\n/g, '') // soft line breaks
        .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    default:
      return body;
  }
}
