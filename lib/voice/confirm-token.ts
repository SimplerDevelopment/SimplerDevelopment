/**
 * Short-lived, server-signed confirmation tokens for the voice assistant.
 *
 * When the realtime model calls a mutating tool, the dispatcher does NOT execute
 * immediately — it returns a `needs_confirmation` response carrying a token that
 * binds the exact (tool, args, user, client) tuple. The widget shows a confirm
 * card; on approve it re-POSTs with the token. The dispatcher verifies the token
 * matches the re-submitted call before executing.
 *
 * This prevents two attacks:
 *  - a tampered client widening args between the confirm card and execution, and
 *  - the model "confirming" on its own — only a token minted by THIS server for
 *    THIS exact call is accepted.
 *
 * HMAC-SHA256 over a canonical payload, base64url-encoded. No DB row needed.
 */
import { createHmac, timingSafeEqual } from 'crypto';

const TTL_MS = 5 * 60 * 1000; // 5 minutes

function secret(): string {
  // Reuse the app auth secret; never ship a hardcoded fallback to production.
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) {
    throw new Error('AUTH_SECRET / NEXTAUTH_SECRET is required to sign voice confirm tokens');
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Canonical fingerprint of a tool call. Args are JSON-stringified with sorted
 * keys so re-serialization on the confirm round-trip produces the same string.
 */
function fingerprint(tool: string, args: unknown, userId: number, clientId: number): string {
  return JSON.stringify({ tool, args: canonical(args), userId, clientId });
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = canonical((value as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return value;
}

export function signConfirmToken(opts: {
  tool: string;
  args: unknown;
  userId: number;
  clientId: number;
}): string {
  const exp = Date.now() + TTL_MS;
  const fp = fingerprint(opts.tool, opts.args, opts.userId, opts.clientId);
  const payload = `${exp}.${b64url(createHmac('sha256', secret()).update(fp).digest())}`;
  // Outer HMAC binds the (exp + inner digest) so exp can't be extended.
  const mac = b64url(createHmac('sha256', secret()).update(payload).digest());
  return `${payload}.${mac}`;
}

export function verifyConfirmToken(
  token: string,
  opts: { tool: string; args: unknown; userId: number; clientId: number },
): boolean {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [expStr, innerDigest, mac] = parts;

  // 1. Verify outer MAC (tamper / exp-extension check).
  const payload = `${expStr}.${innerDigest}`;
  const expectedMac = b64url(createHmac('sha256', secret()).update(payload).digest());
  if (!safeEqual(mac, expectedMac)) return false;

  // 2. Expiry.
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;

  // 3. Inner digest must match the re-submitted call exactly.
  const fp = fingerprint(opts.tool, opts.args, opts.userId, opts.clientId);
  const expectedInner = b64url(createHmac('sha256', secret()).update(fp).digest());
  return safeEqual(innerDigest, expectedInner);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
