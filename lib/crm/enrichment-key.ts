import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { crmEnrichmentConfig } from '@/lib/db/schema';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto/api-key';

/**
 * Read/write accessors for `crm_enrichment_config.own_api_key` — the BYOK
 * enrichment-provider key a client can supply instead of spending platform
 * credits (`crm_enrichment_config.key_source = 'own'`).
 *
 * NOT WIRED UP YET (AUTH79-019 — the column predates any UI/route that reads
 * or writes it). This module exists so that whenever BYOK enrichment ships,
 * the read/write path already goes through AES-256-GCM instead of a future
 * caller reaching for `db.update(crmEnrichmentConfig)` directly and storing
 * the raw key. A plaintext credential column is the exact exception
 * `.claude/rules/auth-surface.md` says must not be reintroduced — GitHub
 * tokens were that exception once. Do not add a second code path that
 * reads/writes `ownApiKey` outside these two functions.
 *
 * Column capacity: `own_api_key` is `varchar(500)`. The stored form is
 * `base64(iv[12] | tag[16] | ciphertext)`; AES-GCM ciphertext is the same
 * length as the plaintext, so 500 base64 chars (~375 decoded bytes) leaves
 * room for roughly **347 characters of plaintext key**. Comfortable for
 * normal provider keys — Postgres errors rather than truncating on overflow,
 * so an oversized key fails loudly on `setOwnApiKey`, not silently.
 */

/**
 * Returns the client's decrypted enrichment-provider key, or `null` if none
 * is configured. Tenant-scoped by `clientId` (the table's primary key).
 */
export async function getOwnApiKey(clientId: number): Promise<string | null> {
  const [row] = await db
    .select({ ownApiKey: crmEnrichmentConfig.ownApiKey })
    .from(crmEnrichmentConfig)
    .where(eq(crmEnrichmentConfig.clientId, clientId));

  if (!row?.ownApiKey) return null;
  return decryptApiKey(row.ownApiKey);
}

/**
 * Encrypts `plaintext` with AES-256-GCM (`lib/crypto/api-key.ts`) and stores
 * the ciphertext blob on the client's `crm_enrichment_config` row. Never
 * stores the raw key.
 *
 * Upserts rather than updating: nothing in the codebase creates a
 * `crm_enrichment_config` row yet (verified — this table has no writer
 * anywhere in app/, lib/, components/, packages/, or workers/, only this
 * schema file). A plain `UPDATE ... WHERE clientId = ?` would match zero
 * rows for every real caller today, resolve successfully, and the caller
 * would believe the key was saved when nothing was written — the worst
 * failure mode for a function whose only job is persisting a secret. The
 * upsert leaves every other column (`enabled`, `keySource`,
 * `platformCreditBalance`, `costPerEnrichment`) on its schema default when
 * creating the row — this function's contract is "store the key", not
 * "turn BYOK enrichment on"; a future caller flips `keySource` to `'own'`
 * itself once it wires up the rest of the settings flow.
 *
 * `.returning()` + a throw on empty is defense in depth: with a single
 * explicit `clientId` target, `onConflictDoUpdate` should always affect
 * exactly one row, but this makes "silently wrote nothing" structurally
 * impossible to miss if that ever stops being true.
 */
export async function setOwnApiKey(clientId: number, plaintext: string): Promise<void> {
  const encrypted = encryptApiKey(plaintext);
  const rows = await db
    .insert(crmEnrichmentConfig)
    .values({ clientId, ownApiKey: encrypted })
    .onConflictDoUpdate({
      target: crmEnrichmentConfig.clientId,
      set: { ownApiKey: encrypted },
    })
    .returning({ clientId: crmEnrichmentConfig.clientId });

  if (rows.length === 0) {
    throw new Error(`setOwnApiKey: upsert for clientId=${clientId} affected no rows`);
  }
}
