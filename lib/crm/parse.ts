/**
 * Pure parsing helpers used by the CRM contact/company upsert paths and the
 * brain → CRM classification step. No DB dependency — safe to import from
 * unit tests without a DATABASE_URL.
 */

/**
 * Pull "Jane Doe" out of `Jane Doe <jane@x.com>` or `jane@x.com`. Falls back
 * to the email local-part (split on `.`/`_`/`-`) when the display name is
 * empty or just the email itself. Caps each name segment at 100 chars to
 * match crm_contacts.firstName / lastName varchar(100).
 *
 * firstName is always non-empty (notNull in schema); lastName may be null.
 */
export function parseDisplayName(raw: string | undefined, email: string): { firstName: string; lastName: string | null } {
  const stripped = (raw ?? '').replace(/<[^>]*>/, '').trim().replace(/^"|"$/g, '').trim();
  const localPart = email.split('@')[0] ?? '';
  const fallback = localPart || email || 'Unknown';

  if (!stripped || stripped.toLowerCase() === email.toLowerCase()) {
    const parts = fallback.split(/[._-]+/).filter(Boolean);
    return {
      firstName: capitalize(parts[0] ?? fallback).slice(0, 100),
      lastName: parts.length > 1 ? capitalize(parts.slice(1).join(' ')).slice(0, 100) : null,
    };
  }

  const tokens = stripped.split(/\s+/);
  return {
    firstName: tokens[0].slice(0, 100),
    lastName: tokens.length > 1 ? tokens.slice(1).join(' ').slice(0, 100) : null,
  };
}

/** Strip protocol, path, and "www." prefix; lowercase. Empty when input unusable. */
export function normalizeDomain(raw: string): string {
  const trimmed = (raw ?? '').trim().toLowerCase();
  if (!trimmed) return '';
  const noProtocol = trimmed.replace(/^https?:\/\//, '');
  const noPath = noProtocol.split('/')[0] ?? '';
  return noPath.replace(/^www\./, '');
}

/** Pull the domain from an email like "jane@acme.com" → "acme.com". Empty when no @. */
export function domainFromEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 0) return '';
  // For pathological inputs like `multiple@@signs.com`, the local-part is
  // `multiple@`; the domain starts after the *first* `@`. We treat any
  // additional `@` in what should be the domain as a malformed input → ''.
  const after = email.slice(at + 1);
  if (after.includes('@')) return '';
  return normalizeDomain(after);
}

export function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'ymail.com',
  'hotmail.com', 'outlook.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  'aol.com', 'protonmail.com', 'proton.me',
  'pm.me', 'fastmail.com', 'zoho.com',
]);

/** True when the domain is a known consumer / freemail provider. */
export function isPersonalDomain(domain: string): boolean {
  return PERSONAL_DOMAINS.has(domain.toLowerCase());
}
