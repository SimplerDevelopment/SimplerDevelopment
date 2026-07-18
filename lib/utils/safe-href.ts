/**
 * Returns null for scheme-only strings like "https://" that Next.js's
 * coercePrefetchableUrl rejects at prefetch time (next/src/client/components/links.ts).
 * Returns the href unchanged for all other values.
 */
export function safeHref(url: string | undefined | null): string | null {
  if (!url) return null;
  if (/^https?:\/\/?$/.test(url.trim())) return null;
  return url;
}
