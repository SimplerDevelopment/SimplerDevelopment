// Plugin signing-key encryption — AES-256-GCM.
//
// Wraps the raw HMAC secrets stored in
// `registered_app_signing_keys.secret_encrypted`. The portal owns these keys
// (plugins never sign), so we only need a single env-managed wrap key. This
// module is intentionally a sibling to `lib/crypto/secrets.ts` and not a
// reuse of it: the wire format here is `<base64-iv>:<base64-ciphertext>:<base64-authtag>`
// (three colon-delimited base64 segments) per the plugin-registry spec, which
// is different from the secrets.ts single-base64-blob format.
//
// Key source: env var PORTAL_KMS_KEY, base64 of a 32-byte key. In development
// (NODE_ENV !== 'production') we fall back to a fixed dev key with a warning
// so a fresh checkout doesn't crash. NEVER allow that fallback in production.

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

// Fixed dev fallback. 32 zero bytes — chosen so anything encrypted under it is
// obviously unsafe and trivially recognisable in audit logs. NEVER ship this
// to production: we hard-fail below when NODE_ENV === 'production'.
const DEV_FALLBACK_KEY = Buffer.alloc(KEY_BYTES, 0);

let warnedDevFallback = false;

function getKey(): Buffer {
  const b64 = process.env.PORTAL_KMS_KEY;
  if (b64) {
    const key = Buffer.from(b64, 'base64');
    if (key.length !== KEY_BYTES) {
      throw new Error(
        `PORTAL_KMS_KEY must decode to ${KEY_BYTES} bytes; got ${key.length}`,
      );
    }
    return key;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'PORTAL_KMS_KEY env var is required in production. ' +
        'Generate one with: openssl rand -base64 32',
    );
  }
  if (!warnedDevFallback) {
    // eslint-disable-next-line no-console
    console.warn(
      '[lib/plugins/kms] PORTAL_KMS_KEY not set; using dev fallback key. ' +
        'Set PORTAL_KMS_KEY (base64 of 32 random bytes) before deploying.',
    );
    warnedDevFallback = true;
  }
  return DEV_FALLBACK_KEY;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv) as CipherGCM;
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    ciphertext.toString('base64'),
    tag.toString('base64'),
  ].join(':');
}

/**
 * Decrypt a blob produced by `encryptSecret`. Throws on:
 *   - malformed envelope (wrong number of segments / undecodable base64)
 *   - wrong key (auth-tag mismatch)
 *   - tampered iv / ciphertext / tag (all caught by GCM auth-tag check)
 */
export function decryptSecret(blob: string): string {
  const parts = blob.split(':');
  if (parts.length !== 3) {
    throw new Error('decryptSecret: expected <iv>:<ciphertext>:<tag>');
  }
  const [ivB64, ciphertextB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  if (iv.length !== IV_BYTES) {
    throw new Error(`decryptSecret: iv must be ${IV_BYTES} bytes`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(`decryptSecret: auth tag must be ${TAG_BYTES} bytes`);
  }
  const key = getKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv) as DecipherGCM;
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
