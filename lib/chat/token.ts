/**
 * Visitor ephemeral tokens — HMAC-signed `${conversationId}.${expiresAt}`.
 *
 * Visitors don't have NextAuth sessions; the widget sends them this token
 * after `POST /api/public/chat/start` so subsequent calls
 * (`messages` POST, `stream` GET) can be scoped to a single conversation.
 *
 * Symmetric HMAC is sufficient — these tokens are only ever verified by
 * the same Next.js process. We don't need rotating asymmetric keys.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

const TTL_MS = 24 * 60 * 60 * 1000; // 24h

function getSecret(): string {
  return (
    process.env.CHAT_TOKEN_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    // Dev-only fallback — emits the same value across reloads so tokens
    // stay valid in `bun dev`. NEVER rely on this in production.
    'dev-chat-token-secret'
  );
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('hex');
}

export function issueVisitorToken(conversationId: number, ttlMs: number = TTL_MS): string {
  const expiresAt = Date.now() + ttlMs;
  const payload = `${conversationId}.${expiresAt}`;
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export interface VerifiedVisitorToken {
  conversationId: number;
  expiresAt: number;
}

export function verifyVisitorToken(token: string | null | undefined): VerifiedVisitorToken | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [convStr, expStr, sig] = parts;
  const conversationId = Number.parseInt(convStr, 10);
  const expiresAt = Number.parseInt(expStr, 10);
  if (!Number.isInteger(conversationId) || conversationId <= 0) return null;
  if (!Number.isInteger(expiresAt) || expiresAt <= 0) return null;

  const expected = sign(`${convStr}.${expStr}`);
  // Both buffers must be the same length for timingSafeEqual.
  if (sig.length !== expected.length) return null;
  let ok = false;
  try {
    ok = timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return null;
  }
  if (!ok) return null;
  if (Date.now() > expiresAt) return null;
  return { conversationId, expiresAt };
}
