// Admin "impersonate-as-client" helpers.
//
// Staff users (users.role in {admin, employee, editor}) can step into any
// client's portal experience without logging out and back in. Implemented as a
// short-lived, HMAC-signed HTTP-only cookie that names the target clientId.
//
// Security model:
// - Cookie is HMAC-signed with AUTH_SECRET. A tampered cookie fails verify and
//   is silently ignored.
// - Cookie is only HONORED when the requester is a staff user. A non-staff
//   user that somehow received this cookie sees no effect (the guard lives in
//   `getImpersonatedClientId`, which every consumer must pass the userRole to).
// - 8-hour TTL baked into the signed payload — stale cookies are ignored.
// - No DB row: keep it cookie-only per the spec.
//
// Consumed by:
// - `lib/portal-client.ts` `getPortalClient(...)` (top-level priority over the
//   regular preferred-client cookie).
// - `components/portal/ImpersonationBanner.tsx` (UI banner).
// - `app/admin/clients/[id]/impersonate-actions.ts` (server actions).

import { createHmac, timingSafeEqual } from 'crypto';

export const IMPERSONATE_COOKIE = 'sd_impersonate_client_id';
const TTL_SECONDS = 60 * 60 * 8; // 8 hours

const STAFF_ROLES = new Set(['admin', 'employee', 'editor']);

/** Returns true if the role is allowed to start/honor impersonation. */
export function isStaffRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return STAFF_ROLES.has(role);
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('AUTH_SECRET (or NEXTAUTH_SECRET) is required for impersonation cookies.');
  }
  return secret;
}

interface Payload {
  clientId: number;
  staffUserId: number;
  /** Seconds since epoch. */
  iat: number;
}

function sign(payload: Payload): string {
  const body = `${payload.clientId}.${payload.staffUserId}.${payload.iat}`;
  const sig = createHmac('sha256', getSecret()).update(body).digest('hex');
  return `${body}.${sig}`;
}

function verify(token: string | undefined | null): Payload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [clientIdStr, staffUserIdStr, iatStr, sig] = parts;
  const body = `${clientIdStr}.${staffUserIdStr}.${iatStr}`;
  const expected = createHmac('sha256', getSecret()).update(body).digest('hex');

  let received: Buffer;
  try {
    received = Buffer.from(sig, 'hex');
  } catch {
    return null;
  }
  const expectedBuf = Buffer.from(expected, 'hex');
  if (received.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(received, expectedBuf)) return null;

  const clientId = Number(clientIdStr);
  const staffUserId = Number(staffUserIdStr);
  const iat = Number(iatStr);
  if (!Number.isFinite(clientId) || !Number.isFinite(staffUserId) || !Number.isFinite(iat)) return null;

  const now = Math.floor(Date.now() / 1000);
  if (now - iat > TTL_SECONDS) return null;
  if (iat - now > 60) return null; // future-dated → reject

  return { clientId, staffUserId, iat };
}

/**
 * Mint a new signed impersonation token. Caller is responsible for verifying
 * staff privilege BEFORE calling this — this function does not check the role.
 */
export function mintImpersonationToken(clientId: number, staffUserId: number): string {
  return sign({ clientId, staffUserId, iat: Math.floor(Date.now() / 1000) });
}

/**
 * Inspect the cookie payload without enforcing the staff check. Used by the
 * banner to render "you are impersonating..." UI. Returns null if the cookie
 * is missing, malformed, or expired.
 *
 * IMPORTANT: this is informational only. Code that grants access (e.g.
 * `getPortalClient`) must use `getImpersonatedClientId` and pass the caller's
 * actual role.
 */
export function readImpersonationCookie(rawToken: string | undefined | null): Payload | null {
  return verify(rawToken);
}

/**
 * Returns the target clientId if (a) the cookie verifies and (b) the caller
 * is a staff user. Returns null otherwise.
 *
 * This is the single security boundary for the read path. Non-staff users
 * never see a non-null result regardless of cookie state.
 */
export function getImpersonatedClientIdFromToken(
  rawToken: string | undefined | null,
  userRole: string | null | undefined,
): number | null {
  if (!isStaffRole(userRole)) return null;
  const payload = verify(rawToken);
  return payload?.clientId ?? null;
}

/** Cookie attributes for setting/clearing in route handlers. */
export const IMPERSONATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: TTL_SECONDS,
};
