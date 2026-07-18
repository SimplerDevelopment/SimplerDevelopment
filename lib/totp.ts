// RFC 6238 TOTP (time-based one-time passwords) for authenticator-app 2FA,
// implemented on node:crypto so we add no dependency (the codebase already uses
// createHmac/timingSafeEqual directly — see lib/impersonation.ts, lib/preview-unlock.ts).
//
// Secrets are base32 (what Google Authenticator / 1Password / Authy expect) and
// are stored AES-256-GCM-encrypted at rest via the `encryptedText` column type.
// Verification checks a ±1 step window for clock skew and compares in constant
// time.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const PERIOD_SECONDS = 30;
const DIGITS = 6;
const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Encode bytes as unpadded RFC 4648 base32 (uppercase). */
function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Decode an RFC 4648 base32 string (case-insensitive, padding/space tolerant). */
function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character in TOTP secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit base32 secret (the size RFC 4226/6238 recommends). */
export function generateTOTPSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 6-digit code for a base32 secret at a given time step (offset in steps). */
export function generateTOTP(secretBase32: string, stepOffset = 0, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / PERIOD_SECONDS) + stepOffset;
  const msg = Buffer.alloc(8);
  // 8-byte big-endian counter (high word is 0 for any realistic date).
  msg.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  msg.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac('sha1', base32Decode(secretBase32)).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

/**
 * Verify a user-supplied code against the secret, allowing ±`drift` steps for
 * clock skew (default ±1 = a 90s tolerance window). Constant-time compare per
 * candidate so a wrong code leaks no timing signal.
 */
export function verifyTOTP(secretBase32: string, code: string, drift = 1, atMs = Date.now()): boolean {
  const trimmed = (code ?? '').trim();
  if (!/^\d{6}$/.test(trimmed)) return false;
  const supplied = Buffer.from(trimmed);
  for (let i = -drift; i <= drift; i++) {
    let expected: Buffer;
    try {
      expected = Buffer.from(generateTOTP(secretBase32, i, atMs));
    } catch {
      return false; // malformed secret
    }
    if (expected.length === supplied.length && timingSafeEqual(expected, supplied)) {
      return true;
    }
  }
  return false;
}

/** otpauth:// URI for the QR code an authenticator app scans during enrollment. */
export function getTOTPUri(secretBase32: string, accountEmail: string, issuer = 'SimplerDevelopment'): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
