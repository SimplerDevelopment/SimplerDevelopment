/**
 * Resolves the Resend API key to use for outbound email on behalf of a client.
 * Modeled on lib/ai/resolve-client-key.ts.
 *
 * Resolution order:
 *   1. BYOK: clientApiKeys row where provider='resend' for this clientId.
 *      Bumps lastUsedAt opportunistically.
 *   2. Platform: process.env.RESEND_API_KEY
 *
 * BYOK enforcement:
 *   When billingMode === 'byok' and no BYOK key exists, throws a clear error
 *   instead of silently using the platform key.
 *
 * Caching: in-process 60s TTL, same pattern as resolve-client-key.ts.
 */

import { db } from '@/lib/db';
import { clientApiKeys, clients } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { decryptApiKey } from '@/lib/crypto/api-key';

export interface ResolvedResendKey {
  key: string;
  source: 'byok' | 'platform';
}

interface CacheEntry {
  value: ResolvedResendKey;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

export function _clearResendKeyCache(): void {
  cache.clear();
}

export async function resolveResendKey(clientId: number): Promise<ResolvedResendKey> {
  const cacheKey = `resend:${clientId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  // Load billingMode for BYOK enforcement
  const [clientRow] = await db
    .select({ billingMode: clients.billingMode })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  const billingMode = clientRow?.billingMode ?? 'agency';

  // BYOK lookup
  let resolved: ResolvedResendKey | null = null;
  try {
    const rows = await db
      .select()
      .from(clientApiKeys)
      .where(and(eq(clientApiKeys.clientId, clientId), eq(clientApiKeys.provider, 'resend')));

    if (rows.length > 0) {
      const sorted = [...rows].sort((a, b) => {
        const aT = a.lastUsedAt?.getTime() ?? a.createdAt.getTime();
        const bT = b.lastUsedAt?.getTime() ?? b.createdAt.getTime();
        return bT - aT;
      });
      const row = sorted[0];
      try {
        const plaintext = decryptApiKey(row.encryptedKey);
        resolved = { key: plaintext, source: 'byok' };
        void db
          .update(clientApiKeys)
          .set({ lastUsedAt: new Date() })
          .where(eq(clientApiKeys.id, row.id))
          .catch(() => {});
      } catch (err) {
        console.warn(`[resolveResendKey] decrypt failed for clientId=${clientId}`, err);
      }
    }
  } catch (err) {
    console.warn(`[resolveResendKey] DB lookup failed for clientId=${clientId}`, err);
  }

  if (!resolved) {
    // BYOK enforcement: if billingMode === 'byok', never fall through to platform
    if (billingMode === 'byok') {
      throw new Error('BYOK client has no Resend key connected — add one in Settings → API Keys');
    }
    const platform = process.env.RESEND_API_KEY;
    if (!platform) {
      throw new Error('[resolveResendKey] RESEND_API_KEY is not set and no BYOK key found');
    }
    resolved = { key: platform, source: 'platform' };
  }

  cache.set(cacheKey, { value: resolved, expiresAt: Date.now() + CACHE_TTL_MS });
  return resolved;
}
