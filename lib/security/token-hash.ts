import { createHash } from 'crypto';

/**
 * Hash a sensitive token (password reset, invite, etc.) for at-rest storage.
 *
 * Why: tokens we email to users are bearer credentials — anyone holding the raw
 * value can take over the account. Storing only the SHA-256 of the token means
 * a read-only DB compromise (backup leak, replica snapshot, log dump) does not
 * yield usable account-takeover credentials. The raw token only ever exists
 * in transit (email body) and on the user's clipboard / link click.
 *
 * SHA-256 is appropriate here (not bcrypt/argon2): the input is a 256-bit
 * random value from `randomBytes(32)`, so it is not subject to dictionary or
 * brute-force attack — a fast hash with no salt is the correct primitive and
 * lets us look up by exact equality (`eq(column, hashToken(input))`).
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}
