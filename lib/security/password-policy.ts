// Shared password policy — the single source of truth for "is this password
// acceptable" across signup, reset, and in-session change. Two concerns:
//
//   1. Strength (validatePasswordStrength) — NIST 800-63B-aligned: length is the
//      primary signal, plus a small blocklist of the passwords that top every
//      breach corpus and a guard against using the account's own identifiers.
//      We deliberately do NOT mandate arbitrary composition rules for long
//      passphrases — NIST advises against them (they push users to predictable
//      patterns like "Password1!"). No new dependency: a static top-N blocklist
//      catches the "password" / "12345678" class the QA caught (AUTH79-003).
//      ponytail: a full breached-password check (HIBP k-anonymity) is a heavier,
//      separate feature — add it if the blocklist proves insufficient.
//
//   2. Reuse (isPasswordReused) — reject a new password that matches the current
//      one or any of the last few (AUTH79-002). History is a bounded list of
//      bcrypt hashes stored on the user row; PASSWORD_HISTORY_LIMIT caps it.

import { compare } from 'bcryptjs';

const MIN_LENGTH = 8;
// bcrypt only hashes the first 72 bytes; also bounds request size.
const MAX_LENGTH = 200;

/** How many prior passwords (including the current one) reset/change reject. */
export const PASSWORD_HISTORY_LIMIT = 5;

// The passwords at the top of every breach corpus. Literal and short on purpose
// — the real backstop for long-tail weak passwords is length + variety below.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd',
  '12345678', '123456789', '1234567890', '87654321', '1234abcd', 'abcd1234',
  'qwerty', 'qwertyui', 'qwerty123', 'asdfghjkl', 'zxcvbnm', '1qaz2wsx',
  '11111111', '00000000', 'aaaaaaaa', 'letmein', 'welcome', 'welcome1',
  'iloveyou', 'admin', 'admin123', 'administrator', 'changeme', 'trustno1',
  'football', 'baseball', 'sunshine', 'princess', 'monkey123', 'starwars',
  'whatever', 'superman', 'batman123', 'simplerdev', 'simplerdevelopment',
]);

export interface PasswordPolicyContext {
  email?: string | null;
  name?: string | null;
}

/**
 * Validate a candidate password against the strength policy. Returns `null` when
 * acceptable, or a short user-facing error string when it fails. Pure and
 * synchronous so signup, reset, and change all share one rule set.
 */
export function validatePasswordStrength(
  password: unknown,
  ctx: PasswordPolicyContext = {},
): string | null {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return `Password must be at least ${MIN_LENGTH} characters.`;
  }
  if (password.length > MAX_LENGTH) {
    return `Password must be ${MAX_LENGTH} characters or fewer.`;
  }

  const lower = password.toLowerCase();

  if (COMMON_PASSWORDS.has(lower)) {
    return 'That password is too common — choose something harder to guess.';
  }

  // A single repeated character ("aaaaaaaa") passes the length check but is trivial.
  if (/^(.)\1+$/.test(password)) {
    return 'Avoid repeating a single character — choose something harder to guess.';
  }

  // The password must not be, or trivially contain, the user's own identifiers.
  const email = ctx.email?.toLowerCase().trim();
  if (email) {
    const localPart = email.split('@')[0];
    if (lower === email || (localPart.length >= 4 && lower.includes(localPart))) {
      return 'Password must not contain your email address.';
    }
  }
  const name = ctx.name?.toLowerCase().trim();
  if (name && name.length >= 4 && lower.includes(name)) {
    return 'Password must not contain your name.';
  }

  // Require a little variety for shorter passwords. Long passphrases (12+) are
  // strong on length alone (NIST), so they skip the character-class requirement.
  if (password.length < 12) {
    const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) =>
      re.test(password),
    ).length;
    if (classes < 2) {
      return 'Use a mix of letters, numbers, or symbols — or a longer passphrase (12+ characters).';
    }
  }

  return null;
}

/**
 * True if `plain` matches any of the supplied bcrypt hashes (current + history).
 * Callers pass the account's current password hash first, then its history, so a
 * reset/change can reject reuse of any recent password (AUTH79-002).
 */
export async function isPasswordReused(plain: string, hashes: (string | null | undefined)[]): Promise<boolean> {
  for (const h of hashes) {
    if (h && (await compare(plain, h))) return true;
  }
  return false;
}

/**
 * Roll the password history forward: prepend the just-replaced hash and keep only
 * the most recent PASSWORD_HISTORY_LIMIT entries. Returns the new history array to
 * persist alongside the new password.
 */
export function nextPasswordHistory(
  previousHash: string,
  existing: (string | null | undefined)[] | null | undefined,
): string[] {
  const prior = (existing ?? []).filter((h): h is string => typeof h === 'string' && h.length > 0);
  return [previousHash, ...prior].slice(0, PASSWORD_HISTORY_LIMIT);
}
