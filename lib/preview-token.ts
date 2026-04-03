import { createHmac } from 'crypto';

const SECRET = process.env.AUTH_SECRET || 'preview-fallback-secret';

/**
 * Generate a time-limited preview token for a site page.
 * Valid for 24 hours.
 */
export function generatePreviewToken(siteId: number): string {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return createHmac('sha256', SECRET)
    .update(`preview:${siteId}:${day}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * Verify a preview token for a site.
 * Accepts tokens from today or yesterday (handles day boundary).
 */
export function verifyPreviewToken(siteId: number, token: string): boolean {
  const day = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  for (const d of [day, day - 1]) {
    const expected = createHmac('sha256', SECRET)
      .update(`preview:${siteId}:${d}`)
      .digest('hex')
      .slice(0, 16);
    if (token === expected) return true;
  }
  return false;
}
