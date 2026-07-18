import { customType } from 'drizzle-orm/pg-core';
import { encryptSecret, decryptMaybe } from '@/lib/crypto/secrets';

/**
 * A Postgres `text` column whose value is transparently AES-256-GCM encrypted
 * at rest. Reads return plaintext; writes (insert / update / upsert) encrypt
 * via the established `lib/crypto/secrets` helper — so call sites keep passing
 * and reading plain strings, and no row of third-party OAuth tokens sits in the
 * DB in the clear.
 *
 * Adoption is backfill-free: `fromDriver` tolerates legacy plaintext rows (see
 * `decryptMaybe`), so an existing plaintext column can be switched to this type
 * with no data migration — stragglers encrypt on their next write, or run
 * `scripts/security/backfill-encrypt-oauth-tokens.ts` to sweep them.
 *
 * Footgun: per-row random IV ⇒ ciphertext is non-deterministic. NEVER filter,
 * join, or `WHERE` on an encryptedText column — query by the owning id instead.
 * Requires `WORKSPACE_TENANT_SECRETS_KEY` in the environment.
 */
export const encryptedText = (name: string) =>
  customType<{ data: string; driverData: string }>({
    dataType() {
      return 'text';
    },
    toDriver(value: string): string {
      return encryptSecret(value);
    },
    fromDriver(value: string): string {
      return decryptMaybe(value);
    },
  })(name);
