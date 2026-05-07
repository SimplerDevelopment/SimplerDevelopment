import { createHmac, timingSafeEqual } from 'crypto';

const SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
if (!SECRET) {
  throw new Error('AUTH_SECRET (or NEXTAUTH_SECRET) is required for preview tokens.');
}

/**
 * Generate a time-limited preview token for a site page.
 * Valid for 24 hours.
 *
 * Uses the full SHA-256 HMAC (64 hex chars) so brute-forcing the token
 * is infeasible.
 */
export function generatePreviewToken(siteId: number): string {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return createHmac('sha256', SECRET as string)
    .update(`preview:${siteId}:${day}`)
    .digest('hex');
}

/**
 * Verify a preview token for a site using constant-time comparison.
 * Accepts tokens from today or yesterday (handles day boundary).
 */
export function verifyPreviewToken(siteId: number, token: string): boolean {
  let received: Buffer;
  try {
    received = Buffer.from(token, 'hex');
  } catch {
    return false;
  }

  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  for (const d of [day, day - 1]) {
    const expected = createHmac('sha256', SECRET as string)
      .update(`preview:${siteId}:${d}`)
      .digest();
    if (received.length !== expected.length) continue;
    if (timingSafeEqual(received, expected)) return true;
  }
  return false;
}
