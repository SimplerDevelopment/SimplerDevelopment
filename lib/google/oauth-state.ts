import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { GoogleSurface } from '@/lib/google/scopes';

/**
 * The OAuth state parameter is opaque to Google but critical to us — it carries
 * the trust we need to know which client/user initiated this flow. Google passes
 * it back unchanged, so anything signed at /connect time arrives at /callback
 * intact.
 *
 * Format: base64url(payload).base64url(hmac_sha256(payload))
 *   payload = JSON({ clientId, userId, surfaces, nonce, expiresAt })
 *
 * HMAC keyed by OAUTH_STATE_SECRET (env). Forging a state requires the secret;
 * tampering with the payload invalidates the HMAC.
 *
 * TTL is intentionally short (10 min) — OAuth flows complete in <2 min in
 * practice, and a stale state replay should be rejected.
 */

const STATE_TTL_MS = 10 * 60 * 1000;

interface StatePayload {
  clientId: number;
  userId: number;
  surfaces: GoogleSurface[];
  nonce: string;
  expiresAt: number;
  returnTo?: string;
}

function getSecret(): Buffer {
  const hex = process.env.OAUTH_STATE_SECRET;
  if (!hex) {
    throw new Error('OAUTH_STATE_SECRET env var is not set. Generate: openssl rand -hex 32');
  }
  if (hex.length < 32) {
    throw new Error('OAUTH_STATE_SECRET must be at least 32 chars');
  }
  return Buffer.from(hex, 'utf8');
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return b.toString('base64url');
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

export function signState(opts: {
  clientId: number;
  userId: number;
  surfaces: readonly GoogleSurface[];
  returnTo?: string;
}): string {
  const payload: StatePayload = {
    clientId: opts.clientId,
    userId: opts.userId,
    surfaces: [...opts.surfaces],
    nonce: randomBytes(16).toString('base64url'),
    expiresAt: Date.now() + STATE_TTL_MS,
    ...(opts.returnTo ? { returnTo: opts.returnTo } : {}),
  };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = b64urlEncode(payloadStr);
  const sig = createHmac('sha256', getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

export class StateInvalidError extends Error {
  constructor(public reason: 'malformed' | 'bad_signature' | 'expired') {
    super(`OAuth state invalid: ${reason}`);
    this.name = 'StateInvalidError';
  }
}

export function verifyState(state: string): StatePayload {
  const parts = state.split('.');
  if (parts.length !== 2) throw new StateInvalidError('malformed');
  const [payloadB64, sigB64] = parts;

  const expectedSig = createHmac('sha256', getSecret()).update(payloadB64).digest();
  const providedSig = b64urlDecode(sigB64);
  if (
    expectedSig.length !== providedSig.length ||
    !timingSafeEqual(expectedSig, providedSig)
  ) {
    throw new StateInvalidError('bad_signature');
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
  } catch {
    throw new StateInvalidError('malformed');
  }

  if (
    typeof payload.clientId !== 'number' ||
    typeof payload.userId !== 'number' ||
    !Array.isArray(payload.surfaces) ||
    typeof payload.nonce !== 'string' ||
    typeof payload.expiresAt !== 'number'
  ) {
    throw new StateInvalidError('malformed');
  }

  if (Date.now() > payload.expiresAt) {
    throw new StateInvalidError('expired');
  }

  return payload;
}
