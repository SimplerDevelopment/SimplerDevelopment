// JWT verification for the WebSocket handshake. Token is passed via the
// `?token=` query parameter on the upgrade URL. The room (URL path) MUST
// match the `docKey` claim — otherwise a leaked token couldn't be confined
// to a single document.

import jwt from 'jsonwebtoken';

export interface RealtimeJwtClaims {
  sub: string;        // userId (string)
  name: string;
  avatar: string | null;
  color: string;
  clientId: number;
  docKey: string;     // "post:123" / "deck:abc" / "email:foo"
  scope: 'read' | 'write';
  iat?: number;
  exp?: number;
}

export interface VerifyResult {
  ok: true;
  claims: RealtimeJwtClaims;
}

export interface VerifyError {
  ok: false;
  status: number;
  message: string;
}

const VALID_ENTITY_TYPES = new Set(['post', 'deck', 'email']);

function isValidDocKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const idx = value.indexOf(':');
  if (idx <= 0) return false;
  const entityType = value.slice(0, idx);
  const entityId = value.slice(idx + 1);
  return VALID_ENTITY_TYPES.has(entityType) && entityId.length > 0;
}

function getSecret(): string | null {
  const s = process.env.REALTIME_JWT_SECRET;
  return s && s.length > 0 ? s : null;
}

/**
 * Verifies the JWT and that the requested room (URL path) matches the
 * token's docKey claim. Returns either `{ ok: true, claims }` or
 * `{ ok: false, status, message }` for the caller to translate into a
 * WebSocket close code.
 */
export function verifyHandshake(args: {
  token: string | null;
  requestedRoom: string;
}): VerifyResult | VerifyError {
  const secret = getSecret();
  if (!secret) {
    return { ok: false, status: 500, message: 'REALTIME_JWT_SECRET not set' };
  }
  if (!args.token) {
    return { ok: false, status: 401, message: 'Missing token' };
  }

  let decoded: jwt.JwtPayload;
  try {
    const result = jwt.verify(args.token, secret);
    if (typeof result === 'string') {
      return { ok: false, status: 401, message: 'Invalid token shape' };
    }
    decoded = result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token verification failed';
    return { ok: false, status: 401, message: msg };
  }

  if (!isValidDocKey(decoded.docKey)) {
    return { ok: false, status: 401, message: 'Invalid docKey claim' };
  }
  if (decoded.docKey !== args.requestedRoom) {
    return { ok: false, status: 403, message: 'Room/token mismatch' };
  }
  if (typeof decoded.sub !== 'string' || !decoded.sub) {
    return { ok: false, status: 401, message: 'Missing sub' };
  }
  if (typeof decoded.clientId !== 'number') {
    return { ok: false, status: 401, message: 'Missing clientId' };
  }
  const scope = decoded.scope === 'read' ? 'read' : 'write';

  return {
    ok: true,
    claims: {
      sub: decoded.sub,
      name: typeof decoded.name === 'string' ? decoded.name : 'User',
      avatar: typeof decoded.avatar === 'string' ? decoded.avatar : null,
      color: typeof decoded.color === 'string' ? decoded.color : '#3b82f6',
      clientId: decoded.clientId,
      docKey: decoded.docKey,
      scope,
      iat: decoded.iat,
      exp: decoded.exp,
    },
  };
}

/**
 * Constant-time string comparison for shared-secret headers. Avoids leaking
 * the secret length via early-exit comparisons on the `===` operator.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
