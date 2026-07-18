import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * App-layer secret encryption for credentials stored in the database
 * (e.g., google_workspace_tenant_credentials.oauth_client_secret_encrypted).
 *
 * Algorithm: AES-256-GCM (authenticated encryption — wrong key OR tampered
 * ciphertext both fail the auth-tag check during decrypt and throw).
 *
 * Storage format: base64( iv[12] | tag[16] | ciphertext[..] ) as a single
 * text column. Per-row random IV — encrypting the same plaintext twice
 * produces different ciphertexts (so don't query by ciphertext).
 *
 * Key: read from env var WORKSPACE_TENANT_SECRETS_KEY, expected as 64 hex chars
 * (32 bytes). Generate with: openssl rand -hex 32
 */

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const hex = process.env.WORKSPACE_TENANT_SECRETS_KEY;
  if (!hex) {
    throw new Error(
      'WORKSPACE_TENANT_SECRETS_KEY env var is not set. ' +
      'Generate one with: openssl rand -hex 32'
    );
  }
  if (hex.length !== KEY_BYTES * 2) {
    throw new Error(
      `WORKSPACE_TENANT_SECRETS_KEY must be ${KEY_BYTES * 2} hex chars ` +
      `(${KEY_BYTES} bytes); got ${hex.length} chars`
    );
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('WORKSPACE_TENANT_SECRETS_KEY must be hex-encoded');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(blob: string): string {
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
 * Decrypt a GCM blob, or return the input unchanged if it isn't one — i.e. a
 * legacy plaintext value written before the column was encrypted. This lets the
 * `encryptedText` column type be adopted over a table that already holds
 * plaintext rows without a blocking backfill: new/rotated writes encrypt, and
 * stragglers read back as-is until they're re-written (or backfilled).
 *
 * Safe because AES-256-GCM authenticates: a real plaintext token fails the
 * auth-tag/length check and falls through to the plaintext branch; it cannot be
 * mistaken for valid ciphertext.
 */
export function decryptMaybe(value: string): string {
  try {
    return decryptSecret(value);
  } catch {
    return value;
  }
}
