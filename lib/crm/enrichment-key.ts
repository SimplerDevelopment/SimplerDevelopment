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
 * stores the raw key. Assumes the row already exists (created alongside the
 * client's CRM enrichment settings) — this only sets the key column.
 */
export async function setOwnApiKey(clientId: number, plaintext: string): Promise<void> {
  await db
    .update(crmEnrichmentConfig)
    .set({ ownApiKey: encryptApiKey(plaintext) })
    .where(eq(crmEnrichmentConfig.clientId, clientId));
}
