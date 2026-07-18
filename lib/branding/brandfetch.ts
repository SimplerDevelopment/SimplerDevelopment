// Auto-enrich a tenant's brand profile from their domain via the Brandfetch
// API, so branding_profiles ship populated instead of blank (the onboarding
// completion problem every downstream AI feature inherits). Strictly additive
// and best-effort: with no BRANDFETCH_API_KEY or on any failure it returns null
// and the caller keeps the existing defaults — enrichment never blocks signup.
//
// The HTTP call and the parse are separated so the parse (the real logic) is
// unit-testable without a network or an API key.

export interface BrandData {
  name?: string;
  logoUrl?: string;
  iconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
}

interface BrandfetchDeps {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}

/** Normalize "https://www.acme.com/path" → "acme.com" (host only). */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .toLowerCase();
}

/** Map a Brandfetch v2 brand response to the fields we store. Pure. */
export function parseBrandfetch(json: unknown): BrandData | null {
  if (!json || typeof json !== 'object') return null;
  const b = json as {
    name?: string;
    logos?: Array<{ type?: string; formats?: Array<{ src?: string }> }>;
    colors?: Array<{ hex?: string; type?: string }>;
  };

  const firstSrc = (l?: { formats?: Array<{ src?: string }> }) =>
    l?.formats?.find((f) => typeof f.src === 'string' && f.src)?.src;
  const logo = b.logos?.find((l) => l.type === 'logo');
  const icon = b.logos?.find((l) => l.type === 'icon');
  const colorOf = (t: string) => b.colors?.find((c) => c.type === t && c.hex)?.hex;

  const out: BrandData = {
    name: typeof b.name === 'string' && b.name.trim() ? b.name.trim() : undefined,
    logoUrl: firstSrc(logo),
    iconUrl: firstSrc(icon),
    // brand/dark is the primary mark; light is a sensible secondary; accent maps directly.
    primaryColor: colorOf('brand') ?? colorOf('dark'),
    secondaryColor: colorOf('light') ?? colorOf('dark'),
    accentColor: colorOf('accent'),
  };
  for (const k of Object.keys(out) as (keyof BrandData)[]) {
    if (out[k] === undefined) delete out[k];
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Fetch + parse brand data for a domain. Returns null (no throw) when there's
 *  no API key, an empty/invalid domain, or any network/parse failure. */
export async function fetchBrandData(domain: string, deps: BrandfetchDeps = {}): Promise<BrandData | null> {
  const apiKey = deps.apiKey ?? process.env.BRANDFETCH_API_KEY;
  const host = normalizeDomain(domain || '');
  if (!apiKey || !host) return null;
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`https://api.brandfetch.io/v2/brands/${encodeURIComponent(host)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    return parseBrandfetch(await res.json());
  } catch {
    return null;
  }
}
