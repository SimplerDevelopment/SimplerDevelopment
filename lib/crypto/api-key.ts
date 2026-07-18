import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * BYOK API-key encryption helper.
 *
 * Used by `client_api_keys.encrypted_key` to store third-party provider keys
 * (Anthropic / OpenAI / etc.) at rest. Mirrors the AES-256-GCM construction
 * used by `lib/crypto/secrets.ts` for the workspace tenant credentials, but
 * is intentionally a separate module so that:
 *
 *   1. The two key universes never share an encryption key (compromise of
 *      one envelope does not leak the other).
 *   2. The env var that names the key follows the pricing-tier brief —
 *      `ENCRYPTION_KEY` — without overloading `WORKSPACE_TENANT_SECRETS_KEY`.
 *
 * Algorithm: AES-256-GCM (authenticated encryption — wrong key OR tampered
 * ciphertext both fail the auth-tag check during decrypt and throw).
 *
 * Storage format: base64( iv[12] | tag[16] | ciphertext[..] ) as a single
 * text column. Per-row random IV — encrypting the same plaintext twice
 * produces different ciphertexts, so do not query by ciphertext.
 *
 * Key: read from env var ENCRYPTION_KEY, expected as 64 hex chars (32 bytes).
 * Generate with: openssl rand -hex 32
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex) {
    throw new Error(
      'ENCRYPTION_KEY env var is not set. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  if (hex.length !== KEY_BYTES * 2) {
    throw new Error(
      `ENCRYPTION_KEY must be ${KEY_BYTES * 2} hex chars ` +
      `(${KEY_BYTES} bytes); got ${hex.length} chars`
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('ENCRYPTION_KEY must be hex-encoded');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptApiKey(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptApiKey(blob: string): string {
  const key = getKey();
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error('Encrypted blob is too short to contain iv + tag');
  }
  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = buf.subarray(IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Render a stored key for display — e.g. "sk-ant-...AbC1" — by decrypting and
 * masking all but the trailing 4 chars. Helpful for UI surfaces that need to
 * show "which key is this" without leaking the full secret.
 */
export function maskApiKey(blob: string): string {
  try {
    const decrypted = decryptApiKey(blob);
    if (decrypted.length <= 8) return '•'.repeat(decrypted.length);
    return `${decrypted.slice(0, 6)}…${decrypted.slice(-4)}`;
  } catch {
    return '••••';
  }
}
