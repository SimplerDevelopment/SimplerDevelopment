// Tracking-script provider catalog. Single source of truth for:
//   - The UI form (which fields to render, how to label them, the help URL)
//   - The API route (which fields to accept, how to validate them)
//   - The public-site renderer (how to emit each script / meta tag)
//
// Adding a new provider: append to PROVIDERS, add the matching column to
// `site_tracking` in lib/db/schema/sites.ts, and add a render branch in
// components/sites/TrackingScripts.tsx (or the metadata block for verifications).

export type TrackingFieldKind = 'script' | 'verification' | 'rawHtml';

export interface TrackingProvider {
  /** Stable key matching the column name in site_tracking */
  key: string;
  /** Human-readable name for the settings UI */
  label: string;
  /** Short hint shown under the input */
  help: string;
  /** Placeholder for the input */
  placeholder: string;
  /** Whether this is a third-party tag, a search-engine verification value, or free HTML */
  kind: TrackingFieldKind;
  /** Validation regex applied to a trimmed value before save. null = any non-empty string */
  pattern: RegExp | null;
  /** Per-provider validation error message */
  patternError?: string;
  /** Max length enforced on save (defaults to 255 for varchar fields, no cap for rawHtml) */
  maxLength?: number;
  /** External docs link shown next to the field */
  docsUrl?: string;
}

// Conservative regexes — match the shape of well-formed IDs without being so
// strict that legitimate values from new product variations fail. Inputs are
// uppercased/trimmed by the API before validation (except verification + raw
// HTML, which can contain mixed case).
export const PROVIDERS: TrackingProvider[] = [
  {
    key: 'gaMeasurementId',
    label: 'Google Analytics 4 Measurement ID',
    help: 'Found in GA4 Admin → Data Streams. Looks like G-XXXXXXXXXX.',
    placeholder: 'G-XXXXXXXXXX',
    kind: 'script',
    pattern: /^G-[A-Z0-9]{6,16}$/,
    patternError: 'Must start with G- followed by 6–16 letters/digits.',
    maxLength: 50,
    docsUrl: 'https://support.google.com/analytics/answer/9539598',
  },
  {
    key: 'gtmContainerId',
    label: 'Google Tag Manager Container ID',
    help: 'Found in GTM under your container name. Looks like GTM-XXXXXXX.',
    placeholder: 'GTM-XXXXXXX',
    kind: 'script',
    pattern: /^GTM-[A-Z0-9]{4,12}$/,
    patternError: 'Must start with GTM- followed by 4–12 letters/digits.',
    maxLength: 50,
    docsUrl: 'https://support.google.com/tagmanager/answer/6103696',
  },
  {
    key: 'gscVerification',
    label: 'Google Search Console verification',
    help: 'Paste only the value of the content="..." attribute from the meta tag GSC gave you.',
    placeholder: 'abcdEFG1234...',
    kind: 'verification',
    pattern: /^[A-Za-z0-9_\-=:./+]{20,255}$/,
    patternError: 'Use only the verification value (letters, digits, /._-=:+), 20–255 chars.',
    maxLength: 255,
    docsUrl: 'https://support.google.com/webmasters/answer/9008080',
  },
  {
    key: 'bingVerification',
    label: 'Bing Webmaster verification',
    help: 'Paste the content value from Bing\'s "Add a meta tag to your home page" option.',
    placeholder: '0123456789ABCDEF...',
    kind: 'verification',
    pattern: /^[A-Za-z0-9_\-=:./+]{16,255}$/,
    patternError: 'Use only the verification value (letters, digits, /._-=:+), 16–255 chars.',
    maxLength: 255,
    docsUrl: 'https://www.bing.com/webmasters/help/getting-started-checklist-32093d3d',
  },
  {
    key: 'pinterestVerification',
    label: 'Pinterest site verification',
    help: 'From Pinterest Business → Claim → Claim website → HTML tag.',
    placeholder: '0123456789abcdef...',
    kind: 'verification',
    pattern: /^[A-Za-z0-9_\-=:./+]{8,255}$/,
    patternError: 'Use only the verification value (letters, digits, /._-=:+), 8–255 chars.',
    maxLength: 255,
    docsUrl: 'https://help.pinterest.com/en/business/article/claim-your-website',
  },
  {
    key: 'metaPixelId',
    label: 'Meta Pixel ID (Facebook / Instagram)',
    help: 'Found in Meta Events Manager. A 15-16 digit number.',
    placeholder: '1234567890123456',
    kind: 'script',
    pattern: /^\d{10,20}$/,
    patternError: 'Must be 10–20 digits with no spaces or dashes.',
    maxLength: 50,
    docsUrl: 'https://www.facebook.com/business/help/952192354843755',
  },
  {
    key: 'clarityProjectId',
    label: 'Microsoft Clarity Project ID',
    help: 'Found in Clarity → Settings → Setup. Lowercase alphanumeric.',
    placeholder: 'abcd1234ef',
    kind: 'script',
    pattern: /^[a-z0-9]{6,20}$/i,
    patternError: 'Must be 6–20 letters/digits (no dashes).',
    maxLength: 50,
    docsUrl: 'https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-setup',
  },
  {
    key: 'hotjarSiteId',
    label: 'Hotjar Site ID',
    help: 'Found in Hotjar → Sites & Organizations. A 6–10 digit number.',
    placeholder: '1234567',
    kind: 'script',
    pattern: /^\d{4,12}$/,
    patternError: 'Must be 4–12 digits.',
    maxLength: 50,
    docsUrl: 'https://help.hotjar.com/hc/en-us/articles/115011867948',
  },
  {
    key: 'linkedinPartnerId',
    label: 'LinkedIn Insight Tag Partner ID',
    help: 'Found in LinkedIn Campaign Manager → Insight Tag. A 4–10 digit number.',
    placeholder: '123456',
    kind: 'script',
    pattern: /^\d{3,12}$/,
    patternError: 'Must be 3–12 digits.',
    maxLength: 50,
    docsUrl: 'https://www.linkedin.com/help/lms/answer/a418880',
  },
  {
    key: 'tiktokPixelId',
    label: 'TikTok Pixel ID',
    help: 'Found in TikTok Ads Manager → Events Manager. Mixed letters and digits.',
    placeholder: 'C123ABC456...',
    kind: 'script',
    pattern: /^[A-Z0-9]{15,32}$/i,
    patternError: 'Must be 15–32 letters/digits.',
    maxLength: 50,
    docsUrl: 'https://ads.tiktok.com/help/article/get-started-pixel',
  },
  {
    key: 'customHeadHtml',
    label: 'Custom <head> HTML',
    help: 'Advanced. Injected at the end of <head> on every page. Use for tags not supported above.',
    placeholder: '<!-- e.g. <script src="https://cdn.example.com/snippet.js" async></script> -->',
    kind: 'rawHtml',
    pattern: null,
    maxLength: 8000,
  },
  {
    key: 'customBodyHtml',
    label: 'Custom <body> HTML',
    help: 'Advanced. Injected at the top of <body>. Common use: noscript fallbacks.',
    placeholder: '<!-- e.g. <noscript><img src="..." /></noscript> -->',
    kind: 'rawHtml',
    pattern: null,
    maxLength: 8000,
  },
];

