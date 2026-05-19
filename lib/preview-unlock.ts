import { createHmac, timingSafeEqual } from 'crypto';

const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
if (!SECRET) {
  throw new Error('AUTH_SECRET (or NEXTAUTH_SECRET) is required for preview unlock tokens.');
}

// 7-day rotating signing window — long enough to share a link via email/Slack
// without re-typing the code, short enough to limit a leaked token's lifespan.
const WINDOW_MS = 1000 * 60 * 60 * 24 * 7;

/**
 * Cookie name for a site-specific unlock grant. Per-site so a visitor can be
 * unlocked on multiple gated sites at once without one cookie growing
 * unbounded, and so each site sets the cookie on its own host (works for
 * subdomains AND custom domains without cross-domain trickery).
 */
export function unlockCookieName(siteId: number): string {
  return `sd_unlocked_${siteId}`;
}

function currentWindow(): number {
  return Math.floor(Date.now() / WINDOW_MS);
}

/**
 * Generate a signed handoff token for `siteId`. Produced by the main app
 * after the visitor's access code is verified; redeemed by the site renderer
 * which validates it, sets a same-host cookie, then redirects to a clean URL.
 *
 * Tokens rotate weekly and accept the previous window so a link emailed
 * Friday still works Monday.
 */
export function generateUnlockToken(siteId: number): string {
  return createHmac('sha256', SECRET as string)
    .update(`unlock:${siteId}:${currentWindow()}`)
    .digest('hex');
}

export function verifyUnlockToken(siteId: number, token: string): boolean {
  let received: Buffer;
  try {
    received = Buffer.from(token, 'hex');
  } catch {
    return false;
  }
  if (received.length !== 32) return false;
  const win = currentWindow();
  for (const w of [win, win - 1]) {
    const expected = createHmac('sha256', SECRET as string)
      .update(`unlock:${siteId}:${w}`)
      .digest();
    if (timingSafeEqual(received, expected)) return true;
  }
  return false;
}

/**
 * Value placed in the per-site unlock cookie. Signed so the cookie itself
 * can't be forged — even though the value is "1" today, signing it lets us
 * extend the shape later (timestamp, scope, etc.) without a migration.
 */
export function signUnlockCookieValue(siteId: number): string {
  const payload = `1:${currentWindow()}`;
  const sig = createHmac('sha256', SECRET as string)
    .update(`cookie:${siteId}:${payload}`)
    .digest('hex')
    .slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyUnlockCookieValue(siteId: number, value: string | undefined): boolean {
  if (!value) return false;
  const dot = value.lastIndexOf('.');
  if (dot < 0) return false;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!/^[0-9a-f]{32}$/.test(sig)) return false;
  const expected = createHmac('sha256', SECRET as string)
    .update(`cookie:${siteId}:${payload}`)
    .digest('hex')
    .slice(0, 32);
  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Normalize a user-typed access code: trim, uppercase, strip spaces. Codes
 * are case-insensitive and tolerant of leading/trailing whitespace so a
 * pasted "  acme-2026 " still matches "ACME-2026".
 */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}
