// White-label / SaaS Mode — custom domain ownership verification.
//
// Agencies prove they own a custom domain by adding a TXT record at
// `_simplerdev.<their-domain>` whose value matches the random token we
// generated when they started the verification flow. This lets us safely
// route requests for an unknown host (e.g. `portal.acme-agency.com`) to
// the matching client's portal without trusting whatever Host header the
// client browser happens to send.
//
// `verifyDomainOwnership` is intentionally pure + side-effect-free except
// for the DNS lookup itself, so it's straightforward to unit-test by
// mocking `node:dns/promises`.

import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';

/**
 * Look up the TXT record at `_simplerdev.<domain>` and return true iff one
 * of the values exactly equals `expectedToken`.
 *
 * Returns `false` (never throws) on:
 *   - DNS resolution errors (NXDOMAIN, NODATA, ENOTFOUND, transient SERVFAIL)
 *   - Empty TXT recordsets
 *   - Token mismatch
 *
 * Caller should treat the boolean as advisory and re-prompt the user to
 * retry on `false`. We never auto-retry here — DNS propagation is the user's
 * responsibility, and a tight retry loop in the API path would just turn
 * into a self-DoS during cold-cache windows.
 */
export async function verifyDomainOwnership(
  domain: string,
  expectedToken: string,
): Promise<boolean> {
  if (!domain || !expectedToken) return false;

  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return false;

  const lookupHost = `_simplerdev.${trimmed}`;

  try {
    const records = await resolveTxt(lookupHost);
    // resolveTxt returns string[][] — each record can be split into chunks.
    // Join chunks for each record before comparing.
    for (const chunks of records) {
      const joined = Array.isArray(chunks) ? chunks.join('') : String(chunks);
      if (joined === expectedToken) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Generate a fresh DNS verification token. 32 random bytes hex-encoded
 * (64 chars) — fits in our `varchar(64)` column and is sufficiently
 * collision-resistant that the unique check on `customDomain` is the
 * binding constraint, not the token itself.
 */
export function generateVerificationToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Cheap shape-check for a candidate custom domain. We don't try to be
 * exhaustive — registrars enforce real validity at the DNS layer — but we
 * do reject obvious garbage so callers can return a 400 instead of a vague
 * "DNS lookup failed" three steps later.
 */
export function isPlausibleDomain(domain: string): boolean {
  if (!domain) return false;
  const trimmed = domain.trim().toLowerCase();
  if (trimmed.length < 4 || trimmed.length > 253) return false;
  // No protocol, no path, no whitespace.
  if (/[\s/:?#]/.test(trimmed)) return false;
  // Reject our own apex — agencies should not be able to claim
  // `simplerdevelopment.com` as a custom domain.
  if (trimmed === 'simplerdevelopment.com' || trimmed.endsWith('.simplerdevelopment.com')) {
    return false;
  }
  // At least one dot, valid hostname labels.
  const labels = trimmed.split('.');
  if (labels.length < 2) return false;
  for (const label of labels) {
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return false;
  }
  return true;
}