export const PROVIDER_BY_KEY: Record<string, TrackingProvider> = Object.fromEntries(
  PROVIDERS.map(p => [p.key, p]),
);

/** Keys we expose in the public TrackingConfig shape (must match site_tracking columns). */
export const TRACKING_KEYS = PROVIDERS.map(p => p.key) as readonly string[];

export type TrackingConfig = {
  [K in (typeof PROVIDERS)[number]['key']]?: string | null;
} & { enabled?: boolean };

/**
 * Client-side prop shape used by the portal settings form. Always allows every
 * provider key as string|null plus an optional `enabled` flag. Defined as its
 * own (non-intersected) interface so it can be used inside an index-signature-
 * free prop type — `Record<string, string|null> & { enabled: boolean }` is not
 * a valid TS type because boolean violates the index signature.
 */
export interface TrackingConfigClient {
  gaMeasurementId?: string | null;
  gtmContainerId?: string | null;
  gscVerification?: string | null;
  bingVerification?: string | null;
  pinterestVerification?: string | null;
  metaPixelId?: string | null;
  clarityProjectId?: string | null;
  hotjarSiteId?: string | null;
  linkedinPartnerId?: string | null;
  tiktokPixelId?: string | null;
  customHeadHtml?: string | null;
  customBodyHtml?: string | null;
  enabled?: boolean;
}

/**
 * Validates and normalises a single field value. Returns the normalised value
 * to persist (or null for blanks), or an Error describing what was wrong.
 *
 * - `script` and `verification` values are trimmed; script values are also
 *   uppercased so case-insensitive matches still hit the canonical form.
 * - `rawHtml` is trimmed only.
 * - Empty / null clears the field.
 */
export function normalizeTrackingValue(
  key: string,
  raw: unknown,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const provider = PROVIDER_BY_KEY[key];
  if (!provider) return { ok: false, error: `Unknown tracking field: ${key}` };
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false, error: `${provider.label} must be a string.` };

  let value = raw.trim();
  if (value === '') return { ok: true, value: null };

  if (provider.kind === 'script') {
    value = value.toUpperCase();
  }
  // For verification values, strip a leading "content=" if a user pasted the
  // full meta-tag attribute by accident.
  if (provider.kind === 'verification') {
    value = value.replace(/^content\s*=\s*["']?/i, '').replace(/["']$/, '').trim();
  }

  if (provider.maxLength && value.length > provider.maxLength) {
    return { ok: false, error: `${provider.label} is too long (max ${provider.maxLength}).` };
  }

  // Raw-HTML escape hatches: block obviously dangerous patterns that have no
  // legitimate use in a tracking snippet. We don't try to sanitise full HTML —
  // by definition the field exists so the client can paste vendor JS. We only
  // block on-* event handlers in plain HTML attributes (which look like
  // injection attempts more than tracking snippets) and javascript: URLs.
  if (provider.kind === 'rawHtml') {
    if (/\bjavascript:/i.test(value)) {
      return { ok: false, error: `${provider.label} cannot contain javascript: URLs.` };
    }
    return { ok: true, value };
  }

  if (provider.pattern && !provider.pattern.test(value)) {
    return { ok: false, error: provider.patternError || `${provider.label} is not in the expected format.` };
  }
  return { ok: true, value };
}

/**
 * True if any field on the config would actually emit something at render time.
 * Accepts any object-shaped config — the Drizzle row, the client form shape,
 * or a partial — since callers cross the server/client boundary with slightly
 * different types but the same column names.
 */
export function hasAnyTracking(
  config: Record<string, unknown> | null | undefined,
): boolean {
  if (!config) return false;
  if (config.enabled === false) return false;
  return PROVIDERS.some(p => {
    const v = config[p.key];
    return typeof v === 'string' && v.trim().length > 0;
  });
}
