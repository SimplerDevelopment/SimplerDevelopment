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
 *
 * `scope` optionally narrows the token to a single page path (the site
 * route's `pageSlug`, e.g. "blog/hello" or "about"). A scope-narrowed token
 * authorizes preview of ONLY that one page — it is NOT interchangeable with
 * the site-wide token. The authenticated visual editor mints site-wide tokens
 * (no scope); the PUBLIC approval page mints scope-narrowed tokens so an
 * external reviewer who lifts the token from the iframe URL cannot enumerate
 * other draft pages on the same site.
 */
export function generatePreviewToken(siteId: number, scope?: string): string {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const suffix = scope ? `:${scope}` : '';
  return createHmac('sha256', SECRET as string)
    .update(`preview:${siteId}${suffix}:${day}`)
    .digest('hex');
}

/**
 * Verify a preview token for a site using constant-time comparison.
 * Accepts tokens from today or yesterday (handles day boundary).
 *
 * A site-wide token (minted with no scope) is always accepted. When `scope`
 * is supplied, a token narrowed to that exact page path is ALSO accepted — so
 * the site renderer can authorize both the editor's site-wide token and the
 * approval page's per-page token. A page-scoped token never validates against
 * a different page (its scope is part of the signed payload).
 */
export function verifyPreviewToken(siteId: number, token: string, scope?: string): boolean {
  let received: Buffer;
  try {
    received = Buffer.from(token, 'hex');
  } catch {
    return false;
  }

  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  const suffixes = scope ? ['', `:${scope}`] : [''];
  for (const suffix of suffixes) {
    for (const d of [day, day - 1]) {
      const expected = createHmac('sha256', SECRET as string)
        .update(`preview:${siteId}${suffix}:${d}`)
        .digest();
      if (received.length !== expected.length) continue;
      if (timingSafeEqual(received, expected)) return true;
    }
  }
  return false;
}
