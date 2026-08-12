// URL normalization for the SEO crawler. Every URL that enters the frontier,
// the dedup set, or a page/link row goes through normalizeUrl first — the
// crawler's loop prevention depends on two spellings of the same page
// normalizing identically.

import { createHash } from 'node:crypto';

export type NormalizeOptions = {
  ignoreQueryParams?: boolean;
};

// Returns the canonical absolute form of `href` resolved against `base`, or
// null when the target is not a crawlable http(s) URL (mailto:, javascript:,
// tel:, data:, malformed). Normalization: strip fragment, lowercase host
// (URL does this), drop default ports (URL does this), strip trailing slash
// on non-root paths, and sort query params so ?a=1&b=2 and ?b=2&a=1 dedupe.
// Percent-encoding is left untouched — decode/re-encode round-trips are a
// known source of subtle mismatches.
export function normalizeUrl(href: string, base?: string, opts: NormalizeOptions = {}): string | null {
  let u: URL;
  try {
    u = base ? new URL(href, base) : new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;

  u.hash = '';
  u.username = '';
  u.password = '';

  if (opts.ignoreQueryParams) {
    u.search = '';
  } else if (u.search) {
    const params = [...u.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    u.search = '';
    const qs = new URLSearchParams();
    for (const [k, v] of params) qs.append(k, v);
    const s = qs.toString();
    if (s) u.search = `?${s}`;
  }

  if (u.pathname !== '/' && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }

  return u.toString();
}

// Host comparison treats "www.example.com" and "example.com" as the same
// site — hosted sites answer on both and auditing them as two domains would
// double-count every page.
export function canonicalHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

export function isInternalUrl(url: string, baseUrl: string): boolean {
  try {
    return canonicalHost(new URL(url).host) === canonicalHost(new URL(baseUrl).host);
  } catch {
    return false;
  }
}

// sha256 hex of the normalized URL. Uniqueness and joins go through this —
// 2 KB URLs make btree-indexing the raw column slow and size-risky.
export function urlHash(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}
