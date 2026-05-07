/**
 * DropboxSign (formerly HelloSign) REST client.
 *
 * Thin fetch-based wrapper — we deliberately do NOT depend on the
 * `@dropbox/sign` SDK (it pulls in a lot for what amounts to four
 * endpoints). All public functions throw with a clear message when
 * the API key is missing instead of failing silently.
 *
 * Embedded signing flow:
 *   1. createSignatureRequest — uploads the contract PDF, returns a
 *      signature_request_id and per-signer signature_id.
 *   2. getEmbeddedSignUrl — returns a one-time URL (5-min TTL) that
 *      the portal embeds in an iframe via the DropboxSign JS embed.
 *   3. Webhook events drive status updates on the contract row.
 *
 * Test mode: defaults to true outside production so dev/staging don't
 * burn signature credits. Set explicitly to override.
 *
 * Webhook signature spec:
 *   HMAC-SHA256(api_key, raw_body) — hex-encoded — must match the
 *   `Hellosign-X-Signature` request header.
 */

import { createHmac, timingSafeEqual } from 'crypto';

const API_BASE = 'https://api.hellosign.com/v3';

type CreateSignatureRequestOpts = {
  fileBuffer: Buffer;
  fileName: string;
  signerEmail: string;
  signerName: string;
  title: string;
  subject: string;
  message: string;
  testMode?: boolean;
};

type CreateSignatureRequestResult = {
  signatureRequestId: string;
  signatureId: string;
};

type EmbeddedSignUrlResult = {
  signUrl: string;
  expiresAt: Date;
};

function getApiKey(): string {
  const key = process.env.DROPBOX_SIGN_API_KEY;
  if (!key) {
    throw new Error(
      'DropboxSign is not configured: set DROPBOX_SIGN_API_KEY in the environment.',
    );
  }
  return key;
}

function getWebhookSecret(): string {
  // The DropboxSign webhook signature is keyed on the API key by default,
  // but we expose DROPBOX_SIGN_WEBHOOK_SECRET as an explicit override so
  // test environments can use a separate verifier without reusing the
  // production API key.
  return process.env.DROPBOX_SIGN_WEBHOOK_SECRET || process.env.DROPBOX_SIGN_API_KEY || '';
}

function authHeader(): string {
  // DropboxSign uses HTTP Basic with the API key as the username and an empty password.
  const key = getApiKey();
  return 'Basic ' + Buffer.from(`${key}:`, 'utf8').toString('base64');
}

function defaultTestMode(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Creates an embedded signature request. Returns the provider's request id
 * (used for webhook lookups) and the per-signer signature id (used to mint
 * the embedded sign URL).
 */
export async function createSignatureRequest(
  opts: CreateSignatureRequestOpts,
): Promise<CreateSignatureRequestResult> {
  const apiKey = getApiKey();
  const testMode = opts.testMode ?? defaultTestMode();

  // Multipart/form-data body. We assemble it manually to avoid
  // pulling in form-data when the native FormData/Blob is sufficient.
  const form = new FormData();
  form.append('test_mode', testMode ? '1' : '0');
  form.append('client_id', process.env.DROPBOX_SIGN_CLIENT_ID || '');
  form.append('title', opts.title);
  form.append('subject', opts.subject);
  form.append('message', opts.message);
  form.append('signers[0][email_address]', opts.signerEmail);
  form.append('signers[0][name]', opts.signerName);
  form.append('signers[0][order]', '0');
  // Default signing — no custom fields. DropboxSign's default behavior
  // is to render a signature widget on the document.
  const blob = new Blob([new Uint8Array(opts.fileBuffer)], { type: 'application/pdf' });
  form.append('file[0]', blob, opts.fileName);

  const res = await fetch(`${API_BASE}/signature_request/create_embedded`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      // Don't set Content-Type — fetch handles the multipart boundary.
    },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DropboxSign create_embedded failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    signature_request?: {
      signature_request_id?: string;
      signatures?: Array<{ signature_id?: string }>;
    };
  };

  const signatureRequestId = json.signature_request?.signature_request_id;
  const signatureId = json.signature_request?.signatures?.[0]?.signature_id;
  if (!signatureRequestId || !signatureId) {
    throw new Error('DropboxSign returned an unexpected response shape (no signature ids).');
  }

  // Suppress unused-API-key lint — we read it above to fail-fast.
  void apiKey;
  return { signatureRequestId, signatureId };
}

/**
 * Mints a one-time embedded sign URL for a signer. The URL is valid for
 * 5 minutes — fetch it on demand right before rendering the iframe.
 */
export async function getEmbeddedSignUrl(signatureId: string): Promise<EmbeddedSignUrlResult> {
  if (!signatureId) throw new Error('signatureId is required.');
  const res = await fetch(`${API_BASE}/embedded/sign_url/${encodeURIComponent(signatureId)}`, {
    method: 'GET',
    headers: { Authorization: authHeader() },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DropboxSign sign_url failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    embedded?: { sign_url?: string; expires_at?: number };
  };

  const signUrl = json.embedded?.sign_url;
  const expiresAtSec = json.embedded?.expires_at;
  if (!signUrl) {
    throw new Error('DropboxSign returned no sign_url.');
  }
  const expiresAt = expiresAtSec
    ? new Date(expiresAtSec * 1000)
    : new Date(Date.now() + 5 * 60 * 1000);
  return { signUrl, expiresAt };
}

/**
 * Verifies the HMAC-SHA256 signature on a webhook payload.
 *
 * DropboxSign signs the body with the API key; we accept an explicit
 * webhook secret override via DROPBOX_SIGN_WEBHOOK_SECRET. Returns
 * false on any mismatch — never throws on bad input.
 */
export async function verifyWebhookSignature(rawBody: string, header: string | null | undefined): Promise<boolean> {
  if (!header) return false;
  const secret = getWebhookSecret();
  if (!secret) return false;

  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  // Constant-time compare. Both sides hex-encoded (lowercase).
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(header.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Cancels an in-flight signature request at the provider. Idempotent —
 * a 4xx response is logged and swallowed; the contract row is the
 * source of truth for status.
 */
export async function cancelSignatureRequest(signatureRequestId: string): Promise<void> {
  if (!signatureRequestId) return;
  const res = await fetch(`${API_BASE}/signature_request/cancel/${encodeURIComponent(signatureRequestId)}`, {
    method: 'POST',
    headers: { Authorization: authHeader() },
  });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text().catch(() => '');
    throw new Error(`DropboxSign cancel failed (${res.status}): ${text}`);
  }
}

/**
 * Returns a pre-signed URL to download the fully-signed PDF (with audit trail).
 * Returns null if the request hasn't been signed yet or the file isn't ready.
 */
export async function getSignedFileUrl(signatureRequestId: string): Promise<string | null> {
  if (!signatureRequestId) return null;
  const res = await fetch(
    `${API_BASE}/signature_request/files/${encodeURIComponent(signatureRequestId)}?file_type=pdf&get_url=1`,
    {
      method: 'GET',
      headers: { Authorization: authHeader() },
    },
  );
  if (!res.ok) {
    // 404 is normal pre-signing.
    return null;
  }
  const json = (await res.json()) as { file_url?: string };
  return json.file_url ?? null;
}
