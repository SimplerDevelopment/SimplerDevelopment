/**
 * Decides whether a tenant request should be redirected before it renders.
 *
 * Pure on purpose, in the same shape as lib/sites/edge-cache-policy.ts: the
 * interesting part is the branching (absolute vs relative target, host
 * canonicalisation, the loop guard), and that deserves a test that does not
 * have to boot middleware to run.
 *
 * Two mechanisms feed in, and they are deliberately different things:
 *   - `redirects` — per-path rules a client author created (a retired page).
 *   - `canonicalHost` — driven by website_domains.is_primary, so a site's
 *     non-primary domains 301 to its real one instead of serving duplicates.
 *
 * They are resolved into ONE hop. Applying them as two sequential redirects
 * would make the common "retired page reached on the old domain" case cost the
 * visitor two round trips for no reason.
 */

export interface RedirectRule {
  /** Lowercased, leading slash, matched exactly. */
  from: string;
  /** A path on the same site, or an absolute http(s) URL. */
  to: string;
  status: number;
}

export interface RedirectPolicyInput {
  canonicalHost: string | null;
  redirects: RedirectRule[];
}

const ABSOLUTE = /^https?:\/\//i;

/**
 * @param currentUrl absolute URL of the incoming request
 * @param host       incoming Host header, port stripped
 * @returns where to send the visitor, or null to render normally
 */
export function resolveRedirect(
  currentUrl: string,
  host: string,
  info: RedirectPolicyInput,
): { url: string; status: number } | null {
  const current = new URL(currentUrl);

  const canonicalHost =
    info.canonicalHost && info.canonicalHost !== host.toLowerCase()
      ? info.canonicalHost
      : null;

  const rule = info.redirects.find((r) => r.from === current.pathname.toLowerCase());
  if (!rule && !canonicalHost) return null;

  let target: URL;
  if (rule && ABSOLUTE.test(rule.to)) {
    // An absolute target is the whole answer. Re-pointing its host at the
    // canonical one would hijack a deliberate off-site redirect.
    target = new URL(rule.to);
  } else {
    target = new URL(currentUrl);
    if (canonicalHost) target.host = canonicalHost;
    if (rule) target.pathname = rule.to;
  }

  // Query strings survive the hop: a redirect that eats ?utm_source silently
  // destroys campaign attribution, and that is invisible until someone asks
  // why a channel reports zero.
  target.search = current.search;

  // Loop guard. A rule pointing at its own path, or an is_primary row that
  // matches the incoming host after normalisation, would otherwise redirect
  // forever. Rendering the page is the strictly safer failure.
  if (target.toString() === currentUrl) return null;

  return { url: target.toString(), status: rule?.status ?? 301 };
}
